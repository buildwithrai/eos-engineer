import path from "node:path";
import { chat } from "../provider/runtime.js";
import { readFile } from "../investigation/tools/read-file.js";
import {
  createInvestigation,
  recordInspection,
  applyPlan,
  scopeOf,
} from "../investigation.js";
import {
  loadEvidence,
  loadKnowledge,
  loadDecisions,
  loadTraceability,
} from "../investigation/evidence.js";
import {
  commitProjection,
  loadLatestProjection,
  sha256,
} from "../projection/persistence.js";
import { verifyLineage } from "../projection/lineage.js";
import { loadReviews, runReview } from "../review.js";
import { buildMemory } from "../memory.js";
import {
  loadChanges,
  createChange,
  gateChangeProposal,
  changeDirectory,
  serializeChange,
} from "../change.js";
import {
  detectFormation,
  loadIntents,
  persistIntent,
  isFormationRequest,
} from "../formation.js";
import { validateWorkspace } from "../workspace.js";
import { buildSurface } from "../judgmentSurface.js";
import {
  JUDGMENT_STATES,
  isJudgmentState,
  loadJudgmentStatus,
} from "../judgment/state.js";
import { evaluateJudgment } from "../judgment/judge.js";
import {
  buildPerspective,
  buildPerspectiveProjection,
} from "../perspective.js";
import {
  investigationFingerprint,
  withInvestigationState,
  requiredReadDirective,
  planGuidance,
} from "../investigation/context.js";
import {
  rejectedJudgmentGuidance,
  EOS_GUIDANCE,
  EPISTEMIC_GUIDANCE,
  RUNTIME_PROTOCOL,
  FORMATION_GUIDANCE,
} from "../reasoning/context.js";
import { reason } from "../reasoning/reason.js";
import { buildSubstrateContext } from "../knowledge/context.js";
import {
  normalizeJson,
  buildUnavailableSurface,
  tools,
} from "../runtime/context.js";
import {
  NO_PROGRESS_LIMIT,
  NO_PROGRESS_CLAIM,
} from "../trace/investigation.js";

