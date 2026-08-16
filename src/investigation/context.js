/**
 * EOS Investigation Context
 *
 * Model-facing representation of deterministic investigation state.
 */

export function investigationFingerprint(investigation) {
  return JSON.stringify({
    inspected: [...investigation.inspectedEvidence].sort(),
    adopted: [...investigation.adoptedRequirements].sort(),
    dependencies: investigation.discoveredDependencies
      .map(
        (dependency) =>
          `${dependency.to}:${dependency.status}:${dependency.reason ?? ""}`
      )
      .sort(),
    prospective: [...investigation.prospectiveArtifacts].sort(),
    observations: investigation.observations
      .map(
        (observation) =>
          `${observation.path}:${observation.digest}:${observation.bytes}:${observation.lines}`
      )
      .sort(),
  });
}

export function investigationStatusBlock(investigation) {
  const phase = phaseOf(investigation);
  const completion = completionReason(investigation);
  const understanding = understandingOf(investigation);

  const pending = investigation.discoveredDependencies.filter(
    (dependency) => dependency.status === "pending"
  );

  const waived = investigation.discoveredDependencies.filter(
    (dependency) => dependency.status === "waived"
  );

  const lines = [
    "INVESTIGATION STATE",
    `Mode: ${investigation.mode}`,
    `Phase: ${phase}`,
    `Completion: ${completion.status} (${completion.reason})`,
    `Understanding: ${understanding.observations.length} evidence observation${
      understanding.observations.length === 1 ? "" : "s"
    } on ${understanding.inspected.length} inspected file${
      understanding.inspected.length === 1 ? "" : "s"
    }${understanding.obligations.some((o) => o.pending) ? "; evidence obligations pending" : ""}`,
  ];

  if (investigation.mode === "formation") {
    lines.push(
      "Formation: project-formation investigation. The recorded engineer intent is citable evidence (intent:<id> or the record path). The formation result is a candidate proposal; canonicalization is the Engineer's act."
    );
  }

  if (investigation.explicitRequirements.size > 0) {
    lines.push(
      `Explicit requirements: ${[...investigation.explicitRequirements].join(", ")}`
    );
  }

  if (investigation.adoptedRequirements.size > 0) {
    lines.push(
      `Adopted requirements: ${[...investigation.adoptedRequirements].join(", ")}`
    );
  }

  if (investigation.inspectedEvidence.size > 0) {
    lines.push(
      `Inspected evidence: ${[...investigation.inspectedEvidence].join(", ")}`
    );
  }

  const obligations = Array.isArray(investigation.evidenceObligations)
    ? investigation.evidenceObligations
    : [];

  if (obligations.length > 0) {
    lines.push("Evidence obligations:");
    for (const obligation of obligations) {
      const status = obligation.pending ? "pending" : "satisfied";
      const satisfiedBy =
        Array.isArray(obligation.satisfiedBy) && obligation.satisfiedBy.length > 0
          ? obligation.satisfiedBy.join(", ")
          : "none";
      lines.push(
        `- [${status}] ${obligation.id}: ${obligation.statement} (kinds: ${obligation.kinds.join(", ")}; satisfied by: ${satisfiedBy})`
      );
    }
  }

  if (pending.length > 0) {
    lines.push(
      `Pending discovered relationships (adopt or waive before judging): ${pending
        .map((dependency) => `${dependency.from} -> ${dependency.to}`)
        .join(", ")}`
    );
  }

  if (waived.length > 0) {
    lines.push(
      `Waived relationships: ${waived
        .map(
          (dependency) =>
            `${dependency.from} -> ${dependency.to} (${dependency.reason ?? "no reason"})`
        )
        .join(", ")}`
    );
  }

  lines.push(
    phase === "complete"
      ? "The investigation is complete; candidate and declared judgment are permitted."
      : phase === "obligations"
        ? "Evidence obligations are pending; candidate and declared judgment require evidence that satisfies them."
        : "The investigation is not complete; candidate and declared judgment are rejected until it is."
  );

  return lines.join("\n");
}

export function withInvestigationState(investigation, content) {
  return `${content}\n\n${investigationStatusBlock(investigation)}`;
}

export function requiredReadDirective(investigation, files) {
  const scope = scopeOf(investigation);
  const missing = (Array.isArray(files) ? files : []).filter(
    (file) =>
      typeof file === "string" &&
      file.length > 0 &&
      scope.has(file)
  );

  if (missing.length === 0) return "";

  return ` Call read_file or read_files with: ${missing.join(", ")}.`;
}

export function planGuidance(parsed, investigation) {
  const parts = [];

  const adoptList = Array.isArray(parsed?.adopt) ? parsed.adopt : [];
  const waiveList = Array.isArray(parsed?.waive) ? parsed.waive : [];

  const adoptedExplicit = adoptList.filter(
    (file) =>
      typeof file === "string" &&
      investigation.explicitRequirements.has(file)
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

import {
  phaseOf,
  scopeOf,
  completionReason,
  understandingOf,
} from "../investigation.js";
