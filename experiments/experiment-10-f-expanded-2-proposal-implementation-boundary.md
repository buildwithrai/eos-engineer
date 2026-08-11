# Experiment-10 — F-Expanded-2 Proposal Generation / Implementation Boundary

## Purpose

Attempt to falsify F-Expanded-2 (EOS-PRODUCT-ARCHITECTURE.md Section 12):

> EOS can own proposal generation as an Intelligence capability while
> proposals remain non-canonical candidate projections and implementation
> remains outside EOS.

Expected boundary under test (not assumed; falsify if the evidence
contradicts it):

> Evidence -> EOS judgment -> candidate proposal -> Engineer/participant
> decision -> deterministic/authorized implementation -> new evidence.

Mode: design/reconciliation only. No code, no tests, no IGE/OCS change, no
EWA migration, no repository restructuring.

---

## Observed Evidence

### EOS implementation (src/loop.js, src/evidence.js)

- `runEos` loads evidence, knowledge, decisions, traceability — all
  read-only (`loadEvidence`, `loadDecisions`, `loadTraceability`,
  `loadKnowledge`; `fs.readFileSync` only).
- `gateJudgment`: a declared/candidate claim MUST reference inspected files
  or evidence ids listed in the ENGINEERING EVIDENCE block. Unresolvable
  refs are rejected. Blocked claims carry no evidence requirement.
- Judgment types: declared / candidate / blocked. A proposal is expressible
  as a candidate claim — no new judgment type is required.
- `writeSurface` writes exactly one artifact: `.eos/judgment.json`
  (atomic tmp + rename). EOS has no write path to evidence, decisions,
  knowledge, or any canonical artifact.
- The surface schema: `{ schema, investigation, evidence, judgment,
  restrictions }`; each judgment claim carries `evidence_refs` and
  `recorded_at` (timestamped, attributable to EOS).

### EWA lineage — change/proposal primitive

- `EngineeringChangeRequest.analyze(request)` returns `{ request, impact,
  plan, questions }`. `impact` is deterministic reachability
  (`impactAnalysis`). `plan` = target, file, affectedFiles, affectedCount,
  and a `validation` list of recommended verification steps (build
  packages, rebuild knowledge, verify MCP tools, verify downstream).
- Grep of the change module, the MCP server, and the agent package found
  NO apply / implement / patch / commit / mutate / write path. The
  `change_plan` MCP tool returns JSON text only. EWA's change primitive is
  analysis/proposal, never implementation.
- Proposal and decision are separate tools: `engineering_change_request`
  (analysis) vs `engineering_create_decision` /
  `engineering_supersede_decision` (Declared records via
  EngineeringDecisionCommandService). No auto-link from change request to
  decision exists.

### IGE / OCS contracts

- ENGINEER principle: "Observe. Discover. Decide. Build. Improve. Teach."
  Build belongs to the Engineer.
- KNOWLEDGE_FLOW: Implementation is the lowest layer — downstream of
  Architecture and Operation. Knowledge flows down; evidence flows up.
- REASONING.md: "Judgment does not act. Judgment produces engineering
  conclusions. Decision belongs to participants. Participants act."
- Runtime State: Observed, Declared (human-owned), Derived, Validated,
  Blocked.
- Reconciler Contract: reconcilers never invent; input is the canonical
  observation model.
- ADR-0001: every fact exactly one canonical representation; derived
  artifacts disposable.
- ADR-0004: AI reasons, does not rediscover; AI is a consumer, not a
  producer of repository understanding.
- Phase 2 verdict: Decisions are Declared state; traceability is Derived;
  evidence is Observed/Validated. Decision IDs are context, not evidence.
  EOS consumes read-only; EOS never writes decisions/traceability.

---

## Reasoning — The Eight Distinctions

### 1. Proposal

A candidate EOS judgment: "given the evidence, this change appears
appropriate." This is Intelligence — probabilistic, evidence-gated,
candidate state (F2 Model B). It is a `candidate` claim in `.eos/` with
resolved evidence_refs (gateJudgment). It is never a runtime category (F6).

Verdict: proposal generation is EOS-owned Intelligence.

### 2. EngineeringChangeRequest

