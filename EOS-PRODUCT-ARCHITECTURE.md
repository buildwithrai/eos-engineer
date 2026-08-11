# EOS Product Architecture — Reconciliation Baseline

- Status: **Accepted** as current architectural direction (2026-08-10).
- Predecessor: `EOS-ARCHITECTURE-RECONCILIATION.md` — the implementation-stage
  baseline. Its statements are transitional/obsolete where marked in this
  document; none are silently carried forward.
- Mode: Read-only architectural design. No implementation, no tests, no
  migration, no repository restructuring. IGE, OCS, and EWA are unmodified.
  Phase 1/2 implementation is unchanged.

## Claim Status Vocabulary

| Status | Meaning |
|--------|---------|
| [constitutional] | Established fact that must be preserved |
| [observed] | Read directly from source |
| [absorbed] | Lineage primitive adopted into EOS scope |
| [proposed] | EOS-owned capability claim, not yet falsified |
| [transitional] | Correct for Phase 1-2 only; superseded as architecture |
| [unknown] | Not yet reconciled or verified |

---

## 1. Product Context

EOS is the finished product: an Engineering Operating Intelligence that helps an
engineer talk through projects, challenge assumptions, discover and refine
requirements, generate proposals, maintain decisions and traceability, create
project backlog/Kanban/burndown intelligence, reason across projects, identify
domain/regulatory/industry obligations, assess risks and dependencies, and
coordinate an agency of specialized agents. [user directive]

- EWA and RAI are absorbed lineage/source material, not permanent runtime
  participants. [user directive]
- IGE remains intact as the governance/knowledge foundation. [user directive]
- OCS remains intact as the deterministic observation/operation foundation.
  [user directive]
- EOS owns the Foundational Intelligence capability. [constitutional,
  Discovery-01, F1-F4 not falsified]
- EOS may absorb EWA/RAI cognition primitives without creating a second IGE/OCS.
  [user directive]
- OpenCode is only an implementation accelerator, not an EOS participant.
  [user directive]

---

## 2. Taxonomy at a Glance

| Category | In this document |
|----------|------------------|
| Constitutional facts already established | Section 3 |
| Absorbed lineage | Section 4 |
| Proposed EOS-owned capabilities | Section 5 |
| Deterministic capabilities remaining IGE/OCS-owned | Section 6 |
| Transitional/obsolete statements | Section 7 |
| Surviving conclusions (preserved) | Section 8 |
| Unresolved architectural questions | Section 11 |
| Claims requiring falsification | Section 9, 10, 12 |

---

## 3. Constitutional Facts Already Established

Restated, not redesigned. These survive unchanged.

### 3.1 IGE — governance/knowledge foundation [constitutional]

- IGE is an engineering operating system and knowledge architecture, not a
  software framework. Hierarchy: Foundations → Canon → Methods → Patterns →
  Capabilities → Standards → Framework → Projects → Products → Organizations.
  Knowledge flows downward; evidence flows upward; implementation is always
  downstream of knowledge. [observed]
- The Engineering Ecosystem consists of four constitutional participants:
  IGE, Omnia, OCS, Corpus. Participant responsibilities become constitutional.
  Future participants must preserve structural distinctness.
  [observed, Discovery-59.1]
- Capability ownership is unique; consumption is unlimited; an unowned
  canonical capability is an orphan and both duplication and orphan violate
  ecosystem integrity. [observed, ADR-ECOSYSTEM-0001]
- Capability Ownership Matrix: Runtime, Governance, Corpus, Provider Resolution
  → IGE; Business → Omnia; Observation → OCS. Intelligence is recognized but
  unowned — an orphan. [observed, CAPABILITY_OWNERSHIP_MATRIX /
  CAPABILITIES.md / ROADMAP.md]
- Capability classification precedes ownership; classification and ownership
  are independent dimensions. Intelligence classifies as Foundational.
  [observed, Discovery-62 (Candidate), Experiment-04]
- Ontology: Identity → Distinction → Entity → Participant. Participation is
  the act of projecting legible state, not membership. Observation never owns
  the observed. No participant owns the object of its responsibility.
  [observed, ENGINEERING_ONTOLOGY_V1 / ONTOLOGY.md / Discovery-53]
- omnia-workspace is an instantiation of the ecosystem, not a peer
  participant. [observed, Discovery-53]
- Engineer survives the identity-vs-role axis because of human origin of
  intent; non-human cannot substitute. Observer collapsed to a role.
  [observed, Discovery-55]
