# EOS Operating Model — Frozen Target Model

- Status: **Frozen** (2026-08-15). The reference model for the alignment
  refactor. This document reconciles the target model's vocabulary and its
  operating loop with the runtime that exists today.
- Alignment: **Complete** (2026-08-16). All gates G1–G16 closed; the runtime is
  in conformance with this model. Verified by the full test suite
  (`npm test`, 31 files).
- Mode: Read-only architectural reconciliation. No implementation, no tests,
  no migration, no repository restructuring. Constitutional facts from
  `EOS-BECOMING.md`, `EOS-PRODUCT-ARCHITECTURE.md`, and the Constitution are
  preserved; none are silently altered here.
- Successor: `EOS-PRODUCT-ARCHITECTURE.md` remains the product architecture
  baseline. This document is its operating-model companion: what the terms
  mean and what loop must run.

---

## 1. The Frozen Target Model

```text
intent
  ↓
objective
  ↓
what must be known
  ↓
evidence obligations
  ↓
investigation
  ↓
evidence acquisition
  ↓
inspection
  ↓
observation
  ↓
understanding
  ↓
knowledge
  ↓
judgment
  ↓
decision
  ↓
actor
  ↓
action
  ↓
verification
  ↓
memory
  ↓
next engineering state
```

The loop continues: the next engineering state becomes the substrate the next
investigation observes.

The engineering cycle it expresses:

```text
UNDERSTAND → KNOW → INVESTIGATE → JUDGE → DECIDE → ACT → VERIFY → REMEMBER
```

## 2. The Central Boundary

```text
deterministic knowledge → probabilistic reasoning → judgment → decision/proposal
    → actor → action → verification → new deterministic evidence
```

- Knowledge is deterministic and already established.
- Reasoning is probabilistic; it never silently becomes canonical truth.
- Judgment is the AI's inference of likely truth, gated on evidence.
- A proposal is EOS's projection of a recommended next action; it is never a
  decision, never an authorization, never an execution.
- A decision belongs to a participant (the human Engineer or another capable
  actor), not to EOS.
- Verification re-observes after the action; only then does new deterministic
  evidence exist.
- **Knowledge before intelligence. Evidence before judgment.**
- **judgment ≠ decision ≠ authorization ≠ execution.**

## 3. Vocabulary Reconciliation

For each term of the frozen model: the architectural meaning, the runtime
representation, and the reconcilement status.

