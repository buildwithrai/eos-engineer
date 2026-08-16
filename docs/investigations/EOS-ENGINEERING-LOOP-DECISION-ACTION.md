# Engineering Loop Completion: Decision → Actor/Action (Change Proposal Wiring)

## Objective

Investigate whether EOS can complete the engineering loop (objective → obligations →
investigation → evidence → understanding → judgment → decision → actor/action →
verification → outcome → continue) and implement the smallest change set that completes
the next missing segment: turning a declared judgment into a deterministic, recorded
"proposed change" contract that names the intended actor and action.

The full `change.js` pipeline (create → authorize → dispatch → recordExecution → verify)
already existed as a complete, tested library but was unreachable from the runtime loop.
This work wires it in: a declared judgment may now carry a change proposal, which the
runtime gates deterministically, commits alongside the judgment, and persists as a
proposed change contract bound to the judgment — awaiting actor authorization.

## Runtime Path: Before vs After

### Before
`eos-run.js` → `runEos` loop → investigation → `evaluateJudgment` (accept) →
`commitProjection` → `runReview` → return surface. The loop ended at judgment + review.
A judgment's decision had no deterministic consequence. `src/change.js` (createChange,
authorizeChange, dispatchChange, recordExecution, verifyChange) existed and was phase-4
tested, but no runtime path reached it.

### After
... → `evaluateJudgment` (accept) → if `parsed.change` present:
`gateChangeProposal(change, investigation, workspaceRoot, nextStatus)` →
`commitProjection` (judgment persists, digest chained) → `createChange(workspaceRoot,
{...proposal, source_judgment_id})` → mutate returned surface with `proposed_change`
(change_id, status, source_judgment_id, contract, authorization) → `runReview` → return.

Known design consequence: the committed projection node and the returned surface diverge
by exactly one field. `proposed_change` exists only on the returned surface, because the
change ledger is authoritative for changes (bound via `source_judgment_id` + the
judgment digest recorded in the contract). No change is ever authorized or executed by
EOS; `authorization` is null on creation.

## Verdict

**IMPLEMENTED (next segment: decision → actor/action, proposal form).** A declared
judgment can deterministically produce a recorded proposed change contract naming the
intended actor, grounded in inspected evidence. Proven by 43 new regression assertions
and by a real model run (hermes3 via ollama) that read real files, judged declared, and
produced a proposed change contract persisted in a consistent ledger.

## IMPLEMENTED

- `src/change.js`
  - `validateChangeContract(root, {scope, predicates, inspected})`: shared
    scope/predicate normalization + validation, used by both `createChange` and the new
    gate. Error messages preserved byte-identical for phase-4 tests.
  - `gateChangeProposal(proposal, investigation, workspaceRoot, judgmentStatus)`:
    rejects non-object, non-`declared` status, missing target/objective, bad
    `requested_actor`, ungrounded scope (changed/unchanged not inspected; created already
    inspected or existing). Returns the normalized proposal.
  - `createChange` accepts `requested_actor` (validated, stored in contract, default
    null); `contractFor` includes `requested_actor`.
- `src/runtime/run.js`
  - Judgment branch: after `evaluateJudgment` accepts, an optional `change` field is
    gated; rejection pushes a full explanation back to the model and `continue`s.
  - Tail: after `commitProjection`, `createChange` persists the proposal as a `proposed`
    change bound to the committed judgment id; surface gains `proposed_change` (or
    `{rejected, message}` on create failure); entry appended to `surface.evidence.changes`.
- `src/provider/ollama.js`: `EOS_RESPONSE_SCHEMA` exported; judgment branch admits an
  optional `change` object (required `target`/`objective`/`scope`, scope requires
  `changed`/`created`/`unchanged`, optional `predicates`/`restrictions`/`requested_actor`).
- `src/reasoning/context.js` SYSTEM_PROMPT: change-proposal guidance — change only with a
  declared judgment; created as "proposed", never authorized/executed; scope grounded in
  inspected evidence; created paths must be new and uninspected; predicate paths within
  changed/created scope; `requested_actor` names intent only; rejection → retry or drop.
