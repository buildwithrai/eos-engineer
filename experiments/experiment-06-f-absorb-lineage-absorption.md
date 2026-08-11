# Experiment-06 — F-Absorb Lineage Absorption

## Purpose

Attempt to falsify F-Absorb (EOS-PRODUCT-ARCHITECTURE.md Section 12):

EOS absorbs EWA/RAI cognition primitives into its Intelligence without
creating a second IGE or a second OCS.

Falsification condition: enumerate EOS-owned vs IGE/OCS-owned canonical
capabilities after absorption. Any overlap (Runtime, Governance, Corpus,
Provider Resolution, Observation) falsifies.

Source of truth: ADR-ECOSYSTEM-0001 (ownership unique; consumption
unlimited; consumers SHALL NOT duplicate canonical implementations) and
the Capability Ownership Matrix (Runtime/Governance/Corpus/Provider
Resolution -> IGE; Business -> Omnia; Observation -> OCS).

---

## Method

Enumerated every absorbable EWA/RAI primitive from source
(/home/raifails/projects/engineering-workspace-agent,
/home/raifails/projects/rai-agent) and classified it:

- EOS-internal Intelligence primitive -> safe
- An instance of an IGE/OCS-owned canonical capability -> overlap risk

---

## Enumeration

### From EWA (@ewa/agent)

| Primitive | EOS disposition | Canonical overlap |
|-----------|-----------------|-------------------|
| Agent, CapabilityRegistry, CapabilityPolicy, CapabilityVerifier | internal orchestration (F9 domain) | none |
| EngineeringIntelligence (query reasoning) | EOS Intelligence core | none (Intelligence is EOS-owned) |
| conversation, memory | EOS conversation state | none |
| RepositoryRetriever, RepositoryKnowledge(Builder) | EOS retrieval; knowledge REPRESENTATION must consume OCS RKM | RISK -> Observation (C1) |
| Graph (file/symbol/package nodes) | derived reasoning structure | none (disposable derived artifact, Canonical Representation Principle) |
| ProviderRegistry, OllamaProvider, FallbackProvider | EOS model/inference access | none; terminology collision with IGE Provider Resolution (C2) |
| Evidence + reconcile + FileEvidenceStore + EvidenceCommandService | EOS evidence core | none; terminology collision: "reconcile" vs IGE Reconciler contract (C2) |
| Decision, DecisionLedger, DecisionCommandService | EOS decision ownership (Phase 2 verdict) | none |
| TraceabilityLink, TraceabilityStore, DecisionLinker | EOS traceability | none |
| EngineeringReviewService + rules | EOS review pipeline | none |
| EngineeringChangeRequest | EOS proposal generation | none |
| requirements, questions, risks, profile | proposed EOS capabilities | none |
| analysis/impact, coverage | EOS risk/impact judgment | none |
| WorkspaceScanner, indexer, cache, retrieval | deterministic repository knowledge production | RISK -> Observation (C1) |
| FileArtifactStore, EngineeringContextBuilder, artifacts | EOS projection storage | none (non-canonical projection; F5) |

### From RAI

| Primitive | EOS disposition | Canonical overlap |
|-----------|-----------------|-------------------|
| evidence-gated loop (required-evidence extraction, controller override, iteration limit, block-until-evidence) | EOS investigation core | none |
| path-escape-safe read tool | EOS read primitive | none |

---

## Overlap Candidates Examined

### 1. Repository knowledge representation vs OCS RKM (ADR-0002)

Observed: EWA's workspace package builds a deterministic repository
knowledge model (scanner, symbol/import/export/package indexers, cache).
OCS ADR-0002 declares the Repository Knowledge Model the canonical,
deterministic representation of repository knowledge; OCS owns
Observation.

This is the only genuine capability-surface overlap. Two deterministic
representations of the same repository knowledge would violate the
Canonical Representation Principle and Observation ownership.

