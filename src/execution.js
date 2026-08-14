import path from "node:path";

const REPORT_VERDICTS = ["passed", "failed", "unresolved"];

const HEX64 = /^[0-9a-f]{64}$/;

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function withinRoot(workspaceRoot, relativePath) {
  const absolute = path.resolve(workspaceRoot, relativePath);

  return absolute !== workspaceRoot && absolute.startsWith(workspaceRoot + path.sep);
}

/**
 * Validates an execution report produced by an execution adapter.
 *
 * The report is *reported* evidence: EOS never treats it as observed truth.
 * It must be self-consistent, bounded to the change contract scope, and
 * carry digests so EOS can cross-check its own re-reads.
 *
 * Returns { ok: true, report } with normalized paths, or { ok: false, errors }.
 */
export function validateExecutionReport(raw, { adapterId, contract, workspaceRoot }) {
  const errors = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["execution report must be an object"] };
  }

  if (raw.adapter_id !== adapterId) {
    errors.push(
      `execution report adapter_id "${String(raw.adapter_id)}" does not match the dispatched adapter "${adapterId}"`
    );
  }

  const scopePaths = new Set(
    [
      ...(contract.scope?.changed ?? []),
      ...(contract.scope?.created ?? []),
    ].map((p) => normalizePath(p))
  );

  const claimed = Array.isArray(raw.claimed_changes) ? raw.claimed_changes : [];

  if (claimed.length === 0) {
    errors.push("execution report must include claimed changes with evidence");
  }

  const normalizedClaims = [];

  for (const [index, claim] of claimed.entries()) {
    const at = `claimed_changes[${index}]`;

    if (claim === null || typeof claim !== "object" || Array.isArray(claim)) {
      errors.push(`${at} must be an object`);
      continue;
    }

    if (typeof claim.path !== "string" || claim.path.length === 0) {
      errors.push(`${at} is missing a path`);
      continue;
    }

    const normalizedPath = normalizePath(claim.path);

    if (!withinRoot(workspaceRoot, normalizedPath)) {
      errors.push(`${at} path escapes the configured workspace: "${claim.path}"`);
      continue;
    }

    if (!scopePaths.has(normalizedPath)) {
      errors.push(
        `${at} path "${claim.path}" is outside the change contract scope (changed or created)`
      );
      continue;
    }

    if (typeof claim.after_digest !== "string" || !HEX64.test(claim.after_digest)) {
      errors.push(`${at} must include a 64-hex after_digest`);
    }

    if (
      claim.before_digest !== undefined &&
      claim.before_digest !== null &&
      (typeof claim.before_digest !== "string" || !HEX64.test(claim.before_digest))
    ) {
      errors.push(`${at} before_digest must be a 64-hex digest when present`);
    }

    normalizedClaims.push({
      path: normalizedPath,
      before_digest: claim.before_digest ?? null,
      after_digest: claim.after_digest,
    });
  }

  const verification = Array.isArray(raw.verification) ? raw.verification : [];

  if (!Array.isArray(raw.verification)) {
    errors.push("execution report verification must be an array");
  }

  const normalizedVerification = [];

  for (const [index, entry] of verification.entries()) {
    const at = `verification[${index}]`;

    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${at} must be an object`);
      continue;
    }

    if (typeof entry.kind !== "string" || entry.kind.length === 0) {
      errors.push(`${at} is missing a kind`);
    }

    if (typeof entry.name !== "string" || entry.name.length === 0) {
      errors.push(`${at} is missing a name`);
    }

    if (!REPORT_VERDICTS.includes(entry.outcome)) {
      errors.push(
        `${at} outcome must be one of ${REPORT_VERDICTS.join(", ")}`
      );
    }

    if (
      entry.artifact_digest !== undefined &&
      entry.artifact_digest !== null &&
      (typeof entry.artifact_digest !== "string" || !HEX64.test(entry.artifact_digest))
    ) {
      errors.push(`${at} artifact_digest must be a 64-hex digest when present`);
    }

    normalizedVerification.push({
      kind: entry.kind,
      name: entry.name,
      outcome: entry.outcome,
      output: entry.output,
      artifact_digest: entry.artifact_digest ?? null,
    });
  }

  const artifacts = Array.isArray(raw.artifacts) ? raw.artifacts : [];

  const normalizedArtifacts = [];

  for (const [index, artifact] of artifacts.entries()) {
    const at = `artifacts[${index}]`;

    if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) {
      errors.push(`${at} must be an object`);
      continue;
    }

    if (typeof artifact.path !== "string" || artifact.path.length === 0) {
      errors.push(`${at} is missing a path`);
      continue;
    }

    const normalizedPath = normalizePath(artifact.path);

    if (!withinRoot(workspaceRoot, normalizedPath)) {
      errors.push(`${at} path escapes the configured workspace: "${artifact.path}"`);
      continue;
    }

    if (typeof artifact.digest !== "string" || !HEX64.test(artifact.digest)) {
      errors.push(`${at} must include a 64-hex digest`);
    }

    normalizedArtifacts.push({ path: normalizedPath, digest: artifact.digest });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    report: {
      adapter_id: adapterId,
      claimed_changes: normalizedClaims,
      verification: normalizedVerification,
      artifacts: normalizedArtifacts,
      note: typeof raw.note === "string" ? raw.note : null,
    },
  };
}
