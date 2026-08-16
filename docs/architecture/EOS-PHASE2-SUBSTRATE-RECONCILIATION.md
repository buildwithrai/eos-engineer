# EOS Phase 2 — Substrate Reconciliation: Decisions & Traceability

Engineering Operating Intelligence — read-only reconciliation of whether EOS
should directly consume `.ewa/engineering/decisions/*.json` and
`.ewa/engineering/traceability.json`, or reference them only through the
evidence model.

- Date: 2026-08-10
- Mode: Read-only reconnaissance. No engineering files were modified.
- Claim status: [observed] = read directly from source. [inferred] = reasoned
  from observed evidence. [proposed] = recommendation, not yet implemented.
  [unknown] = not yet verified.

---

## 1. Question

EOS is evidence-gated judgment: probabilistic, evidence-gated investigation
recorded as declared/candidate state. [observed, EOS README / Discovery-01]

EWA persists three deterministic stores under `.ewa/engineering/`:

- `.ewa/engineering/evidence/<id>.json` — observed/validated records
- `.ewa/engineering/decisions/<id>.json` — declared engineering choices
- `.ewa/engineering/traceability.json` — derived links between them

Phase 1 wired evidence + knowledge into EOS's substrate. [observed]

Phase 2 question: should EOS directly consume the decision ledger and
traceability store as first-class substrate, or should they remain
deterministic OCS/EWA state that EOS may only see through the evidence model?

---

## 2. Substrate Inventory (observed)

| Store | Path | Shape |
|-------|------|-------|
| Knowledge | `.ewa/knowledge.json` | `repository`, `symbols`, `imports`, `exports`, `packageDependencies` |
| Evidence | `.ewa/engineering/evidence/<id>.json` | `id, subject, attempted, observed, outcome, stateBefore?, stateAfter?, basis[], unresolved[], createdAt` |
| Decisions | `.ewa/engineering/decisions/<id>.json` | `id, title, context, options[], decision, rationale, impacts[], relatedArtifacts[], status (active\|superseded\|revisited), createdAt, updatedAt` |
| Traceability | `.ewa/engineering/traceability.json` | array of `{id, from, to, relationship (creates\|depends_on\|impacts\|mitigates\|implements\|verifies), rationale, createdAt}` |
| Index | `.ewa/engineering/index.json` (via `EngineeringIndexer`) | artifacts typed `discovery\|requirement\|research\|decision\|risk` |

Wiring (observed, `EngineeringRuntimeFactory.ts`): FileDecisionLedger → decision
dir; FileTraceabilityStore → traceability.json; FileEvidenceStore → evidence
dir; `EngineeringDecisionCommandService(decisions, DecisionLinker(traceability))`
creates decisions and links them to artifacts. `DecisionLinker` emits
`impacts` links from `decision.id` to artifact ids. [observed]

Real EWA workspace state (observed): `.ewa/engineering/` currently contains
only an empty `decisions/` directory. No evidence, no traceability, no index.
The substrate EOS would consume is unpopulated in the live workspace today.

---

## 3. Constitutional Grounding (observed)

- IGE KNOWLEDGE_FLOW: knowledge flows downward; evidence flows upward through
  Reality → Observation → Experiment → Discovery → **Decision** → Architecture →
  Implementation → Operation. Decision sits between Discovery and Architecture.
- IGE NODE_TYPES: Experiment = Evidence. ADR = Architectural decisions.
  Discovery = Validated findings. These are three distinct node types.
- IGE EDGE_TYPES: supports, derived_from, validated_by, governs, implemented_by,
  depends_on, supersedes, applies_to. `validated_by` = "Confirmed through
  evidence."
- IGE RUNTIME_STATE categories: Observed, Declared, Derived, Validated, Blocked.
  Declared = "Human-owned engineering declarations." Derived = "Facts computed
  from observed and declared state."
- IGE PARTICIPANTS: IGE=Governance, Omnia=Production, OCS=Observation (never
  owns the observed), Corpus=Sustainment. Capability ownership is unique;
  consumption is unlimited.