- Runtime State categories: Observed, Declared, Derived, Validated, Blocked.
  Reconciler contract: Deterministic, Idempotent, Observable, Stateless,
  Replaceable; reconcilers never invent information. [observed,
  RUNTIME_STATE.md / RECONCILER_CONTRACT.md / RUNTIME_INVARIANTS.md]
- Reasoning model: Observation discovers; knowledge accumulates; judgment
  evaluates; participants act. Judgment does not act. Decision belongs to
  participants. [observed, REASONING.md]

### 3.2 OCS — deterministic observation/operation foundation [constitutional]

- Canonical Representation Principle: every engineering fact has exactly one
  canonical representation; derived artifacts are disposable.
  [observed, OCS ADR-0001]
- Repository Knowledge Model (RKM) is the canonical, deterministic
  representation of repository knowledge. [observed, OCS ADR-0002]
- AI reasons; AI does not rediscover. AI consumes the RKM.
  [observed, OCS ADR-0004]
- Canonical Engineering Schema: every artifact SHALL expose
  `{ metadata, data }`. [observed, OCS ADR-0006]
- Deterministic engineering pipeline: Discover → Model → Analyze → Verify →
  Transform → Present → Persist. [observed, OCS ADR-0008 / handbook]
- Deterministic Before Probabilistic. Knowledge Before Intelligence
  (Facts → Knowledge → Reasoning → Decisions). AI augments engineering; it
  does not replace engineering. [observed, OCS handbook]

### 3.3 EOS — identity and projection [constitutional, confirmed]

- Discovery-01 (Confirmed): EOS is a distinct participant identity owning the
  Intelligence capability; Intelligence classifies Foundational; F1-F4 not
  falsified. EOS is not Engineer; EOS is not OCS; EOS consumes IGE.
  [observed]
- Discovery-02 (Confirmed): EOS exposes `.eos/judgment.json` — a legible,
  non-canonical projection surface; judgment types are declared/candidate/
  blocked; F5-F8 not falsified. [observed]
- Phase 2 substrate verdict (Confirmed): decisions and traceability are
  Declared/Derived deterministic state; EOS consumes them read-only; decision
  IDs are context, never evidence. [observed, EOS-PHASE2-SUBSTRATE-
  RECONCILIATION.md]

---

## 4. Absorbed Lineage (EWA / RAI)

EWA and RAI are source material. Their useful primitives become EOS substrate;
their boundaries as separate products are not preserved. [user directive]

### 4.1 Absorbed from EWA [absorbed]

