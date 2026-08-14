# EOS ENGINEERING CHANGE — PHASE 4 CHECKPOINT

Status: COMPLETE (2026-08-13). Verified state is fully reproducible from this file.

## Objective achieved
Closed EOS's architectural gap between VERIFIED JUDGMENT and ENGINEERING OUTCOME by adding
a first-class, EOS-owned **change contract**: judgment -> change -> execution -> verification
-> persisted, citable engineering outcome. EOS never implements, never writes canonical
state, and never auto-decides; the change contract is candidate until participant
authorization, and verification is EOS-observed (re-reads + digest comparison), never
adapter-reported alone.

## Files (all new/modified this session)
- `src/change.js` (NEW): change ledger + lifecycle + gates + refs.
- `src/execution.js` (NEW): execution-adapter contract + `validateExecutionReport`.
- `src/loop.js` (MODIFIED): substrate `ENGINEERING OUTCOME RECORDS` block, `changes`
  threading through `canonicalizeEvidenceRefs`/`gateJudgment`/`buildEvidenceBlock`/
  `buildSurface`, SYSTEM_PROMPT guidance for `change:<id>` refs.
- `src/review.js` (MODIFIED): `resolveRefOutcome` resolves `change:<id>` ->
  verified=forward, failed=regression, non-terminal=unresolved; `runReview` loads changes.
- `package.json` (MODIFIED): test script appends the two phase4 test files.
- `test/phase4-engineering-change.test.js` (NEW): 71 assertions.
- `test/phase4-change-consumption.test.js` (NEW): 17 assertions.

## Design contract (load-bearing)
- Statuses: proposed -> authorized -> executing -> executed -> verified | failed.
- Ledger: immutable nodes `.eos/changes/<changeId>/<seq>.json` (zero-padded, each node a
  full snapshot, `prev_digest` sha256 chaining) + latest pointer `.eos/change.json`.
- `createChange` gates: source judgment must exist, be `declared`, and changed/unchanged
  scope must be subset of its inspected evidence; created must not be inspected; predicates
  path must be in changed/created; scope non-empty and non-duplicated; supersedes_change_id
  must reference a `failed` change.
- `authorizeChange` gates: status `proposed`; actor + rationale required.
- `dispatchChange` gates: status `authorized` (or `executing` resume, which aborts pending
  attempts); snapshots pre-state digests of every contract path; awaits adapter.execute
  (plain object `{ id, execute(contract, workspaceRoot) }`); adapter throw or invalid report
  leaves the change `executing` (retryable).
- `recordExecution` gates: status `executing`, attempt `pending` (single-intake); validates
  report (adapter_id match, claimed_changes non-empty within changed/created scope, 64-hex
  digests, verification outcomes passed/failed/unresolved).
- `verifyChange` gates: status `executed`; EOS re-reads every contract path and checks
  changed/created/unchanged/predicate/claimed findings; verdict verified iff all findings ok;
  failure is terminal (`failed`).
- `verifyChangeLedger` replays all nodes: schema, contiguity, id/seq match, prev_digest
  chaining, latest pointer equality, source judgment still declared.
- Consumption: `change:<id>` refs accepted by gate/canonicalization; substrate block
  `ENGINEERING OUTCOME RECORDS`; review resolution verified->forward / failed->regression /
  non-terminal->unresolved.

## Test evidence
- Baseline before work: 719 PASS / 0 FAIL / exit 0.
- After work: 807 PASS / 0 FAIL / exit 0 (`npm test`). `git diff --check` clean.
- Key adversarial coverage: fabricated change claim -> failed; adapter-reported verification
  alone never confers verified; scope-breach claim rejected; out-of-contract modification
  of `unchanged` file -> failed; interrupted dispatch aborted + resumed; stale execution
  report rejected; double supersede permitted for failed change only; no opencode/cline
  coupling and no run_command anywhere in src/.

## Repro commands
```
npm test                                   # full suite (expect 807 PASS, 0 FAIL)
git diff --check                           # expect clean
node test/phase4-engineering-change.test.js
node test/phase4-change-consumption.test.js
```

## Exact next step (for a continuing agent)
1. If the goal is only this gap: the phase is DONE. Do not commit/push unless asked.
2. Natural follow-up (NOT yet implemented): decide whether model-generated change proposals
   should be admitted to the ollama.js response schema (currently deferred; requires the
   investigation lifecycle to resolve plan/judgment vs change-proposal response types).
3. Optional: add an adapter for a real execution harness (OpenCode) behind the same
   `{ id, execute(contract, root) }` interface, reusing `validateExecutionReport` unchanged.
