# EOS Framework Boundary Investigation

Second-generation report. Supersedes the first EOS Framework Boundary
Investigation where the completed six-item investigation loop changed its
conclusions.

Status: FINDING — a reconciliation of the EOS constitutional boundaries
against the completed investigation results.

This report is an investigation record. It does not amend the EOS
Constitution. It does not amend IGE. It does not make constitutional
decisions. It records what the evidence supports and what it does not.

---

## 1. Executive Finding

The completed six-item investigation loop resolved the boundary questions
that the first investigation left open. The evidence supports a normalized
EOS framework of five constitutional boundaries — constitution, ontology,
epistemology, relationships, conformance — with no sixth Contracts domain
and no Possibility primitive.

The findings, in order of consequence:

1. **Contracts are absorbed, not a sixth boundary.** All seven candidate
   contracts in CONTRACTS.md reduce to relationship coherence plus
   epistemic verification, or are already constitutionally owned. Contracts
   content is absorbed by relationships + epistemology + constitution.
   FINDING: Contracts is not a sixth EOS constitutional boundary.

2. **Possibility is not an EOS ontological primitive.** The ontological
   removal test does not establish possibility. FINDING: possibility fails
   the current EOS ontological necessity/removal test. This is a precise
   finding about the removal test; it is not a claim that possibility does
   not exist in ordinary language or across all IGE documentation.

3. **EOS remains constitutionally non-agent.** src/loop.js is agent-shaped
   but has no independent projection surface; its output is EOS's
   projection. FINDING: src/loop.js is a role/capability of EOS, not an
   independent identity.

4. **The Intelligence orphan is CONFIRMED.** Intelligence classifies as
   Foundational (experiment-04/F4), the Capability Ownership Matrix has no
   Intelligence row, and the matrix's own rule makes an ownerless
   capability an orphan. Resolving the ownership matrix is an IGE-level
   matter and is NOT decided by this investigation.

5. **Missing review artifacts are a runtime wiring gap.** runReview writes
   review artifacts but is not invoked from src/loop.js. FINDING: the
   runtime consumes review evidence but does not produce reviews in-band.

6. **The corrective loop ran and falsified the prior judgment.** The real
   runtime produced review ba8e67b0 (neutral), candidate judgment 4e07ee27,
   a consistent lineage chain of depth 4, and corrected `.eos/judgment.json`.
   The prior judgment 97c7f2ca recorded an inspection digest (d9d913da...)
   that does not match the actual current src/loop.js digest (0f8dfda...).
   FINDING: the prior judgment was not merely a bad interpretation of valid
   evidence; its recorded evidence digest did not correspond to the
   repository state.

The architectural consequence is a leaner, evidence-supported framework:
five boundaries, no invented primitives, and a clear separation between
what EOS constitutes locally and what remains an IGE-level matter.

---

## 2. Current Domain Model

The EOS Constitution (Article XIV) establishes five constitutional
boundaries:

- constitution/ — what must remain true for EOS to remain EOS;
- ontology/ — what can exist and participate within the EOS biome;
- epistemology/ — how EOS distinguishes what is known, observed, inferred,
  asserted, decided, unresolved, or otherwise epistemically situated;
- relationships/ — how participants and actors relate while becoming;
- conformance/ — how EOS remains an IGE citizen while constituting and
  evolving its own biome.

OBSERVED: The ontology directory contains ONTOLOGY.md, which lists
candidate ontological primitives (participant, actor, identity, state,
relationship) and applies the ontological test:

> If this distinction were removed, what would become impossible to
> distinguish?

OBSERVED: The relationships/, epistemology/, and conformance/ directories
are not yet constituted. They are declared domains of authority in the
Constitution, not yet filled with content.

OBSERVED: CONTRACTS.md proposes a "constitutional-adjacent domain" of
contracts, positioned between relationships and epistemology in its own
semantic boundary (Section 21). This is the candidate sixth domain that the
first investigation considered.

The current domain model is therefore: five declared constitutional
boundaries, one of which (ontology) has begun to be constituted, and one
candidate domain (contracts) whose boundary status this investigation
resolves.

---

## 3. Boundary Stress Test

The boundary stress test applies the ontological removal test to each
candidate boundary and primitive:

