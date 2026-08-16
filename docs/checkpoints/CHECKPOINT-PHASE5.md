# EOS ENGINEERING CHANGE — PHASE 5 CHECKPOINT

Status: COMPLETE (2026-08-14). Verified state is fully reproducible from this file.

## A. Failure diagnosis (the gap)
An empty workspace plus an initial engineer intent ("create a project charter for ...") was
routed through the repository-investigation pipeline and could not reach judgment:

- Empty workspace, no file refs: the investigation was immediately "complete", but any
  candidate/declared judgment with `evidence_refs: []` is rejected by the evidence gate.
  The only legal fallback is the blocked judgment ("Investigation iteration limit reached
  without judgment"). Result: `status: blocked`, `phase: complete`, no charter.
- Request referencing `docs/charter.md`: the referenced file became an *explicit requirement*
  and, because it does not exist, could never be inspected. Result: `status: blocked`,
  `phase: inspecting`, `gaps: ["docs/charter.md"]`.

Root cause: EOS had no representation for project formation. In a greenfield workspace the
engineer's intent itself is the only legitimate evidence, and prospective artifacts
(charter, plan, docs) are *outputs*, not inspection obligations.

## B. Architectural finding
The runtime lifecycle is investigation -> planning -> inspection -> judgment, and every
evidence obligation is a filesystem read. For formation there is no substrate to read; the
intent is the evidence. The minimal architectural change is a deterministic *mode* on the
investigation:

- `mode: "formation"` when the workspace is greenfield (no substrate, no source files) or the
  request carries an explicit formation marker (`project charter`, `charter`, `greenfield`,
  `project formation`, `new project`, `create ... project`, `define ... project`).
- The recorded intent becomes citable evidence (`intent:<id>`, record path, or latest pointer),
  satisfying the evidence gate through the existing inspected-evidence machinery.
- Referenced-but-non-existent files become `prospectiveArtifacts` (outputs to be materialized),
  never inspection obligations. Existing referenced files remain obligations.
- A new deterministic phase `formation` is reached when a formation investigation is complete.

## C. Ownership/boundary finding
The formation result is explicitly bounded as a candidate proposal:
- Surface `formation` block: `{ status: "candidate", canonical_owner: "Engineer",
  eos_writes_canonical_project_state: false }`.
- SYSTEM_PROMPT guidance instructs the model to mark the result non-canonical and to put
  materialization in the Engineer's hands.
- EOS never becomes canonical owner of project state; the change pipeline (phase 4) remains
  the only deterministic write path, and only on participant authorization.

## D. Minimal implementation
- `src/formation.js` (NEW): `INTENT_SCHEMA = "eos-formation-intent/v1"`, write-once intent
  ledger `.eos/formation/records/<id>.json` + latest pointer `.eos/formation/intent.json`;
  `isGreenfield` (substrate check + source walk that skips dot-dirs and node_modules);
  `isFormationRequest` markers; `detectFormation -> {mode, reasons}`; `persistIntent`
  (idempotent on identical intent); `loadIntents`/`loadLatestIntent`; `intentIdFromRef` /
  `isIntentRef` / `isPersistedIntentRef`.
- `src/investigation.js` (MODIFIED): `createInvestigation(userInput, options)` with
  `mode` (`"repository"` default / `"formation"`) and `workspaceRoot`; formation mode filters
  referenced files by existence (existing -> explicit requirement, missing -> prospective
  artifact); `phaseOf` returns `"formation"` for a complete formation investigation.
- `src/loop.js` (MODIFIED): formation detection + intent persistence at `runEos` start; the
  intent record and latest pointer are read back and recorded as inspected evidence; `intents`
  threaded through `buildSubstrateContext` (`ENGINEERING INTENT` block),
  `canonicalizeEvidenceRefs`, `gateJudgment` (`backedByIntent`), `buildEvidenceBlock`,
  `buildSurface` (top-level `mode`, `formation` boundary block, `intents`); status block adds
  `Mode:` and a `Formation:` line; `FORMATION_GUIDANCE` appended to the system prompt in
  formation mode.
- `src/review.js` (MODIFIED): `resolveRefOutcome` resolves `intent:<id>` / record path /
  pointer to `forward`; `runReview` loads intents into context.
- `test/phase5-formation-lifecycle.test.js` (NEW): 35 assertions.
- `package.json` (MODIFIED): test script appends the phase5 file.

## E. Tests added / changed
- NEW `test/phase5-formation-lifecycle.test.js` (F1-F5): greenfield formation end-to-end
  (mode/phase/candidate judgment, intent record persisted and inspected, boundary block,
  review resolves intent refs forward); prospective artifact does not block and is declared;
  existing referenced file remains an inspection obligation; repository mode unchanged
  (declared-without-evidence still rejected, no formation block); detection/ledger semantics
  (greenfield, markers, idempotent persist, latest pointer, ref extraction, substrate disables
  greenfield).
- FIXED `test/phase4-change-consumption.test.js` pre-existing fixture bug: `makeVerifiedChange`
  appended to `src/a.js` *before* dispatch, so the `changed` verification expectation could
  never pass and verify always failed; `phase4-change-consumption` only passed intermittently
  because `loadReviews` returns `readdirSync` order. The append now happens inside the adapter's
  `execute`, matching the correct phase4 pattern. (Not related to formation; pre-existing
  uncommitted phase4 flakiness.)

## F. Test results
- Baseline before this session: 807 PASS / 0 FAIL / exit 0.
- After work: 842 PASS / 0 FAIL / exit 0 (`npm test`), reproduced 3 consecutive clean runs.
- `git diff --check` clean.
- Repro commands:
  ```
  npm test                                   # expect 842 PASS, 0 FAIL
  node test/phase5-formation-lifecycle.test.js
  git diff --check
  ```

## G. Remaining limitations
- Formation classification is a deterministic heuristic (markers + greenfield check); it may
  be bypassed by unusual wording, in which case the request falls back to repository mode
  (previous behavior, no regression).
- The intent ledger records the literal request text. Refining/revising the intent persists a
  new record and advances the pointer; EOS does not merge or rewrite prior intents.
- Materializing a charter/plan document is not implemented: the result is judgment claims with
  a non-canonical boundary; the Engineer materializes or routes through the phase4 change
  pipeline on authorization.
- Formation classification is a deterministic heuristic (markers + greenfield check); it may
  be bypassed by unusual wording, in which case the request falls back to repository mode
  (previous behavior, no regression).

## H. Exact example flow
Request: "Create a project charter for a greenfield automated irrigation controller project."

1. `runEos` -> `detectFormation` -> greenfield (no substrate/source) -> `mode: "formation"`.
2. `persistIntent` writes `.eos/formation/records/<id>.json` + `.eos/formation/intent.json`;
   both are read back and recorded as inspected evidence.
3. Phase recomputes to `formation` (no pending planning, no unmet inspection obligations).
4. The model cites `intent:<id>` / record path / `.eos/formation/intent.json`; the evidence
   gate admits them (`backedByIntent` / directly inspected). Candidate formation claims commit.
5. Surface: `status: candidate`, `mode: "formation"`, `formation.boundary` = candidate /
   Engineer-owned / non-canonical, prospective artifacts declared, intent records listed.
6. Review resolves the intent refs `forward`.

## Exact next step (for a continuing agent)
1. The phase is DONE. Do not commit/push unless asked.
2. Natural follow-up (NOT implemented): a materialization path that takes an admitted
   formation judgment and produces project scaffolding through the phase4 change pipeline
   (requires authorization by the Engineer, preserving EOS's non-canonical boundary).
3. `loadReviews` is now deterministic (sorted by `reviewed_at`, `review_id` tiebreak); the
   pre-existing order-sensitivity noted in earlier versions of this file is resolved.