Disposition: NOT falsified yet, because (a) EWA's index is a
consumer-side knowledge cache, not a claimed canonical representation,
and (b) the absorption rule (Section 4.3) makes EOS a consumer, not a
generator. EOS consumes OCS RKM; any local index is a disposable derived
artifact, rebuilt from canonical knowledge.

Open condition (C1): if EOS ever owns a canonical deterministic
repository-knowledge generator, or if OCS RKM is not the source EOS
consumes, F-Absorb is falsified. Section 11.1 stays open until OCS RKM
is consumable.

### 2. EWA providers vs IGE Provider Resolution

Observed: IGE Provider Resolution (RESOLVER.md, discovery-49/61) resolves
which engineering Runtime Provider (filesystem/git/package) a project
consumes. A Resolver performs no engineering behavior, resolves provider
identity only, and precedes runtime execution.

Observed: EWA's ProviderRegistry/OllamaProvider/FallbackProvider resolve
AI model endpoints for LLM inference (chat, chatWithTools). The only
input is environment variables (OLLAMA_URL, OLLAMA_MODEL).

These are different concerns. AI model access is absent from the
Capability Ownership Matrix. EOS owning model access does not duplicate
IGE's Provider Resolution capability.

But the shared term "provider" creates a legibility hazard. EOS must
rename its model-access layer (C2) and must not claim the term "Provider
Resolution."

### 3. EWA engineering_reconcile vs IGE Reconciler contract

Observed: EWA's engineering_reconcile maps a recorded evidence record to
its observed state transition outcome (forward/neutral/regression/
unresolved). This is judgment bookkeeping.

Observed: IGE's Reconciler contract (Deterministic, Idempotent,
Observable, Stateless, Replaceable; never invents information) produces
canonical runtime artifacts (PROJECT_STATE.md) from inspect truth.

Different concerns. But the shared term "reconcile" implies IGE
reconciler semantics. EOS must rename its evidence-outcome mapping (C2).

---

## Success

Every absorbed primitive is an Intelligence-internal mechanism. No
absorbed primitive becomes an EOS-owned duplicate of Runtime, Governance,
Corpus, Provider Resolution, Business, or Observation.

---

## Failure

Any absorbed primitive would be EOS-owned canonical behavior already
owned by IGE, Omnia, or OCS. Specifically:

1. EOS owns a canonical deterministic repository-knowledge generator
   (C1 broken) -> Observation overlap.
2. EOS claims "Provider Resolution" for its model-access layer
   (C2 broken) -> Provider Resolution overlap.
3. EOS's evidence-outcome mapping is presented as IGE reconciliation
   (C2 broken) -> Runtime overlap.
4. Any absorbed artifact is treated as reconciler input or Runtime State
   (C3 broken) -> F5/F6/F8 breach.

---

## Result

F-Absorb — NOT FALSIFIED, with conditions.

C1. EOS owns no canonical deterministic repository-knowledge generator.
     EOS consumes OCS RKM; its index is a disposable derived cache.
C2. EOS renames model access ("inference access", not "provider
     resolution") and evidence-outcome mapping ("evidence outcome", not
     "reconcile") to avoid colliding with IGE-owned terms.
C3. Absorbed artifacts remain non-canonical projections. Never reconciler
     inputs. Never Runtime State.

Section 11.1 (knowledge/RKM reconciliation) remains unresolved but is
now conditional, not unconditional: it resolves by delegation to OCS RKM.

## Status

Not falsified. Conditions C1-C3 are binding on any implementation of the
absorption.

## Binding Constraints (for F-Absorb survivors)

- EOS consumes, never generates, canonical deterministic knowledge.
- EOS never owns a canonical capability row shared with IGE/Omnia/OCS.
- EOS's model-access layer is not "Provider Resolution."
- EOS's evidence bookkeeping is not "Reconciliation."
- Absorption preserves F5, F6, F8.