> If this distinction were removed, what EOS-necessary distinction becomes
> impossible to distinguish?

Applied to the contract candidates, the test asks whether any contract
condition establishes a distinction that relationships, epistemology, and
constitution cannot already express.

Applied to possibility, the test asks whether removing possibility makes an
EOS-necessary distinction impossible to distinguish.

FINDING: The stress test does not establish a sixth boundary. Every
contract candidate's content is expressible as a relationship coherence
condition plus an epistemic verification condition, or is already
constitutionally owned. Possibility fails the removal test: the current
epistemic state model already distinguishes unresolved/candidate from
blocked, so removing possibility as a primitive does not collapse a
distinction EOS needs.

The stress test is the discipline that prevents useful software
abstractions or useful documents from becoming ontological or
constitutional primitives merely because they are useful.

---

## 4. Contract Investigation

All seven candidate contracts in CONTRACTS.md were tested. The results:

1. **identity/distinction** — reduces to a relationship coherence condition
   plus epistemic verification. The requirement is maintained distinction,
   not absence of difference; how distinction is established is an
   epistemic question.

2. **actor/participation** — reduces to relationship coherence plus
   epistemic verification. "Capacity != enactment" is a coherence condition
   over the actor-participation relationship; the basis of agency is an
   epistemic question.

3. **participant/projection** — reduces to relationship coherence plus
   epistemic verification. "Not projected" vs "projected but not observed"
   is an epistemic distinction, not a new primitive.

4. **capability/ownership conditions** — reduce to relationship coherence
   plus epistemic verification. "Canonical ownership is unique" and
   "ownership is distinct from consumption" are coherence conditions over
   the capability-ownership relationship.

5. **coherent continuation != sameness** — already represented through
   Becoming (Constitution Articles XVII and XVIII). It does not require a
   new primitive.

6. **possibility != capability** — cannot establish a contract distinction
   because possibility itself fails the EOS ontological removal test
   (Section 8).

7. **The remaining "must remain true" / normative obligation** — already
   constitutionally owned. The Constitution establishes what must remain
   true for EOS to remain EOS; the normative force of a contract condition
   derives from the constitutional and relational domain in which it
   exists (CONTRACTS.md Section 15).

CONCLUSION: Contracts content is absorbed by relationships + epistemology +
constitution.

FINDING: Do NOT propose Contracts as a sixth EOS constitutional boundary.

This supersedes the first investigation, which treated Contracts as a
candidate sixth domain with unresolved status. The second investigation
resolves that status: the contract candidates are expressions of existing
domains, not a new domain.

---

## 5. Epistemology Investigation

The epistemic state model distinguishes:

- blocked — cannot judge; conditions prevent it (no evidence requirement);
- candidate — offered pending validation, supported by inspected evidence;
- declared — committed now, fully supported by inspected evidence.

FINDING: This state model already distinguishes unresolved/candidate from
blocked. This is the distinction that the possibility investigation tested
against (Section 8): the epistemic model can represent "not yet resolved"
without requiring possibility as an ontological primitive.

The corrective loop (Section 6 of the completed results) exercised the
epistemic model directly. The prior judgment 97c7f2ca was recorded as
blocked with the claim "The specified file does not exist." Its own
inspection record was ok:true, and its recorded inspection digest
(d9d913da...) does not match the actual current src/loop.js digest
(0f8dfda...).

FINDING: The prior judgment was not merely a bad interpretation of valid
evidence; its recorded evidence digest did not correspond to the repository
state. The correct epistemically-honest state for that investigation was
candidate with evidence, not blocked with a false reason.

The corrected candidate 4e07ee27 records the actual finding: src/loop.js
exports runEos, JUDGMENT_STATES, isJudgmentState, canTransition,
surfaceStatus, gateJudgment, and canonicalizeEvidenceRefs, and runs an
evidence-gated model loop that commits a projection.

Epistemology is therefore not a passive domain. It is the domain that
detects and corrects the mismatch between recorded evidence and repository
state. The digest mismatch is the concrete mechanism by which a false
judgment was falsified.

---

## 6. Becoming Investigation

The Constitution (Articles XVII and XVIII) establishes:

- Becoming is not a function performed by EOS, IGE, OCS, OW, any actor, or
  any participant.
