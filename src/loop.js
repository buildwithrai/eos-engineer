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

Never claim to have inspected a file unless the read_file tool returned it.

A declared or candidate claim MUST reference only:
- files you actually inspected, or
- evidence ids listed in the ENGINEERING EVIDENCE block below.

Never invent an evidence id. An evidence_ref that does not resolve to inspected
evidence or to a listed evidence id will be rejected.
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
    evidence: [],
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

function gateJudgment(judgment, investigation, evidence = []) {
  const inspected = [...investigation.inspectedFiles];

  for (const item of judgment) {
    if (item.type === "blocked") continue;

    const refs = Array.isArray(item.evidence_refs) ? item.evidence_refs : [];

    if (refs.length === 0) {
      return {
        ok: false,
        missing: [],
        message: `Claim "${item.claim}" references no evidence. Provide evidence_refs.`,
      };
    }

    const missing = refs.filter(
      (ref) =>
        !inspected.some(
          (file) =>
            file === normalizePath(ref) ||
            file.endsWith(`/${normalizePath(ref)}`)
        ) && !evidenceExists(evidence, ref)
    );

    if (missing.length > 0) {
      return {
        ok: false,
        missing,
        message: `Claim "${item.claim}" references evidence not inspected or not in the engineering evidence store: ${missing.join(", ")}`,
      };
    }
  }

  return { ok: true };
}

async function runEos(userInput, { workspace, chatFn = chat, maxIterations = 10 } = {}) {
  const workspaceRoot = path.resolve(workspace);
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

  for (let i = 0; i < maxIterations; i++) {
    const response = await chatFn(messages);

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

      const gate = gateJudgment(items, investigation, evidence);

      if (!gate.ok) {
        messages.push({
          role: "assistant",
          content: JSON.stringify(parsed),
        });
        messages.push({
          role: "user",
          content: `You cannot finish yet. ${gate.message}. Inspect the required evidence before judging.`,
        });
        continue;
      }

      finalJudgment = items;
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

      if (parsed.tool === "read_file" && investigation.requiredFiles.length > 0) {
        const requestedPath = parsed.input?.path;

        const validRequestedPath =
          typeof requestedPath === "string" &&
          investigation.requiredFiles.includes(normalizePath(requestedPath));

        if (!validRequestedPath) {
          const nextRequiredFile = investigation.requiredFiles.find(
            (file) => !investigation.inspectedFiles.has(file)
          );

          if (nextRequiredFile) {
            parsed.input = { path: nextRequiredFile };
          }
        }
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

        investigation.evidence.push(result);
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
    finalJudgment = [
      {
        claim: "Investigation iteration limit reached without judgment",
        type: "blocked",
        confidence: "low",
        evidence_refs: [...investigation.inspectedFiles],
      },
    ];
  }

  const surface = buildSurface(userInput, investigation, finalJudgment, restrictions, evidence, knowledge, decisions, traceability);
  writeSurface(workspaceRoot, surface);

  return surface;
}

function buildEvidenceBlock(evidence, knowledge, decisions, traceability, judgment) {
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
    knowledge:
      knowledge === undefined
        ? undefined
        : {
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

function buildSurface(userInput, investigation, judgment, restrictions, evidence, knowledge, decisions, traceability) {
  const gaps = investigation.requiredFiles.filter(
    (file) => !investigation.inspectedFiles.has(file)
  );

  const recordedAt = new Date().toISOString();
  const investigationId = crypto.randomUUID();
  const judgmentId = crypto.randomUUID();

  const status =
    judgment.some((item) => item.type === "blocked")
      ? "blocked"
      : judgment.some((item) => item.type === "candidate")
        ? "candidate"
        : "declared";

  return {
    schema: "eos-judgment/v1",
    judgment_id: judgmentId,
    investigation_id: investigationId,
    recorded_at: recordedAt,
    status,
    investigation: {
      target: investigation.target,
      required_evidence: investigation.requiredFiles,
      inspected_evidence: [...investigation.inspectedFiles],
      gaps,
    },
    evidence: buildEvidenceBlock(evidence, knowledge, decisions, traceability, judgment),
    judgment: judgment.map((item) => ({
      ...item,
      evidence_refs: Array.isArray(item.evidence_refs) ? item.evidence_refs : [],
    })),
    restrictions,
  };
}

function writeSurface(workspaceRoot, surface) {
  const eosDir = path.join(workspaceRoot, ".eos");

  if (!fs.existsSync(eosDir)) {
    fs.mkdirSync(eosDir, { recursive: true });
  }

  const finalPath = path.join(eosDir, "judgment.json");
  const tmpPath = path.join(eosDir, "judgment.json.tmp");

  fs.writeFileSync(tmpPath, JSON.stringify(surface, null, 2) + "\n");
  fs.renameSync(tmpPath, finalPath);
}

export { runEos };
