# Experiment-13 — F-Expanded-5 Obligation Identification Boundary

## Purpose

Attempt to falsify F-Expanded-5 (EOS-PRODUCT-ARCHITECTURE.md Section 12):

> EOS can own obligation identification (domain/regulatory/industry) as
> evidence-gated candidate claims without owning authoritative obligation
> knowledge, an obligation engine, or compliance.

Expected architectural distinction under test (not assumed; falsify if the
evidence contradicts it):

> Authoritative obligation knowledge is validated knowledge consumed from
> its (unresolved) canonical source. EOS judges which obligations apply to
> a project/artifact — relevance, scope, materiality — as candidate,
> evidence-gated claims. EOS never owns obligation knowledge, never
> invents an obligation engine, never writes obligation records, and never
> enforces or certifies compliance.

Mode: design/reconciliation only. No code, no tests, no IGE/OCS change, no
EWA migration, no repository restructuring.

---

## Observed Evidence

### Product scope and refinement

- Product scope: EOS helps "identify domain/regulatory/industry
  obligations" (EOS-PRODUCT-ARCHITECTURE.md Section 1). [user directive]
- Section 5 row: "Obligation identification (domain/regulatory/industry) |
  Evidence-gated candidate claims | New (refined from compliance non-goal,
  7.7)". [proposed]
- Section 7.7: "EOS is not a compliance chatbot" — Refined: "Evidence-gated
  obligation judgment is in scope; obligation claims are candidate state
  citing evidence, never canon." [transitional -> refined]

### Authoritative obligation knowledge

- Section 11.5 [unknown]: "Where authoritative obligation knowledge comes
  from (IGE corpus, OCS verification, external domain/regulatory sources).
  EOS's obligation claims are candidate state; the authoritative
  determination is validated knowledge that does not yet exist as a
  capability." [unknown]
- Capability Ownership Matrix: Runtime, Governance, Corpus, Provider
  Resolution -> IGE. The Corpus participant's responsibility is
  Sustainment: sustaining validated discoveries/knowledge. [observed]
- Section 6: Corpus is owned by IGE; EOS "consumes (never amends)."
  [constitutional]

### Obligation semantics absent

- Reconciliation Section 12: "there is no obligation semantics — no 'who
  owes what to whom and when'. EOS's judgment of declared vs candidate
  state is a natural obligation surface, but this is currently only a germ
  in EWA's EngineeringChangeRequest + review pipeline. [proposed: EOS must
  not invent an obligation engine; it should judge obligation claims
  recorded by EWA/OCS.]" [observed -> proposed]
- Reconciliation Section 17: "Obligation engine | Only after requirements
  model has obligation semantics" — deferred. [proposed]
- No obligation artifact/store exists in the lineage (EWA index types,
  `.ewa/engineering/` stores, OCS inspect.json have no obligation field).

### IGE / OCS contracts

- ADR-0001: every fact exactly one canonical representation; derived
  artifacts disposable.
- ADR-0004: AI reasons, does not rediscover; AI consumes, not produces.
- Runtime State: Observed, Declared (human-owned), Derived, Validated,
  Blocked.
- REASONING.md: judgment evaluates; judgment does not act; decision belongs
  to participants; participants act.
- F2 (Experiment-02): judgment is evidence-gated probabilistic synthesis
  (Model B), not deterministic derivation (Model A).

### EOS-established facts

- Discovery-01/02: EOS owns Intelligence; `.eos/judgment.json` is a
  non-canonical projection; F5-F8 hold.
- Anti-fabrication: declared/candidate claims MUST cite inspected files or
  real evidence ids; fabricated refs rejected (gateJudgment).
- F-Expanded-1 (Experiment-09): EOS judges significance/materiality;
  canonical truth stays outside EOS.
- F-Expanded-2 (Experiment-10): proposals are candidate; EOS never
  implements, never auto-decides.
- F-Expanded-3 (Experiment-11): deterministic findings consumed, not
  re-derived.
- F-Expanded-4 (Experiment-12): judgment across projections; coordination
  stays deterministic/governance-owned.

---

## Reasoning — The Distinctions

### 1. Authoritative obligation knowledge