| Primitive | Source | Adopted as |
|-----------|--------|------------|
| `EngineeringEvidence` + `reconcile()` | @ewa/engineering/evidence | EOS evidence core; the deterministic floor of judgment |
| `DecisionRecord`, `DecisionLedger`, `EngineeringDecisionCommandService` | @ewa/engineering/decision | EOS decision ownership |
| `TraceabilityLink`, `TraceabilityStore`, `DecisionLinker` | @ewa/engineering/traceability | EOS traceability ownership |
| `EngineeringReviewService` + rules (OrphanRequirement, EvidenceOutcome) | @ewa/engineering/review | EOS review pipeline (loop-closure is EOS's to solve) |
| `EngineeringChangeRequest` | @ewa/agent/change | EOS proposal/change scaffolding |
| Repository knowledge, indexers, queries | @ewa/workspace | EOS knowledge substrate (reconciliation with OCS RKM unresolved — see 11.1) |
| Graph (file/symbol/package nodes, traversal context) | @ewa/graph | EOS graph reasoning primitive |
| Retrieval (budgeted ranked context) | @ewa/agent/retrieval | EOS retrieval primitive |
| Agent, capability registry, `CapabilityPolicy`, verifier | @ewa/agent | EOS agency/orchestration skeleton |
| Providers (Ollama, Fallback) | @ewa/providers | EOS model access (IGE Provider Resolution consumption unresolved — see 11.2) |
| 13-tool `engineering` capability shape; MCP server; CLI | @ewa/apps | EOS tool/interface surfaces |

### 4.2 Absorbed from RAI [absorbed]

| Primitive | Source | Adopted as |
|-----------|--------|------------|
| Evidence-gated investigation loop (required-evidence extraction, controller override, iteration limit, block-until-evidence) | rai-agent/src/loop.js | EOS investigation core |
| Path-escape-safe read tool | rai-agent/src/tools | EOS read primitive |

### 4.3 Absorption rule [proposed]

EOS does not integrate with EWA at runtime; EOS is the continuation of EWA's
cognition runtime. EWA's `.ewa/` file projections become EOS-internal or are
reconciled to canonical conventions — never a foreign runtime's storage.
Absorption must not duplicate canonical capabilities owned by IGE or OCS
(see Section 12, falsification F-Absorb).

---

## 5. Proposed EOS-Owned Capabilities

One participant; one canonical capability (Intelligence, Foundational); many
internal capabilities. Precedent: IGE alone owns four canonical capabilities.
[observed] Each row is a [proposed] claim that must survive falsification.

| EOS-owned capability | Nature | Falsification required |
|----------------------|--------|------------------------|
| Judgment | Probabilistic, evidence-gated, declared/candidate/blocked | F1-F8 standing; re-applied per surface |
| Investigation / evidence-gating loop | [absorbed] RAI loop | Anti-fabrication gate standing |
| Evidence model + reconcile | [absorbed] EWA | Phase 2 verdict standing |
| Decisions + traceability maintenance | [absorbed] EWA | Phase 2 verdict standing |
| Review/rule pipeline | [absorbed] EWA | Standing; loop-closure new |
| Knowledge + graph + retrieval | [absorbed] EWA | RKM reconciliation — 11.1 |
| Proposal generation | Candidate-state projection | RUN — F-Expanded-2 not falsified (Experiment-10) |
| Requirements reasoning (discover/refine/challenge) | Candidate-state refinement | RUN — F-Expanded-3 not falsified (Experiment-11) |
| Planning intelligence (triage/prioritize/sequence/estimate) | Candidate content feeding deterministic reconcilers | Section 10 |
| Cross-project / portfolio reasoning | Judgment across project projections | RUN — F-Expanded-4 not falsified (Experiment-12) |
| Obligation identification (domain/regulatory/industry) | Evidence-gated candidate claims | RUN — F-Expanded-5 not falsified (Experiment-13) |
| Risk & dependency judgment | Verdict over deterministic impact/risk data | New |
| Agent agency / orchestration | Internal roles; single projection | F9, Section 9 |

---

## 6. Deterministic Capabilities Remaining IGE/OCS-Owned

EOS consumes these; EOS never owns them. [constitutional]

| Capability | Owner | EOS relationship |
|------------|-------|------------------|
| Governance | IGE | Consumes (never amends) |
| Runtime | IGE | Consumes |
| Corpus | IGE | Consumes |
| Provider Resolution | IGE | Consumes (mechanism unresolved — 11.2) |
| Business | Omnia | Consumes as projection input; never produces |
| Observation | OCS | Consumes canonical model; never owns the observed |
| Canonical observation model (`inspect.json`) | OCS | Consumes |
| Repository Knowledge Model | OCS | Consumes (reconciliation with absorbed EWA knowledge unresolved — 11.1) |
| Canonical Engineering Schema | OCS | Conforms to |
| Engineering pipeline | OCS | Consumes outputs |
| Canonical project artifacts (PROJECT_STATE / BACKLOG / TIMELINE / METRICS) | Deterministic reconcilers | Consumes; never writes |
| Runtime State categories (Observed/Declared/Derived/Validated/Blocked) | IGE | EOS judgment never classified into these (F6) |

---

## 7. Transitional / Obsolete Architectural Statements

Explicitly marked; not silently carried forward.

| Statement | Disposition |
|-----------|-------------|
| "EOS = judgment projection layer over EWA" | [transitional] Correct only for Phase 1-2. Superseded: EOS is the Engineering Operating Intelligence; EWA is absorbed lineage. |
| "no new runtime" | [transitional] Obsolete as target. Absorption makes EOS the runtime; "no new runtime" meant "no second EWA runtime." |
| "EOS must NOT re-implement Agent" | [transitional] Obsolete. The Agent primitive is absorbed into EOS; EOS owns its own Agent, not a re-implementation of an external one. |
| "wire engineering_judgment into EWA's capability" | [transitional] Obsolete. Registration happens in EOS's own capability registry after absorption. |
| "EOS is not a project manager" | [transitional] Refined. Planning intelligence is in scope; EOS is not the owner of canonical project state and not a reconciler. See Section 10. |
| "EOS is not a collection of agents" | Retained constitutionally; refined internally. No internal agent is a constitutional participant, but internal specialized agents are permitted as EOS roles. See Section 9. |
| "EOS is not a compliance chatbot" | Refined. Evidence-gated obligation judgment is in scope; obligation claims are candidate state citing evidence, never canon. |

---

## 8. Surviving Conclusions (Preserved)

These survive the reframe unchanged. [constitutional / observed]

1. EOS/Engineer identity boundary: intent originates with the human Engineer;
   EOS serves intent, never substitutes. (F3, Discovery-55)
2. EOS/OCS observation boundary: OCS is deterministic; judgment is not a
   deterministic derivation; OCS consumes EOS projections but does not absorb
   EOS. (F2)
3. Deterministic before probabilistic; knowledge before intelligence.
4. Evidence-gated judgment: declared/candidate claims MUST cite inspected
   files or real evidence ids; fabricated refs are rejected. Anti-fabrication.
5. `.eos/judgment.json` is a non-canonical projection, legible to plain
   consumers. (Discovery-02, F5/F7)
6. Runtime purity: runtime reconcile output is byte-identical with `.eos/`
   present. (F8)
7. Decision IDs are context, not evidence. (Phase 2 substrate verdict)
8. EOS never writes or reclassifies deterministic observation truth; judgment
   is never Observed/Derived/Validated. (F6)

---

## 9. F9 Experiment — RUN (not falsified)

### EOS Agency of Agents — Identity/Projection Boundary

- Status: **NOT FALSIFIED** (Experiment-07, 2026-08-10). Design-only run;
  no implementation.
- Origin: product scope requires EOS to coordinate an agency of specialized
  agents; IGE requires that future participants preserve structural
  distinctness (Discovery-59.1) and that capability ownership be unique
  (ADR-ECOSYSTEM-0001).
- Surviving constraint: internal agents are roles/mechanisms of the single
  EOS participant; EOS remains one participant and the sole external
  projection identity. An internal agent becomes a participant only by
  independent projection (FC-F9-1), independent capability ownership
  (FC-F9-2), or structural distinctness (FC-F9-3) — any of which falsifies.
- Remaining unknowns: Discovery-63 (Candidate); whether any future agent
  legitimately requires independent projection; the `.eos/` minimum
  projection contract; provenance as evidence. See Experiment-07.

### Hypothesis [proposed]

Specialized internal EOS agents are roles within the single EOS participant.
They execute EOS's Intelligence internally and project only through EOS's own
identity and projection surface. They do not independently become
constitutional participants.

### Definitions (design-level, no implementation inferred)

- Internal agent: an EOS-executed specialization (role/capability) whose
  outputs carry EOS's identity and timestamp, with no separate participation
  surface.
- Constitutional participant: an entity that projects legible state on its own
  behalf (Discovery-53) and/or owns a canonical capability
  (ADR-ECOSYSTEM-0001).
- Independent projection: a legible surface readable without EOS, attributed
  to the agent, not to EOS.

### Method (design-level)

- Model A (role): an internal agent executes inside EOS; every output is
  emitted through the `.eos/` surface under identity "eos". An OCS-style
  participation filter (Discovery-51 interaction-33 / Discovery-57) reads one
  participant: EOS. Predict survival.
- Model B (independent): an internal agent exposes its own surface and
  identity. The participation filter reads an additional participant; the
  Capability Ownership Matrix requires a new row or a shared row. Predict
  violation.
- Reuse the identity-vs-role axis (Discovery-55) at agent granularity:
  for each agent, does it require something beyond Existence + Distinction +
  Projection to be distinguishable?

### Falsification Criteria

The hypothesis is **FALSIFIED** if any of the following holds:

1. An internal agent independently projects to the ecosystem on its own
   identity (a legible surface attributed to the agent, readable without EOS).
2. An internal agent acquires an independently owned canonical capability
   (a row in the Capability Ownership Matrix distinct from EOS's Intelligence).
3. An internal agent requires an independent constitutional boundary
   (its own responsibility, its own ownership of an object, structural
   distinctness per Discovery-59.1).
4. EOS can no longer present one coherent participant/projection identity
   (external observers cannot attribute EOS's projections to a single
   participant).

### Consequence if not falsified

EOS remains one participant owning Intelligence, with agent agency as internal
mechanism. The constitutional model is unchanged.

### Consequence if falsified

The agency is not architecture; agents that pass any criterion must either be
reabsorbed as roles or be proposed as distinct participants through IGE's
falsification discipline.

---

## 10. Next Architectural Falsification — Planning Scope

### Question

Can EOS generate backlog/Kanban/burndown intelligence as candidate/judged
content that feeds deterministic OCS/IGE reconciliation without EOS becoming
the reconciler or owner of canonical project state?

- Status: **NOT FALSIFIED** (Experiment-08, 2026-08-10). Design-only run;
  no implementation.
- Result: EOS owns planning judgment and its candidate projection; EOS
  never owns/writes/renders canonical project state; EOS never feeds a
  reconciler. The only channel from planning intelligence to canonical
  state is a participant decision: EOS judges, the Engineer declares, the
  deterministic reconciler renders. Backlog/Kanban/burndown are three
  separate concerns, each split into judgment input and deterministic
  artifact/measurement. See Experiment-08.

### Hypothesis [proposed]

Planning intelligence is judgment: evidence-gated, candidate-state. The
canonical backlog/timeline/burndown artifacts are deterministic reconciler
outputs. EOS produces the judged content (priorities, sequencing, estimates,
risk) that informs the deterministic layer, without writing canonical
artifacts and without changing runtime output.

### Falsification Criteria

The hypothesis is **FALSIFIED** if any of the following holds:

1. FC-P1 — A deterministic reconciler consumes EOS's planning projection as
   canonical observation input (`.eos/` feeds the reconciler the way
   `.ige/inspect.json` does). (F5-style breach)
2. FC-P2 — Runtime reconcile output changes because EOS's planning projection
   exists (byte-for-byte invariance breaks). (F8-style breach)
3. FC-P3 — EOS writes PROJECT_BACKLOG / PROJECT_TIMELINE / metrics or any
   canonical artifact, or marks planning claims as Observed/Derived/Validated.
   (F5/F6-style breach)
4. FC-P4 — EOS's planning projection is not legible to a plain consumer
   (participation contract failure). (F7-style breach)
5. FC-P5 — Planning intelligence is a pure deterministic derivation from
   canonical state, i.e., no evidence-gated judgment is involved. If true,
   planning belongs to the deterministic layer, not EOS. (F2-style breach)

### Consequence if not falsified

Planning intelligence is an EOS-owned capability; canonical artifacts remain
deterministic; the EOS/OCS boundary holds for planning.

### Consequence if falsified

Planning intelligence either collapses to a deterministic capability (FC-P5)
or EOS must drop planning from scope until the projection→reconciler boundary
is redesigned.

---

## 11. Unresolved Architectural Questions

Marked [unknown]. No implementation detail may be inferred until each is
reconciled.

1. How absorbed EWA knowledge/graph/retrieval reconciles with OCS Repository
   Knowledge Model (ADR-0002) — both exist today; two knowledge sources of
   truth must not persist. [unknown]
2. How EOS consumes IGE Provider Resolution for model access (EWA's
   `ProviderRegistry` predates it). [unknown]
3. Where canonical requirement artifacts live, and who owns the requirement
   artifact type canonically. [unknown]
4. The mechanism by which EOS planning intelligence feeds deterministic
   reconcilers. RESOLVED by F-Plan (Experiment-08): through
   participant-declared decisions; EOS judgment is never reconciler input.
   The declared planning-value schema (estimate, priority, sequencing) in
   the canonical observation model is not yet specified. [unknown]
5. Where authoritative obligation knowledge comes from (IGE corpus, OCS
   verification, external domain/regulatory sources). EOS's obligation claims
   are candidate state; the authoritative determination is validated knowledge
   that does not yet exist as a capability. [unknown]
6. Whether Discovery-63 (projection is the universal capability) confirms —
   currently Candidate. [observed → unknown]
7. Whether the live substrate becomes populated: EWA `.ewa/engineering/`
   holds only an empty `decisions/`; OCS `inspect.json` engineering counts are
   zero. EOS judgment is not yet exercisable against real, populated evidence.
   [observed → unknown]
8. Whether any future agent legitimately projects independently, and so
   requires participant status rather than role status (F9). [unknown]

---

## 12. Claims Requiring Falsification (Index)

| # | Claim | Falsification |
|---|-------|---------------|
| F-Absorb | EOS absorbs EWA/RAI primitives without creating a second IGE/OCS | RUN — not falsified (Experiment-06). Any overlap (Runtime, Governance, Corpus, Provider Resolution, Observation) falsifies; conditions C1-C3 binding |
| F-Expanded | Each proposed EOS-owned capability (proposal, requirements reasoning, planning intelligence, cross-project reasoning, obligation identification, risk judgment) is genuinely Intelligence and not a duplicated deterministic capability | Extend F1-F4 procedure per capability: ownership must remain unique; classification must remain independent of owner; no capability may require EOS to violate a boundary in Section 8. RUN — all capabilities falsified without loss: risk & dependency judgment (Experiment-09); proposal generation (Experiment-10); requirements reasoning (Experiment-11); cross-project reasoning (Experiment-12); obligation identification (Experiment-13) |
| F9 | Agency of agents remains internal roles (Section 9) | FC-F9-1..4 |
| F-Plan | Planning intelligence feeds deterministic reconcilers without EOS becoming reconciler/owner (Section 10) | FC-P1..P5 |
| Standing | F1-F8 remain standing | Re-applied at planning and agency surfaces, not assumed transitive |

---

## 13. Boundaries Preserved (Non-Goals)

- EOS never amends IGE. [observed]
- EOS never owns Runtime, Governance, Corpus, Provider Resolution, Observation,
  or Business. [constitutional]
- EOS never substitutes for Engineer. [constitutional]
- EOS never writes or reclassifies deterministic observation truth. [observed]
- EOS never fabricates evidence; every claim cites evidence. [observed]
- EOS's projections are never reconciler inputs and never Runtime State.
  [observed]
- OpenCode is not a participant; EOS is not shaped around it. [user directive]
- Omnia Workspace is an instance/application, not a peer product. [user
  directive / Discovery-53]

---

## Verdict

### CONFIRMED (constitutional)

EOS is a distinct participant owning the Foundational Intelligence capability;
`.eos/judgment.json` is a non-canonical projection; the EOS/Engineer boundary
and the EOS/OCS boundary hold; deterministic-before-probabilistic and
evidence-gated judgment hold; decision IDs are context, not evidence; EOS does
not write or reclassify deterministic observation truth.

### CONFIRMED AS DIRECTION (proposed, to be falsified)

EOS is the Engineering Operating Intelligence product; EWA/RAI are absorbed
lineage; EOS owns the expanded Intelligence surface; agency is internal; the
old "judgment projection layer over EWA" framing is transitional, not
architectural.

### FALSIFICATION PENDING

None. F-Expanded's proposed capabilities have all been falsified without
survival loss (see FALSIFICATION RUN).

### FALSIFICATION RUN

- F-Absorb — not falsified (Experiment-06), with binding conditions C1-C3
  (Section 12).
- F9 — not falsified (Experiment-07); agency remains internal roles;
  surviving constraint in Section 9.
- F-Plan — not falsified (Experiment-08); planning intelligence is
  EOS-owned, canonical project state stays deterministic; surviving
  boundary in Section 10.
- F-Expanded-1 — risk & dependency judgment not falsified (Experiment-09);
  EOS judges significance/priority/uncertainty/consequence; canonical
  dependency/risk truth stays deterministic; surviving boundary in
  Section 12.
- F-Expanded-2 — proposal generation not falsified (Experiment-10);
  proposals are candidate, evidence-gated, non-canonical projections;
  EOS never implements and never auto-decides; an accepted proposal
  becomes canonical only as Declared decision + Observed evidence via
  deterministic participant commands; surviving boundary in Section 12.
- F-Expanded-3 — requirements reasoning not falsified (Experiment-11);
  EOS discovers/refines/challenges requirements as candidate,
  evidence-gated claims; deterministic review findings are consumed, not
  re-derived; EOS never writes or owns canonical requirement records;
  surviving boundary in Section 12.
- F-Expanded-4 — cross-project reasoning not falsified (Experiment-12);
  EOS judges across project projections (priority, dependency, risk
  concentration, gaps); portfolio coordination stays IGE ecosystem-layer;
  per-project canonical state stays OCS-owned; surviving boundary in
  Section 12.
- F-Expanded-5 — obligation identification not falsified (Experiment-13);
  EOS identifies obligations as candidate, evidence-gated claims;
  authoritative obligation knowledge is consumed (source unresolved in
  11.5); EOS never invents an obligation engine and never enforces or
  certifies compliance; surviving boundary in Section 12.

### UNKNOWN

The seven unresolved questions in Section 11. No implementation proceeds on
any of them until reconciled.