| Term | Architectural meaning | Runtime representation | Status |
|------|----------------------|------------------------|--------|
| intent | The human's reason the work exists; the origin of purpose. Never created by EOS. | `userInput`; persisted `intent` records under `.eos/formation/` in formation mode (`formation.js`) | matched (repository mode carries it as `userInput`; only formation persists it) |
| objective | The specific aim this investigation serves, derived from intent. | `investigation.target` / `investigation.objective` (`createInvestigation`); surface `investigation.target` / `objective` | matched |
| what must be known | The determinate set of facts required before judgment. | `explicitRequirements` + `requiredFiles` + `adoptedRequirements`; surface `required_evidence` | matched (file-scope capture is heuristic; semantic needs are expressed as obligations) |
| evidence obligations | Deterministic preconditions: what must become grounded before judgment is permitted. | `investigation.evidenceObligations`; phase `obligations`; gate `evidenceObligationStatus` | matched |
| investigation | The governed process of acquiring, inspecting, and grounding evidence. | `createInvestigation` + `investigation/` module; `phaseOf`; `investigationComplete` | matched |
| evidence acquisition | The act of obtaining evidence from substrate. | read_file / read_files tools; substrate loaders (`loadEvidence`, `loadKnowledge`, `loadDecisions`, `loadTraceability`) | matched |
| inspection | A deterministic matter of record: which artifact was read, when, from where, and its digest. | `recordInspection`; `investigation.inspections`; `inspectedEvidence` | matched |
| observation | What a single inspection revealed — recorded per evidence. | none. Inspections are stored as raw reads with a digest, but no structured per-inspection observation is captured. | **gap (G5)** |
| understanding | The synthesized account derived from the set of observations; distinct from judgment. | none. The loop moves from inspection straight to judgment; there is no explicit understanding step or field. | **gap (G5)** |
| knowledge | Deterministic repository knowledge already established (RKM / repository knowledge); distinct from evidence. | `loadKnowledge` → REPOSITORY KNOWLEDGE block; `buildSubstrateContext`; knowledge refs in `knowledge.js` | matched (consumed read-only; canonical source is OCS RKM per product architecture) |
| judgment | The AI's probabilistic inference of likely truth, evidence-gated; declared / candidate / blocked. | `evaluateJudgment`; `judgment/gate.js`; `JUDGMENT_STATES` | matched |
| decision | A participant commitment; belongs to the human Engineer or another actor, never EOS. | loaded read-only from substrate decisions (`.eos/substrate/engineering/decisions/`); change authorization records (`authorizeChange`) | matched (external / participant-owned; EOS never decides) |
| proposal | EOS's candidate projection of a recommended next action. | `change` field on a declared judgment; `gateChangeProposal`; `createChange` (status `proposed`) | matched |
| actor | A participant capable of performing an action; named, never authorized by proxy. | `requested_actor`; authorization record `actor`; execution adapter | matched |
| action | A concrete change to engineering state, performed by an actor. | change contract scope (`changed` / `created` / `unchanged`) + predicates; executed via adapter (`dispatchChange`) | matched (EOS records; adapter executes) |
| verification | EOS re-reads the contract paths after the action to check the change actually occurred. | `verifyChange`; verification record + verdict; surfaced deterministically on the surface as `memory.verification` (verified / failed / pending) | matched (G9) |
| memory | History: intents, investigations, judgments, proposals, verifications — what EOS learns across runs. | `buildMemory` → surface `memory` block (`eos-memory/v1`): judgment/review/intent counts, latest review, change verification state | matched (G9) |
| engineering state | The real-world state of the engineering system under management. | substrate files + workspace files; EOS never owns it; surface carries explicit `engineering_state` transition (from → transition → to) | matched (G8) |
| projection | EOS's legible, non-canonical model of engineering state. | `.eos/judgment.json`; `buildSurface`; change contracts | matched |

## 4. Operating Loop Reconciliation

How the frozen loop maps to the runtime flow (`src/runtime/run.js`):

| Model step | Runtime step |
|-----------|--------------|
| intent / objective | `runEos(userInput, …)` → `createInvestigation(userInput, …)` |
| what must be known | explicit file requirements extracted; evidence obligations for file-less objectives |
| investigation | the reasoning loop: `reason` → tool / plan / judgment |
| inspection | `read_file` / `read_files` → `recordInspection` → `inspections`, `inspectedEvidence` |
| observation | `observationOf` → `investigation.observations` (path, exists, digest, bytes, lines, observedAt) (G5) |
| understanding | `understandingOf(investigation)` → surface `investigation.understanding` (G5) |
| knowledge | REPOSITORY KNOWLEDGE block + perspective projection supplied to the model |
| judgment | `evaluateJudgment` → declared / candidate / blocked; gated; committed |
| proposal | optional `change` carried on a declared judgment → `gateChangeProposal` → `createChange` (proposed) |
| decision | external: `authorizeChange` by a participant; EOS never authorizes |
| action | adapter executes the contract (`dispatchChange`); EOS records |
| verification | `verifyChange` re-reads and compares digests; surfaced on the surface via `memory.verification` (G9) |
| memory | `buildMemory` → surface `memory` block (G9); ledgers persist; lineage seeds the next run |
| next engineering state | surface `engineering_state` transition (from → transition → to) (G8) |

## 5. Gaps Register

Identified during reconciliation. These drive the later refactor gates and are
not new architectural investigation — they are the model being made operational.