What survives from EWA: the `analyze()` shape — request + deterministic
impact + proposed plan (sequence/approach) + recommended validation. It is
absorbed as EOS-owned candidate-state proposal machinery: EOS runs
evidence-gated judgment over the deterministic impact analysis and emits a
candidate proposal. The `validation` list is a recommendation, not
execution. Nothing in the lineage applies a change. Under F-Absorb this is
an Intelligence-internal primitive.

Verdict: the primitive survives as proposal analysis; it is not reconciled
into implementation or into decisions.

### 3. Implementation plan

EOS's proposed sequence/approach (steps, affected files, validation
recommendations) is candidate state — a judgment artifact in `.eos/`. It is
distinct from canonical implementation state: what was actually done is
Observed; what was declared as the plan is Declared; EOS's plan is neither.
The deterministic artifacts (PROJECT_TIMELINE etc.) stay deterministic
(F-Plan); the plan is a proposal, not the canonical plan.

Verdict: EOS proposes plans; canonical implementation state is
deterministic/participant-owned.

### 4. Decision

A human/participant declaration (Declared) remains distinct from EOS's
proposal. Phase 2: decisions are Declared state and context, not evidence.
A proposal must not silently acquire Decision status merely because it is
well supported. Lineage confirms separation: change-request analysis and
decision creation are separate tools with no auto-link. The transition
proposal -> decision requires a participant act (create/supersede decision
via the deterministic command service).

Verdict: proposal (candidate EOS judgment) and decision (Declared
participant declaration) are distinct; no conflation exists or is permitted.

### 5. Implementation

Actual change authority lives with the participant — the Engineer. ENGINEER
principle ("Decide. Build."), REASONING.md ("Participants act"), and
KNOWLEDGE_FLOW (Implementation is the downstream layer) all place
implementation outside EOS. No EWA/OCS/IGE mechanism applies a proposal to
the repository. The deterministic path: the participant implements; then
deterministic verification (build, knowledge rebuild, verification steps)
confirms outcome; then the outcome is recorded as Observed evidence.

Verdict: implementation authority is the participant's; EOS never
implements.

### 6. Canonical artifact

Does an accepted proposal become canonical anywhere, and through which
path? The proposal record itself never becomes canonical; it stays a
candidate in `.eos/`. Its consequences do, through deterministic
participant-owned commands:

- acceptance -> Declared decision record (create_decision,
  EngineeringDecisionCommandService);
- observed outcome -> Observed/Validated evidence record
  (record_evidence, reconcile).

Both writes belong to the deterministic command layer, not EOS (Phase 2
boundary 1). The path is proposal (candidate) -> participant declaration ->
Declared decision + subsequent Observed evidence.

Verdict: an accepted proposal becomes canonical only as Declared decision
and Observed evidence, through deterministic participant-owned commands.

### 7. Evidence

A proposal must remain evidence-gated. What makes it citable without
turning the proposal into evidence: the proposal's `evidence_refs` resolve
to inspected files or listed evidence ids (gateJudgment). The support is
citable; the proposal is not a source of fact. Evidence is Observed/
Validated state recorded by the deterministic command service — EOS never
writes evidence and never treats its own proposal as evidence. A proposal
may cite a decision id only as inspected context, never as gating evidence
(Phase 2).

Verdict: proposals are evidence-gated; a proposal is never evidence.

### 8. Projection

Architectural properties of a proposal projection:

- candidate/non-canonical — a candidate claim, never canonical truth;
- attributable to EOS — the `.eos/` surface carries EOS identity;
- timestamped — `recorded_at` per claim;
- evidence-referenced — evidence_refs resolved and gated;
- reconciler-inert — never reconciler input (F5); runtime output unchanged
  by its presence (F8);
- legible to plain consumers (F7).

The existing `.eos/judgment.json` schema already satisfies all properties;
a proposal is a candidate claim within it (or a proposal block with the
same properties). No new canonical machinery is required.

Verdict: the proposal projection properties hold within the existing
non-canonical surface.

---

## Converse Test

If EOS could not generate an actionable proposal because implementation
authority remains outside EOS, would that reduce Intelligence to passive
analysis? No. An actionable proposal is decision-ready: candidate,
evidence-gated, carrying impact analysis and recommended validation. It is
actionable precisely because the participant can decide and implement.
Actionability is decision-readiness, not execution authority. The converse
would hold only if EOS could not produce proposals at all — and it can. The
converse therefore confirms the boundary.

---

## Falsification Criteria

F-Expanded-2 FALSIFIED if EOS must:

