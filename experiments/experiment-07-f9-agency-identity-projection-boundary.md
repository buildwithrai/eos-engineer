# Experiment-07 — F9 Agency Identity / Projection Boundary

## Purpose

Attempt to falsify F9 (EOS-PRODUCT-ARCHITECTURE.md Section 9):

> Specialized agents coordinated internally by EOS remain roles/capabilities
> of the single EOS participant unless they independently project to the
> ecosystem on their own behalf.

Mode: constitutional design/reconciliation. No implementation. No
orchestration-technology selection. EWA's Agent/capability structure is
cited only as observed evidence that internal specialization is compatible
with a single identity — it is not a prescription for EOS.

---

## Claim Under Test

Specialized agents execute inside EOS as roles/capabilities of the one EOS
participant. They become ecosystem participants only if they project on
their own behalf. This is tested against the IGE distinctions: participant
vs role, capability ownership vs consumption, identity vs specialization,
projection vs internal execution.

---

## Observed Evidence

### IGE distinctions

**Participant vs role** — Discovery-55: the identity-vs-role axis. A
candidate that is a role collapses — it is a behavior any participant can
exhibit. A distinct identity requires something beyond
Existence + Distinction + Projection. Observer confirmed a role: OCS is
simultaneously Observer and Participant; the act changes what an Entity
does, not what it is. PARTICIPANT.md (Accepted): specializations "describe
distinguishable projection roles," not separate primitives.

**Capability ownership vs consumption** — ADR-ECOSYSTEM-0001: ownership is
unique; consumption is unlimited; consumers execute canonical capabilities
through Provider Resolution; consumers SHALL NOT duplicate canonical
implementations; consumers may own adapters (which contain no engineering
behavior). Ownership is architectural and belongs to the participant whose
constitutional responsibility includes maintaining the capability.
CAPABILITY_OWNERSHIP_MATRIX.md: six rows — Runtime, Governance, Corpus,
Provider Resolution (IGE); Business (Omnia); Observation (OCS). Rule: more
than one owner = duplicated responsibility; no owner = orphan; both violate
integrity. Discovery-62: classification precedes ownership.

**Identity vs specialization** — Discovery-54: Entity is constituted by
Existence + Distinction alone; relationship is required for participation,
not for entityhood. "An Entity can exist without participating."
Discovery-52 resolution (PARTICIPANT.md): the Participant primitive
survives; specializations are roles expressed through projections, not
separate primitives.

**Projection vs internal execution** — Discovery-63 (Candidate): every
participant communicates through projections; no participant directly
shares internal execution; only projections cross participant boundaries.
PROJECTION.md (ecosystem): "Participants execute internally. Participants
project externally. Observation consumes projections." PROJECTION_MODEL.md:
projection is the bridge between execution and observation. Discovery-53:
participation is the act of projecting legible state — "A projection that
exists is participation." Discovery-57 (Closed): the participation filter
recognizes exactly three surfaces — .ige/inspect.json (governed),
.ai/NOW.md (projecting), runtime/scripts/inspect (constitution); a repo
with only .git/ is not a participant.

**Structural distinctness** — Discovery-59.1/59.2 (Confirmed): the ecosystem
consists of four constitutional participants (IGE, Omnia, OCS, Corpus); no
participant requires ownership of another; future participants must
preserve structural distinctness.

### EOS-established facts

- Discovery-01 (Confirmed): EOS is a distinct participant owning
  Intelligence; `.eos/judgment.json` is its projection surface
  (Discovery-02, Confirmed).
- Experiments-01..05: F1-F8 not falsified.
- EOS-PRODUCT-ARCHITECTURE.md Section 7: "no internal agent is a
  constitutional participant, but internal specialized agents are permitted
  as EOS roles" — retained.

### Observed implementation (evidence only, not prescription)

EWA (@ewa/agent) executes 13 specialized engineering tools through one
Agent class and one capability registry under a single identity
(packages/agent/src/Agent.ts, DefaultCapabilities.ts). Multiple
specialized behaviors execute within one runtime and one identity without
any additional legible surface. This demonstrates internal specialization
does not require participant identity. It does not design EOS's agency.

---

## Reasoning — Test Design

### Test 1 — Single identity

Hypothesis: multiple specialized agents can execute independently while
EOS remains the sole externally legible participant.

Constitutional basis:

- Participation is an act, not a type (Discovery-53). An agent that
  executes internally but projects no legible state is not participating —
  the ecosystem has no surface to read.
- Discovery-54: an Entity can exist without participating. Internal agents
  may exist as EOS-internal specializations without acquiring participation.
- Discovery-57: the ecosystem recognizes participants through projection
  surfaces. Internal agents add no surface. Applied to the instantiation,
  the participation filter reads exactly one EOS surface (`.eos/`) — one
  participant.

Verdict: survives. Independent execution and sole legible participant are
compatible because legibility runs through the projection surface, not
through execution.

### Test 2 — Projection boundary

Hypothesis: internal agent output consumed by EOS is distinguishable from
an independently attributable ecosystem projection.

Precise criterion (derived from Discovery-53/57/63, PROJECTION.md): a
projection is a legible state surface that crosses a participant boundary —
readable by an observer other than its producer and counting as
participation.

- Internal agent output consumed by EOS: produced by the agent, consumed by
  EOS. No participant boundary is crossed (producer and consumer are both
  inside EOS). This is internal execution, not a projection.
- EOS projection: EOS emits a legible surface (`.eos/`) under the identity
  EOS. It crosses the participant boundary and counts as EOS's
  participation.