| Gap | Gate | Status |
|-----|------|--------|
| Guidance mixes EOS guidance, epistemic guidance, and runtime protocol in one prompt | G4 | closed — layered `EOS_GUIDANCE` / `EPISTEMIC_GUIDANCE` / `RUNTIME_PROTOCOL` |
| Investigation lacks explicit per-evidence observation | G5 | closed — `observations` + `observationOf` |
| Investigation lacks explicit understanding step/field | G5 | closed — `understandingOf` surfaced |
| No engineering-state transition object (from → transition → to) | G8 | closed — surface `engineering_state` |
| Verification not surfaced in the main runtime loop; memory not first-class | G9 | closed — `buildMemory` → surface `memory` |
| Obsolete empty `.eos/` persistence structures | G10 | closed — removed obsolete `investigations/`, `projections/`, `trace/` |
| Empty runtime module stubs | G11 | closed — removed empty `knowledge/access.js`, `knowledge/substrate.js`, `projection/projection.js`, `trace/reasoning.js` |
| Runtime-supplied authoritative state not verified as read-only | G12 | closed — substrate byte-identical after runs; EOS writes only to its ledgers (`authoritative-state-regression.test.js`) |
| Tests named by implementation phase rather than architectural invariant | G13 | closed — `architectural-invariants.test.js` asserts the frozen loop across identity, epistemology, investigation, knowledge, judgment/proposal/execution, verification, memory, state |
| Root leftovers and empty placeholder dirs | G14 | closed — removed `--workspace/`, `.does-not-exist/`, `.tmp-blackbox-eos/`, `.tmp-debug-ia/`, `.tmp-test-workspace-formation/`, empty `epistemology/`, `relationships/`, `conformance/`, `contracts/` |
| Whole-loop alignment not yet verified against the frozen model | G15-16 | closed — `frozen-model-alignment.test.js` walks all 17 loop steps and a full round trip (intent → judgment → proposal → actor → action → verification → memory → next state) |

## 6. Boundary Enforcement (G6, G7)

Verified during reconciliation, not redesigned. Each boundary is enforced by
deterministic code, not by prompt alone.

### Knowledge ≠ Evidence (G6)

| Concern | Runtime mechanism |
|---------|-------------------|
| Repository knowledge | `loadKnowledge` → REPOSITORY KNOWLEDGE block; `knowledge.js` resolves `symbol:` / `package:` / `import:` / `export:` / `dependency:` refs against the loaded RKM |
| Evidence | `.eos/substrate/engineering/evidence/` records; inspected files; review refs (`review:<id>`); change refs (`change:<id>`); intent refs (`intent:<id>`); perspective refs |
| Separation | `judgment/gate.js` canonicalizes each ref class against its own store; a knowledge ref that does not resolve to a listed entity is rejected (`isKnowledgeRef`, `resolveKnowledgeEntityRef`) |

Knowledge is deterministic, already-established repository facts consumed
read-only. Evidence is what the current investigation grounds claims in.
They are never interchangeable citation classes.

### judgment ≠ decision ≠ proposal ≠ authorization ≠ execution (G7)

| Concern | Runtime mechanism |
|---------|-------------------|
| judgment | `evaluateJudgment` → declared / candidate / blocked; evidence-gated; the AI's inference only |
| proposal | `change` field carried on a declared judgment → `gateChangeProposal` → `createChange` (status `proposed`); candidate projection, never a decision |
| decision | participant-owned; `authorizeChange` requires an actor and rationale; EOS never calls it on its own behalf |
| execution | adapter-owned; `dispatchChange` executes via a participant-supplied adapter |
| verification | `verifyChange` re-reads contract paths and compares digests; EOS-observed |

The runtime (`run.js`) invokes only `createChange`. It never calls
`authorizeChange`, `dispatchChange`, or `verifyChange` inside the loop: those
are participant/adapter-facing transitions, exercised through tests and
external callers, never silently by EOS.

## Verdict

The frozen model is now operational in the runtime. Every term of the loop has a
runtime representation on the projection surface, and the full cycle
(intent → objective → what must be known → evidence obligations → investigation
→ evidence acquisition → inspection → observation → understanding → knowledge →
judgment → proposal → actor → action → verification → memory → next engineering
state) runs end-to-end. The alignment gates G1–G16 are closed: guidance is
layered, observations/understanding/completion are explicit, engineering-state
transitions and memory/verification are first-class surface blocks, boundaries
(knowledge ≠ evidence; judgment ≠ decision ≠ proposal ≠ authorization ≠
execution) are enforced by deterministic code, authoritative substrate is
read-only, obsolete structures and stubs are removed, and architectural and
whole-loop alignment invariants are asserted by regression tests. The full test
suite (31 files) passes.
