# Experiment-11 — F-Expanded-3 Requirements Reasoning Boundary

## Purpose

Attempt to falsify F-Expanded-3 (EOS-PRODUCT-ARCHITECTURE.md Section 12):

> EOS can own requirements reasoning (discover/refine/challenge) as
> candidate-state refinement without owning the canonical requirement
> artifact, duplicating deterministic review, or acting on requirement
> state.

Expected architectural distinction under test (not assumed; falsify if the
evidence contradicts it):

> EOS discovers, refines, and challenges requirements as candidate,
> evidence-gated judgment. Canonical requirement records remain
> deterministic/participant-declared wherever they live. Deterministic
> review findings (e.g., OrphanRequirement) are consumed, not re-derived.
> EOS never writes, classifies, reconciles, or implements requirement
> state.

Mode: design/reconciliation only. No code, no tests, no IGE/OCS change, no
EWA migration, no repository restructuring.

---

## Observed Evidence

### EWA lineage — requirements surface

- `EngineeringIndex` artifact types include `requirement`; the
  `EngineeringIndexer.detectType` classifies files under `requirements/`
  as requirement artifacts (EOS-ARCHITECTURE-RECONCILIATION.md Section 12;
  EOS-PHASE2-SUBSTRATE-RECONCILIATION.md Section 2 index row). The index is
  a deterministic representation of artifacts; it does not judge content.
- `EngineeringAssistant` lists requirements from artifacts.
  [observed]
- `OrphanRequirementRule` (EngineeringReviewService rules) flags
  requirements without links. This is a deterministic review finding:
  requirement R has no traceability links — a computed fact.
  [observed]
- `EngineeringChangeRequest` carries questions; the review pipeline
  (`context.build() → analyzer.analyze(context) → findings →
  advisor.review() → questions`) produces findings and questions but never
  closes the loop (EOS-ARCHITECTURE-RECONCILIATION.md Section 13).
  [observed]

### Deterministic/participant-owned requirement state

- Requirements exist as EWA index entries and as OCS/Omnia business
  capabilities (leave.request, employee.lifecycle.change, etc.).
  [observed]
- The canonical requirement artifact type ownership is UNRESOLVED —
  EOS-PRODUCT-ARCHITECTURE.md Section 11.3: "Where canonical requirement
  artifacts live, and who owns the requirement artifact type canonically.
  [unknown]".
- Decisions are Declared state produced by the deterministic command
  service; traceability is Derived produced by DecisionLinker. (Phase 2
  verdict.) No requirement-equivalent declaration command exists in the
  lineage. [observed]

### IGE / OCS contracts

- ADR-0001: every fact exactly one canonical representation; derived
  artifacts disposable.
- ADR-0004: AI reasons, does not rediscover; AI consumes, not produces.
- Runtime State: Observed, Declared (human-owned), Derived, Validated,
  Blocked.
- REASONING.md: Observation discovers; knowledge accumulates; judgment
  evaluates; participants act. Judgment does not act; decision belongs to
  participants.
- F2 (Experiment-02): judgment is evidence-gated probabilistic synthesis
  (Model B), not deterministic derivation (Model A).
- F-Absorb C1-C3 (Experiment-06): EOS owns no canonical deterministic
  knowledge generator; terminology must not claim owned capabilities; no
  absorbed artifact is reconciler input or Runtime State.

### EOS-established facts

- Discovery-01/02: EOS owns Intelligence; `.eos/judgment.json` is a
  non-canonical projection; F5-F8 hold.
- Anti-fabrication: declared/candidate claims MUST cite inspected files or
  real evidence ids; fabricated refs are rejected (gateJudgment,
  src/loop.js).
- F-Plan (Experiment-08): EOS judges, the Engineer declares, the
  deterministic reconciler renders.
- F-Expanded-1 (Experiment-09): EOS judges significance/priority/
  uncertainty/consequence; canonical truth stays outside EOS.
- F-Expanded-2 (Experiment-10): EOS generates proposals as candidate,
  evidence-gated, non-canonical projections; EOS never implements and
  never auto-decides.

---

## Reasoning — The Distinctions

### 1. Declared requirement

A participant-declared statement of intent — Declared state. It exists
today as EWA index entries (requirement-typed files) and OCS/Omnia business
capabilities. The canonical owner of the requirement artifact type is
unresolved (11.3), but every candidate is deterministic or participant-owned
(EWA index layer, OCS Business, or a future declared schema) — none is EOS.
EOS consumes declared requirements as context, never as evidence gate
(Phase 2: decisions are context; requirements are similarly Declared
context, not gating evidence).

Verdict: EOS is a consumer of declared requirements; it does not own the
artifact type.

### 2. Candidate requirement discovery