export async function runEos(userInput, { workspace, chatFn = chat, maxIterations = 10 } = {}) {
  const workspaceRoot = path.resolve(workspace);

  const workspaceValidation = validateWorkspace(workspaceRoot);

  if (!workspaceValidation.ok) {
    // A missing/unavailable repository target is a deterministic blocker.
    // The only exception is an explicit formation request: project formation
    // is the one flow that legitimately targets a path that does not exist
    // yet. A missing path is never reinterpreted as formation on its own.
    if (!isFormationRequest(userInput)) {
      return buildUnavailableSurface(userInput, workspaceRoot, workspaceValidation);
    }
  }

  const lineage = verifyLineage(workspaceRoot);
  let previousStatus = loadJudgmentStatus(workspaceRoot);

  if (lineage.state === "inconsistent") {
    console.warn(
      `[eos] persisted lineage is inconsistent (${lineage.reason}); treating as fresh state`
    );
    previousStatus = null;
  }

  const priorStatus = previousStatus;

  let priorJudgmentId = null;
  let previousJudgmentDigest = null;

  if (lineage.state !== "inconsistent") {
    const latest = loadLatestProjection(workspaceRoot);

    if (latest !== null) {
      priorJudgmentId = latest.surface.judgment_id;
      previousJudgmentDigest = latest.digest;
    }
  }

  const formation = detectFormation(workspaceRoot, userInput);

  const investigation = createInvestigation(userInput, {
    mode: formation.mode,
    workspaceRoot,
  });

  const perspective = buildPerspective(workspaceRoot, {
    mode: formation.mode,
    prospectiveArtifacts: investigation.prospectiveArtifacts,
  });

  const evidence = loadEvidence(workspaceRoot);
  const knowledge = loadKnowledge(workspaceRoot);
  const decisions = loadDecisions(workspaceRoot);
  const traceability = loadTraceability(workspaceRoot);
  const reviews = loadReviews(workspaceRoot);
  const changes = loadChanges(workspaceRoot);

  let intents = [];

  if (formation.mode === "formation") {
    const persisted = persistIntent(workspaceRoot, userInput);
    intents = loadIntents(workspaceRoot);

    const recordPath = path.relative(workspaceRoot, persisted.source);
    const read = await readFile({ path: recordPath }, workspaceRoot);

    if (read.ok) {
      recordInspection(investigation, read, workspaceRoot);
      investigation.inspections.push(read);
    }

    const pointerPath = path.relative(
      workspaceRoot,
      path.join(workspaceRoot, ".eos", "formation", "intent.json")
    );
    const pointer = await readFile({ path: pointerPath }, workspaceRoot);

    if (pointer.ok) {
      recordInspection(investigation, pointer, workspaceRoot);
      investigation.inspections.push(pointer);
    }
  }

  const reviewContext = {
    workspaceRoot,
    evidenceItems: evidence,
    knowledge,
    reviews,
    changes,
    intents,
    inspections: investigation.inspections,
  };

  const substrateContext = buildSubstrateContext(evidence, knowledge, decisions, traceability, reviews, changes, intents);

  const perspectiveProjection = buildPerspectiveProjection(perspective);

  const baseSystem = substrateContext
    ? `${EOS_GUIDANCE}${EPISTEMIC_GUIDANCE}${RUNTIME_PROTOCOL}\n\n${substrateContext}${perspectiveProjection ? `\n\n${perspectiveProjection}` : ""}`
    : `${EOS_GUIDANCE}${EPISTEMIC_GUIDANCE}${RUNTIME_PROTOCOL}${perspectiveProjection ? `\n\n${perspectiveProjection}` : ""}`;

  const systemContent =
    formation.mode === "formation"
      ? `${baseSystem}\n\n${FORMATION_GUIDANCE}`
      : baseSystem;

  const messages = [
    {
      role: "system",
      content: systemContent,
    },
    { role: "user", content: withInvestigationState(investigation, userInput) },
  ];

  let finalJudgment = null;
  let resolvedJudgmentStatus = null;
  let restrictions = [];
  let commitReason = "judgment";
  let blocker = null;
  let noProgressStreak = 0;
  let previousFingerprint = null;
  let pendingChangeProposal = null;

  for (let i = 0; i < maxIterations; i++) {
    const fingerprint = investigationFingerprint(investigation);

    if (previousFingerprint === null) {
      previousFingerprint = fingerprint;
    } else if (fingerprint !== previousFingerprint) {
      noProgressStreak = 0;
      previousFingerprint = fingerprint;
    } else {
      noProgressStreak += 1;

      if (noProgressStreak >= NO_PROGRESS_LIMIT) {
        commitReason = "no-progress";
        blocker = {
          reason: "no-progress",
          detail: `${NO_PROGRESS_LIMIT} consecutive actions produced no investigation-state change`,
          limit: NO_PROGRESS_LIMIT,
        };
        break;
      }
    }

    const reasoning = await reason({
      messages,
      chatFn,
      iteration: i + 1,
    });

    if (!reasoning.ok) {
      messages.push({
        role: "user",
        content: withInvestigationState(
          investigation,
          `Invalid JSON. Respond with exactly one tool call or judgment JSON.`
        ),
      });
      continue;
    }

    const parsed = reasoning.parsed;

    if (parsed.type === "judgment") {
      const result = evaluateJudgment({
        parsed,
        investigation,
        workspaceRoot,
        evidence,
        knowledge,
        reviews,
        changes,
        intents,
        perspective,
        reviewContext,
        priorJudgmentId,
        previousStatus,
      });

      if (!result.ok) {
        messages.push({
          role: "assistant",
          content: JSON.stringify(parsed),
        });

        messages.push({
          role: "user",
          content: withInvestigationState(
            investigation,
            result.message
          ),
        });

        continue;
      }

      // A judgment may carry an optional change proposal naming the next
      // engineering action it entails. The proposal is gated before the
      // judgment commits, so an inadmissible proposal rejects the whole
      // response and the model can retry. A proposal is only admissible for a
      // judgment that commits as declared, and its scope must be grounded in
      // evidence inspected during this investigation.
      let changeProposal = null;

      if (parsed.change !== undefined && parsed.change !== null) {
        const proposalGate = gateChangeProposal(
          parsed.change,
          investigation,
          workspaceRoot,
          result.nextStatus
        );

        if (!proposalGate.ok) {
          messages.push({
            role: "assistant",
            content: JSON.stringify(parsed),
          });

          messages.push({
            role: "user",
            content: withInvestigationState(
              investigation,
              proposalGate.message
            ),
          });

          continue;
        }

        changeProposal = proposalGate.proposal;
      }

      if (result.revision) {
        commitReason = "revision";
      }

      previousStatus = result.nextStatus;
      resolvedJudgmentStatus = result.nextStatus;
      finalJudgment = result.canonicalItems;
      restrictions = result.restrictions;
      pendingChangeProposal = changeProposal;
      break;
    }

    if (parsed.type === "tool") {
      const tool = tools[parsed.tool];

      if (!tool) {
        messages.push({
          role: "user",
          content: `Unknown tool "${parsed.tool}". Use read_file or read_files.`,
        });
        continue;
      }

      const result = await tool(parsed.input ?? {}, workspaceRoot);

      if (parsed.tool === "read_file") {
        if (result?.ok && result?.path) {
          recordInspection(investigation, result, workspaceRoot);
          investigation.inspections.push(result);
        }
      } else if (parsed.tool === "read_files") {
        if (Array.isArray(result?.inspections)) {
          for (const inspection of result.inspections) {
            if (inspection.ok && inspection.path) {
              recordInspection(investigation, inspection, workspaceRoot);
              investigation.inspections.push(inspection);
            }
          }
        }
      }

      messages.push({ role: "assistant", content: JSON.stringify(parsed) });
      messages.push({
        role: "tool",
        content: withInvestigationState(investigation, JSON.stringify(result)),
      });
      continue;
    }

    if (parsed.type === "plan") {
      const planResult = applyPlan(investigation, {
        adopt: parsed.adopt,
        waive: parsed.waive,
      });

      messages.push({ role: "assistant", content: JSON.stringify(parsed) });

      if (!planResult.ok) {
        const uninspectedExplicit = [...investigation.explicitRequirements].filter(
          (file) => !investigation.inspectedEvidence.has(file)
        );

        messages.push({
          role: "user",
          content: withInvestigationState(
            investigation,
            `Plan rejected: ${planResult.message}${planGuidance(parsed, investigation)}${requiredReadDirective(investigation, uninspectedExplicit)}`
          ),
        });

        continue;
      }

      const uninspectedScope = [...scopeOf(investigation)].filter(
        (file) => !investigation.inspectedEvidence.has(file)
      );

      const message = planResult.mutated
        ? "Plan applied. Continue investigating, or judge when the investigation is complete."
        : `Plan produced no investigation-state change.${requiredReadDirective(investigation, uninspectedScope)} Continue investigating, or judge when the investigation is complete.`;

      messages.push({
        role: "user",
        content: withInvestigationState(investigation, message),
      });

      continue;
    }

    messages.push({
      role: "user",
      content: withInvestigationState(
        investigation,
        `Unknown response type. Respond with exactly one tool call, plan, or judgment JSON.`
      ),
    });
  }

  if (!finalJudgment) {
    const terminalState = isJudgmentState(previousStatus)
      ? previousStatus
      : "blocked";

    resolvedJudgmentStatus = terminalState;

    if (commitReason === "no-progress") {
      finalJudgment = [
        {
          claim: NO_PROGRESS_CLAIM,
          type: terminalState,
          confidence: "low",
          evidence_refs: [...investigation.inspectedEvidence],
        },
      ];
    } else {
      commitReason = "fallback";

      finalJudgment = [
        {
          claim: "Investigation iteration limit reached without judgment",
          type: terminalState,
          confidence: "low",
          evidence_refs: [...investigation.inspectedEvidence],
        },
      ];
    }
  }

  const surface = buildSurface(
    investigation,
    finalJudgment,
    restrictions,
    evidence,
    knowledge,
    decisions,
    traceability,
    reviews,
    priorJudgmentId,
    previousJudgmentDigest,
    commitReason,
    changes,
    intents,
    blocker,
    perspective,
    resolvedJudgmentStatus,
    priorStatus
  );

  commitProjection(workspaceRoot, surface);

  // A gated change proposal is created only after the judgment node commits:
  // createChange deterministically re-validates the proposal against the
  // committed judgment's inspected evidence and records it as a proposed
  // change contract awaiting an actor's authorization. EOS never authorizes
  // and never executes; the actor is a participant.
  if (pendingChangeProposal !== null) {
    const created = createChange(workspaceRoot, {
      ...pendingChangeProposal,
      source_judgment_id: surface.judgment_id,
    });

    if (created.ok) {
      surface.proposed_change = {
        change_id: created.change.change_id,
        status: created.change.status,
        source_judgment_id: surface.judgment_id,
        contract: created.change.contract,
        authorization: created.change.authorization,
      };

      surface.evidence.changes.push({
        id: created.change.change_id,
        status: created.change.status,
        target: created.change.contract?.target ?? null,
        source_judgment_id: surface.judgment_id,
        source: changeDirectory(workspaceRoot, created.change.change_id),
        digest: sha256(serializeChange(created.change)),
      });
    } else {
      surface.proposed_change = {
        rejected: true,
        message: created.message,
      };
    }
  }

  runReview(workspaceRoot, surface.judgment_id);

  // Memory is the retained history EOS holds across runs: judgments, reviews,
  // intents, and the verification state of every change EOS recorded. It is a
  // first-class surface concept, deterministic from the persisted ledgers, and
  // distinct from verification (EOS re-reading current engineering state after
  // an actor's action). Verification results EOS has already retained appear
  // here; verification itself is never performed on the actor's report alone.
  surface.memory = buildMemory(workspaceRoot, {
    changes: loadChanges(workspaceRoot),
    reviews: loadReviews(workspaceRoot),
    intents: loadIntents(workspaceRoot),
  });

  return surface;
}
