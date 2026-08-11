# Experiment-12 — F-Expanded-4 Cross-Project Reasoning Boundary

## Purpose

Attempt to falsify F-Expanded-4 (EOS-PRODUCT-ARCHITECTURE.md Section 12):

> EOS can own cross-project / portfolio reasoning as judgment across
> project projections without owning portfolio coordination, per-project
> canonical state, or the portfolio composition model.

Expected architectural distinction under test (not assumed; falsify if the
evidence contradicts it):

> OCS/IGE produce per-project canonical projections and the deterministic
> portfolio composition. EOS judges across those projections — relative
> priority, cross-project dependencies, risk concentration, gaps, and
> trade-offs — as candidate state. Portfolio coordination belongs to IGE's
> ecosystem layer; per-project canonical state stays OCS-owned.

Mode: design/reconciliation only. No code, no tests, no IGE/OCS change, no
EWA migration, no repository restructuring.

---

## Observed Evidence

### Project and portfolio model (lineage)

- IGE hierarchy places Projects → Products → Organizations at the bottom;
  implementation is downstream. [observed]
- Omnia `.ige/inspect.json` materializes per-project state: phase,
  active_thread, open_decisions, blocking_issues, coverage, gaps,
  runtime.synced_at. [observed]
- EWA indexes a single repository; `repositoryMap` returns workspace
  inventory. [observed]
- OCS pipeline (ADR-0008) frames per-repository engineering pipelines.
  [observed]
- "Today there is one project state (Omnia) ... There is no portfolio layer
  that composes projects for judgment. EOS judgment operates on a project
  (e.g., a repo or a workspace) as its subject, not on the portfolio.
  Portfolio coordination belongs to IGE's ecosystem layer, not EOS."
  [proposed, EOS-ARCHITECTURE-RECONCILIATION.md Section 11]
- "Portfolio-wide judgment | Belongs to IGE ecosystem layer"
  [proposed, EOS-ARCHITECTURE-RECONCILIATION.md Section 17]
- Product baseline (superseding the reconciliation doc): "Cross-project /
  portfolio reasoning | Judgment across project projections | New"
  [proposed, EOS-PRODUCT-ARCHITECTURE.md Section 5]

### Reconciliation of the two lineage statements

The reconciliation doc's [proposed] statements assign PORTFOLIO
COORDINATION (governance of the portfolio, its composition and canonical
state) to IGE's ecosystem layer. The product doc assigns CROSS-PROJECT
JUDGMENT (judgment over the set of project projections) to EOS. These are
different concerns; the product doc's own phrasing — "Judgment across
project projections" — preserves the coordination/judgment split, exactly
as Section 10 (F-Plan) split planning judgment from canonical project state.

### IGE / OCS contracts

- ADR-0001: every fact exactly one canonical representation; derived
  artifacts disposable.
- ADR-0004: AI reasons, does not rediscover; AI consumes, not produces.
- ADR-0008: deterministic per-repository pipeline (Discover -> RKM ->
  Analyze -> Verify -> Transform -> Present -> Persist).
- Runtime State: Observed, Declared (human-owned), Derived, Validated,
  Blocked.
- REASONING.md: judgment evaluates; judgment does not act; decision belongs
  to participants; participants act.
- F2 (Experiment-02): judgment is evidence-gated probabilistic synthesis
  (Model B), not deterministic derivation (Model A).
- F9 (Experiment-07): one EOS participant, one projection identity; any
  independent projection/capability/boundary falsifies.

### EOS-established facts

- Discovery-01/02: EOS owns Intelligence; `.eos/judgment.json` is a
  non-canonical projection; F5-F8 hold.
- Anti-fabrication: declared/candidate claims MUST cite inspected files or
  real evidence ids; fabricated refs rejected (gateJudgment).
- F-Plan (Experiment-08): EOS judges, Engineer declares, deterministic
  reconciler renders.
- F-Expanded-1 (Experiment-09): risk/dependency judgment; canonical truth
  stays outside EOS.
- F-Expanded-2 (Experiment-10): proposals are candidate; EOS never
  implements, never auto-decides.
- F-Expanded-3 (Experiment-11): requirements reasoning is candidate
  judgment; deterministic review findings consumed, not re-derived.

---

## Reasoning — The Distinctions

### 1. Project projection

Each project's legible canonical state: `.ige/inspect.json`, decisions,
evidence, traceability, knowledge. OCS/IGE own these deterministically,
per project (ADR-0008 per-repository pipeline). EOS consumes each
projection read-only. A project is a subject of judgment; cross-project
reasoning does not make the portfolio a new subject class.

Verdict: EOS is a consumer of per-project projections.

### 2. Portfolio composition