EOS elicits/posits requirements from the engineer's stated intent and from
inspected evidence, as candidate claims. Requirement elicitation is judgment
over intent, not observation of facts: REASONING.md's "Observation
discovers" refers to deterministic observation of the observed (OCS);
eliciting and shaping intent is not OCS observation. It is evidence-gated
probabilistic synthesis — the same anti-fabrication gate applies: a
discovered requirement cites inspected files or recorded evidence
(including a recorded statement), never invention.

Verdict: requirement discovery is EOS-owned Intelligence, candidate state.

### 3. Refinement

EOS clarifies, decomposes, makes testable, and resolves ambiguity/conflict
in requirements. This is judgment: identical stated requirements do not
determine a unique refinement — context, intent, and trade-offs shape it (F2
Model B). Refinement is candidate content; the refined statement is a
judgment artifact, not a canonical record.

Verdict: refinement is EOS-owned Intelligence.

### 4. Challenge

EOS challenges requirements: ambiguity, contradiction, incompleteness,
scope, orphanhood. This splits cleanly:

- Deterministic findings (consumed): `OrphanRequirementRule` flags
  "requirement without links" — a computed fact about the traceability
  model. EOS consumes it; it must not re-derive it as canonical truth
  (F-Absorb C1/C3, ADR-0001).
- Judgment (EOS-owned): the significance of a finding, the contradictions
  between statements, the risk of ambiguity — evidence-gated synthesis
  over the deterministic findings and evidence.

Verdict: EOS judges challenge; deterministic review rules are consumed.

### 5. Requirement record

The canonical requirement artifact is deterministic/participant-owned. When
EOS's candidate requirement or refinement is adopted, adoption is Declared
state entered through a participant command channel into the deterministic
store (analogous to decisions, Phase 2; and to proposal->decision,
Experiment-10). EOS never writes the record. The artifact-type owner
remains an open question (11.3); this experiment establishes only that it is
not EOS.

Verdict: requirement records are Declared state when adopted; EOS never
writes them.

### 6. Evidence

Requirement claims are evidence-gated and a refinement is never evidence.
A claim cites inspected files or real evidence ids. A stated intent (from
conversation) must be captured as recorded evidence before it can gate a
claim — conversation alone is not a citable id under the current gate
(refs resolve to inspected files or evidence ids). This keeps
anti-fabrication intact: EOS may not manufacture a requirement as fact.

Verdict: requirement judgment cites evidence; it is never itself evidence.

### 7. Projection

What EOS may expose in `.eos/` without a second canonical representation:
candidate requirement statements, refinements, challenges, significance
judgments, and evidence refs. EOS must not project a competing canonical
requirement registry. The surface stays legible, timestamped, non-canonical
(F5/F7/F8), and reconciler-inert.

Verdict: EOS projects judgment, never canonical requirement truth.

### 8. Action

EOS recommends; it never implements requirements, never mutates canonical
requirement state, never reconciles a requirement claim into canonical
state, and never commands deterministic systems from judgment (Experiment-08
mutation boundary, Experiment-10 implementation boundary, REASONING.md).

Verdict: EOS recommends; participants declare; deterministic machinery
acts.

---

## Converse Test

If EOS were forbidden from requirements reasoning because "requirements are
Declared state, deterministic," requirements engineering would collapse to
bookkeeping.

This is incorrect: discovery, refinement, and challenge are judgment. A
requirement is intent, frequently ambiguous, incomplete, and conflicting;
its resolution is evidence-gated synthesis, not deterministic derivation (F2
Model A fails — identical stated requirements do not determine a unique
refinement). Forbidding it would discard the clarification and conflict
resolution that distinguish requirements engineering from recording. The
converse confirms the boundary.

Converse-falsification remains: if requirements reasoning is a pure
deterministic function of canonical state (template extraction, no judgment
involved), it belongs to the deterministic layer and EOS is redundant — see
FC-Q4.

---

## Falsification Criteria

F-Expanded-3 FALSIFIED if EOS must:

**FC-Q1 — own the canonical requirement artifact type** (a competing
canonical registry, or a Capability Ownership Matrix row for requirement
truth). The owner is unresolved (11.3); any owner other than EOS preserves
the boundary, EOS ownership falsifies.

**FC-Q2 — write canonical requirement records directly** (no participant
declaration channel; bypassing the deterministic command layer).

**FC-Q3 — classify requirement refinements as Observed/Derived/Validated**
(judgment into runtime categories; F6 breach).

**FC-Q4 — have requirements reasoning be a pure deterministic derivation**
from canonical state (no evidence-gated judgment involved). If true,
requirements reasoning belongs to the deterministic layer, not EOS.

**FC-Q5 — feed its requirement projection to a reconciler as canonical
input** (F5 breach).