The body of domain/regulatory/industry obligation facts ("regulation R
requires X") is validated knowledge. Its canonical source is unresolved
(11.5: IGE corpus, OCS verification, or external domain/regulatory
sources); the authoritative determination does not yet exist as a
capability. Whichever source owns it, it is not EOS: Corpus is IGE-owned
(Sustainment), Governance is IGE-owned, and EOS consumes, never amends
(Section 6). EOS cannot be the source of what the regulation requires.

Verdict: EOS consumes authoritative obligation knowledge; it never owns
it.

### 2. Obligation identification

EOS judges which obligations apply to this project or artifact, and their
relevance, scope, and materiality. This is judgment — F2 Model B: identical
obligation text does not determine a unique applicability verdict (project
context, subject matter, and risk shape it). It is expressed as candidate,
evidence-gated claims — never canon, consistent with the 7.7 refinement.

Verdict: obligation identification is EOS-owned Intelligence.

### 3. Obligation semantics / record

"Who owes what to whom and when" does not exist in the lineage; the
obligation engine is deferred until requirements carry obligation
semantics. When obligation records exist, they are Declared/validated
state owned by the deterministic layer (or the future validated-knowledge
capability) — not EOS. EOS must not invent an obligation engine as a
canonical substitute (reconciliation Section 12 proposal).

Verdict: obligation records/semantics are deterministic/validated state;
EOS never writes or invents them.

### 4. Obligation claim vs evidence

An obligation claim is a candidate judgment; its support is the
authoritative source (inspected corpus/regulatory text, recorded evidence)
and the project state it applies to. The claim is never evidence and never
canon. The source is citable; the identification is judgment. If the
authoritative source is external, its citation must be recorded as evidence
or inspected before it can gate a claim — anti-fabrication holds.

Verdict: obligation claims are evidence-gated; a claim is never evidence.

### 5. Obligation materiality / priority

EOS judges which obligations are material to planning (a candidate
priority/sequencing input). This feeds planning intelligence through the
participant-decision channel (Experiment-08): EOS judges, the Engineer
declares, the deterministic reconciler renders. EOS does not create a
canonical compliance queue.

Verdict: materiality judgment is EOS's; the planning channel is
participant-decision.

### 6. Compliance

Enforcement, remediation, and verification of obligations belong to
deterministic/participant layers: Business (Omnia) and Observation/OCS.
EOS is not a compliance chatbot (7.7): it identifies obligations and
recommends; it never enforces, never certifies compliance, never mutates
project state to satisfy an obligation.

Verdict: compliance is outside EOS.

### 7. Projection

EOS exposes obligation identification as candidate claims in `.eos/` —
legible, timestamped, evidence-referenced, non-canonical, reconciler-inert
(F5/F6/F7/F8). It never projects a competing canonical obligation store or
a second authoritative corpus (ADR-0001).

Verdict: EOS projects judgment, never authoritative obligation truth.

### 8. Action

EOS recommends responses to obligations (as candidate proposals,
Experiment-10); it never acts on them. REASONING.md and the F-Plan/
Experiment-10 mutation boundaries hold.

Verdict: EOS recommends; participants decide; deterministic machinery
acts.

---

## Converse Test

If EOS were forbidden from obligation identification because "EOS is not a
compliance chatbot," obligation awareness would collapse into deterministic
keyword/rule matching or nothing at all.

This is incorrect: applicability and materiality are judgment. The same
regulatory text does not determine a unique identification (project
context, scope, and risk shape it — F2 Model A fails). Forbidding it would
either force obligation awareness into the deterministic layer (a rules
engine, which is precisely the compliance chatbot non-goal) or discard it
entirely, leaving obligations invisible to engineering judgment. The
converse confirms the boundary.

Converse-falsification remains: if obligation identification is a pure
deterministic function of authoritative text (keyword matching, no
judgment), it belongs to the deterministic layer and EOS is redundant — see
FC-O4.

---

## Falsification Criteria

F-Expanded-5 FALSIFIED if EOS must:

**FC-O1 — own authoritative obligation knowledge** (the canonical
domain/regulatory/industry fact store — Corpus/IGE or the future
validated-knowledge capability ownership).

**FC-O2 — write canonical obligation records or enforce/certify
compliance** (Business/OCS verification breach; "not a compliance chatbot"
breach).

**FC-O3 — classify obligation claims as Observed/Derived/Validated**
(judgment into runtime categories; F6 breach).

**FC-O4 — have obligation identification be a pure deterministic
derivation** from authoritative text (no evidence-gated judgment). If true,
it belongs to the deterministic layer, not EOS.

**FC-O5 — feed its obligation projection to a reconciler as canonical
input** (F5 breach).

**FC-O6 — act on obligations** (enforce, remediate, or mutate project state
to satisfy an obligation).

**FC-O7 — fabricate obligation claims without evidence** (no resolvable
evidence_refs to authoritative sources or inspected project state;
anti-fabrication breach).

**FC-O8 — invent an obligation engine/semantics as canonical** (building
the deferred obligation engine inside EOS instead of consuming recorded
obligation claims; reconciliation Section 12 proposal breach).

Converse falsification: if obligation identification is a pure deterministic
function of authoritative text, it belongs to the deterministic layer and
EOS is redundant (F2 Model A holds).

---

## Verdict

F-Expanded-5 — NOT FALSIFIED.

- Authoritative obligation knowledge: consumed; source unresolved (11.5)
  but not EOS; Corpus/IGE constitutional home.
- Obligation identification: EOS-owned Intelligence (F2 Model B),
  candidate state per the 7.7 refinement.
- Obligation semantics/record: deferred; would be Declared/validated
  state, never EOS-written; EOS must not invent an obligation engine.
- Obligation claim vs evidence: evidence-gated; a claim is never evidence.
- Materiality/priority: EOS judgment feeding planning via the
  participant-decision channel (Experiment-08).
- Compliance: outside EOS; not a compliance chatbot.
- Projection: candidate claims in `.eos/`, never canonical obligation
  truth.
- Action: EOS recommends; participants decide; deterministic machinery
  acts.
- Converse: forbidding obligation judgment collapses awareness into rules
  or nothing; applicability is not derivable from text alone.

The expected architectural distinction survives the evidence:

> Authoritative obligation knowledge is validated knowledge consumed from
> its (unresolved) canonical source. EOS judges which obligations apply to
> a project/artifact — relevance, scope, materiality — as candidate,
> evidence-gated claims. EOS never owns obligation knowledge, never
> invents an obligation engine, never writes obligation records, and never
> enforces or certifies compliance.

---

## Surviving Boundary

> EOS identifies domain/regulatory/industry obligations as candidate,
> evidence-gated claims in `.eos/`, citing authoritative sources (inspected
> or recorded as evidence) and project state — never invented. EOS consumes
> authoritative obligation knowledge; it does not own it (source unresolved
> in 11.5, but not EOS; Corpus/IGE is the constitutional home). EOS never
> invents an obligation engine, never writes obligation records, never
> classifies its claims into runtime categories, never feeds a reconciler,
> and never enforces or certifies compliance. EOS recommends; participants
> decide; deterministic machinery acts.

Bindings:

- B1. Obligation claims are non-canonical `.eos/` state (F5/F6/F7/F8).
- B2. EOS consumes authoritative obligation knowledge; its claims never
  become the authoritative determination (ADR-0001; F-Absorb C1).
- B3. Obligation records are Declared/validated state when they exist; EOS
  never writes them and never builds the obligation engine (reconciliation
  Section 12/17).
- B4. Compliance enforcement and verification belong to Business (Omnia)
  and Observation (OCS); EOS is not a compliance chatbot (7.7).
- B5. EOS action is recommendation, never enforcement/mutation
  (REASONING.md; Experiment-08; Experiment-10).

---

## Unresolved Questions

1. Where authoritative obligation knowledge comes from (11.5) — IGE corpus,
   OCS verification, or external domain/regulatory sources; no validated
   capability exists today. [unknown]
2. How external authoritative sources become citable (recorded as
   evidence? inspected?) so the gate can resolve an obligation claim's refs.
3. Whether obligation materiality judgment feeds planning intelligence
   directly or only through participant-declared decisions — the channel is
   the F-Plan one (Experiment-08), the obligation-specific schema is
   unspecified.
4. Whether obligation semantics should attach to the (unresolved) canonical
   requirement artifact type (11.3) or to a separate declared record — an
   open schema question, deferred with the obligation engine.
5. The boundary between an "obligation" (validated external requirement)
   and a "requirement" (declared/candidate intent, Experiment-11) once both
   exist as records — needs a term/type distinction to prevent conflation.

---

## Smallest Next Experiment

Run the F2 Model A/B test at the obligation surface: take identical
authoritative obligation text and identical project state in two different
engineering contexts and attempt to derive the applicability/materiality
deterministically. If the identification legitimately differs (given scope,
subject matter, and risk), Model A fails and obligation identification is
judgment — confirming the boundary. If the identification is identical in
all cases, it collapses to deterministic matching and FC-O4/converse
falsification triggers. Separately, gate-test the surface: an obligation
claim citing an un-inspected/unrecorded external source is rejected; a claim
citing the recorded evidence of the source is accepted.

---

## Status

Not falsified.
