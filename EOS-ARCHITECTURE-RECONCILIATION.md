# EOS Architecture Reconciliation

Engineering Operating Intelligence — architectural reconciliation of RAI Agent,
Engineering-Workspace-Agent (EWA), IGE, OCS, Omnia Workspace, and EOS-Engineer.

- Date: 2026-08-10
- Mode: Read-only reconnaissance. No files were modified, merged, or patched.
- Claim status: [observed] = read directly from source. [inferred] = reasoned from
  observed evidence. [proposed] = recommendation, not yet implemented.
  [unknown] = not yet verified.

---

## 1. Executive Conclusion

EOS-Engineer is currently a **proposal and a minimal judgment skeleton**, not an
architecture. [observed] The repositories that must inform EOS already contain
most of the primitives EOS needs — but they are fragmented across three systems
that were never reconciled: EWA (probabilistic cognition runtime), OCS (the
deterministic Engineering Operating System), and IGE (the knowledge
architecture). [observed]

The single most important architectural finding: **the "Intelligence"
capability is an orphan** in IGE's Capability Ownership Matrix
(ADR-ECOSYSTEM-0001). [observed] Ownership is unique; consumption is unlimited;
an orphaned capability violates ecosystem integrity. [observed] EOS-Engineer's
Discovery-01 proposes EOS as that owner. [observed] The reconciliation supports
this proposal, but shows that the EOS skeleton as written cannot yet carry the
responsibility: it has no knowledge model, no evidence store, no judgment
continuity, and no participant integration. [observed]

Next implementation step (recommended): make EOS the **judgment projection
layer** on top of EWA's engineering evidence model — a deterministic `judgment`
interface over `.ewa/engineering/evidence` — not a separate agent.

---

## 2. Lineage: RAI → EWA → EOS

### RAI Agent (`~/projects/rai-agent`) — the original CLI assistant [observed]
- Entry point `index.js`, `agent.js`, `llm.js`; loop in `src/loop.js`; local
  Ollama provider in `src/ollama.js`; tools `src/tools/grep.js`,
  `src/tools/readFile.js`.
- Conversational REPL, chat-loop, minimal tool use. There is no knowledge model,
  no evidence, no judgment, no capability registry. [observed]

### EWA (`~/projects/engineering-workspace-agent`) — the engineering cognition runtime [observed]
- Monorepo `@ewa/*`: agent, engineering, workspace, conversation, memory,
  providers, graph, shared. [observed]
- Self-declared purpose: "This repository is building a product. Not an AI
  framework. Engineering intelligence is the product." [observed, SESSION_CONTEXT]
- Wires RAI-style chat into a full engineering capability stack (Section 6).
- Runs fully local: Ollama, `hermes3` primary + `qwen2.5-coder:7b` fallback,
  no API keys. [observed]

### EOS (`~/projects/eos-engineer`) — judgment participant [observed]
- README: "EOS is an engineering participant whose responsibility is judgment:
  probabilistic, evidence-gated investigation recorded as declared / candidate
  state. EOS consumes IGE. EOS is not a second IGE. EOS is not OCS. EOS is not a
  substitute for Engineer." [observed]
- `eos-run.js` → `src/loop.js::runEos()` → `EOS JUDGMENT SURFACE` (JSON).
  [observed]
- The `src/` tree mirrors RAI's structure (`loop.js`, `ollama.js`,
  `tools/readFile.js`). [observed] Lineage is visible in the code shape.

---

## 3. Capability Inheritance Matrix