- sameness != continuity; change != loss of identity; difference !=
  incoherence; persistence != immobility.
- EOS remains itself through sufficient continuity across difference, not
  through remaining unchanged.

FINDING: "Coherent continuation != sameness" is already represented through
Becoming. It does not require a new primitive.

The contract candidate "Contract preserves the conditions of coherent
continuation, not immobility" (CONTRACTS.md Section 13) is therefore an
expression of the existing Becoming domain, not a new contract primitive.

FINDING: Contracts preserve coherence within becoming; they do not govern
becoming as an object. This is consistent with the Constitution's Article
XVII: no framework possesses authority over becoming outside the
constitutional scope that legitimizes it.

---

## 7. Actor / Participant Investigation

The Constitution (Article V) distinguishes an actor from a participant by
the capacity to act. An actor may participate in EOS without EOS requiring
the actor to be human, agent, intelligence, system, or engineer.

The contract candidate "actor/participation" (CONTRACTS.md Section 9)
proposes: "A claimed act of participation must have a distinguishable basis
of agency."

FINDING: This reduces to relationship coherence plus epistemic
verification. "Capacity != enactment" is a coherence condition over the
actor-participation relationship. The basis of agency — whether human,
agent, intelligence, system, or engineer — is an epistemic question, not a
new ontological primitive.

The participant/projection candidate (CONTRACTS.md Section 10) proposes:
"A claimed participation must remain capable of becoming legible through
projection." This preserves the distinction between "not projected" and
"projected but not observed."

FINDING: This is an epistemic distinction. Absence of observation does not
by itself establish absence of participation. The distinction belongs to
epistemology, not to a new contract domain.

The actor/participation and participant/projection candidates are therefore
absorbed by relationships + epistemology, consistent with the contract
investigation conclusion (Section 4).

---

## 8. Possibility Investigation

A broader grep found five incidental IGE uses and substantive EOS discussion
in CONTRACTS.md. Evidence includes:

- IGE ontology asks "What relationships are possible?"
- IGE BIOME discusses what implementation makes possible.
- IGE FND-0009 uses "possible asset."
- EOS CONTRACTS.md contains entity ↔ possibility, possibility space, and
  possibility != capability.

However, the ontological removal test does NOT establish possibility as an
EOS primitive.

Ask:

> If possibility were removed, what EOS-necessary distinction becomes
> impossible to distinguish?

Current evidence identifies none.

The current epistemic state model already distinguishes unresolved/candidate
from blocked. A possibility that is not yet enacted is representable as an
unresolved or candidate epistemic state; it does not require possibility as
an ontological primitive.

CONCLUSION: Possibility is NOT justified as an EOS ontological primitive
under current evidence.

IMPORTANT PRECISION: This finding does not claim that possibility "does not
exist" in ordinary language or across all IGE documentation. The precise
finding is that possibility fails the current EOS ontological
necessity/removal test. The distinction between "not an EOS primitive" and
"does not exist" is preserved.

This supersedes the first investigation, which left possibility-primitive
status open. The second investigation resolves it: possibility is not an
EOS primitive under current evidence.

---

## 9. EOS Agent Boundary

The agent-role question is resolved by applying discovery-55 (identity-vs-
role) and experiment-07/F9 (agency identity / projection boundary).

OBSERVED: src/loop.js is agent-shaped. It contains a SYSTEM_PROMPT that
begins "You are EOS, an engineering operating intelligence," a model loop
that calls chatFn, tool execution (read_file, read_files), plan handling,
and judgment gating.

OBSERVED: src/loop.js has no independent projection surface. Its output is
committed through commitProjection as EOS's projection (`.eos/judgment.json`).

FINDING: "You are EOS..." is EOS speaking through its runtime role. The
agent-shaped loop is an internal component of EOS, not a separate
participant.

Per experiment-07/F9 (not falsified): an internal component without
independent projection is a role/capability of the participant, not a
separate participant. Legibility runs through the projection surface, not
through execution. Internal agent output consumed by EOS crosses no
participant boundary; it is internal execution, not a projection.

CONCLUSION: EOS remains constitutionally non-agent. src/loop.js is a
role/capability of EOS, not an independent identity.

