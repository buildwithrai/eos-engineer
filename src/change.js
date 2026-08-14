import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { sha256 } from "./lineage.js";
import { readFile } from "./tools/readFile.js";
import { validateExecutionReport } from "./execution.js";

export const CHANGE_SCHEMA = "eos-change-node/v1";
export const CONTRACT_SCHEMA = "eos-change-contract/v1";

const CHANGES_DIR = path.join(".eos", "changes");
const LATEST_CHANGE_FILE = path.join(".eos", "change.json");

const LEGAL_STATUSES = ["proposed", "authorized", "executing", "executed", "verified", "failed"];
const LEGAL_ATTEMPT_OUTCOMES = ["pending", "executed", "failed", "aborted"];

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function withinRoot(workspaceRoot, relativePath) {
  const absolute = path.resolve(workspaceRoot, relativePath);

  return absolute !== workspaceRoot && absolute.startsWith(workspaceRoot + path.sep);
}

function workspaceRelative(root, filePath) {
  const normalized = normalizePath(filePath).replace(/^\.\//, "");

  if (!withinRoot(root, normalized)) {
    throw new Error(`path escapes the configured workspace: "${filePath}"`);
  }

  return path.relative(root, path.resolve(root, normalized)).replace(/\\/g, "/");
}

function iso() {
  return new Date().toISOString();
}

export function serializeChange(node) {
  return JSON.stringify(node, null, 2) + "\n";
}

export function changesDirectory(root) {
  return path.join(root, CHANGES_DIR);
}

export function changeDirectory(root, changeId) {
  return path.join(changesDirectory(root), changeId);
}

export function nodeFile(root, changeId, seq) {
  return path.join(changeDirectory(root, changeId), `${String(seq).padStart(4, "0")}.json`);
}

export function latestChangeFile(root) {
  return path.join(root, LATEST_CHANGE_FILE);
}

function judgmentNodeFile(root, judgmentId) {
  return path.join(root, ".eos", "judgments", `${judgmentId}.json`);
}

function loadJudgmentNode(root, judgmentId) {
  const file = judgmentNodeFile(root, judgmentId);

  if (!fs.existsSync(file)) return null;

  try {
    const bytes = fs.readFileSync(file);
    const node = JSON.parse(bytes);
    return { node, bytes, digest: sha256(bytes) };
  } catch {
    return null;
  }
}

function loadLatestNode(root, changeId) {
  const dir = changeDirectory(root, changeId);

  if (!fs.existsSync(dir)) return null;

  const files = fs
    .readdirSync(dir)
    .filter((entry) => /^\d{4}\.json$/.test(entry))
    .sort();

  if (files.length === 0) return null;

  const file = path.join(dir, files[files.length - 1]);

  try {
    const bytes = fs.readFileSync(file);
    const node = JSON.parse(bytes);
    return { node, bytes, digest: sha256(bytes) };
  } catch {
    return null;
  }
}

export function loadChange(root, changeId) {
  const latest = loadLatestNode(root, changeId);
  return latest === null ? null : latest.node;
}

export function loadChanges(root) {
  const dir = changesDirectory(root);

  if (!fs.existsSync(dir)) return [];

  const items = [];

  for (const entry of fs.readdirSync(dir)) {
    const candidate = path.join(dir, entry);

    if (!fs.statSync(candidate).isDirectory()) continue;

    const latest = loadLatestNode(root, entry);

    if (latest === null) continue;

    items.push({
      change: latest.node,
      source: path.join(candidate, `${String(latest.node.seq).padStart(4, "0")}.json`),
      digest: latest.digest,
    });
  }

  items.sort((a, b) => (a.change.change_id < b.change.change_id ? -1 : 1));

  return items;
}

export function latestChange(root) {
  const file = latestChangeFile(root);

  if (!fs.existsSync(file)) return null;

  try {
    const bytes = fs.readFileSync(file);
    const node = JSON.parse(bytes);
    return { change: node, source: file, digest: sha256(bytes) };
  } catch {
    return null;
  }
}

function nextNode(prev, { event, status, patch }) {
  return {
    ...prev,
    ...patch,
    seq: prev.seq + 1,
    event,
    status,
    at: iso(),
    prev_digest: sha256(serializeChange(prev)),
  };
}

function persistNode(root, next, prev) {
  if (prev !== null) {
    next.prev_digest = sha256(serializeChange(prev));
  }

  const file = nodeFile(root, next.change_id, next.seq);

  if (fs.existsSync(file)) {
    throw new Error(`change ledger is write-once; node already exists (${file})`);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });

  const bytes = serializeChange(next);
  fs.writeFileSync(file, bytes);

  const latestFile = latestChangeFile(root);
  const tmpPath = path.join(path.dirname(latestFile), "change.json.tmp");
  fs.mkdirSync(path.dirname(latestFile), { recursive: true });
  fs.writeFileSync(tmpPath, bytes);
  fs.renameSync(tmpPath, latestFile);
}

