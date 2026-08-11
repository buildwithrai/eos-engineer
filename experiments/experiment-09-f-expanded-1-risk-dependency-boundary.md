# Experiment-09 — F-Expanded-1 Risk & Dependency Judgment Boundary

## Purpose

Attempt to falsify F-Expanded-1 (EOS-PRODUCT-ARCHITECTURE.md Section 12):

> EOS can own probabilistic risk/dependency judgment over deterministic
> OCS/EWA influence data without absorbing deterministic observation,
> analysis, or reconciliation ownership.

Expected architectural distinction under test (not assumed; falsify if the
evidence contradicts it):

> OCS observes and deterministically analyzes dependency/influence.
> EOS judges significance, priority, uncertainty, and engineering
> consequence. EOS projects that judgment as candidate/intelligence state.
> Canonical truth remains outside EOS.

Mode: design/reconciliation only. No code, no tests, no IGE/OCS change, no
EWA migration, no repository restructuring.

---

## Observed Evidence

### EWA — deterministic influence machinery (lineage)

- RepositoryKnowledgeQuery (packages/workspace/src/query/
  RepositoryKnowledgeQuery.ts) over the RepositoryKnowledgeCache:
  - `dependencyContext(target)` — deterministic filters: symbol, imports,
    importers, exports, packageDependencies.
  - `impactOf(target)` — deterministic BFS reachability over import edges:
    affectedFiles, affectedImports, count.
  - `architectureContext(target)` — role + relationship sets (imports,
    importedBy, exports, dependencies).
  - `statistics()` — deterministic counts (symbols, imports, exports,
    packageDependencies).
- EngineeringIntelligence.riskAnalysis(target)
  (packages/agent/src/intelligence/EngineeringIntelligence.ts): pure
  arithmetic over the knowledge index — symbol exists (boolean), counts of
  imports/importers/exports/packageDependencies. It is influence data, not
  judgment; no significance is asserted.

### EWA — Risk artifact (lineage)

- Risk artifact (packages/engineering/src/artifacts/Risk.ts):
  `{ type: "risk", impact: low|medium|high, probability: low|medium|high }`.
  Impact/probability are judgment levels. Created by
  EngineeringArtifactFactory.risk(...) with base fields (id, title,
  description, status "active", timestamps). No command service currently
  calls `.risk(` — the factory and the indexer's "risk" fallback
  classification exist; no writer is wired.
- EngineeringIndexer.detectType: any file outside discoveries/requirements/
  research/decisions classifies as "risk" — a catch-all label, not a
  significance computation.

### OCS — canonical dependency analysis (lineage)

- capabilities/dependencies/index.mjs: reads RKM graph nodes (package.json)
  and computes deterministic totals — packages, dependencies,
  devDependencies. Pure counts from the canonical model.
- ADR-0002: RKM is the canonical representation of repository knowledge;
  consumers interact only with the RKM.
- ADR-0003: dependencies point toward the RKM; the graph is the canonical
  dependency structure.
- ADR-0008: deterministic pipeline Discover -> RKM -> Analyze -> Verify ->
  Transform -> Present -> Persist. Analyze is a deterministic stage.
- observation-contract.md: events are facts; projectors create
  understanding; observations expose understanding; consumers consume
  observation contracts, not storage tables.

### IGE / OCS contracts

- ADR-0001: every fact exactly one canonical representation; derived
  artifacts disposable; never duplicate.
- ADR-0004: AI reasons, does not rediscover; AI is a consumer, not a
  producer of repository understanding.
- Runtime State categories: Observed, Declared (human-owned), Derived,
  Validated, Blocked.
- REASONING.md: judgment evaluates; judgment does not act; decision belongs
  to participants; participants act.
- Reconciler Contract: reconcilers never invent; input is canonical
  observation model.
- F2 (Experiment-02): judgment is evidence-gated probabilistic synthesis
  (Model B), not a deterministic derivation (Model A). Judgment cannot be a
  reconciler artifact. Model B held: identical canonical input can produce
  different judgment.

### EOS-established facts

- Discovery-01: EOS owns Intelligence (Foundational).
- Discovery-02: `.eos/judgment.json` is a non-canonical projection; F5
  projection never reconciler input; F6 judgment never Observed/Derived/
  Validated; F7 legible to plain consumers; F8 runtime purity.
- F-Absorb C1 (Experiment-06): EOS owns no canonical deterministic
  repository-knowledge generator; its index is a disposable derived cache
  sourced from canonical knowledge.
- F-Plan (Experiment-08): EOS judges, the Engineer declares, the
  deterministic reconciler renders; EOS never owns/writes/renders canonical
  project state and never acts on it.

---

## Reasoning — The Eight Distinctions

### 1. Observed dependency