This is consistent with the Constitution (Article II): EOS is not an agent.
Agency is not the constitutional nature of EOS. The agent-shaped runtime is
an implementation expression of EOS's judgment responsibility, not a
constitutional identity.

---

## 10. IGE / EOS Constitutional Relationship

The Constitution (Article I) establishes the constitutional relationship:

- IGE is the ecosystem-level constitutional order.
- EOS is a distinct local constitutional biome within that ecosystem.
- EOS receives constitutional legitimacy and citizenship conditions from
  IGE while retaining responsibility for constituting its own local biome.
- IGE must not prescribe the complete ontology, epistemology,
  relationships, purpose, or implementation of EOS.
- EOS must not claim authority over the constitutional identity of other
  IGE citizens.

Article VI establishes the citizenship conditions EOS recognizes as
inherited from IGE:

- identity requires distinction;
- participation is the act of projecting legible state; it is not
  membership;
- no participant owns the object of its responsibility;
- capability ownership is unique; consumption is unlimited;
- observation never owns the observed;
- nothing becomes architecture until falsified.

Article VII establishes the non-dictatorial principle: the IGE ecosystem
preserves coherence without requiring homogenization; no framework
possesses authority over becoming outside the constitutional scope that
legitimizes it.

FINDING: The contract candidates that carry normative force derive their
authority from this constitutional relationship. A contract condition is
not authoritative merely because it is proposed; its authority derives from
the constitutional and relational domain in which it exists (CONTRACTS.md
Section 15). This is why the "must remain true" obligation is already
constitutionally owned (Section 4).

---

## 11. Conformance Investigation

Conformance is how EOS remains a legitimate IGE citizen while constituting
and evolving its own biome.

The Constitution (Article VI) establishes:

- conformance != obedience;
- conformance != sameness;
- citizenship != subordination;
- difference != incoherence.

FINDING: The boundary stress test (Section 3) and the contract absorption
(Section 4) are conformance-relevant. EOS may discover principles that are
meaningful within EOS without automatically promoting those principles to
IGE. A discovery made within EOS that may have ecosystem-level significance
may be presented to IGE for ecosystem-level reconciliation (Article XIX).

The Intelligence ownership question (Section 4 of the completed results) is
a conformance matter: the Capability Ownership Matrix is an IGE-level
artifact, and resolving it is an IGE-level matter. This investigation does
NOT decide it.

FINDING: The conformance domain is declared but not yet constituted. Its
content — the precise conditions under which EOS's local constitution
remains a legitimate IGE citizenship — remains an open derived concern.

---

## 12. Proposed Normalized Framework

The evidence supports a five-domain structure. There is NO conditional
sixth Contracts domain.

The normalized framework:

    CONSTITUTION
        what establishes legitimate local order

    ONTOLOGY
        what can exist and participate within the EOS biome

    EPISTEMOLOGY
        how EOS distinguishes what is known, observed, inferred, asserted,
        decided, unresolved, or otherwise epistemically situated

    RELATIONSHIPS
        how participants and actors relate while becoming

    CONFORMANCE
        how EOS remains an IGE citizen while constituting and evolving its
        own biome

The contract candidates are redistributed into these domains:

- relationship coherence conditions → relationships;
- epistemic verification conditions → epistemology;
- normative "must remain true" obligations → constitution;
- coherent continuation != sameness → becoming (constitution).

FINDING: Contracts is not a sixth EOS constitutional boundary. Its content
is absorbed by relationships + epistemology + constitution.

This supersedes the first investigation, which proposed a conditional sixth
Contracts domain. The second investigation resolves the condition: the
contract candidates do not establish a distinction that the five domains
cannot express.

The normalized framework does not claim that the five domains are fully
constituted. Ontology has begun; relationships, epistemology, and
conformance are declared but not yet filled. The framework is the
evidence-supported boundary structure, not a claim of complete content.

---

## 13. Falsified Assumptions

The corrective loop falsified the prior judgment and its supporting
assumption.

FALSIFIED: The prior judgment 97c7f2ca, recorded as blocked with the claim
"The specified file does not exist."

Falsification evidence:

- The judgment's own inspection record was ok:true, contradicting the
  blocked claim.
- The inspection digest recorded by 97c7f2ca (d9d913da...) does not match
  the actual current src/loop.js digest (0f8dfda...).