function isInspected(inspected, relativePath) {
  return inspected.some(
    (file) => file === relativePath || file.endsWith(`/${relativePath}`) || relativePath.endsWith(`/${file}`)
  );
}

function collectContractPaths(contract) {
  const paths = [];

  for (const key of ["changed", "created", "unchanged"]) {
    for (const p of contract.scope?.[key] ?? []) {
      paths.push(p);
    }
  }

  for (const predicate of contract.predicates ?? []) {
    paths.push(predicate.path);
  }

  return [...new Set(paths)];
}

/**
 * Creates a change contract record bound to a declared judgment.
 *
 * The scope (changed/created/unchanged and predicate paths) must be fully
 * grounded in the source judgment's inspected evidence. EOS does not execute;
 * the change record is a candidate, participant-gated contract.
 */
export function createChange(root, { target, objective, source_judgment_id, scope, predicates, restrictions, supersedes_change_id }) {
  if (typeof target !== "string" || target.length === 0) {
    return { ok: false, message: "change target must be a non-empty string" };
  }

  if (typeof objective !== "string" || objective.length === 0) {
    return { ok: false, message: "change objective must be a non-empty string" };
  }

  if (typeof source_judgment_id !== "string" || source_judgment_id.length === 0) {
    return { ok: false, message: "change source_judgment_id must be a non-empty string" };
  }

  if (scope === null || typeof scope !== "object" || Array.isArray(scope)) {
    return { ok: false, message: "change scope must be an object" };
  }

  if (
    typeof supersedes_change_id === "string" &&
    supersedes_change_id.length > 0
  ) {
    const superseded = loadChange(root, supersedes_change_id);

    if (superseded === null) {
      return { ok: false, message: `supersedes_change_id "${supersedes_change_id}" does not exist` };
    }

    if (superseded.status !== "failed") {
      return { ok: false, message: `only a failed change may be superseded ("${supersedes_change_id}" is ${superseded.status})` };
    }
  }

  const source = loadJudgmentNode(root, source_judgment_id);

  if (source === null) {
    return { ok: false, message: `source judgment "${source_judgment_id}" does not exist` };
  }

  if (source.node.status !== "declared") {
    return { ok: false, message: `source judgment "${source_judgment_id}" is not declared; a change contract requires a committed judgment` };
  }

  const inspected = (source.node.investigation?.inspected_evidence ?? []).map(normalizePath);

  const normalizedScope = { changed: [], created: [], unchanged: [] };

  for (const key of ["changed", "created", "unchanged"]) {
    const raw = Array.isArray(scope[key]) ? scope[key] : [];

    for (const filePath of raw) {
      if (typeof filePath !== "string" || filePath.length === 0) {
        return { ok: false, message: `scope.${key} entries must be non-empty strings` };
      }

      try {
        normalizedScope[key].push(workspaceRelative(root, filePath));
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  const all = new Set([...normalizedScope.changed, ...normalizedScope.created, ...normalizedScope.unchanged]);

  if (all.size !== normalizedScope.changed.length + normalizedScope.created.length + normalizedScope.unchanged.length) {
    return { ok: false, message: "scope paths must not be duplicated across changed/created/unchanged" };
  }

  if (normalizedScope.changed.length + normalizedScope.created.length === 0) {
    return { ok: false, message: "change scope must include at least one changed or created path" };
  }

  for (const key of ["changed", "unchanged"]) {
    for (const filePath of normalizedScope[key]) {
      if (!isInspected(inspected, filePath)) {
        return { ok: false, message: `scope.${key} path "${filePath}" is not supported by inspected evidence in the source judgment` };
      }
    }
  }

  for (const filePath of normalizedScope.created) {
    if (isInspected(inspected, filePath)) {
      return { ok: false, message: `scope.created path "${filePath}" is already part of the inspected evidence; it cannot be a new file` };
    }
  }

  const editable = new Set([...normalizedScope.changed, ...normalizedScope.created]);

  const normalizedPredicates = [];

  for (const predicate of Array.isArray(predicates) ? predicates : []) {
    if (predicate === null || typeof predicate !== "object" || Array.isArray(predicate)) {
      return { ok: false, message: "change predicates must be objects with path and contains" };
    }

    if (typeof predicate.path !== "string" || predicate.path.length === 0 || typeof predicate.contains !== "string" || predicate.contains.length === 0) {
      return { ok: false, message: "change predicates require a non-empty path and contains" };
    }

    let predicatePath;

    try {
      predicatePath = workspaceRelative(root, predicate.path);
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }

    if (!editable.has(predicatePath)) {
      return { ok: false, message: `predicate path "${predicate.path}" must be in the changed or created scope` };
    }

    normalizedPredicates.push({ path: predicatePath, contains: predicate.contains });
  }

  const contract = {
    schema: CONTRACT_SCHEMA,
    target,
    objective,
    scope: normalizedScope,
    predicates: normalizedPredicates,
    restrictions: Array.isArray(restrictions) ? restrictions : [],
    source_judgment_id: source_judgment_id,
    source_judgment_digest: source.digest,
    supersedes_change_id: supersedes_change_id ?? null,
  };

  const change = {
    schema: CHANGE_SCHEMA,
    change_id: crypto.randomUUID(),
    seq: 1,
    event: "created",
    status: "proposed",
    at: iso(),
    prev_digest: null,
    contract,
    authorization: null,
    attempts: [],
    verification: null,
  };

  persistNode(root, change, null);

  return { ok: true, change };
}

/**
 * Participant authorization. EOS never authorizes its own changes; the
 * authorization record requires an actor and a non-empty rationale.
 */
export function authorizeChange(root, changeId, { actor, rationale }) {
  if (typeof actor !== "string" || actor.length === 0) {
    return { ok: false, message: "authorization actor must be a non-empty string" };
  }

  if (typeof rationale !== "string" || rationale.length === 0) {
    return { ok: false, message: "authorization rationale must be a non-empty string" };
  }

  const latest = loadLatestNode(root, changeId);

  if (latest === null) {
    return { ok: false, message: `change "${changeId}" does not exist` };
  }

  if (latest.node.status !== "proposed") {
    return { ok: false, message: `change "${changeId}" cannot be authorized from status "${latest.node.status}"; only proposed changes may be authorized` };
  }

  const next = nextNode(latest.node, {
    event: "authorized",
    status: "authorized",
    patch: {
      authorization: {
        actor,
        authorized_at: iso(),
        rationale,
      },
    },
  });

  persistNode(root, next, latest.node);

  return { ok: true, change: next };
}

/**
 * Dispatches the change contract to an execution adapter.
 *
 * The adapter is a plain object with an id and an execute(contract,
 * workspaceRoot) function. EOS never executes; it records the dispatch
 * (including pre-state digests of every contract path), then awaits the
 * adapter's report. An interrupted or failed dispatch leaves the change in
 * status "executing" with a non-pending attempt, so it is resumable.
 */
export async function dispatchChange(root, changeId, adapter) {
  if (adapter === null || typeof adapter !== "object") {
    return { ok: false, message: "execution adapter must be an object with id and execute" };
  }

  if (typeof adapter.id !== "string" || adapter.id.length === 0) {
    return { ok: false, message: "execution adapter must declare a non-empty id" };
  }

  if (typeof adapter.execute !== "function") {
    return { ok: false, message: `execution adapter "${adapter.id}" must implement execute(contract, workspaceRoot)` };
  }

  const latest = loadLatestNode(root, changeId);

  if (latest === null) {
    return { ok: false, message: `change "${changeId}" does not exist` };
  }

  if (!["authorized", "executing"].includes(latest.node.status)) {
    return { ok: false, message: `change "${changeId}" cannot be dispatched from status "${latest.node.status}"` };
  }

  const attempts = latest.node.attempts.map((attempt) =>
    attempt.outcome === "pending" ? { ...attempt, outcome: "aborted" } : attempt
  );

  const preState = [];

  for (const filePath of collectContractPaths(latest.node.contract)) {
    const result = await readFile({ path: filePath }, root);

    if (result.ok) {
      preState.push({ path: filePath, exists: true, digest: sha256(result.content) });
    } else {
      preState.push({ path: filePath, exists: false, digest: null });
    }
  }

  const attempt = {
    attempt_id: crypto.randomUUID(),
    adapter_id: adapter.id,
    dispatched_at: iso(),
    pre_state: preState,
    outcome: "pending",
    report: null,
    report_digest: null,
    error: null,
  };

  const next = nextNode(latest.node, {
    event: "dispatched",
    status: "executing",
    patch: { attempts: [...attempts, attempt] },
  });

  persistNode(root, next, latest.node);

  const contract = contractFor(next);

  let rawReport;

  try {
    rawReport = await adapter.execute(contract, root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return markAttemptFailed(root, next, attempt.attempt_id, message);
  }

  return recordExecution(root, next.change_id, attempt.attempt_id, rawReport);
}

function contractFor(change) {
  return {
    schema: CONTRACT_SCHEMA,
    change_id: change.change_id,
    source_judgment_id: change.contract.source_judgment_id,
    target: change.contract.target,
    objective: change.contract.objective,
    scope: change.contract.scope,
    predicates: change.contract.predicates,
    restrictions: change.contract.restrictions,
    authorization: change.authorization,
  };
}

/**
 * Intakes an adapter execution report. The report is validated against the
 * change contract scope and is recorded as *reported* evidence, never as
 * EOS-observed truth. A rejected report leaves the change resumable.
 */
export async function recordExecution(root, changeId, attemptId, rawReport) {
  const latest = loadLatestNode(root, changeId);

  if (latest === null) {
    return { ok: false, message: `change "${changeId}" does not exist` };
  }

  if (latest.node.status !== "executing") {
    return { ok: false, message: `change "${changeId}" cannot record execution from status "${latest.node.status}"` };
  }

  const index = latest.node.attempts.findIndex((attempt) => attempt.attempt_id === attemptId);

  if (index === -1) {
    return { ok: false, message: `attempt "${attemptId}" does not exist on change "${changeId}"` };
  }

  const attempt = latest.node.attempts[index];

  if (attempt.outcome !== "pending") {
    return { ok: false, message: `attempt "${attemptId}" is not pending (${attempt.outcome}); execution reports are single-intake` };
  }

  const validation = validateExecutionReport(rawReport, {
    adapterId: attempt.adapter_id,
    contract: latest.node.contract,
    workspaceRoot: root,
  });

  if (!validation.ok) {
    const attempts = latest.node.attempts.map((entry, i) =>
      i === index ? { ...entry, outcome: "failed", error: validation.errors.join("; ") } : entry
    );

    const next = nextNode(latest.node, {
      event: "attempt-failed",
      status: "executing",
      patch: { attempts },
    });

    persistNode(root, next, latest.node);

    return {
      ok: false,
      message: `execution report rejected: ${validation.errors.join("; ")}`,
      change: next,
    };
  }

  const reportDigest = sha256(JSON.stringify(validation.report));

  const attempts = latest.node.attempts.map((entry, i) =>
    i === index ? { ...entry, outcome: "executed", report: validation.report, report_digest: reportDigest } : entry
  );

  const next = nextNode(latest.node, {
    event: "executed",
    status: "executed",
    patch: { attempts },
  });

  persistNode(root, next, latest.node);

  return { ok: true, change: next };
}

function markAttemptFailed(root, change, attemptId, error) {
  const attempts = change.attempts.map((attempt) =>
    attempt.attempt_id === attemptId ? { ...attempt, outcome: "failed", error } : attempt
  );

  const next = nextNode(change, {
    event: "attempt-failed",
    status: "executing",
    patch: { attempts },
  });

  persistNode(root, next, change);

  return { ok: false, message: `execution adapter failed: ${error}`, change: next };
}

/**
 * EOS-observed verification. EOS re-reads every contract path itself and
 * compares observed digests against the pre-state snapshot and the adapter's
 * claimed digests. Adapter-reported verification is never sufficient on its
 * own. Verification failure is terminal (status "failed").
 */
export async function verifyChange(root, changeId) {
  const latest = loadLatestNode(root, changeId);

  if (latest === null) {
    return { ok: false, message: `change "${changeId}" does not exist` };
  }

  if (latest.node.status !== "executed") {
    return { ok: false, message: `change "${changeId}" cannot be verified from status "${latest.node.status}"` };
  }

  const attempt = [...latest.node.attempts].reverse().find((entry) => entry.outcome === "executed");

  if (attempt === undefined) {
    return { ok: false, message: `change "${changeId}" has no executed attempt to verify` };
  }

  const contract = latest.node.contract;
  const preMap = new Map((attempt.pre_state ?? []).map((entry) => [entry.path, entry]));
  const claimedMap = new Map(
    (attempt.report?.claimed_changes ?? []).map((claim) => [claim.path, claim])
  );

  const observed = [];
  const contents = new Map();

  for (const filePath of collectContractPaths(contract)) {
    const result = await readFile({ path: filePath }, root);

    if (result.ok) {
      contents.set(filePath, result.content);
      observed.push({ path: filePath, exists: true, digest: sha256(result.content) });
    } else {
      observed.push({ path: filePath, exists: false, digest: null });
    }
  }

  const observedMap = new Map(observed.map((entry) => [entry.path, entry]));

  const findings = [];

  for (const filePath of contract.scope.changed) {
    const pre = preMap.get(filePath);
    const current = observedMap.get(filePath);

    const ok =
      pre !== undefined &&
      pre.exists === true &&
      current !== undefined &&
      current.exists === true &&
      current.digest !== pre.digest;

    findings.push({
      expectation: "changed",
      path: filePath,
      ok,
      detail: ok ? "file content changed from pre-state" : "file did not change from pre-state",
    });
  }

  for (const filePath of contract.scope.created) {
    const pre = preMap.get(filePath);
    const current = observedMap.get(filePath);

    const ok = pre !== undefined && pre.exists === false && current !== undefined && current.exists === true;

    findings.push({
      expectation: "created",
      path: filePath,
      ok,
      detail: ok ? "new file exists and was absent at dispatch" : "new file was not created",
    });
  }

  for (const filePath of contract.scope.unchanged) {
    const pre = preMap.get(filePath);
    const current = observedMap.get(filePath);

    const ok =
      pre !== undefined &&
      pre.exists === true &&
      current !== undefined &&
      current.exists === true &&
      current.digest === pre.digest;

    findings.push({
      expectation: "unchanged",
      path: filePath,
      ok,
      detail: ok ? "file content matches pre-state" : "file was modified outside the change contract",
    });
  }

  for (const predicate of contract.predicates) {
    const current = observedMap.get(predicate.path);
    const content = contents.get(predicate.path) ?? "";
    const ok = current !== undefined && current.exists === true && content.includes(predicate.contains);

    findings.push({
      expectation: "predicate",
      path: predicate.path,
      contains: predicate.contains,
      ok,
      detail: ok ? "predicate content present" : "predicate content not present",
    });
  }

  for (const [filePath, claim] of claimedMap) {
    const pre = preMap.get(filePath);
    const current = observedMap.get(filePath);

    const beforeOk =
      claim.before_digest == null || (pre !== undefined && pre.exists && pre.digest === claim.before_digest);

    const ok =
      beforeOk &&
      current !== undefined &&
      current.exists === true &&
      current.digest === claim.after_digest;

    findings.push({
      expectation: "claimed",
      path: filePath,
      ok,
      claimed_digest: claim.after_digest,
      observed_digest: current !== undefined && current.exists ? current.digest : null,
      detail: ok ? "EOS-observed digest matches the claimed change" : "EOS-observed digest does not match the claimed change",
    });
  }

  const verdict = findings.every((finding) => finding.ok) ? "verified" : "failed";

  const next = nextNode(latest.node, {
    event: verdict,
    status: verdict,
    patch: {
      verification: {
        verified_at: iso(),
        verdict,
        evidence: observed.map((entry) => ({ path: entry.path, exists: entry.exists, digest: entry.digest })),
        findings,
      },
    },
  });

  persistNode(root, next, latest.node);

  return { ok: true, change: next };
}

/**
 * Replays every change ledger node and validates schema, contiguity, chaining,
 * the latest pointer, and that each change remains bound to a declared source
 * judgment. Returns { state: "consistent" | "inconsistent" | "none", ... }.
 */
export function verifyChangeLedger(root) {
  const dir = changesDirectory(root);

  if (!fs.existsSync(dir)) {
    return { state: "none", reason: "missing-changes", changes: [] };
  }

  const latestFile = latestChangeFile(root);

  if (!fs.existsSync(latestFile)) {
    return { state: "inconsistent", reason: "missing-latest-change", changes: [] };
  }

  let latestBytes;
  let latest;

  try {
    latestBytes = fs.readFileSync(latestFile);
    latest = JSON.parse(latestBytes);
  } catch {
    return { state: "inconsistent", reason: "malformed-latest-change", changes: [] };
  }

  if (
    latest.schema !== CHANGE_SCHEMA ||
    typeof latest.change_id !== "string" ||
    !Number.isInteger(latest.seq) ||
    latest.seq < 1
  ) {
    return { state: "inconsistent", reason: "malformed-latest-change", changes: [] };
  }

  const ids = fs
    .readdirSync(dir)
    .filter((entry) => {
      try {
        return fs.statSync(path.join(dir, entry)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();

  const changes = [];

  for (const id of ids) {
    const changeDir = path.join(dir, id);
    const files = fs
      .readdirSync(changeDir)
      .filter((entry) => /^\d{4}\.json$/.test(entry))
      .sort();

    if (files.length === 0) continue;

    let previousBytes = null;

    for (let k = 1; k <= files.length; k += 1) {
      const expected = `${String(k).padStart(4, "0")}.json`;

      if (files[k - 1] !== expected) {
        return { state: "inconsistent", reason: "non-contiguous-sequence", change_id: id, seq: k, changes: [] };
      }

      const file = path.join(changeDir, expected);
      const bytes = fs.readFileSync(file);
      let node;

      try {
        node = JSON.parse(bytes);
      } catch {
        return { state: "inconsistent", reason: "malformed-node", change_id: id, seq: k, changes: [] };
      }

      if (node.schema !== CHANGE_SCHEMA) {
        return { state: "inconsistent", reason: "invalid-schema", change_id: id, seq: k, changes: [] };
      }

      if (node.change_id !== id) {
        return { state: "inconsistent", reason: "id-mismatch", change_id: id, seq: k, changes: [] };
      }

      if (node.seq !== k) {
        return { state: "inconsistent", reason: "seq-mismatch", change_id: id, seq: k, changes: [] };
      }

      if (!LEGAL_STATUSES.includes(node.status)) {
        return { state: "inconsistent", reason: "invalid-status", change_id: id, seq: k, changes: [] };
      }

      if (k > 1 && node.prev_digest !== sha256(previousBytes)) {
        return { state: "inconsistent", reason: "prev-digest-mismatch", change_id: id, seq: k, changes: [] };
      }

      previousBytes = bytes;
    }

    const finalFile = path.join(changeDir, files[files.length - 1]);
    const finalNode = JSON.parse(fs.readFileSync(finalFile, "utf8"));
    const source = loadJudgmentNode(root, finalNode.contract?.source_judgment_id);

    if (source === null || source.node.status !== "declared") {
      return { state: "inconsistent", reason: "dangling-source-judgment", change_id: id, changes: [] };
    }

    changes.push({
      change: finalNode,
      source: finalFile,
      digest: sha256(fs.readFileSync(finalFile)),
    });
  }

  const pointerFile = nodeFile(root, latest.change_id, latest.seq);

  if (!fs.existsSync(pointerFile)) {
    return { state: "inconsistent", reason: "dangling-latest-change", changes: [] };
  }

  if (sha256(fs.readFileSync(pointerFile)) !== sha256(latestBytes)) {
    return { state: "inconsistent", reason: "latest-change-mismatch", changes: [] };
  }

  return {
    state: "consistent",
    reason: "ok",
    changes,
    latest: { change_id: latest.change_id, seq: latest.seq },
  };
}

export function changeIdFromRef(ref) {
  if (typeof ref !== "string") return null;

  if (ref.startsWith("change:")) {
    const id = ref.slice("change:".length).trim();
    return id.length > 0 ? id : null;
  }

  const match = ref.match(/(?:^|\/)\.eos\/changes\/([^/]+)\//);

  if (match) return match[1];

  return null;
}

export function isChangeRef(ref, changes = []) {
  const id = changeIdFromRef(ref);

  if (id === null) return false;

  return changes.some(
    (record) => (record.change ?? record).change_id === id
  );
}

export function changeVerdictOutcome(change) {
  if (change === null || typeof change !== "object") return "unresolved";

  if (change.status === "verified") return "forward";
  if (change.status === "failed") return "regression";

  return "unresolved";
}
