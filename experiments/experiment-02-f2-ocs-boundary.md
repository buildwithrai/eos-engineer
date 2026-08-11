# Experiment-02 — F2 OCS Boundary

## Purpose

Attempt to falsify Discovery-01's OCS/EOS boundary.

Determine whether OCS can absorb EOS's judgment responsibility under
ADR-0001's "future AI capabilities" without changing the canonical
representation contract.

---

## Context

OCS ADR-0001: "All reports, metrics, documentation, visualizations,
dashboards, APIs, and future AI capabilities shall derive from that
representation rather than independently rediscovering repository
state."

OCS handbook: "Deterministic Before Probabilistic." "AI augments
engineering; it does not replace engineering."

IGE Reconciler Contract: Deterministic, Idempotent, Stateless,
Replaceable, Observable. "Reconcilers never invent information."

---

## Attempt

Test whether engineering judgment can be expressed as a deterministic
derivation from the canonical observation model.

If it can, judgment is another reconciler artifact OCS can own, and EOS
is redundant.

---

## Models

### Model A — Judgment as Deterministic Derivation

Assume judgment is a pure function of the canonical observation model.

Prediction: identical canonical input produces identical judgment.

If true, judgment is a Reconciler output and belongs to the
deterministic system.

### Model B — Judgment as Evidence-Gated Probabilistic Synthesis

Assume judgment depends on:

- which evidence was gathered
- the order evidence was gathered
- the framing of the investigation
- probabilistic synthesis over partial evidence

Prediction: identical canonical input can produce different judgment.

If true, judgment is not derivable, not idempotent, and not Observable
in the reconciler sense.

---

## Success

Model B holds and Model A fails.

Judgment cannot be a reconciler artifact.

OCS absorbing judgment would require changing the canonical
representation contract to allow non-derivable, non-deterministic
outputs. That is a contract change, not an augmentation.

EOS survives.

---

## Failure

Model A holds.

Judgment is a deterministic derivation from canonical state.

OCS owns it as another AI capability.

EOS is redundant.

---

## Result

The RAI Agent loop (EOS's seed) is evidence-gated: the final answer is
blocked until required evidence is inspected (hasRequiredEvidence,
controller override). The loop's output depends on evidence gathering
order and model synthesis — not on canonical state alone.

Judgment is not a pure function of the canonical observation model.

Model A fails. Model B holds.

## Status

Not falsified.
