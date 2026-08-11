# Experiment-08 — F-Plan Planning Intelligence / Deterministic Reconciler Boundary

## Purpose

Attempt to falsify F-Plan (EOS-PRODUCT-ARCHITECTURE.md Section 10):

> EOS owns planning intelligence — triage, prioritization, sequencing,
> estimation, backlog/Kanban/burndown recommendations — while OCS/IGE
> remain the canonical deterministic owners of project state and
> reconciliation.

Origin: the product requirement that EOS can "create project
backlogs/Kanban/burndown."

Mode: design/reconciliation only. No code, no tests, no IGE/OCS change,
no EWA migration, no repository restructuring.

---

## Claim Under Test

EOS may own planning judgment and project candidate/non-canonical planning
content, without owning canonical project state, without producing
Observed/Derived/Validated state, without performing deterministic
reconciliation, and without duplicating a canonical OCS/IGE
representation. The converse: if deterministic systems cannot consume EOS
planning intelligence at all, the product requirement may be
architecturally impossible under current ecosystem contracts.

---

## Observed Evidence

### IGE — governance and runtime

- KNOWLEDGE_FLOW: knowledge flows downward; evidence flows upward.
  Decision sits between Discovery and Architecture.
- RECONCILER.md / RECONCILER_CONTRACT.md: "Reconcilers transform observed
  facts into engineering artifacts. Reconcilers never invent information."
  Input: canonical observation model (typically .ige/inspect.json).
  Output: exactly one engineering artifact — PROJECT_STATE, PROJECT_BACKLOG,
  PROJECT_TIMELINE, PROJECT_METRICS, PROJECT_HANDOFF. Properties:
  Deterministic, Idempotent, Observable ("every output shall trace directly
  to observed repository facts"), Stateless, Replaceable, Traceable.
- Runtime State categories: Observed, Declared ("human-owned engineering
  declarations"), Derived, Validated, Blocked.
- runtime/scripts/reconcile: renders .ige/inspect.json -> .ige/PROJECT_STATE.md
  via declared-field extraction; empty declared fields render as placeholders.
  Demonstrates the deterministic render-declared-values pattern.
- Templates PROJECT_BACKLOG.md (Ready / In Progress / Waiting / Blocked /
  Complete), PROJECT_TIMELINE.md (Phase | Status | Started | Finished),
  PROJECT_METRICS.md (discoveries, experiments, ADRs, contracts,
  migrations, services, test coverage, technical debt, open questions).
- generate-backlog.sh, generate-timeline.sh, generate-metrics.sh,
  generate-handoff.sh, update-state.sh: EMPTY (0 bytes). The backlog/
  timeline/metrics reconcilers are contracted but not implemented.
- REASONING.md: "Judgment does not act. Judgment produces engineering
  conclusions. Decision belongs to participants. Participants decide.
  Observation discovers. Knowledge accumulates. Judgment evaluates.
  Participants act."

### OCS — deterministic observation foundation

- ADR-0001 (Accepted): every engineering fact shall have exactly one
  canonical representation; derived artifacts are disposable; "Model once.
  Consume everywhere. Never duplicate engineering knowledge."
- ADR-0002 (Accepted): RKM is the canonical representation of repository
  knowledge; consumers interact only with the RKM.
- ADR-0004 (Accepted): "AI should reason. AI should not rediscover." AI
  consumes the RKM rather than rediscovering repository state. "AI becomes
  another consumer of engineering knowledge rather than another producer of
  repository understanding."
- ADR-0008 (Accepted): deterministic pipeline Discover -> RKM -> Analyze ->
  Verify -> Transform -> Present -> Persist.
- Manifesto Phase 2: AI consumes the Repository Knowledge Graph. Phase 3
  (Autonomous Engineering): engineering recommendations, drift detection,
  "technical debt prioritization," build-vs-buy. Prioritization is an
  OCS-recognized AI capability; the graph remains canonical.

### EOS — established facts

- Discovery-01 (Confirmed): EOS owns Intelligence (Foundational).
- Discovery-02 (Confirmed): `.eos/judgment.json` is a non-canonical
  projection; "EOS does not write PROJECT_STATE.md, PROJECT_BACKLOG.md, or
  any reconciler artifact. Those are deterministic runtime outputs." F5:
  projection never a reconciler input. F6: judgment is never
  Observed/Derived/Validated. F8: runtime output unchanged by `.eos/`.
- Phase 2 substrate reconciliation (Confirmed): decisions are Declared
  state, traceability Derived, evidence Observed/Validated; EOS consumes
  them read-only; decision IDs are context, not evidence.
- ADR-ECOSYSTEM-0001: ownership unique; consumption unlimited; consumers
  execute canonical capabilities, they do not duplicate or own them.
  Runtime is IGE-owned.

---

## Reasoning — The Six Distinctions

### 1. Planning judgment

EOS may judge priority, sequencing, risk significance, dependencies,
estimates, and proposed work. This is probabilistic, evidence-gated
judgment — the Intelligence capability (Discovery-01). It is declared/
candidate state; it fits none of the five runtime categories (F6).

Constitutional check: does any of it invent canonical truth? No. It is
judgment, not derivation. Estimation is judgment over evidence, not a
reconciler derivation. "Judgment does not act" (REASONING.md) — planning
judgment produces conclusions, it does not mutate state.

Verdict: survives. Planning judgment is EOS-owned Intelligence.

### 2. Planning projection

EOS emits candidate/non-canonical planning content through `.eos/` (e.g.,
planning claims within judgment.json, or a dedicated planning projection).
Same discipline as Discovery-02: legible, timestamped, explicitly
non-canonical, readable by a plain consumer (F7), never a reconciler input
(F5), runtime output unchanged by its presence (F8).

Verdict: survives. Planning projection is EOS-owned surface.

### 3. Canonical project state

What remains owned and produced by deterministic machinery:

- `.ige/inspect.json` — canonical observation model (IGE inspect)
- `.ige/PROJECT_STATE.md` — rendered by IGE reconcile
- PROJECT_BACKLOG.md / PROJECT_TIMELINE.md / PROJECT_METRICS.md /
  PROJECT_HANDOFF.md — canonical reconciler outputs (IGE Reconciler
  Contract; templates exist; reconcilers contracted, not yet implemented)
- RKM — canonical repository knowledge (OCS)
- Declared decisions / Derived traceability — deterministic Declared/
  Derived state (Phase 2)
- Business reality — Omnia

EOS owns none of these. The Reconciler Contract names PROJECT_BACKLOG and
PROJECT_TIMELINE as deterministic outputs; EOS must not become their owner
(ADR-ECOSYSTEM-0001; Discovery-02).

Verdict: survives. Canonical project state stays OCS/IGE/Omnia-owned.

### 4. Reconciliation

Can EOS feed planning intelligence into the deterministic reconciliation
pipeline without becoming the reconciler?

Direct feed is forbidden: the reconciler's input is the canonical
observation model (inspect.json); accepting EOS judgment as canonical
input would be an F5 breach and would make EOS a producer of repository
understanding (ADR-0004).

The surviving channel: EOS produces candidate planning conclusions; the
Engineer — the deciding participant (REASONING.md: "Decision belongs to
participants") — adopts or adapts them; the adoption is a human-owned
Declared declaration; the deterministic reconciler renders Declared state
(verified pattern: runtime/scripts/reconcile renders declared fields from
inspect.json). The pipeline's input remains canonical Declared state, not
EOS judgment. EOS never becomes the reconciler; Runtime stays IGE-owned.

Verdict: survives. EOS feeds the pipeline only through participant
decision; it never reconciles.

### 5. Backlog / Kanban / burndown — three separate concerns

Each splits into a judgment part (EOS) and a deterministic part (OCS/IGE):

- Backlog: judgment = proposing work items, triage, prioritization,
  estimation. Deterministic = the PROJECT_BACKLOG.md artifact (status
  buckets Ready / In Progress / Waiting / Blocked / Complete) and
  item-status facts. EOS "creates" the backlog as intelligence content and
  ordering; the canonical backlog artifact is rendered from declared state.
- Kanban: deterministic presentation of workflow state (columns = status;
  item positions are state). Judgment = pull decisions (what to pull next),
  WIP-limit policy, forecast. EOS contributes judgment; the board is
  presentation derived from canonical state.
- Burndown: deterministic measurement — remaining work over time, computed
  from declared estimates, observed completions, and elapsed time. EOS
  contributes the estimates (judgment, candidate until declared). The
  burndown chart is a disposable derived artifact (ADR-0001).

No single capability: the three share deterministic status/measurement
machinery and share EOS judgment inputs, but each has its own deterministic
artifact and its own judgment contribution. Conflating them into "EOS
creates backlogs/Kanban/burndown" is what produced the boundary risk.

Verdict: survives. Judgment parts are EOS-owned; artifacts and measurements
are deterministic.

### 6. Mutation boundary

Two candidate answers examined against the contracts:

- (a) EOS directly writes canonical state: FALSIFIED. Discovery-02
  explicitly forbids EOS writing PROJECT_BACKLOG.md or any reconciler
  artifact; ADR-0004 forbids AI as a producer of repository understanding.
- (b) EOS issues commands/proposals that cause deterministic systems to
  update canonical state from EOS judgment: FALSIFIED as an EOS judgment
  path. If the deterministic system derives canonical state from EOS
  judgment, the runtime has accepted probabilistic judgment as canonical
  input (F5 breach) and EOS has become a producer via indirection
  (ADR-0004) — the indirection does not change the constitutional
  violation.
- Surviving path: EOS proposals are candidate state readable by the
  Engineer; the Engineer's acceptance is a human-owned Declared decision;
  the deterministic reconciler renders Declared decisions. EOS influences
  canonical state only through participant decision.

Verdict: survives only with the participant-decision channel. EOS neither
writes canonical state nor commands the pipeline from its judgment.

---

## Converse Failure

If deterministic systems cannot consume EOS planning intelligence at all —
neither directly (forbidden) nor through participant-adopted declarations
— then "create project backlogs/Kanban/burndown" would be
architecturally impossible under current ecosystem contracts, and the
requirement (not the architecture) would have to be amended.

Assessment: the deterministic systems CAN consume planning intelligence
through the participant-decision channel. The requirement is achievable
but must be read as "EOS creates planning intelligence; deterministic
machinery creates canonical planning artifacts from declared decisions."
A reading that requires EOS to produce canonical planning artifacts
directly is architecturally impossible and is reframed.

---

## Falsification Criteria

F-Plan FALSIFIED if EOS must itself:

**FC-P1 — own canonical project state.** EOS owns or produces
PROJECT_BACKLOG.md / PROJECT_TIMELINE.md / PROJECT_METRICS.md / RKM or any
canonical project-state artifact, or holds a canonical ownership row for
project state.

**FC-P2 — produce Observed/Derived/Validated state.** EOS planning claims
are classified as runtime categories.

**FC-P3 — perform deterministic reconciliation.** EOS's planning projection
is canonical reconciler input (F5 breach), or EOS implements a reconciler
(duplicating IGE's Runtime).

**FC-P4 — become the source of repository/project truth.** Canonical
artifacts derive from EOS judgment rather than from observed facts and
human-owned declarations (ADR-0001, ADR-0004).

**FC-P5 — duplicate a canonical OCS/IGE representation.** EOS maintains a
competing canonical backlog/timeline/metrics representation.

**FC-P6 (converse) — architectural impossibility.** If deterministic
systems cannot consume EOS planning intelligence by any means, and the
product requirement is retained as stated, the requirement is
architecturally impossible under current ecosystem contracts.

---

## Verdict

F-Plan — NOT FALSIFIED.

- Planning judgment: EOS-owned Intelligence. Survives.
- Planning projection: EOS-owned non-canonical surface. Survives.
- Canonical project state: stays OCS/IGE/Omnia-owned. Survives.
- Reconciliation: EOS never reconciles; runtime stays IGE-owned. Survives.
- Backlog/Kanban/burndown: separable; judgment parts EOS-owned,
  artifacts/measurements deterministic. Survives.
- Mutation boundary: EOS neither writes canonical state nor commands the
  pipeline from its judgment. The participant-decision channel is the only
  surviving path. Survives with a binding boundary.
- Converse: not triggered — the channel exists; the requirement is
  achievable when read as "EOS creates planning intelligence."

---

## Surviving Planning Boundary

> EOS owns planning judgment and its candidate projection. EOS never owns,
> writes, or renders canonical project state; it never produces
> Observed/Derived/Validated state; it never implements or feeds a
> reconciler. EOS's planning intelligence reaches canonical project state
> only through a participant decision: EOS judges, the Engineer declares,
> the deterministic reconciler renders.

Bindings on any implementation:

- B1. EOS planning projections live under `.eos/` and are non-canonical
  (F5, F6, F7, F8).
- B2. No deterministic reconciler consumes `.eos/` (F5).
- B3. EOS produces no canonical planning artifact (Discovery-02).
- B4. Estimates, priorities, and sequencing are judgment (candidate) until
  a participant's declaration makes them Declared state.
- B5. Backlog/Kanban/burndown are treated as three concerns, each split
  into judgment input and deterministic artifact/measurement.
- B6. The backlog/timeline/metrics reconcilers are IGE Runtime outputs
  (ADR-ECOSYSTEM-0001); their absence (empty scripts) is a deterministic
  gap, not an EOS opportunity.

---

## Unresolved Questions

1. The canonical schema for Declared planning values (estimate, priority,
   sequencing) inside the canonical observation model is unspecified —
   inspect.json has no declared planning fields today. The render-declared
   pattern exists (reconcile) but no schema for planning declarations.
2. The deterministic backlog/timeline/metrics reconcilers are contracted
   but not implemented (empty scripts). F-Plan assumes they will exist.
3. Whether the Engineer-in-the-loop adoption is accepted as the intended
   boundary, or whether the product requires autonomous pipeline mutation
   (which F-Plan finds constitutionally impossible).
4. Whether OCS's Phase 3 AI capabilities (prioritization) and EOS's
   planning intelligence are the same capability owned once, or two
   consumers — an ownership-matrix question (F-Expanded territory).
5. Whether `.eos/` needs a dedicated planning projection or extends
   judgment.json — implementation choice, not architecture.

---

## Smallest Next Experiment

Test FC-P4 (source-of-truth) and FC-P6 (impossibility) concretely: model
one planning decision end-to-end at the schema level — EOS proposes a
priority + estimate for one item (candidate); the Engineer declares the
item's priority and estimate (Declared); the hypothetical backlog
reconciler renders PROJECT_BACKLOG.md. Verify: EOS wrote nothing canonical,
the reconciler consumed only Declared state, and the item appears in the
canonical artifact. If the render fails without EOS judgment in the
pipeline, the declared-schema gap (unresolved question 1) must be closed
by IGE before planning content can flow.

---

## Status

Not falsified.