- IGE ENGINEERING_ONTOLOGY: Observation never owns the observed; projection
  reveals; knowledge accumulates; ownership remains independent.

---

## 4. Ownership Boundaries (inferred)

- Decisions are **Declared** state: human-owned engineering declarations,
  produced deterministically by `EngineeringDecisionCommandService`
  (create/supersede). [observed]
- Traceability is **Derived** state: facts computed from observed + declared,
  produced by `DecisionLinker`. [observed]
- Evidence is **Observed/Validated** state: confirmed through engineering
  process (`reconcile()` derives outcomes). [observed]
- EOS owns Intelligence/judgment only. Per Discovery-01/02, EOS consumes the
  canonical model as evidence and never writes reconciler artifacts. [observed]

Consumption is unlimited; ownership is unique. [observed, ADR-ECOSYSTEM-0001]
EOS may therefore consume decisions/traceability freely — but must never own,
write, or reclassify them.

---

## 5. Canonical Representation and AI Reasoning (observed)

- OCS ADR-0001: every engineering fact has exactly one canonical
  representation; all consumers derive from it. "Model once. Consume
  everywhere. Never duplicate."
- OCS ADR-0004: "AI should reason. AI should not rediscover." AI consumes the
  Repository Knowledge Model rather than rediscovering repository state.

A decision record is the canonical representation of a decision. Traceability
is the canonical representation of links. If EOS could only reach these
through evidence records, it would either duplicate them into evidence (ADR-0001
violation) or re-derive them probabilistically (ADR-0004 violation).

---

## 6. Projection Boundary (observed)

- Discovery-63 (Candidate): projection is the universal capability; only
  projections cross participant boundaries.
- Discovery-53: participation is the act of projecting legible state; a
  projection that exists is participation.
- OCS observation-contract: consumers depend on observation APIs/projections,
  not internal storage tables.

In the file-based substrate, the projection IS the file. `.ewa/` is the legible
surface EWA projects — the same pattern by which EOS already reads
`.ewa/knowledge.json` and `.ewa/engineering/evidence/*.json` in Phase 1.
[observed] Reading decision/traceability files directly is consuming EWA's
projection surface, not reaching into a separate runtime. [inferred]

---

## 7. Falsified: Evidence-Model-Only Mediation (inferred)

The hypothesis that decisions/traceability "remain deterministic OCS/EWA state
referenced only through the evidence model" is FALSIFIED:

1. **No schema mechanism exists.** `EngineeringEvidence` has `basis: string[]`
   and `supports: string[]` — no decision id field, no typed edge to a
   decision. `DecisionLinker` creates decision→artifact `impacts` links, never
   evidence→decision links. There is nothing today that references a decision
   through evidence. [observed]
2. **It inverts the knowledge flow.** KNOWLEDGE_FLOW places Decision ABOVE
   Experiment; evidence validates decisions (`validated_by`), not the reverse.
   Forcing decisions through evidence makes evidence the source of decisions,
   which the ontology does not support. [observed]
3. **It collapses distinct node types.** Experiment (Evidence), ADR (Decision),
   and Discovery are distinct IGE node types. Funneling decisions through the
   evidence model conflates them. [observed]
4. **It violates ADR-0004 and ADR-0001.** EOS would rediscover or duplicate
   declared state instead of deriving from the canonical representation.
   [observed]

---

## 8. Confirmed: Direct Read-Only Substrate Consumption (proposed)

EOS should consume `.ewa/engineering/decisions/*.json` and
`.ewa/engineering/traceability.json` **directly, read-only**, as substrate
context — the same file adapter pattern as Phase 1 evidence/knowledge:

- Add read-only loaders (`loadDecisions`, `loadTraceability`) mirroring
  `loadEvidence`/`loadKnowledge`: `fs.readFileSync` only, sha256 digest +
  source provenance, graceful empty handling. [proposed]