| Capability | RAI | EWA | IGE | OCS | EOS (current) |
|------------|-----|-----|-----|-----|---------------|
| Chat loop | Owns | Owns | — | — | Wired [observed] |
| Provider resolution | Ollama-only | Owns (`ProviderRegistry`) | Owns (matrix) | — | Ollama-only |
| Repository knowledge model | — | Owns (`@ewa/workspace`) | Owns (Corpus) | Owns (ADR-0002) | — |
| Capability registry | — | Owns | Owns (classification) | Owns (ADR-0005) | — |
| Decisions / traceability | — | Owns (`DecisionLedger`, `TraceabilityStore`) | Owns (Governance) | Consumes | — |
| Evidence model | — | Owns (`EngineeringEvidence`, reconcile) | Consumes | Consumes | Absent [observed] |
| Review pipeline | — | Owns (findings → questions) | Consumes | Owns (pipeline ADR-0008) | — |
| Judgment / Intelligence | — | Partial (impact/risk heuristics) | Orphan | — | Declared, skeletal [observed] |
| Canonical schema | — | — | Owns | Owns (ADR-0006) | — |
| Observation | — | — | Consumes | Owns | Consumes (proposed) |

EOS today inherits a **loop and a tool** from RAI, and a **declared identity**
from its own discoveries. It inherits almost nothing operational from EWA —
the strongest base — because the two repositories never share code or data.
[inferred]

---

## 4. System Boundaries

### IGE (`~/projects/framework/IGE`) — engineering operating system / knowledge architecture [observed]
- "Industrial-Grade Engineering is an engineering operating system. It is not a
  software framework. Not a methodology. It is a knowledge architecture."
  [observed, README]
- Hierarchy: Foundations → Canon → Methods → Patterns → Capabilities → Standards
  → Framework → Projects → Products → Organizations. "Knowledge flows downward.
  Evidence flows upward. Implementation is always downstream of knowledge."
  [observed]
- Discovery-59.1 (Confirmed): the Engineering Ecosystem has four constitutional
  participants — IGE, Omnia, OCS, Corpus. "Participant responsibilities become
  constitutional. Future participants must preserve structural distinctness."
  [observed]
- Ecosystem layer "does not execute engineering behavior... observes, relates,
  and coordinates engineering state." Status: under discovery. [observed]

### OCS (`~/projects/clients/ocs`) — the deterministic Engineering Operating System [observed]
- README is empty; identity is carried by ADRs and handbook. [observed]
- ADRs 0001–0011: canonical representation principle, repository knowledge
  model, dependency gradient, AI phase two, capability-oriented architecture,
  canonical engineering schema, adaptive execution engine, engineering pipeline
  architecture, execution context, Omnia event integration, event outbox.
  [observed]
- Handbook: Inspect→Understand→Patch→Verify→Commit; "Deterministic Before
  Probabilistic"; "Knowledge Before Intelligence" (Facts → Knowledge →
  Reasoning → Decisions); "Artificial Intelligence augments engineering; it
  does not replace engineering." [observed]
- ADR-0006: Canonical Engineering Schema — every artifact SHALL expose
  `{ metadata, data }`. [observed]
- Stack: backend, frontend, supabase, railway.toml. [observed]

### Omnia Workspace (`~/projects/products/omnia-workspace`) — business participant [observed]
- Proven architecture (do not redesign): Intent → Capability → Artifact →
  Event → Projector → Read Model. [observed, SESSION_CONTEXT]
- Supabase platform layer, API server, HR/workplace/structure/recruiting
  verticals scaffolded; migrations 001–023; not live. [observed]
- Carries `.ige/` runtime state: `inspect.json`, `reconcile`, `handoff`, `sync`,
  `PROJECT_STATE`, `PROJECT_TIMELINE`, `PROJECT_BACKLOG`, `schema-manifest.yaml`,
  `provider.yaml`. [observed]
- `inspect.json` shape: project / git / engineering (adr, discovery, experiment,
  handoff counts) / traceability (primitives confirmed/falsified/decided/
  deferred) / schema_coverage / package_coverage / gaps / runtime. [observed]

### OpenCode — the implementation tool, NOT a participant [observed]
- OpenCode (this environment) is a coding assistant used to author EOS files.
  It is not in IGE's ecosystem matrix and has no constitutional role. EOS must
  not be shaped around it. [inferred]

### EOS boundary rules (from its own discoveries) [observed]
- Discovery-01: EOS is a distinct participant; Intelligence ownership.
- Discovery-02: EOS judgment projection surface (`.eos/judgment.json`),
  legible and non-canonical; "projection not reconciler", "projection not
  runtime state". [observed, IGE_PROPOSAL]
