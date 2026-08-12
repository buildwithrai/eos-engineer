import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chat } from "./ollama.js";
import { readFile } from "./tools/readFile.js";
import { readFiles } from "./tools/readFiles.js";
import {
  createInvestigation,
  recordInspection,
  applyPlan,
  planningComplete,
  investigationComplete,
  scopeOf,
} from "./investigation.js";
import {
  loadEvidence,
  loadKnowledge,
  loadDecisions,
  loadTraceability,
  evidenceExists,
} from "./evidence.js";
import {
  commitProjection,
  loadLatestProjection,
  verifyLineage,
  sha256,
} from "./lineage.js";
import {
  buildKnowledgeProjection,
  isKnowledgeRef,
  isKnowledgeEntityRef,
} from "./knowledge.js";
import {
  loadReviews,
  isReviewRef,
  isPersistedReviewRef,
  resolveRefOutcome,
  reviewIdFromRef,
} from "./review.js";

const tools = { read_file: readFile, read_files: readFiles };

const SYSTEM_PROMPT = `
You are EOS, an engineering operating intelligence.

You investigate engineering evidence and record judgment.

You MUST respond in JSON.

Two possible responses:

1. Tool call:
{"type":"tool","tool":"read_file","input":{"path":"..."}}

Tool paths are workspace-relative: the path in a read_file or read_files call
is always relative to the repository root, e.g.
"backend/src/events/processEvent.js". Never prefix a tool path with an
absolute filesystem path such as "/workspace/...".

2. Judgment:
{"type":"judgment","judgment":[{"claim":"...","type":"declared|candidate|blocked","confidence":"high|medium|low","evidence_refs":["..."]}],"restrictions":["..."]}

Judgment types:
- declared: you commit to this judgment now, fully supported by inspected evidence
- candidate: you offer this judgment pending validation, supported by inspected evidence
- blocked: you cannot judge; conditions prevent it (no evidence requirement)

When investigating, gather the evidence required before returning a judgment.

      Repository knowledge is authoritative evidence for repository-level facts
      already represented in the REPOSITORY KNOWLEDGE block.
      For questions about package identity, package membership, repository inventory,
      source files, symbols, imports, exports, or dependencies, consult REPOSITORY
      KNOWLEDGE before attempting filesystem inspection.
      Package names are identities, not filesystem paths. For example, @ewa/agent
      is a package identity and must not be converted into packages/@ewa/agent.
      Cite specific knowledge entities when a claim is about a specific entity:
      - symbol:<name> for a symbol listed under SYMBOLS
      - package:<name> for a package listed under PACKAGES
      - import:<file>-><resolvedFile> for an import listed under IMPORTS
      - export:<file>:<symbol> for an export listed under EXPORTS
      - dependency:<package>-><dependency> for a dependency listed under
        PACKAGE DEPENDENCIES
      Never claim a symbol, package, import, export, or dependency exists unless it
      is listed in the REPOSITORY KNOWLEDGE block. A specific knowledge ref that
      does not match a listed entity is rejected.
      If REPOSITORY KNOWLEDGE directly supports a claim, cite "REPOSITORY KNOWLEDGE"
      or the specific knowledge entity ref in evidence_refs.
      Review records are explicit evidence artifacts produced from a committed
      judgment. When re-verifying a prior judgment, cite the review record as
      review:<id> or its artifact path (.eos/reviews/<id>.json) in evidence_refs.

Explicitly requested files are inspection obligations. Repository knowledge never
substitutes for inspecting a requested file: even when a file is listed in
REPOSITORY KNOWLEDGE, you must still call read_file (or read_files) on it before
you may claim anything about its contents. A claim that a file was or is being
inspected is supported only by a read_file/read_files result, never by repository
knowledge.

Never claim to have inspected a file unless the read_file tool returned it.

A declared or candidate claim MUST reference only:
- files you actually inspected, or
- evidence ids listed in the ENGINEERING EVIDENCE block below, or
- review refs listed in the REVIEW EVIDENCE block below, or
- knowledge refs listed in the REPOSITORY KNOWLEDGE block below.

For an inspected file, evidence_refs MUST use the file path returned by
read_file, or the exact repository-relative path represented by that result.
Do not use labels such as "repository_content", "source", "file", or other
descriptive aliases as evidence_refs.

For example, if you call read_file with path "packages/workspace/src/indexer/RepositoryIndexer.ts"
and read_file returns {"ok":true,"path":"/home/you/repo/packages/workspace/src/indexer/RepositoryIndexer.ts",...}

then the evidence_ref must identify that inspected file, such as:
"packages/workspace/src/indexer/RepositoryIndexer.ts".

Never invent an evidence id or evidence label. An evidence_ref that does not
resolve to inspected evidence or to a listed evidence id will be rejected.

You may also return a plan response to manage the investigation:
{"type":"plan","adopt":["..."],"waive":[{"path":"...","reason":"..."}]}
adopt means a discovered dependency becomes part of the investigation scope and must be inspected.
waive means a discovered dependency is disposed of and does not require inspection; a non-empty reason is required.
Reading a discovered dependency implicitly adopts it.
candidate and declared judgments cannot be accepted while discovered relationships remain undisposed (pending). Dispose of them with adopt or waive before judging.
Never claim to have inspected a file unless read_file or read_files actually returned it.
`;

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Actionable read directive for the model when required files remain
 * uninspected. Only files that are actually in investigation scope are
 * named; evidence refs that are not scope paths are never suggested as
 * filesystem reads.
 */