**FC-Q6 — act on requirements** (implement, mutate canonical requirement
state, or command deterministic systems from judgment).

**FC-Q7 — fabricate requirements without evidence** (claims with no
resolvable evidence_refs; anti-fabrication breach).

**FC-Q8 — re-derive deterministic review findings as canonical** (e.g.,
recompute orphanhood as EOS-owned canonical truth instead of consuming the
rule).

Converse falsification: if requirement discovery/refinement is a pure
deterministic function of canonical state, requirements reasoning belongs to
the deterministic layer and EOS is redundant (F2 Model A holds).

---

## Verdict

F-Expanded-3 — NOT FALSIFIED.

- Declared requirement: consumed, never owned.
- Candidate requirement discovery: EOS-owned Intelligence (F2 Model B);
  judgment over intent, not OCS observation.
- Refinement: EOS-owned Intelligence.
- Challenge: EOS judges; deterministic review rules (OrphanRequirement) are
  consumed, not re-derived.
- Requirement record: Declared when adopted via participant command channel;
  EOS never writes it; artifact-type owner unresolved (11.3) but not EOS.
- Evidence: requirement claims evidence-gated; refinements never evidence.
- Projection: EOS projects judgment, never canonical requirement truth.
- Action: EOS recommends; participants declare; deterministic machinery
  acts.
- Converse: forbidding requirements reasoning collapses requirements
  engineering to bookkeeping; refinement is not determined by stated
  requirements.

The expected architectural distinction survives the evidence:

> EOS discovers, refines, and challenges requirements as candidate,
> evidence-gated judgment. Canonical requirement records remain
> deterministic/participant-declared wherever they live. Deterministic
> review findings (e.g., OrphanRequirement) are consumed, not re-derived.
> EOS never writes, classifies, reconciles, or implements requirement
> state.

---

## Surviving Boundary

> EOS discovers, refines, and challenges requirements as candidate,
> evidence-gated claims in `.eos/`, citing inspected files or recorded
> evidence — never inventing requirements as fact. EOS does not own the
> canonical requirement artifact type (owner unresolved in 11.3, but not
> EOS), never writes canonical requirement records, never classifies
> refinements into runtime categories, never feeds a reconciler, and never
> implements or mutates requirement state. Adoption of a candidate
> requirement is Declared, via participant declaration through the
> deterministic command layer. Deterministic review findings
> (OrphanRequirement) are consumed, not re-derived.

Bindings:

- B1. Requirement projections are non-canonical `.eos/` state (F5/F6/F7/F8).
- B2. Requirement claims are evidence-gated; a refinement is never evidence
  and a stated intent is citable only when recorded as evidence or
  inspected.
- B3. Adoption of a candidate requirement into canonical form is Declared,
  via a participant command channel; EOS never writes it (Phase 2 boundary
  1; Experiment-10).
- B4. Deterministic review findings are consumed, not re-derived by EOS as
  canonical (F-Absorb C1/C3).
- B5. EOS action is recommendation, never mutation (REASONING.md;
  Experiment-08; Experiment-10).

---

## Unresolved Questions

1. Who owns the canonical requirement artifact type — unresolved (11.3).
   This experiment confirms only that EOS does not; the owner is still
   unknown.
2. Whether the word "discover" creates a collision: REASONING.md assigns
   discovery to Observation (OCS observes facts); EOS elicits intent.
   Terminology must not collapse OCS observation with requirements
   elicitation (mirrors F-Absorb C2).
3. Whether a recorded conversation (engineer-stated intent) is a citable
   evidence surface for requirement claims, or must first be recorded as an
   engineering evidence record by the deterministic layer — the current gate
   resolves refs to inspected files or evidence ids only.
4. Whether the review rules (OrphanRequirement, EvidenceOutcome) are
   deterministic findings to consume or judgment rules EOS owns — Section
   4.1 absorbs the review pipeline; the deterministic/judgment split of
   individual rules is unspecified.
5. Whether challenge findings feed planning intelligence (prioritizing
   unresolved requirement questions) — a cross-capability channel, subject
   to the F-Plan participant-decision boundary.

---

## Smallest Next Experiment

Run the F2 Model A/B test at the requirements surface: present identical
stated requirements (identical deterministic input, including identical
evidence refs) to two distinct engineering contexts and attempt to derive
the refinement deterministically. If the refinement legitimately differs
(given intent, trade-offs, uncertainty), Model A fails and requirements
reasoning is judgment — confirming the boundary. If the refinement is
identical in all cases, requirements reasoning collapses to deterministic
derivation and FC-Q4/converse falsification triggers. Separately, gate-test
the surface: a refinement claim with no resolvable evidence_ref is rejected;
a claim citing the recorded evidence record of the stated intent is
accepted.

---

## Status

Not falsified.