- Experiment-02 (F2): EOS/OCS boundary — OCS is the deterministic EOS; EOS is
  the probabilistic Operating Intelligence. OCS consumes EOS projections; OCS
  does not absorb EOS. [observed]

---

## 5. Canonical EOS Concepts

| Concept | Meaning | Source / status |
|---------|---------|-----------------|
| Participant | Constitutional identity with unique capability ownership | IGE Discovery-59.1 [observed] |
| Judgment | Probabilistic, evidence-gated investigation | EOS README [observed] |
| Declared state | What EOS asserts | EOS README [observed] |
| Candidate state | What EOS suspects / projects | EOS README [observed] |
| Projection | Legible non-canonical surface, not a reconciler | Discovery-02 / F5-F8 [observed] |
| Capability | Unique owner, unlimited consumption | ADR-ECOSYSTEM-0001 [observed] |
| Orphan | Capability with no owner → ecosystem integrity violation | ADR-ECOSYSTEM-0001 [observed] |
| Deterministic | Rules, graphs, AST, verification | OCS handbook [observed] |
| Probabilistic | Model-driven inference, evidence-gated | OCS handbook / EOS [observed] |
| Canonical schema | `{ metadata, data }` for every artifact | OCS ADR-0006 [observed] |
| Knowledge | Corpus layer feeding reasoning | IGE / OCS handbook [observed] |

[inferred] The concepts are consistent across sources: deterministic layer
(OCS/IGE) owns knowledge and observation; probabilistic layer (EOS) owns
judgment; the interface between them is declared/candidate state projections.

---

## 6. Canonical EOS Entities

Existing, reusable entities (all observed in source):

- `EngineeringEvidence` — id, subject, attempted, observed, outcome
  (`forward|neutral|regression|unresolved`), stateBefore, stateAfter, basis,
  unresolved, createdAt. [EWA]
- `EngineeringReconciliation` — attempt, stateBefore/After, observed, intent,
  claimed, reconciled, consistent, supports, unresolved. [EWA]
- `EngineeringReview` — findings, questions, changes, generatedAt. [EWA]
- `EngineeringFinding` + `EngineeringQuestion` — analysis output. [EWA]
- `EngineeringIndex` — artifacts typed `discovery|requirement|research|decision|
  risk`, each with id, file, title, updatedAt. [EWA]
- `EngineeringChangeRequest` — request, impact, plan, questions. [EWA]
- `Decision`/`DecisionLedger`/`TraceabilityStore` — decisions and links.
  [EWA]
- Knowledge model — `symbols`, `imports`, `exports`, `packageDependencies`,
  repository inventory. Persisted as `.ewa/knowledge.json`. [EWA, observed]
- Graph model — nodes `file|symbol|package`, edges `imports|exports|defined_in|
  depends_on`, `GraphQuery.contextFor(term, depth)`. [EWA]
- IGE runtime projection — `inspect.json` (project/git/engineering/traceability/
  coverage/gaps/runtime). [Omnia `.ige`, observed]
- EOS judgment surface — output of `runEos()`; shape not yet fixed beyond
  "judgment surface". [EOS]

[proposed] EOS canonical entity set:
1. `Judgment` — id, subject, request, classification, verdict, confidence,
   evidenceReferences, supports, unresolved, generatedAt, status
   (declared/candidate).
2. `JudgmentProjection` — the legible `.eos/judgment.json` form (Discovery-02).
3. `Evidence` — reuse EWA `EngineeringEvidence` as-is (canonical source).
4. `Decision` — reuse EWA decision/traceability stores as-is.
5. `ParticipantHandoff` — `.ige`-style handoff consumed by OCS/Omnia.

---

## 7. Canonical Relationships

- Ownership: unique per capability (ADR-ECOSYSTEM-0001). [observed]
- Consumption: unlimited (same ADR). [observed]
- Classification ⊥ Ownership: independent dimensions (Discovery-62,
  Classification Matrix). [observed]