- Independent agent projection: a legible surface (a) readable without EOS,
  (b) attributed to the agent, (c) recognized by the participation filter
  as the participation of a distinct entity.

The discriminating property is attribution-by-readability: a surface whose
attribution is legible to an external observer as "not EOS." Internal
output re-emitted through EOS's surface under EOS's identity is EOS's
projection, regardless of which internal specialization produced it.

Verdict: survives.

### Test 3 — Capability ownership

Hypothesis: an internal agent can specialize in a capability without
becoming its constitutional owner.

Constitutional basis:

- ADR-ECOSYSTEM-0001: ownership is unique and architectural; consumption is
  unlimited. A consumer executes a canonical capability without owning it.
  Ownership belongs to the participant whose constitutional responsibility
  includes maintaining it — the row in the matrix.
- Discovery-52 resolution + PARTICIPANT.md: specializations are roles
  expressed through projections, not owners.
- Discovery-62: classification precedes ownership; specialization does not
  alter ownership.

Examination: an internal agent specializing in requirements reasoning
exercises EOS's Intelligence. The Capability Ownership Matrix row remains
"Intelligence — EOS." The agent acquires no row; it is a consumer of EOS's
own capability — structurally identical to a Project consuming Runtime
through Provider Resolution.

Verdict: survives. Ownership and specialization are orthogonal, mirroring
Discovery-62's classification/ownership independence.

### Test 4 — Traceability

Hypothesis: EOS can preserve attribution of internal-agent work without
creating separate participant identity.

Constitutional basis:

- Discovery-55's two axes: "what it does" and "what it is" are independent.
  Attribution describes what did the work (a property of the record);
  identity describes who participates (a property of the projection).
- Discovery-63 / PROJECTION.md: attribution travels inside the projection;
  only the projection crosses the boundary.

Examination: EOS's projection may record provenance — which internal
specialization produced which claim — as fields within the projection. The
projection remains attributed to EOS. An external observer reads one
participant carrying internally-attributed records. Traceability is
preserved without a second identity because provenance is record metadata,
not a projection surface.

Verdict: survives.

---

## Falsification Criteria

F9 FALSIFIED if any of the following holds:

**FC-F9-1 — Independent projection.** Any internal agent projects to the
ecosystem under its own identity: a legible surface readable without EOS,
attributed to the agent, and recognized by the participation filter
(Discovery-57) as the participation of a distinct entity.

**FC-F9-2 — Independent capability ownership.** Any internal agent acquires
a row in the Capability Ownership Matrix distinct from EOS's Intelligence
row, or owns a canonical capability independently of EOS
(ADR-ECOSYSTEM-0001).

**FC-F9-3 — Independent governance/observation boundary.** Any internal
agent requires structural distinctness per Discovery-59.1 — its own
responsibility, its own object of ownership, or OCS observing it as a
separate participant.

**FC-F9-4 — Incoherent participant identity.** External observers cannot
attribute EOS's projections to a single participant; EOS can no longer
present one coherent identity.

---

## Verdict

F9 — NOT FALSIFIED.

- Test 1 (single identity): survives. Legibility runs through projection,
  not execution.
- Test 2 (projection boundary): survives. The discriminating property is
  attribution-by-readability; internal consumption crosses no participant
  boundary.
- Test 3 (capability ownership): survives. Ownership is constitutional and
  unique; specialization is consumption.
- Test 4 (traceability): survives. Provenance is record metadata, not a
  projection surface.

---

## Surviving Architectural Constraint

The exact rule that survives:

> Internal agents are roles/mechanisms of the single EOS participant. EOS
> remains one participant and the sole external projection identity. An
> internal agent becomes an ecosystem participant only by independently
> projecting legible state on its own behalf (FC-F9-1), acquiring
> independent canonical capability ownership (FC-F9-2), or requiring
> structural distinctness (FC-F9-3) — any of which falsifies the model.

Corollaries:

- EOS executes internally; EOS projects externally through `.eos/`. Only
  EOS's projection crosses participant boundaries (Discovery-63).
- An internal agent is at most an Entity (Existence + Distinction,
  Discovery-54); it is not a Participant until it projects (Discovery-53).
- Attribution of internal-agent work is record provenance inside EOS's
  projection, not a second identity (Discovery-55).
- EOS's canonical capability row is unchanged by the number or
  specialization of internal agents (ADR-ECOSYSTEM-0001, Discovery-62).

---

## Remaining Unknowns

1. Discovery-63 (projection is the universal capability) remains Candidate.
   F9's projection-boundary test relies on it; confirmation strengthens the
   verdict, non-confirmation weakens but does not reverse it (Discovery-53/
   57 independently establish the participation filter).
2. Whether any future agent legitimately requires independent projection
   (FC-F9-1) — an agent that must be legible to the ecosystem without EOS.
   This is decided per-agent, not by EOS's structure.
3. The minimum projection contract for `.eos/` (Discovery-53's open question
   applied to EOS's surface). Not needed for F9; needed before F-Plan.
4. Whether provenance becomes observable enough to serve as evidence —
   currently record metadata only.

---

## Smallest Next Experiment

Re-apply the identity-vs-role axis (Discovery-55) to each proposed
EOS-internal specialization under F-Expanded (proposal, requirements,
planning, cross-project, obligation, risk) against FC-F9-1..4. Smallest
run: take the single most boundary-adjacent specialization — the risk agent,
whose output most resembles an ecosystem-visible judgment surface — and test
it against all four criteria. If the boundary-adjacent case survives, the
remaining cases are lower-risk by construction.

---

## Status

Not falsified.