**FC-PP1 — directly implement a proposal** (apply/commit/mutate source).

**FC-PP2 — directly mutate canonical repository/project state** (write
canonical artifacts, decisions, evidence, or runtime state).

**FC-PP3 — treat its proposal as Observed/Derived/Validated truth** (a
proposal classified as a runtime category; F6 breach).

**FC-PP4 — make a decision on behalf of the Engineer/participant** (EOS's
proposal auto-acquires Decision status, or EOS invokes decision commands).

**FC-PP5 — become the canonical store of implementation state** (a
canonical row or competing representation of implementation).

**FC-PP6 — bypass the deterministic/project-owned implementation path**
(EOS commanding implementation from its judgment, or executing the
change outside participant authorization).

---

## Verdict

F-Expanded-2 — NOT FALSIFIED.

- Proposal: EOS-owned candidate Intelligence.
- EngineeringChangeRequest: survives as EOS-owned proposal analysis; never
  implements, never auto-decides.
- Implementation plan: candidate EOS judgment; canonical implementation
  state stays deterministic/participant-owned.
- Decision: Declared participant declaration, distinct from EOS's proposal;
  no conflation.
- Implementation: authority is the participant's (Engineer); no mechanism
  in the lineage applies proposals.
- Canonical artifact: an accepted proposal becomes canonical only as
  Declared decision + Observed evidence, via deterministic participant
  commands.
- Evidence: proposals are evidence-gated; a proposal is never evidence.
- Projection: candidate/non-canonical, EOS-attributable, timestamped,
  evidence-referenced, reconciler-inert — all properties hold in `.eos/`.
- Converse: actionability is decision-readiness, not execution; no
  reduction to passive analysis.

The expected boundary survives the evidence:

> Evidence -> EOS judgment -> candidate proposal -> Engineer/participant
> decision -> deterministic/authorized implementation -> new evidence.

Proposal and decision are not conflated: proposal is candidate EOS
judgment; decision is Declared participant declaration; the transition
requires a participant act.

---

## Surviving Proposal/Implementation Boundary

> EOS generates proposals as candidate, evidence-gated, non-canonical
> projections in `.eos/`. EOS never implements a proposal, never mutates
> canonical repository/project state, never classifies a proposal as
> Observed/Derived/Validated, never decides on behalf of the participant,
> and never bypasses the deterministic/project-owned implementation path.
> An accepted proposal becomes canonical only as a Declared decision and
> subsequent Observed evidence, through deterministic participant-owned
> commands. Implementation authority resides with the Engineer.

Bindings:

- B1. Proposal projections satisfy candidate/non-canonical,
  EOS-attributable, timestamped, evidence-referenced, reconciler-inert
  properties (F5/F6/F7/F8).
- B2. Proposal -> decision requires a participant act; a well-supported
  proposal never auto-becomes a decision.
- B3. EOS has no write path beyond `.eos/` (observed in src/loop.js).
- B4. EOS recommendation of validation/verification steps is candidate
  content; execution of those steps is participant/deterministic.
- B5. Proposals cite evidence; proposals are never evidence.

---

## Unresolved Questions

1. Whether a proposal is a candidate claim within judgment.json or a
   dedicated proposal block on the same surface — implementation choice,
   not architecture.
2. Whether the deterministic command layer that records decisions/evidence
   exists as the canonical participant-owned channel for EOS proposals —
   decisions/evidence command services exist in EWA lineage; their
   canonical ownership post-absorption is unresolved (Section 11).
3. Whether an accepted proposal should also produce a Declared
   implementation-plan record (analogous to decisions) or whether the plan
   remains EOS candidate state only — an open declared-schema question.
4. How an outcome's new evidence is guaranteed to be recorded only by the
   participant/deterministic layer, never by EOS — operational, but
   required to keep F-Expanded-2 and Phase 2 boundaries intact.

---

## Smallest Next Experiment

Model one proposal end-to-end at the schema level: EOS emits a candidate
proposal claim with impact + validation in `.eos/`; verify (a) the evidence
gate resolves every ref, (b) no canonical write occurs, (c) runtime output
is byte-identical with and without the proposal (F8), and (d) the proposal
is legible to a plain consumer (F7). Then confirm that promoting the
proposal to a decision requires an explicit participant create_decision
act — verifying proposal/decision separation at the boundary.

---

## Status

Not falsified.