- Knowledge flows downward; evidence flows upward (IGE README). [observed]
- Implementation is always downstream of knowledge (IGE README). [observed]
- Deterministic before probabilistic (OCS handbook). [observed]
- OCS consumes EOS judgment projections; OCS does not absorb EOS (F2).
  [observed]
- EOS consumes IGE (EOS README). [observed]
- EOS projection is not a reconciler and not runtime state (F5–F8). [observed]

[inferred] The consistent graph: IGE (governance/corpus) → OCS (deterministic
operation) → EOS (judgment on evidence) → Omnia (business consumption), with
EOS projections flowing back toward OCS/Omnia as inputs, never as canon.

---

## 8. Evidence and Provenance Model

EWA's evidence model is the strongest provenance primitive in the lineage.
[observed] Source: `EngineeringEvidence` (subject/attempted/observed/outcome/
stateBefore/stateAfter/basis/unresolved) and `reconcile()` which derives an
outcome from state change and observation and flags `consistent` when claimed ≠
derived. [observed]

Key insight [inferred]: EWA's `reconcile` is already the **judgment core EOS
declares as its identity** — declared (claimed) state checked against observed
state, producing `consistent|regression|unresolved`. EOS's probabilistic
judgment is the same operation applied to evidence at a higher altitude
(project-level, cross-artifact, intent-aware), not a new mechanism.

Gaps to close [proposed]:
- Evidence currently has `basis` as string list; needs artifact/revision
  provenance (which commit, which file, which tool).
- No evidence chain across attempts (before/after implied but not linked).
- No uncertainty model beyond `unresolved`; judgment needs confidence/verdict.
- EOS must not fabricate evidence: any judgment MUST cite evidence by id.
  [proposed]

---

## 9. Judgment Model

Current EOS judgment: `runEos()` returns a JSON "judgment surface"; the shape is
unfixed; `judgment.test.js` exercises it. [observed] Judgment terminology —
declared vs candidate state — is in the README but not in the code. [observed]

EWA judgment-adjacent heuristics: `EngineeringIntelligence` computes
`impactAnalysis`, `riskAnalysis` (boolean presence + counts), `changePlan`,
`verificationPlan`. [observed] These are deterministic influence counts, not
judgment. [inferred]

OCS/IGE position: judgment belongs to the probabilistic layer; classification
precedes ownership; deterministic precedes probabilistic. [observed]

[proposed] EOS judgment contract:
```
Judgment {
  subject: string                 // what is being judged
  request: string                 // the prompt / intent
  classification: string          // precedes any ownership claim (Discovery-62)
  verdict: "aligns" | "conflicts" | "unclear"
  confidence: number              // 0..1, model-provided, calibrated
  status: "declared" | "candidate"
  evidence: string[]              // evidence ids — REQUIRED
  supports: string[]              // supporting evidence
  unresolved: string[]            // open questions
  generatedAt: string
  participant: "eos"
}
```
Judgment is recorded as declared/candidate state; it never mutates evidence or
canon. [proposed]

---

## 10. Agent/Agency Model

### EWA agent model (the strongest available) [observed]
- `Agent` class wires: conversation + RepositoryService + knowledge cache +
  search + graph query + retriever + prompt builder + capabilities registry +
  provider, with `chatWithCapabilities` bounded at 3 tool rounds and a
  `CapabilityPolicy` gating tool execution. [observed, Agent.ts]
- One registered capability (`engineering`) exposing 13 tools:
  engineering_status, engineering_requirements, engineering_review,
  engineering_decisions, engineering_decision, engineering_decision_impact,
  engineering_create_decision, engineering_supersede_decision,
  engineering_change_request, engineering_record_evidence, engineering_evidence,
  engineering_evidence_item, engineering_reconcile. [observed, SESSION_CONTEXT]
- `EngineeringAgentContext` bundles contextBuilder, reviewService, decisionLedger,
  traceabilityStore, decisionCommand, changeRequestService, evidenceStore,
  evidenceCommand. [observed, EngineeringAgentContext.ts]