- The current repository state shows src/loop.js exists and exports runEos,
  JUDGMENT_STATES, isJudgmentState, canTransition, surfaceStatus,
  gateJudgment, and canonicalizeEvidenceRefs.

FINDING: The prior judgment was not merely a bad interpretation of valid
evidence; its recorded evidence digest did not correspond to the repository
state. The falsification is therefore stronger than a reinterpretation: the
recorded evidence itself was inconsistent with the repository.

The corrected candidate 4e07ee27 records the actual finding and chains to
97c7f2ca → 643307bc → a05a3d01 → baff76bf. verifyLineage reports the chain
consistent, depth 4. `.eos/judgment.json` now points to the corrected
candidate. `.eos/review.json` and `.eos/reviews/ba8e67b0*.json` now exist.

FINDING: The corrective loop demonstrates that the epistemic model can
detect and correct a false judgment when the recorded evidence digest does
not match the repository state. This is the concrete mechanism by which
"nothing becomes architecture until falsified" operates.

---

## 14. Open Questions

The following questions genuinely remain open. Contract-domain status and
possibility-primitive status are REMOVED from this list because those
investigations are now resolved.

1. **Review wiring.** The runtime consumes review evidence but does not
   produce reviews in-band. What is the precise mechanism by which review
   becomes part of the normal EOS runtime loop?

2. **Correction/review transition semantics.** The corrective loop ran
   manually. What are the precise transition semantics for a regression
   review authorizing a downgrade (declared → candidate, candidate →
   blocked), and when is a correction itself committed?

3. **Intelligence ownership.** The Intelligence orphan is CONFIRMED, but
   resolving the Capability Ownership Matrix is an IGE-level matter. Who
   resolves it, and under what reconciliation procedure?

4. **Projection/conformance contract.** The minimum projection contract for
   `.eos/` is not yet defined. What must EOS's projection surface guarantee
   for EOS to remain a legible, conformant IGE citizen?

5. **Investigation-state persistence.** Whether investigation state itself
   needs durable first-class persistence remains open. The corrective loop
   revealed that recorded evidence digests can diverge from repository
   state; does investigation state need to be persisted as first-class
   evidence to prevent such divergence?

6. **Constitution of the derived domains.** Relationships, epistemology,
   and conformance are declared but not yet constituted. What content do
   they require?

7. **The complete actor ontology.** The Constitution preserves the
   abstraction of the actor without closing its definition. What
   distinguishes an actor from an intelligence, agent, or system?

These are the questions the evidence leaves genuinely open. They are not
resolved by this investigation.

---

## 15. Recommended Next Investigation Loop

The next loop should be a focused engineering/investigation loop, not a
broad boundary investigation. The boundary questions are resolved; the
remaining work is to make the framework's mechanisms concrete and
consistent.

Recommended focus:

1. **Wire review into the normal EOS runtime loop.** runReview exists and
   writes `.eos/reviews/<id>.json` and `.eos/review.json`, but is not
   invoked from src/loop.js. Determine how review becomes an in-band step
   of the runtime so that review evidence is produced, not merely consumed.

2. **Define the precise correction/review transition semantics.** The
   corrective loop demonstrated a regression review authorizing a
   downgrade. Specify the exact conditions under which a review outcome
   authorizes a state transition, and how a correction is committed and
   chained.

3. **Resolve Intelligence ownership at the IGE level.** The Intelligence
   orphan is CONFIRMED. This is an IGE-level matter and must be presented
   for ecosystem-level reconciliation, not decided by EOS.

4. **Verify the EOS projection/conformance contract.** Define the minimum
   projection contract for `.eos/` and verify that EOS's projection surface
   satisfies the conformance conditions of IGE citizenship.

5. **Investigate whether investigation state itself needs durable
   first-class persistence.** The digest mismatch (d9d913da vs 0f8dfda)
   shows recorded evidence can diverge from repository state. Determine
   whether investigation state must be persisted as first-class evidence to
   prevent such divergence and to make falsification auditable.

The next loop should preserve the reporting discipline of this
investigation: prefer falsification over confirmation, do not turn
candidate concepts into constitutional concepts, and do not claim more than
the evidence supports.