function requiredReadDirective(investigation, files) {
  const scope = scopeOf(investigation);
  const missing = (Array.isArray(files) ? files : []).filter(
    (file) => typeof file === "string" && file.length > 0 && scope.has(file)
  );

  if (missing.length === 0) return "";

  return ` Call read_file or read_files with: ${missing.join(", ")}.`;
}

/**
 * Guidance for a rejected plan. A plan entry that references an explicit
 * requirement is not a discovered dependency and cannot be adopted or waived;
 * the file is already required and must be inspected directly. The model is
 * told exactly that instead of being left to guess.
 */
function planGuidance(parsed, investigation) {
  const parts = [];

  const adoptList = Array.isArray(parsed?.adopt) ? parsed.adopt : [];
  const waiveList = Array.isArray(parsed?.waive) ? parsed.waive : [];

  const adoptedExplicit = adoptList.filter(
    (file) => typeof file === "string" && investigation.explicitRequirements.has(file)
  );

  if (adoptedExplicit.length > 0) {
    parts.push(
      `${adoptedExplicit.join(", ")} ${
        adoptedExplicit.length === 1 ? "is" : "are"
      } already an explicit requirement of this investigation and must be inspected with read_file or read_files, not adopted.`
    );
  }

  const waivedExplicit = waiveList
    .filter(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof entry.path === "string" &&
        investigation.explicitRequirements.has(entry.path)
    )
    .map((entry) => entry.path);

  if (waivedExplicit.length > 0) {
    parts.push(
      `${waivedExplicit.join(", ")} ${
        waivedExplicit.length === 1 ? "is" : "are"
      } an explicit requirement of this investigation and cannot be waived; it must be inspected with read_file or read_files.`
    );
  }

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function buildSubstrateContext(evidence, knowledge, decisions, traceability, reviews) {
  const parts = [];

  if (knowledge !== undefined) {
    const projection = buildKnowledgeProjection(knowledge);

    if (projection !== undefined) {
      parts.push(projection);
    }
  }

  if (evidence.length > 0) {
    const ids = evidence.map((item) => item.evidence.id).join(", ");
    parts.push(`ENGINEERING EVIDENCE\nEvidence ids available for citation: ${ids}`);
  }

  if (reviews.length > 0) {
    const lines = reviews.map(
      ({ review }) =>
        `- review:${review.review_id} [${review.outcome}] (reviewed ${review.reviewed_judgment_id})`
    );
    parts.push(`REVIEW EVIDENCE\nReview refs available for citation:\n${lines.join("\n")}`);
  } else {
    parts.push("REVIEW EVIDENCE\n(none — no review evidence recorded)");
  }

  if (decisions.length > 0) {
    const lines = decisions.map(({ item: decision }) => {
      const artifacts = Array.isArray(decision.relatedArtifacts)
        ? decision.relatedArtifacts.join(", ")
        : "";
      return `- ${decision.id} [${decision.status}]: ${decision.title}\n  decision: ${decision.decision}\n  artifacts: ${artifacts || "none"}`;
    });
    parts.push(`DECISIONS\n${lines.join("\n")}`);
  } else {
    parts.push("DECISIONS\n(none — substrate consulted)");
  }

  const traceabilityLinks =
    traceability !== undefined && Array.isArray(traceability.item)
      ? traceability.item
      : [];

  if (traceabilityLinks.length > 0) {
    const lines = traceabilityLinks.map((link) => {
      const rationale = link.rationale ? ` — ${link.rationale}` : "";
      return `- ${link.id}: ${link.from} -> ${link.to} [${link.relationship}]${rationale}`;
    });
    parts.push(`TRACEABILITY\n${lines.join("\n")}`);
  } else {
    parts.push("TRACEABILITY\n(none — substrate consulted)");
  }

  return parts.join("\n\n");
}

function normalizeJson(raw) {
  let jsonText = String(raw ?? "").trim();

  if (!jsonText) throw new Error("Model returned empty content");

  const fenced = jsonText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (fenced) jsonText = fenced[1].trim();

  return jsonText.replace(/\\\\([^"\\\\\\/bfnrtu])/g, "$1");
}

const JUDGMENT_STATES = {
  blocked: { rank: 0, requiresEvidence: false },
  candidate: { rank: 1, requiresEvidence: true },
  declared: { rank: 2, requiresEvidence: true },
};

const LEGAL_TRANSITIONS = {
  blocked: ["candidate"],
  candidate: ["declared"],
};

const LEGAL_DOWNGRADES = {
  declared: ["candidate"],
  candidate: ["blocked"],
};

function isJudgmentState(type) {
  return Object.prototype.hasOwnProperty.call(JUDGMENT_STATES, type);
}

function canTransition(from, to, regressionAuthorized = false) {
  if (!isJudgmentState(to)) return false;
  if (from == null) return true;
  if (from === to) return true;
  if ((LEGAL_TRANSITIONS[from] ?? []).includes(to)) return true;
  if (regressionAuthorized) {
    return (LEGAL_DOWNGRADES[from] ?? []).includes(to);
  }
  return false;
}

function regressionAuthorizedFor(judgment, context, priorJudgmentId) {
  for (const item of judgment) {
    const refs = Array.isArray(item.evidence_refs) ? item.evidence_refs : [];

    for (const ref of refs) {
      const resolved = resolveRefOutcome(ref, context);

      if (resolved.outcome !== "regression") continue;

      const reviewId = reviewIdFromRef(ref);

      if (reviewId === null) return true;

      const record = context.reviews.find(
        (entry) => entry.review.review_id === reviewId
      );

      if (
        record !== undefined &&
        record.review.reviewed_judgment_id === priorJudgmentId
      ) {
        return true;
      }
    }
  }

  return false;
}

function surfaceStatus(judgment) {
  let status = "declared";

  for (const item of judgment) {
    const state = JUDGMENT_STATES[item.type];

    if (!state) continue;

    if (state.rank < JUDGMENT_STATES[status].rank) {
      status = item.type;
    }
  }

  return status;
}

function loadJudgmentStatus(workspaceRoot) {
  const file = path.join(workspaceRoot, ".eos", "judgment.json");

  if (!fs.existsSync(file)) return null;

  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }

  return isJudgmentState(parsed?.status) ? parsed.status : null;
}

function isPersistedJudgmentRef(ref, workspaceRoot) {
  if (typeof ref !== "string") return false;

  const judgmentFile = normalizePath(
    path.relative(
      workspaceRoot,
      path.join(workspaceRoot, ".eos", "judgment.json")
    )
  );

  const ledgerDir = normalizePath(
    path.relative(
      workspaceRoot,
      path.join(workspaceRoot, ".eos", "judgments")
    )
  );

  const normalizedRef = normalizePath(ref).replace(/^\.\//, "");

  return (
    normalizedRef === judgmentFile ||
    normalizedRef.endsWith(`/${judgmentFile}`) ||
    normalizedRef === ledgerDir ||
    normalizedRef.startsWith(`${ledgerDir}/`)
  );
}

  function canonicalizeEvidenceRefs(
    judgment,
    workspaceRoot,
    evidence = [],
    knowledge = undefined,
    reviews = []
  ) {
    const absoluteRoot = normalizePath(workspaceRoot);

    return judgment.map((item) => ({
      ...item,

      evidence_refs: (
        Array.isArray(item.evidence_refs)
          ? item.evidence_refs
          : []
      ).map((ref) => {
        if (typeof ref !== "string") return ref;

        // Review references are canonical as-is. Never normalize them as
        // filesystem paths.
        if (isReviewRef(ref, reviews)) {
          return ref;
        }

        // Knowledge references are canonical as-is (blanket or specific
        // entity refs). Never normalize them as filesystem paths.
        if (isKnowledgeRef(ref, knowledge)) {
          return ref;
        }

        // Canonical substrate reference.
        if (ref === "REPOSITORY KNOWLEDGE") {
          return ref;
        }

        // Engineering evidence IDs are already canonical.
        // Never normalize them as filesystem paths.
        if (evidenceExists(evidence, ref)) {
          return ref;
        }

        // Filesystem evidence references are canonicalized as
        // workspace-relative paths.
        const normalizedRef = normalizePath(ref);

        if (normalizedRef.startsWith(absoluteRoot + "/")) {
          return normalizedRef.slice(absoluteRoot.length + 1);
        }

        return normalizedRef;
      }),
    }));
  }

  function gateJudgment(
  judgment,
  investigation,
  evidence = [],
  knowledge = undefined,
  workspaceRoot = undefined,
  reviews = []
) {
  const inspected = [...investigation.inspectedEvidence];

  for (const item of judgment) {
    const state = JUDGMENT_STATES[item.type];

    if (!state) {
      return {
        ok: false,
        reason: "state",
        message: `Judgment state "${item.type}" is not a legal EOS state. Use blocked, candidate, or declared.`,
      };
    }

    if (!state.requiresEvidence) continue;

    const planningOk = planningComplete(investigation);
    const investigationOk = investigationComplete(investigation);

    if (!planningOk || !investigationOk) {
      const missingRequired = [...investigation.explicitRequirements].filter(
        (file) => !investigation.inspectedEvidence.has(file)
      );
      const missingAdopted = [...investigation.adoptedRequirements].filter(
        (file) => !investigation.inspectedEvidence.has(file)
      );
      const pending = investigation.discoveredDependencies
        .filter((dependency) => dependency.status === "pending")
        .map((dependency) => `${dependency.from} -> ${dependency.to}`);

      let message =
        `Claim "${item.claim}" cannot reach ${item.type} because the investigation is incomplete. `;

      if (missingRequired.length > 0) {
        message += `Required evidence not inspected: ${missingRequired.join(", ")}. `;
      }

      if (missingAdopted.length > 0) {
        message += `Adopted evidence not inspected: ${missingAdopted.join(", ")}. `;
      }

      if (pending.length > 0) {
        message += `Discovered relationships not disposed: ${pending.join(", ")}. Waive or adopt them before judging.`;
      }

      return {
        ok: false,
        reason: "evidence",
        missing: [...missingRequired, ...missingAdopted],
        pending,
        message,
      };
    }

    const refs = Array.isArray(item.evidence_refs) ? item.evidence_refs : [];

    if (refs.length === 0) {
      return {
        ok: false,
        reason: "evidence",
        missing: [],
        message: `Claim "${item.claim}" references no evidence. Provide evidence_refs.`,
      };
    }

    const missing = refs.filter((ref) => {
      const normalizedRef = normalizePath(ref);

      const directlyInspected = inspected.some(
        (file) =>
          file === normalizedRef ||
          file.endsWith(`/${normalizedRef}`)
      );

      const requiredEvidenceInspected =
        [...investigation.explicitRequirements].some(
          (requiredFile) =>
            (
              requiredFile === normalizedRef ||
              requiredFile.endsWith(`/${normalizedRef}`) ||
              normalizedRef.endsWith(`/${requiredFile}`)
            ) &&
            investigation.inspectedEvidence.has(requiredFile)
        );

      const backedByEvidenceStore =
        evidenceExists(evidence, ref);

      const backedByKnowledge = isKnowledgeRef(ref, knowledge);

      const backedByReview = isReviewRef(ref, reviews);

      const persistedJudgmentRef =
        workspaceRoot !== undefined &&
        isPersistedJudgmentRef(ref, workspaceRoot);

      const persistedReviewRef =
        workspaceRoot !== undefined &&
        isPersistedReviewRef(ref, workspaceRoot);

      return (
        persistedJudgmentRef ||
        persistedReviewRef ||
        !(
          directlyInspected ||
          requiredEvidenceInspected ||
          backedByEvidenceStore ||
          backedByKnowledge ||
          backedByReview
        )
      );
    });
    if (missing.length > 0) {
      const knowledgeLike = missing.filter((ref) => isKnowledgeEntityRef(ref));

      const message =
        knowledgeLike.length > 0
          ? `Claim "${item.claim}" cites knowledge refs not present in the REPOSITORY KNOWLEDGE block: ${knowledgeLike.join(", ")}. Never claim a symbol, package, import, export, or dependency exists unless it is listed there.`
          : `Claim "${item.claim}" references evidence not inspected, not in the engineering evidence store, or not in the repository knowledge model: ${missing.join(", ")}`;

      return {
        ok: false,
        reason: "evidence",
        missing,
        knowledge: knowledgeLike,
        message,
      };
    }
  }

  return { ok: true };
}

async function runEos(userInput, { workspace, chatFn = chat, maxIterations = 10 } = {}) {
  const workspaceRoot = path.resolve(workspace);
  const lineage = verifyLineage(workspaceRoot);
  let previousStatus = loadJudgmentStatus(workspaceRoot);

  if (lineage.state === "inconsistent") {
    console.warn(
      `[eos] persisted lineage is inconsistent (${lineage.reason}); treating as fresh state`
    );
    previousStatus = null;
  }

  let priorJudgmentId = null;
  let previousJudgmentDigest = null;

  if (lineage.state !== "inconsistent") {
    const latest = loadLatestProjection(workspaceRoot);

    if (latest !== null) {
      priorJudgmentId = latest.surface.judgment_id;
      previousJudgmentDigest = latest.digest;
    }
  }

  const investigation = createInvestigation(userInput);

  const evidence = loadEvidence(workspaceRoot);
  const knowledge = loadKnowledge(workspaceRoot);
  const decisions = loadDecisions(workspaceRoot);
  const traceability = loadTraceability(workspaceRoot);
  const reviews = loadReviews(workspaceRoot);

  const reviewContext = {
    workspaceRoot,
    evidenceItems: evidence,
    knowledge,
    reviews,
    inspections: investigation.inspections,
  };

  const substrateContext = buildSubstrateContext(evidence, knowledge, decisions, traceability, reviews);

  const messages = [
    {
      role: "system",
      content: substrateContext ? `${SYSTEM_PROMPT}\n\n${substrateContext}` : SYSTEM_PROMPT,
    },
    { role: "user", content: userInput },
  ];

  let finalJudgment = null;
  let restrictions = [];
  let commitReason = "judgment";

  for (let i = 0; i < maxIterations; i++) {
    const response = await chatFn(messages);

      console.log(`\n=== EOS ITERATION ${i + 1} MODEL RESPONSE ===`);
      console.log(response?.content ?? "(empty)");

    let parsed;

    try {
      parsed = JSON.parse(normalizeJson(response?.content ?? ""));
    } catch (e) {
      messages.push({
        role: "user",
        content: `Invalid JSON. Respond with exactly one tool call or judgment JSON.`,
      });
      continue;
    }

    if (parsed.type === "judgment") {
      const items = Array.isArray(parsed.judgment) ? parsed.judgment : [];

        if (items.length === 0) {
          messages.push({
            role: "assistant",
            content: JSON.stringify(parsed),
          });
          messages.push({
            role: "user",
            content:
              "You cannot finish yet. A judgment must contain at least one claim.",
          });
          continue;
        }

      const canonicalItems =
        canonicalizeEvidenceRefs(items, workspaceRoot, evidence, knowledge, reviews);

      const gate = gateJudgment(
        canonicalItems,
        investigation,
        evidence,
        knowledge,
        workspaceRoot,
        reviews
      );

      if (!gate.ok) {
        messages.push({
          role: "assistant",
          content: JSON.stringify(parsed),
        });

        messages.push({
          role: "user",
          content:
            gate.reason === "state"
              ? `You cannot finish yet. ${gate.message}`
              : gate.knowledge?.length > 0
                ? `You cannot finish yet. ${gate.message}`
                : `You cannot finish yet. ${gate.message}. Inspect the required evidence before judging.${requiredReadDirective(investigation, gate.missing)}`,
        });

        continue;
      }

      const nextStatus = surfaceStatus(canonicalItems);

      const regressionAuthorized = regressionAuthorizedFor(
        canonicalItems,
        reviewContext,
        priorJudgmentId
      );

      if (!canTransition(previousStatus, nextStatus, regressionAuthorized)) {
        messages.push({
          role: "assistant",
          content: JSON.stringify(parsed),
        });

        messages.push({
          role: "user",
          content: `You cannot finish yet. Judging as "${nextStatus}" is not a legal transition from the previous state "${previousStatus}". Legal transitions are blocked -> candidate -> declared, plus one-level downgrades (declared -> candidate, candidate -> blocked) when a cited reference resolves to a regression outcome.`,
        });

        continue;
      }

      if (
        previousStatus !== null &&
        JUDGMENT_STATES[nextStatus].rank < JUDGMENT_STATES[previousStatus].rank
      ) {
        commitReason = "revision";
      }

      previousStatus = nextStatus;
      finalJudgment = canonicalItems;
      restrictions = Array.isArray(parsed.restrictions) ? parsed.restrictions : [];
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
      messages.push({ role: "tool", content: JSON.stringify(result) });
      continue;
    }

    if (parsed.type === "plan") {
      const planResult = applyPlan(investigation, {
        adopt: parsed.adopt,
        waive: parsed.waive,
      });

      messages.push({ role: "assistant", content: JSON.stringify(parsed) });

      if (planResult.ok) {
        messages.push({
          role: "user",
          content:
            "Plan applied. Continue investigating, or judge when the investigation is complete.",
        });
      } else {
        messages.push({
          role: "user",
          content: `Plan rejected: ${planResult.message}${planGuidance(parsed, investigation)}`,
        });
      }

      continue;
    }

    messages.push({
      role: "user",
      content: `Unknown response type. Respond with exactly one tool call, plan, or judgment JSON.`,
    });
  }

  if (!finalJudgment) {
    commitReason = "fallback";

    const fallbackState = isJudgmentState(previousStatus)
      ? previousStatus
      : "blocked";

    finalJudgment = [
      {
        claim: "Investigation iteration limit reached without judgment",
        type: fallbackState,
        confidence: "low",
        evidence_refs: [...investigation.inspectedEvidence],
      },
    ];
  }

  const surface = buildSurface(
    userInput,
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
    commitReason
  );

  commitProjection(workspaceRoot, surface);

  return surface;
}

function buildEvidenceBlock(
  evidence,
  inspections,
  knowledge,
  decisions,
  traceability,
  reviews,
  judgment
) {
  const consumed = new Set();

  for (const item of judgment) {
    for (const ref of item.evidence_refs ?? []) {
      consumed.add(ref);
    }
  }

  return {
    source: "ewa",
    evidence: evidence.map(({ evidence: e, source, digest }) => ({
      id: e.id,
      subject: e.subject,
      attempted: e.attempted,
      observed: e.observed,
      outcome: e.outcome,
      source,
      digest,
    })),
    inspections: inspections.map((inspection) => ({
      ok: inspection.ok,
      path: inspection.path,
      digest: typeof inspection.content === "string" ? sha256(inspection.content) : null,
    })),
    knowledge:
      knowledge === undefined
        ? undefined
        : {
            id: "REPOSITORY KNOWLEDGE",
            source: knowledge.source,
            digest: knowledge.digest,
            generatedAt: knowledge.knowledge.generatedAt,
            repositoryRoot: knowledge.knowledge.repository?.root,
          },
    decisions: decisions.map(({ item: decision, source, digest }) => ({
      id: decision.id,
      title: decision.title,
      status: decision.status,
      decision: decision.decision,
      source,
      digest,
    })),
    traceability:
      traceability === undefined
        ? undefined
        : {
            source: traceability.source,
            digest: traceability.digest,
            links: (traceability.item ?? []).map((link) => ({
              id: link.id,
              from: link.from,
              to: link.to,
              relationship: link.relationship,
            })),
          },
    reviews: reviews.map(({ review, source, digest }) => ({
      id: review.review_id,
      outcome: review.outcome,
      judgment_id: review.reviewed_judgment_id,
      source,
      digest,
    })),
    consumed: [...consumed],
  };
}

  function buildSurface(userInput, investigation, judgment, restrictions, evidence, knowledge, decisions, traceability, reviews, previousJudgmentId = null, previousJudgmentDigest = null, commitReason = "judgment") {
    const explicitMissing = [...investigation.explicitRequirements].filter(
      (file) => !investigation.inspectedEvidence.has(file)
    );
    const adoptedMissing = [...investigation.adoptedRequirements].filter(
      (file) => !investigation.inspectedEvidence.has(file)
    );
    const gaps = [...explicitMissing, ...adoptedMissing];
    const pendingRequirements = [...investigation.adoptedRequirements].filter(
      (file) => !investigation.inspectedEvidence.has(file)
    );
    const unresolvedRelationships = investigation.discoveredDependencies
      .filter((dependency) => dependency.status === "pending")
      .map((dependency) => `${dependency.from} -> ${dependency.to}`);

    const recordedAt = new Date().toISOString();
    const investigationId = crypto.randomUUID();
    const judgmentId = crypto.randomUUID();

    const status = surfaceStatus(judgment);

    return {
      schema: "eos-judgment/v1",
      judgment_id: judgmentId,
      investigation_id: investigationId,
      recorded_at: recordedAt,
      status,
      previous_judgment_id: previousJudgmentId,
      previous_judgment_digest: previousJudgmentDigest,
      commit_reason: commitReason,
      investigation: {
        target: investigation.target,
        objective: investigation.objective,
        explicit_requirements: [...investigation.explicitRequirements],
        required_evidence: investigation.requiredFiles,
        adopted_requirements: [...investigation.adoptedRequirements],
        inspected_evidence: [...investigation.inspectedEvidence],
        discovered_dependencies: investigation.discoveredDependencies.map(
          (dependency) => ({
            from: dependency.from,
            specifier: dependency.specifier,
            to: dependency.to,
            status: dependency.status,
            reason: dependency.reason,
          })
        ),
        pending_requirements: pendingRequirements,
        gaps,
        unresolved_relationships: unresolvedRelationships,
      },
      evidence: buildEvidenceBlock(
        evidence,
        investigation.inspections,
        knowledge,
        decisions,
        traceability,
        reviews,
        judgment
      ),
      judgment: judgment.map((item) => ({
        ...item,
        evidence_refs: Array.isArray(item.evidence_refs) ? item.evidence_refs : [],
      })),
      restrictions,
    };
  }

export {
  runEos,
  JUDGMENT_STATES,
  isJudgmentState,
  canTransition,
  surfaceStatus,
  gateJudgment,
  canonicalizeEvidenceRefs,
};