- `EngineeringRuntimeFactory` wires file-backed stores:
  `.ewa/engineering/evidence`, `.ewa/engineering/decisions`,
  `.ewa/engineering/traceability.json`, plus review rules
  (`OrphanRequirementRule`, `EvidenceOutcomeRule`). [observed]

### EOS agency [observed]
- Single loop, single readFile tool, Ollama. No registry, no policy, no stores.
- "EOS is not a collection of agents" is implied by the single-participant
  design and must remain explicit. [inferred]

[proposed] EOS must NOT re-implement `Agent`. EOS agency = a thin
judgment-focused capability on the EWA runtime (or a consumer of its evidence
API), because the 13-tool engineering capability already covers decisions,
evidence, review, and reconcile that EOS's identity requires.

---

## 11. Project and Portfolio Model

- IGE hierarchy places Projects → Products → Organizations at the bottom;
  implementation is downstream. [observed]
- Omnia `.ige/inspect.json` materializes per-project state: phase, active_thread,
  open_decisions, blocking_issues, coverage, gaps, runtime.synced_at. [observed]
- EWA indexes a single repository; `repositoryMap` returns workspace inventory.
  [observed]
- OCS pipeline ADR-0008 frames per-repository engineering pipelines.
  [observed]

[inferred] Today there is one project state (Omnia) with IGE runtime files, one
repo knowledge model (EWA), and OCS per-repo pipelines. There is no portfolio
layer that composes projects for judgment. EOS judgment operates on a project
(e.g., a repo or a workspace) as its subject, not on the portfolio. Portfolio
coordination belongs to IGE's ecosystem layer, not EOS. [proposed]

---

## 12. Requirements and Obligation Model

- EWA: `EngineeringIndex` types include `requirement`; `EngineeringAssistant`
  lists requirements from artifacts; `OrphanRequirementRule` flags requirements
  without links. [observed]
- EWA decisions: `DecisionLedger` + `TraceabilityStore` + `DecisionLinker`
  connect decisions to artifacts. [observed]
- OCS/Omnia: business verticals carry requirements via capabilities
  (leave.request, employee.lifecycle.change, etc.) and engineering requirements
  via `.ige` state. [observed]

[inferred] Requirements exist as index entries and business capabilities, but
there is no obligation semantics — no "who owes what to whom and when". EOS's
judgment of declared vs candidate state is a natural obligation surface, but
this is currently only a germ in EWA's `EngineeringChangeRequest` + review
pipeline. [proposed: EOS must not invent an obligation engine; it should judge
obligation claims recorded by EWA/OCS.]

---

## 13. Engineering Alignment Loop

The closest thing to an alignment loop in the lineage is EWA's
`EngineeringReviewService`:
`context.build() → analyzer.analyze(context) → findings → advisor.review() →
questions`. [observed] It produces findings and questions; nothing closes the
loop (no consumption of answers, no re-verification). [observed]
`CapabilityVerifier` exists but only checks registration, not execution.
[observed, SESSION_CONTEXT]

OCS pipeline (ADR-0008) + handbook Inspect→Understand→Patch→Verify→Commit
define the deterministic loop. [observed]

[proposed] EOS's role in the loop:
1. OCS/EWA record evidence + declared state (deterministic).
2. EOS projects judgment (declared/candidate) against evidence.
3. OCS/Omnia consume the projection to decide action.
4. New evidence triggers re-projection — not re-architecture.
The loop closes when evidence outcomes (forward/neutral/regression/unresolved)
flow back into the judgment projection. [proposed]

---

## 14. Missing Capabilities (from reconciliation)

