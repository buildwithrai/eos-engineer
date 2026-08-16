/**
 * Consecutive-iteration budget for investigation progress.
 *
 * A model action only counts as investigation progress when it materially
 * changes investigation state: new evidence inspected, a requirement adopted,
 * a dependency discovered or disposed, or any other deterministic transition.
 * Repeated no-op actions (rejected plans, re-adoptions, rejected judgments,
 * repeated reads of already-inspected files) advance no state. After
 * NO_PROGRESS_LIMIT consecutive iterations with no state change, EOS
 * terminates honestly as blocked rather than consuming the iteration budget
 * on a self-consuming loop.
 */
export const NO_PROGRESS_LIMIT = 3;

export const NO_PROGRESS_CLAIM =
  "Investigation terminated for no-progress: repeated actions produced no change to investigation state (no new evidence inspected, no requirement adopted, no dependency discovered or disposed).";