A deterministic fact about an actual repository/system relationship —
"package A depends on package B" (package.json metadata), "file F imports
symbol S" (import edge). Canonical ownership: OCS RKM (ADR-0002, ADR-0003);
Observed state in the IGE model. EWA's import/export/package indexers are
deterministic representations of observed dependencies. EOS consumes this
truth; EOS does not discover or own it.

Verdict: EOS is a consumer. If EOS must discover dependencies itself rather
than consume OCS/RKM truth, the boundary is falsified — no such requirement
exists.

### 2. Derived influence

A deterministic calculation over observed facts: dependency counts, impact
counts, graph reachability, affected artifacts. Evidence: `impactOf` BFS
reachability, `statistics` counts, `riskAnalysis` counts, OCS dependency
capability totals. This is Derived state — computed deterministically from
observed facts (ADR-0008 Analyze stage).

The boundary question: may EOS compute influence at all? Under F-Absorb C1,
EOS's index is a disposable derived cache sourced from canonical knowledge.
EOS may query/consume deterministic influence data (from OCS RKM/analytics
or from its disposable context); EOS never publishes counts or reachability
as canonical truth. The authoritative deterministic influence model is
OCS's.

Verdict: EOS consumes; deterministic analysis ownership stays with OCS/IGE.
If EOS must become the deterministic risk calculator — the authoritative
influence computation — the boundary is falsified. No such requirement
exists.

### 3. Risk significance

EOS judgment about what the observed/derived facts mean for engineering
risk. Evidence: identical counts (e.g., 12 importers) can carry different
significance depending on context, criticality, blast radius, and
uncertainty. Significance is not a function of the counts alone — it is
evidence-gated probabilistic synthesis over the influence data, matching F2
Model B. The `Risk` artifact's impact/probability levels are judgment
fields, not computed fields.

Verdict: risk significance is EOS-owned Intelligence.

### 4. Risk priority

EOS judgment about what deserves attention first — prioritization over
significance and urgency. Candidate state, consistent with F-Plan's
planning priority. EOS does not mutate a canonical queue; it judges order.

Verdict: risk priority is EOS-owned Intelligence.

### 5. Risk record

What category is a risk record, and who owns it canonically?

- Content (significance, probability, consequence): EOS judgment —
  declared/candidate state in EOS's own categories (Discovery-02), never a
  runtime category (F6). A risk is not Observed (not collected), not
  Derived (not computed from facts), not Validated (not process-confirmed).
- Record as a canonical artifact: if a participant adopts the risk, the
  record becomes Declared state — human-owned declaration, analogous to
  decisions (Phase 2 verdict). The deterministic artifact store owns the
  record; the write belongs to the deterministic command layer, not EOS
  (Phase 2 boundary 1).
- EOS may hold the same risk as candidate state in `.eos/` without creating
  a second canonical representation (ADR-0001), because `.eos/` is
  explicitly non-canonical.

Verdict: risk record = Declared state when adopted, owned by the
deterministic artifact store; content originates as EOS candidate judgment.
EOS never writes or classifies the canonical record.

### 6. Dependency record

Canonical dependency truth (the RKM edges: package.json dependencies,
import relationships) is distinct from EOS's interpretation of dependency
significance. Canonical truth: OCS RKM (ADR-0002). EOS interpretation:
significance judgment — never a competing canonical representation
(ADR-0001). If EOS's disposable context derives from the RKM, it remains a
cache; the published dependency truth is OCS's.

Verdict: canonical dependency truth stays OCS-owned; EOS owns only its
interpretation.

### 7. Projection

What EOS may expose in `.eos/` without creating a second canonical
representation: risk/dependency significance judgments (candidate),
priority orderings, uncertainty assessments, consequence statements, and
evidence refs citing the canonical dependency/impact facts and inspected
files. EOS must not project a competing dependency graph or canonical
impact count. The surface stays legible, timestamped, non-canonical
(F5/F7/F8).

Verdict: EOS projects judgment, never canonical truth.

### 8. Action

EOS recommends actions (mitigation, verification, monitoring) as candidate
proposals. EOS does not directly cause deterministic project state to
change: it does not write canonical state, does not run runtime scripts
(e.g., promote-blocking), and does not command deterministic systems to act
from EOS judgment. Consistent with F-Plan's mutation boundary and
REASONING.md: EOS recommends; the participant decides; deterministic
machinery acts.

Verdict: EOS recommends, never acts.

---

## Converse Test

If EOS were forbidden from expressing risk significance because
deterministic systems already calculate influence counts, judgment would be
collapsed into deterministic analysis.

This is incorrect: the counts are evidence; significance is judgment (F2
Model A fails — identical influence data does not determine significance).
Forbidding significance would reduce risk to arithmetic, discarding
uncertainty, context, and consequence — the parts that require judgment.
The converse therefore confirms the boundary rather than falsifying it:
deterministic influence analysis and risk significance judgment are
different capabilities, and both are needed.