- Inject a DECISIONS + TRACEABILITY context block into
  `buildSubstrateContext` (ids, status, relationship summary) alongside the
  ENGINEERING EVIDENCE and REPOSITORY KNOWLEDGE blocks. [proposed]
- Keep the judgment gate unchanged: `evidence_refs` resolve to inspected files
  OR real evidence ids. A decision file becomes citable only when inspected —
  preserving the anti-fabrication discipline. [proposed]

Rationale: ADR-0001 consume-everywhere, ADR-0004 reason-not-rediscover,
Discovery-63/53 (`.ewa/` is the legible projection surface), and KNOWLEDGE_FLOW
(decisions are part of the substrate EOS judges over). [inferred]

---

## 9. Boundaries EOS Must Never Cross (proposed)

1. EOS never writes decisions or traceability. Writes belong to
   `EngineeringDecisionCommandService`/`DecisionLinker`. [observed]
2. EOS never reclassifies its judgment into runtime categories (Observed/
   Derived/Validated) — Discovery-02 F6. [observed]
3. EOS never treats decisions as evidence. Decisions are Declared context;
   evidence is the gate. Judgment claims are supported by evidence, informed by
   decisions. [proposed]
4. EOS never calls EWA loaders (`RepositoryKnowledgeCache.load()` rebuilds/
   writes). It reads persisted files directly. [observed]
5. Decisions/traceability/evidence/knowledge are four distinct substrate blocks
   in the prompt — never collapsed into one generic context object. [proposed]

---

## 10. Verification and Next Step (proposed)

Verification plan for the next implementation step:

- Unit tests for `loadDecisions`/`loadTraceability`: read-only (no writes on
  missing dir), digest provenance, empty-dir handling. [proposed]
- Gate test: a fabricated decision id (not inspected, not an evidence id) is
  rejected; an inspected decision file is accepted as a ref. [proposed]
- Live verification against the EWA workspace: currently `decisions/` is empty
  and `traceability.json` absent → EOS must degrade gracefully, which the
  empty-handling tests cover. [observed, proposed]

---

## Verdict

### CONFIRMED

1. Decisions and traceability are deterministic canonical state (Declared /
   Derived), distinct from evidence (Observed / Validated). NODE_TYPES and
   RUNTIME_STATE categories are distinct. [observed]
2. EOS should consume `.ewa/engineering/decisions/*.json` and
   `.ewa/engineering/traceability.json` **directly, read-only**, as substrate
   context — same pattern as Phase 1 evidence/knowledge reading. [proposed]
3. Decisions/traceability are context, not gating evidence. The evidence gate
   stays: refs resolve to inspected files or real evidence ids. [proposed]
4. EOS must never write decisions/traceability, never call EWA loaders, and
   never reclassify its judgment into runtime categories. [observed → proposed]

### FALSIFIED

The claim that decisions/traceability "should remain deterministic OCS/EWA
state referenced only through the evidence model" is falsified: there is no
evidence→decision schema or link today; forcing it would invert KNOWLEDGE_FLOW,
collapse distinct node types, and violate ADR-0001/ADR-0004. [inferred]

### UNKNOWN

- Whether Discovery-63 (projection is the universal capability) will be
  confirmed — currently Candidate. [observed]
- Whether EWA will add typed evidence→decision edges (e.g., a `validated_by`
  relationship) in future — absent today. [observed]
- Whether the live EWA workspace will populate the substrate — currently empty
  except `decisions/`. [observed]
- Whether EOS's substrate injection should be structured summaries (this report)
  or raw file availability only — an implementation choice, not architecture.
  [unknown]

### NEXT SMALLEST STEP

Extend `src/evidence.js` (read-only) with `loadDecisions(root)` reading
`.ewa/engineering/decisions/*.json` and `loadTraceability(root)` reading
`.ewa/engineering/traceability.json`, each returning `{item, source, digest}`
like evidence; wire both into `buildSubstrateContext` as a DECISIONS +
TRACEABILITY block; keep `gateJudgment` unchanged; add tests for read-only
digests, empty-dir handling, and fabrication rejection.
