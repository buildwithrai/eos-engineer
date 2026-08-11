# Experiment-05 — F5-F8 Judgment Surface Boundary

## Purpose

Attempt to falsify Discovery-02.

Determine whether `.eos/judgment.json` can be made to behave as a
reconciler artifact, as Runtime State, or as an illegible surface.

---

## Procedure

Executed in a real IGE runtime (reconcile/inspect scripts, temp git
repo with `.ige/`).

### F5 — Projection Not Reconciler

Searched reconcile and inspect scripts for any reference to `.eos` or
judgment as canonical input.

Result: no runtime script references `.eos` or judgment. The reconciler
consumes only `.ige/inspect.json`.

### F6 — Projection Not Runtime State

Attempted to classify EOS judgment as a runtime category.

Observed / Derived / Validated assert deterministic truth derived from
the repository. EOS judgment is probabilistic and evidence-gated
(Experiment-02). Labeling it Observed or Derived would assert truth the
runtime did not collect. Labeling it Validated would assert process
confirmation that did not occur.

Result: no honest classification exists.

### F7 — Legibility Without Knowledge

Created `.eos/judgment.json`. Read it with `cat` and parsed it with a
plain Python JSON consumer. No EOS or IGE tooling involved.

Result: surface is legible and parseable by a plain consumer.

### F8 — Runtime Purity

Baseline reconcile produced `.ige/PROJECT_STATE.md`. Reconcile rerun
with `.eos/judgment.json` present. Output compared byte-for-byte.

Result: identical output with and without `.eos/`.

---

## Success

All four boundaries hold. The surface is a projection, not a reconciler,
not Runtime State, and legible to strangers.

---

## Failure

Any single boundary breaks.

---

## Result

F5 — PASS. No reconciler consumes `.eos`.
F6 — PASS. No runtime category honestly labels judgment.
F7 — PASS. Plain consumer reads the surface.
F8 — PASS. Runtime output unchanged by `.eos/`.

Discovery-02 survives.

## Status

Not falsified.
