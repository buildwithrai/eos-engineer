import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chat } from "./ollama.js";
import { readFile } from "./tools/readFile.js";
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

const tools = { read_file: readFile };

const SYSTEM_PROMPT = `
You are EOS, an engineering operating intelligence.

You investigate engineering evidence and record judgment.

You MUST respond in JSON.

Two possible responses:

1. Tool call:
{"type":"tool","tool":"read_file","input":{"path":"..."}}

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
      If REPOSITORY KNOWLEDGE directly supports a claim, cite "REPOSITORY KNOWLEDGE"
      in evidence_refs.

Never claim to have inspected a file unless the read_file tool returned it.

A declared or candidate claim MUST reference only:
- files you actually inspected, or
- evidence ids listed in the ENGINEERING EVIDENCE block below.

For an inspected file, evidence_refs MUST use the file path returned by
read_file, or the exact repository-relative path represented by that result.
Do not use labels such as "repository_content", "source", "file", or other
descriptive aliases as evidence_refs.

For example, if read_file returns:
{"ok":true,"path":"/workspace/packages/workspace/src/indexer/RepositoryIndexer.ts",...}

then the evidence_ref must identify that inspected file, such as:
"packages/workspace/src/indexer/RepositoryIndexer.ts".

Never invent an evidence id or evidence label. An evidence_ref that does not
resolve to inspected evidence or to a listed evidence id will be rejected.
`;

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function createInvestigation(userInput) {
  const requiredFiles = new Set();

  const filePattern =
    /(?:^|[\s"'`(])((?:\.\/)?(?:[\w.-]+\/)*[\w.-]+\.(?:js|ts|tsx|jsx|json|md|sql|yaml|yml|py|sh))(?=$|[\s"'`),.:;])/g;

  let match;

  while ((match = filePattern.exec(userInput)) !== null) {
    const candidate = match[1].trim();

    if (
      !candidate.endsWith(".") &&
      !candidate.startsWith("Do ") &&
      !candidate.startsWith("http")
    ) {
      requiredFiles.add(normalizePath(candidate));
    }
  }

  return {
    target: userInput.split("\n")[0].slice(0, 200),
    requiredFiles: [...requiredFiles],
    inspectedFiles: new Set(),
    inspections: [],
  };
}

function hasRequiredEvidence(investigation) {
  return investigation.requiredFiles.every((file) =>
    investigation.inspectedFiles.has(file)
  );
}

function buildSubstrateContext(evidence, knowledge, decisions, traceability) {
  const parts = [];

  if (knowledge !== undefined) {
    const repo = knowledge.knowledge.repository ?? {};
    parts.push(
      `REPOSITORY KNOWLEDGE\nRoot: ${repo.root}\nPackages: ${(repo.packages ?? []).join(", ")}\nSource files: ${repo.sourceFiles ?? 0}\nSymbols: ${(knowledge.knowledge.symbols ?? []).length}`
    );
  }

  if (evidence.length > 0) {
    const ids = evidence.map((item) => item.evidence.id).join(", ");
    parts.push(`ENGINEERING EVIDENCE\nEvidence ids available for citation: ${ids}`);
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

function isJudgmentState(type) {
  return Object.prototype.hasOwnProperty.call(JUDGMENT_STATES, type);
}

function canTransition(from, to) {
  if (!isJudgmentState(to)) return false;
  if (from == null) return true;
  if (from === to) return true;
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
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
    evidence = []
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
  workspaceRoot = undefined
) {
  const inspected = [...investigation.inspectedFiles];

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
    if (!hasRequiredEvidence(investigation)) {
      const missingRequired = investigation.requiredFiles.filter(
        (file) => !investigation.inspectedFiles.has(file)
      );

      return {
        ok: false,
        reason: "evidence",
        missing: missingRequired,
        message:
      `Claim "${item.claim}" cannot reach ${item.type} because required ` +
      `investigation evidence has not been inspected: ${missingRequired.join(", ")}`,
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
        investigation.requiredFiles.some(
          (requiredFile) =>
            (
              requiredFile === normalizedRef ||
              requiredFile.endsWith(`/${normalizedRef}`) ||
              normalizedRef.endsWith(`/${requiredFile}`)
            ) &&
            investigation.inspectedFiles.has(requiredFile)
        );

      const backedByEvidenceStore =
        evidenceExists(evidence, ref);

      const backedByKnowledge =
        ref === "REPOSITORY KNOWLEDGE" &&
        knowledge !== undefined;

      const persistedJudgmentRef =
        workspaceRoot !== undefined &&
        isPersistedJudgmentRef(ref, workspaceRoot);

      return (
        persistedJudgmentRef ||
        !(
          directlyInspected ||
          requiredEvidenceInspected ||
          backedByEvidenceStore ||
          backedByKnowledge
        )
      );
    });
    if (missing.length > 0) {
      return {
        ok: false,
        reason: "evidence",
        missing,
        message: `Claim "${item.claim}" references evidence not inspected or not in the engineering evidence store: ${missing.join(", ")}`,
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

  const investigation = createInvestigation(userInput);

  const evidence = loadEvidence(workspaceRoot);
  const knowledge = loadKnowledge(workspaceRoot);
  const decisions = loadDecisions(workspaceRoot);
  const traceability = loadTraceability(workspaceRoot);

  const substrateContext = buildSubstrateContext(evidence, knowledge, decisions, traceability);

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
        canonicalizeEvidenceRefs(items, workspaceRoot, evidence);

      const gate = gateJudgment(
        canonicalItems,
        investigation,
        evidence,
        knowledge,
        workspaceRoot
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
              : `You cannot finish yet. ${gate.message}. Inspect the required evidence before judging.`,
        });

        continue;
      }

      const nextStatus = surfaceStatus(canonicalItems);

      if (!canTransition(previousStatus, nextStatus)) {
        messages.push({
          role: "assistant",
          content: JSON.stringify(parsed),
        });

        messages.push({
          role: "user",
          content: `You cannot finish yet. Judging as "${nextStatus}" is not a legal transition from the previous state "${previousStatus}". Legal transitions are blocked -> candidate -> declared.`,
        });

        continue;
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
          content: `Unknown tool "${parsed.tool}". Use read_file.`,
        });
        continue;
      }

      const result = await tool(parsed.input ?? {}, workspaceRoot);

      if (
        parsed.tool === "read_file" &&
        result?.ok &&
        result?.path
      ) {
        const normalized = normalizePath(result.path);

        for (const requiredFile of investigation.requiredFiles) {
          if (
            normalized === requiredFile ||
            normalized.endsWith(`/${requiredFile}`)
          ) {
            investigation.inspectedFiles.add(requiredFile);
          }
        }

        investigation.inspections.push(result);
      }

      messages.push({ role: "assistant", content: JSON.stringify(parsed) });
      messages.push({ role: "tool", content: JSON.stringify(result) });
      continue;
    }

    messages.push({
      role: "user",
      content: `Unknown response type. Respond with exactly one tool call or judgment JSON.`,
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
        evidence_refs: [...investigation.inspectedFiles],
      },
    ];
  }

  let previousJudgmentId = null;
  let previousJudgmentDigest = null;

  if (lineage.state !== "inconsistent") {
    const latest = loadLatestProjection(workspaceRoot);

    if (latest !== null) {
      previousJudgmentId = latest.surface.judgment_id;
      previousJudgmentDigest = latest.digest;
    }
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
    previousJudgmentId,
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
    consumed: [...consumed],
  };
}

  function buildSurface(userInput, investigation, judgment, restrictions, evidence, knowledge, decisions, traceability, previousJudgmentId = null, previousJudgmentDigest = null, commitReason = "judgment") {
    const gaps = investigation.requiredFiles.filter(
      (file) => !investigation.inspectedFiles.has(file)
    );

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
        required_evidence: investigation.requiredFiles,
        inspected_evidence: [...investigation.inspectedFiles],
        gaps,
      },
      evidence: buildEvidenceBlock(
        evidence,
        investigation.inspections,
        knowledge,
        decisions,
        traceability,
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
};