Who composes projects into a portfolio for judgment? The deterministic
composition — inventory, aggregate metrics, cross-project dependency edges
— belongs to IGE's ecosystem layer / deterministic layer. Today no
composition exists ("no portfolio layer" [observed]); EOS must not invent a
canonical portfolio model as a substitute. EOS consumes whatever
composition exists; it never owns it.

Verdict: portfolio composition is IGE ecosystem-layer / deterministic;
EOS consumes.

### 3. Cross-project judgment

EOS judges across the composed projections: relative priority, cross-project
dependencies, risk concentration, gaps, sequencing, trade-offs. This is
judgment — F2 Model B. Identical aggregate metrics do not determine a unique
cross-project verdict (context, strategy, and uncertainty shape it). It is
Intelligence over multiple project subjects, emitted as a single EOS
candidate projection.

Verdict: cross-project judgment is EOS-owned Intelligence.

### 4. Portfolio record / coordination state

Canonical portfolio coordination state (the portfolio's composition,
aggregates, governance decisions) belongs to IGE's ecosystem layer. EOS
never writes it, never renders it, never classifies its judgment into
portfolio state. EOS's cross-project projection is candidate and
non-canonical — never a competing portfolio record (ADR-0001).

Verdict: portfolio record/coordination state is IGE ecosystem-layer-owned;
EOS never writes it.

### 5. Evidence across projects