| Gap | Evidence | Required by |
|-----|----------|-------------|
| EOS has no knowledge model (no symbols/imports/deps) | EOS src [observed] | Judgment needs ground truth |
| EOS has no evidence store or provenance | EOS src [observed] | Judgment identity |
| No judgment continuity across sessions | no persistence in EOS [observed] | Declared/candidate state |
| No fixed judgment schema | `runEos()` returns unshaped JSON [observed] | Canonical schema ADR-0006 |
| No participant integration (OCS/Omnia/IGE consumption) | EOS has none [observed] | Discovery-59 distinctness |
| No tool/capability policy (gate, allowlist) | EWA has it; EOS lacks it [observed] | Agency safety |
| No review loop closure (answers → re-verify) | EWA review ends at questions [observed] | Alignment loop |
| No classification discipline inside EOS | F4/Discovery-62 [observed] | Ownership precedes claims |
| Web/research capability missing | EWA "What Is Missing" [observed] | Not EOS-critical [proposed] |
| Vector/semantic memory missing | EWA roadmap [observed] | Deferred (Section 17) |

---

## 15. Proposed EOS Architecture

[proposed] Based on the reconciliation, EOS is a **judgment projection layer**,
not a new runtime:

```
                    ┌─────────────────────────────┐
                    │  IGE (constitution, corpus) │   governance
                    └──────────────┬──────────────┘
                                   │ knowledge / contracts
              ┌────────────────────┴────────────────────┐
              │               EOS (judgment)            │
              │   projection surface  .eos/judgment.json │
              │   declared/candidate state              │
              └───────┬────────────────────┬────────────┘
                      │ evidence flows      │ projections consumed
        ┌─────────────▼──────────┐   ┌──────▼──────────────┐
        │ EWA cognition runtime  │   │ OCS deterministic   │
        │ evidence/decisions/    │   │ pipeline, canonical  │
        │ review, 13 capabilities│   │ schema, ADRs        │
        └─────────────┬──────────┘   └──────┬──────────────┘
                      │                     │
              ┌───────▼───────────┐  ┌──────▼──────────────┐
              │ Omnia workspace   │  │ repository (project)│
              │ business verticals│  │ .ige runtime state  │
              └───────────────────┘  └─────────────────────┘
```

Principles:
1. EOS consumes IGE; never amends it (EOS README). [observed]
2. EOS does not re-implement EWA agent or OCS pipeline. [proposed]
3. Deterministic before probabilistic: EOS judges only on recorded evidence.
   [proposed]
4. Judgment is projection, never reconciliation, never runtime state
   (Discovery-02, F5–F8). [observed]
5. EOS is one participant with one responsibility — not a swarm, not a
   project manager, not a chatbot. [inferred from IGE_PROPOSAL + README]

---

## 16. Minimum Viable EOS (MVE)

[proposed] MVE = judgment capability over EWA evidence, no new runtime.

1. Adopt EWA evidence model as the evidence source (`EngineeringEvidence`,
   `reconcile()`).
2. Define `Judgment` + `JudgmentProjection` schema (Section 6/9).
3. Persist projections to `.eos/judgment.json` (Discovery-02 surface).
4. Implement judgment capability that takes a subject + evidence, returns
   `Judgment` with verdict/confidence/supports/unresolved, citing evidence ids
   (never inventing).
5. Wire into EWA's 13-tool `engineering` capability as
   `engineering_judgment` (registered tool) rather than a standalone agent.
6. Add `JudgmentVerdictRule` to the review pipeline so findings surface when
   judgment is unsupported.
7. Keep `eos-run.js` as the CLI entry (CLI is fine; identity is the product).
8. Tests: judgment.test.js extended to assert every judgment cites evidence and
   is consistent with reconcile outcomes.

This keeps EOS legible, consumes IGE knowledge, and avoids duplicating the
cognition runtime that EWA already built. [proposed]

---

## 17. Deferred Capabilities

| Capability | Why deferred |
|-----------|--------------|
| Vector / semantic memory (pgvector, SQLite graph persistence) | EWA roadmap Phase 2; not needed for evidence-gated judgment [observed] |
| Web search / research capability | Listed as missing in EWA; OCS/IGE deterministic-first [observed] |
| Git observation / commit hooks | Belongs to OCS observation ownership [observed] |
| MCP server integrations | Implementation detail; add later if surfaced [observed] |
| Frontend / desktop | "product" aspiration in EWA; irrelevant to judgment identity [observed] |
| Portfolio-wide judgment | Belongs to IGE ecosystem layer [observed, proposed] |
| Obligation engine | Only after requirements model has obligation semantics [proposed] |