---

## Falsification Criteria

F-Expanded-1 FALSIFIED if EOS must:

**FC-R1 — discover dependencies itself** rather than consume OCS/RKM truth.

**FC-R2 — own canonical dependency relationships** (a row for dependency
truth, or a competing canonical graph).

**FC-R3 — produce Observed/Derived/Validated dependency or risk state**
(its significance classified as a runtime category; F6 breach).

**FC-R4 — duplicate the OCS canonical dependency model** (ADR-0001 breach:
a second authoritative dependency representation).

**FC-R5 — become the deterministic risk calculator** (own the authoritative
influence computation; ADR-0008 Analyze ownership).

**FC-R6 — reconcile risk into canonical project state** (EOS's risk
projection as reconciler input; F5 breach).

**FC-R7 — act directly on project state** (write canonical state, run
runtime scripts, or command deterministic systems from EOS judgment).

Converse falsification: if risk significance is a pure deterministic
function of influence data, then risk judgment belongs to the deterministic
layer and EOS is redundant for risk (F2 Model A holds).

---

## Verdict

F-Expanded-1 — NOT FALSIFIED.

- Observed dependency: consumed, never discovered/owned.
- Derived influence: consumed; deterministic analysis stays OCS/IGE-owned.
- Risk significance: EOS-owned Intelligence (F2 Model B).
- Risk priority: EOS-owned Intelligence.
- Risk record: Declared state when adopted, owned by the deterministic
  artifact store; content originates as EOS candidate judgment.
- Dependency record: canonical truth OCS-owned; EOS owns interpretation.
- Projection: EOS projects judgment, never canonical truth.
- Action: EOS recommends; participants decide; deterministic machinery
  acts.
- Converse: significance is not derivable from counts; forbidding it would
  collapse judgment into arithmetic.

The expected architectural distinction survives the evidence:

> OCS observes and deterministically analyzes dependency/influence.
> EOS judges significance, priority, uncertainty, and engineering
> consequence. EOS projects that judgment as candidate/intelligence state.
> Canonical truth remains outside EOS.

---

## Surviving Boundary

> EOS consumes OCS/IGE canonical dependency and influence data (RKM,
> counts, reachability, impact) as evidence. EOS judges risk significance,
> priority, uncertainty, and consequence as candidate state in `.eos/`.
> EOS never discovers dependencies, owns canonical dependency truth, or
> becomes the authoritative influence calculator. EOS never classifies
> judgment as Observed/Derived/Validated, never reconciles risk into
> canonical state, and never acts on project state. EOS recommends;
> participants declare; deterministic machinery acts and owns the records.

Bindings:

- B1. EOS risk projections are non-canonical `.eos/` state (F5/F6/F7/F8).
- B2. EOS consumes deterministic influence data; its own computation of
  counts/reachability is disposable context (F-Absorb C1), never published
  as canonical.
- B3. A canonical risk record is Declared state created by participant
  declaration through the deterministic command layer; EOS never writes it.
- B4. Canonical dependency truth is OCS RKM; EOS holds no competing
  dependency model (ADR-0001).
- B5. EOS action is recommendation; never mutation (F-Plan mutation
  boundary, REASONING.md).

---

## Unresolved Questions

1. Whether EOS computing disposable influence context (reachability/
   counts) over consumed knowledge is operationally distinguishable from
   owning deterministic analysis. F-Absorb C1 permits the cache; the
   operational threshold (consume vs compute) is unspecified.
2. Whether OCS Phase-3 "technical debt prioritization" (manifesto) and
   EOS risk-priority judgment are the same canonical capability owned once
   — a Capability Ownership Matrix question spanning F-Expanded. If OCS
   owns prioritization as an AI capability, the EOS risk-priority row
   collides and must be resolved.
3. The canonical schema and declaration channel for a risk record
   (impact/probability levels) — the EWA Risk factory exists but is
   unwired; inspect.json has no risk declaration fields.
4. Whether `.eos/` risk projection is a separate surface or extends
   judgment.json (implementation choice, not architecture).
5. Naming hazard: EWA's deterministic `riskAnalysis` (counts) is labeled
   "risk" but is influence data, not risk judgment. Terminology must not
   collapse the distinction (mirrors F-Absorb C2).

---

## Smallest Next Experiment

Run the F2 Model A/B test at the risk surface: produce identical influence
counts (importers, exports, dependencies, reachability) for two different
targets and attempt to derive risk significance deterministically from the
counts alone. If significance differs despite identical counts (given
context, criticality, and uncertainty), Model A fails for risk and
significance is not the deterministic calculator's output — confirming the
boundary. If significance is identical for identical counts in all cases,
risk judgment collapses to deterministic analysis and the converse
falsification triggers.

---

## Status

Not falsified.