- `test/phase7-change-proposal-loop.test.js`: 42 assertions across P1–P9 (proposal
  creation/binding, candidate/blocked rejection, ungrounded-scope rejection + retry,
  created-already-inspected rejection, no-change → no proposal, schema admits change,
  full authorize→dispatch→verify→consume next-iteration path, no OpenCode/Cline coupling).

## PARTIAL

- Real-model demonstration on `~/projects/omnia-workspace`:
  - The workspace contains only `.eos/` (EOS's own ledger); it has no source files, and
    the small local models (qwen2.5-coder:7b, hermes3, llama3.1) hallucinate non-existent
    source paths (e.g. `packages/workspace/src/indexer/RepositoryIndexer.ts` from the EOS
    engine repo) and stall into the deterministic no-progress blocker. This is a
    model-capability issue, not an EOS defect: exact, real paths (`.eos/judgment.json`
    etc.) are read correctly.
  - A faithful copy with two real source files (`src/tokens.js`, `src/layout.js`) was
    used for the live demonstration. In it, hermes3 read files, produced a declared
    judgment, and attached a change proposal; the gate rejected one iteration's
    ungrounded `changed` path (`packages/workspace/src/index.js`) and the model corrected;
    the accepted proposal was persisted as `proposed` with `requested_actor: engineer`,
    `authorization: null`, ledger consistent, review outcome `forward`.
  - Live authorize → dispatch → verify was exercised on an earlier proposed change; EOS
    verification correctly FAILED it because the contract declared `changed:
    [src/tokens.js, src/layout.js]` but the actor's implementation left those files
    unmodified. This is verification enforcing the contract, not a defect.
  - Model-quality artifact: the 8B model labels grounding files as `changed` instead of
    `unchanged` and prepends `packages/workspace/src/` to created paths. Prompt guidance
    was tightened; model behavior is outside EOS's control.

## DESIGNED

- Proposed change contract schema: `eos-change-contract/v1` with `requested_actor` and
  `source_judgment_id`/`source_judgment_digest` (bound to the committing projection).
- Change ledger remains the authoritative record for changes; the judgment node on disk
  does not reference its change (single-direction binding), so the committed node and the
  returned surface intentionally diverge by `proposed_change`.
- No actor registry, no reauthorization policy, no dispatch integration — deliberately
  out of scope; authorization/dispatch/verification remain library calls (the phase-4
  pipeline) invoked by the engineer or a future agent, never by EOS itself.

## MISSING (remaining loop segments — unchanged by this work)

- **Actor authorization + execution inside the runtime loop.** `authorizeChange`,
  `dispatchChange`, `recordExecution`, `verifyChange` are reachable only via direct
  library calls or test adapters. Nothing in the runtime loop (i) selects/consults an
  actor, (ii) waits for or records authorization, (iii) dispatches an executor, or
  (iv) closes the loop by turning a verified change back into evidence for the next
  iteration automatically (a consuming judgment can already cite `change:<id>`, and
  review resolves a verified change as `forward` — the P8 test proves this path).
- **Deterministic change-eligibility from the objective.** Whether a judgment "should"
  carry a change is entirely model-chosen; there is no rule deriving an entailed action
  from an unfulfilled objective.
- **`requested_actor` enforcement.** Names an intended actor; nothing verifies the named
  actor is capable, available, or distinct from EOS.

## UNKNOWN

- Whether a larger/stronger model produces consistently well-formed change contracts
  (changed vs unchanged, workspace-relative created paths) on the real workspace without
  the exact-path prompting needed with 7–8B local models.
- Whether review should treat a committed-but-unexecuted proposed change differently than
  `forward` when the same objective persists across iterations.

## Verification

- `node --check` on all modified files.
- Full suite: 1107 assertions, 0 failures (baseline 1064 + 43 new from phase7).
- Real model (hermes3 via ollama at localhost:11434) on a faithful copy of
  `~/projects/omnia-workspace`: declared judgment → gated change proposal → proposed
  change contract in a consistent ledger, lineage consistent, review `forward`.
- One change exercised live through authorize → dispatch → verify; verification failed
  the contract (changed files unmodified) as designed.