---

## 18. Recommended Implementation Phases

| Phase | Work | Deliverable |
|-------|------|-------------|
| 0 (now) | Read-only reconciliation (this document) | EOS-ARCHITECTURE-RECONCILIATION.md |
| 1 | Evidence adapter: read EWA `.ewa/engineering/evidence` + `.ewa/knowledge.json` | `src/evidence.js` |
| 2 | Judgment schema + projection writer | `.eos/judgment.json`, `src/judgment.js` |
| 3 | Judgment capability (model-gated, evidence-citing) + review rule | `engineering_judgment` tool behavior |
| 4 | EWA integration: register EOS judgment in the engineering capability | live tool in EWA runtime |
| 5 | OCS consumption: OCS pipeline reads projections | canonical/legible boundary test |
| 6 | IGE proposal: EOS as fifth participant + Intelligence row in matrices | updated IGE_PROPOSAL, only if survived falsification |

Each phase verifiable via tests; nothing becomes architecture until falsified.
[observed, IGE_PROPOSAL]

---

## 19. Architectural Risks

| Risk | Evidence | Severity |
|------|----------|----------|
| EOS becomes a second EWA agent (duplication) | EOS src mirrors RAI structure; EWA already has 13-tool runtime [observed] | High |
| EOS invents its own evidence model → two sources of truth | no evidence code in EOS today [observed] | High |
| EOS projects without knowledge → hallucinated judgment | EOS has no knowledge/imports/deps access [observed] | High |
| Judgment surface diverges from canonical schema | `runEos()` unshaped [observed] vs ADR-0006 `{metadata,data}` | Medium |
| EOS becomes "a chatbot" / "a coding agent" / "a project manager" | identity drift if loop-first, evidence-later [inferred] | Medium |
| Intelligence orphan persists; another system claims it | matrix has no Intelligence row; EWA partially owns it already [observed] | Medium |
| Falsification discipline abandoned | experiments F1–F8 exist and passed; must remain gating [observed] | Medium |
| OCS/EOS boundary collapse (EOS absorbed) | F2 experiment protects; only if OCS starts judging [observed] | Low–Medium |
| Provenance loss: evidence not tied to commit/artifact | `basis` is untyped string list [observed] | Medium |
| Local-model judgment quality on 7B models | EWA uses hermes3/qwen locally; frontier models primary for heavy reasoning [observed] | Low (design note) |

---

## 20. Explicit Non-Goals for EOS

- NOT a chatbot (conversation is incidental; judgment is the product).
- NOT a project manager (no portfolio/planning ownership; that is IGE/Omnia).
- NOT a coding agent (no patch/commit authority; EOS does not implement).
- NOT a collection of agents (single participant, single responsibility).
- NOT an OCS wrapper (OCS is deterministic; EOS is probabilistic; F2).
- NOT a compliance chatbot (judgment is declared/candidate, never canon).
- NOT a second IGE (consumes IGE; never amends; EOS README).
- NOT a substitute for Engineer (EOS README).
- EOS does not execute engineering behavior (ecosystem rule: observe, relate,
  coordinate). [observed]

---

## Recommendation — Next Implementation Step

Make EOS the **judgment projection capability over EWA's existing evidence
model** — Phase 1 in Section 18: write a small read-only adapter
(`src/evidence.js`) that loads `.ewa/engineering/evidence` and
`.ewa/knowledge.json`, then have `runEos()` return a `Judgment` that (a) cites
evidence ids, (b) is consistent with EWA's `reconcile()` outcomes, and (c)
writes the projection to `.eos/judgment.json`. This single step converts EOS
from a proposal+skeleton into an evidence-gated judgment participant without
building a second cognition runtime, and it directly exercises the identity
that Discovery-01 claims. Do this before any further agent/loop work.