Cross-project claims remain evidence-gated. Each ref must resolve within
its project's store: an inspected file path (per project) or a real
evidence id (in the cited project's evidence store). The gate generalizes
across projections without weakening: a cross-project claim may cite
evidence from project B only if that evidence id exists in B's store or the
file was inspected. Anti-fabrication holds across projects.

Verdict: the evidence gate extends across project stores; no fabricated
cross-project refs.

### 6. Projection

EOS's cross-project reasoning is one candidate projection in `.eos/`,
attributable to EOS, timestamped, evidence-referenced, reconciler-inert
(F5/F6/F7/F8). It is not per-project canonical state and not a second
project repository. Consistent with F9: one participant, one projection
identity, reasoning over many subjects.

Verdict: cross-project reasoning projects through the single `.eos/`
surface.

### 7. Deterministic aggregate vs judgment

Aggregate portfolio metrics (counts, sums, coverage per project) are
Derived state — deterministic, OCS/ecosystem-owned. Cross-project judgment
(significance, priority, concentration, trade-off) is EOS's. The metrics
are evidence; the judgment is synthesis. EOS consumes the metrics; it never
publishes them as its own canonical truth.

Verdict: aggregates are consumed as evidence; judgment is EOS's.

### 8. Action

EOS recommends across projects; it never coordinates, reconciles, or
implements across them. Participants decide; deterministic machinery acts
per project (OCS per-repo pipelines, IGE ecosystem coordination). EOS's
recommendations are candidate proposals (Experiment-10), consumed through
the participant-decision channel (Experiment-08).

Verdict: EOS recommends; coordination/implementation stays deterministic
and participant-owned.

---

## Converse Test

If EOS were forbidden from cross-project reasoning because "portfolio
coordination belongs to IGE's ecosystem layer," the reconciliation doc's
own distinction would be misread: coordination and judgment are different
capabilities, as Section 10 already showed for planning. Forbidding
cross-project judgment would reduce multi-project insight to deterministic
aggregates, discarding the prioritization, risk-concentration, and trade-off
judgment that is exactly not a function of the aggregates (F2 Model A
fails). The converse confirms the boundary rather than falsifying it.

Converse-falsification remains: if cross-project reasoning is a pure
deterministic function of aggregate portfolio state, it belongs to the
deterministic layer and EOS is redundant — see FC-C4.

---

## Falsification Criteria

F-Expanded-4 FALSIFIED if EOS must:

**FC-C1 — own the portfolio composition / coordination state** (canonical
portfolio inventory, aggregates, or governance of the portfolio — IGE
ecosystem-layer breach).

**FC-C2 — write per-project canonical state** (any project's
`inspect.json`, decisions, evidence, traceability, or knowledge).

**FC-C3 — classify cross-project judgment as Observed/Derived/Validated**
(judgment into runtime categories; F6 breach).

**FC-C4 — have cross-project reasoning be a pure deterministic derivation**
from aggregated canonical state (no evidence-gated judgment). If true, it
belongs to the deterministic layer, not EOS.

**FC-C5 — feed its cross-project projection to a reconciler as canonical
input** (F5 breach).

**FC-C6 — act across projects** (coordinate, reconcile, or implement from
judgment; F9/implementation boundary breach).

**FC-C7 — cite un-inspected or nonexistent cross-project evidence** (an
evidence id from another project's store that does not exist, or a file
never inspected — anti-fabrication breach).

**FC-C8 — become a second project repository or second ecosystem layer**
(structural duplication of OCS per-repo pipelines or IGE ecosystem
governance).

Converse falsification: if cross-project reasoning is a pure deterministic
function of aggregate metrics, it belongs to the deterministic layer and
EOS is redundant (F2 Model A holds).

---

## Verdict

F-Expanded-4 — NOT FALSIFIED.

- Project projection: consumed, never owned.
- Portfolio composition: IGE ecosystem-layer / deterministic; EOS
  consumes; no portfolio layer exists today and EOS must not invent one
  as canonical.
- Cross-project judgment: EOS-owned Intelligence (F2 Model B).
- Portfolio record/coordination state: IGE ecosystem-layer-owned; EOS
  never writes it.
- Evidence across projects: gate generalizes across stores; no fabricated
  cross-project refs.
- Projection: single `.eos/` candidate surface, reconciler-inert (F9
  consistent).
- Deterministic aggregate vs judgment: aggregates consumed as evidence;
  judgment is EOS's.
- Action: EOS recommends; participants decide; deterministic machinery
  acts per project.
- Converse: coordination vs judgment are different capabilities; forbidding
  judgment collapses multi-project insight into aggregates.

The reconciliation doc's "portfolio coordination belongs to IGE's ecosystem
layer" and the product doc's "cross-project reasoning is EOS-owned judgment"
are consistent once coordination (governance, canonical composition) is
separated from judgment (synthesis over projections) — the same split as
Section 10.

The expected architectural distinction survives the evidence:

> OCS/IGE produce per-project canonical projections and the deterministic
> portfolio composition. EOS judges across those projections — relative
> priority, cross-project dependencies, risk concentration, gaps, and
> trade-offs — as candidate state. Portfolio coordination belongs to IGE's
> ecosystem layer; per-project canonical state stays OCS-owned.

---

## Surviving Boundary

> EOS consumes per-project canonical projections (inspect.json, decisions,
> evidence, traceability, knowledge) and whatever deterministic portfolio
> composition exists. EOS judges across projects — priority, dependency,
> risk concentration, gaps, trade-offs — as candidate state in `.eos/`,
> with every evidence ref resolving within a real project store. EOS never
> owns the portfolio composition/coordination state (IGE ecosystem layer),
> never writes per-project canonical state, never classifies its judgment
> into runtime categories, never feeds a reconciler, and never coordinates
> or implements across projects. EOS recommends; participants decide;
> deterministic machinery acts per project.

Bindings:

- B1. Cross-project projections are non-canonical `.eos/` state
  (F5/F6/F7/F8) under a single EOS identity (F9).
- B2. EOS consumes the deterministic portfolio composition; it must not
  invent a canonical portfolio model (ADR-0001; F-Absorb C1).
- B3. Cross-project evidence refs resolve within real project stores;
  anti-fabrication holds across projects.
- B4. Portfolio coordination is IGE ecosystem-layer-owned; EOS never
  writes or renders it.
- B5. EOS action is recommendation, never coordination/implementation
  (REASONING.md; Experiment-08; Experiment-10).

---

## Unresolved Questions

1. Whether the deterministic portfolio composition exists at all — no
   portfolio layer is observed today; EOS's cross-project reasoning depends
   on a composition that does not yet exist. [observed -> unknown]
2. How a cross-project evidence ref is identified when two projects use
   independent evidence id namespaces — resolution scheme unspecified.
3. Whether cross-project reasoning is one judgment act over many subjects or
   many project-scoped judgments composed — projection-shape question, not
   architecture.
4. Whether IGE ecosystem-layer coordination will materialize as a capability
   (or remain in the ecosystem layer) — the coordination side of the split
   is unowned today.
5. Whether cross-project recommendation feeds planning intelligence per
   project through the participant-decision channel (Experiment-08) — the
   multi-project channel is unspecified.

---

## Smallest Next Experiment

Run the F2 Model A/B test at the portfolio surface: take identical
aggregate metrics for two projects (identical counts, coverage, dependency
edges, risk totals) in two different organizational contexts and attempt to
derive the cross-project priority deterministically. If the priority
legitimately differs (given strategy, criticality, concentration,
uncertainty), Model A fails and cross-project reasoning is judgment —
confirming the boundary. If the priority is identical in all cases, it
collapses to deterministic aggregation and FC-C4/converse falsification
triggers. Separately, gate-test across stores: a cross-project claim citing
a nonexistent evidence id in project B is rejected; a claim citing B's real
evidence id (or an inspected file) is accepted.

---

## Status

Not falsified.
