# Discovery-02 — EOS Judgment Projection Surface

## Status

Confirmed

---

## Falsification Result

F5 — Projection Not Reconciler — not falsified (Experiment-05).
F6 — Projection Not Runtime State — not falsified (Experiment-05).
F7 — Legibility Without Knowledge — not falsified (Experiment-05).
F8 — Runtime Purity — not falsified (Experiment-05).

The `.eos/judgment.json` surface survives as a projection, distinct
from the runtime.

---

## Origin

Step 2 of the EOS implementation sequence.

Define EOS's judgment projection surface and how its declared /
candidate state integrates with the IGE runtime without becoming a
reconciler.

Discovery-01 (Confirmed): EOS is a distinct participant owning
Intelligence. Judgment is probabilistic, evidence-gated, recorded as
declared/candidate state.

This document consumes IGE. It does not amend IGE.

---

## Observation

IGE Runtime State has five categories:

- Observed — facts directly collected from the repository
- Declared — human-owned engineering declarations
- Derived — facts computed from observed and declared state
- Validated — facts confirmed through engineering process
- Blocked — known conditions preventing progress

Runtime invariants: deterministic, observational, stateless.
"Reconcilers never invent information."

EOS judgment is probabilistic. It is not deterministic. It does not
derive from canonical state alone (Experiment-02). It is not
human-owned.

EOS judgment therefore fits none of the five runtime categories.

It must not be forced into them.

---

## Question

Where does EOS's judgment live so that:

- it is legible (participation contract)
- it never becomes a reconciler artifact
- it never modifies Runtime State
- it is consumable by OCS without OCS knowing EOS exists

---

## Resolution (Candidate)

EOS exposes a judgment projection surface: `.eos/` in each governed
project.

The primary artifact is `.eos/judgment.json`.

The surface is a projection, not Runtime State. It is analogous to
OCS's `.ai/NOW.md` — a legible, timestamped surface another participant
can read without knowing its owner.

---

## Surface Contract

`.eos/judgment.json`

```
{
  "schema": "eos-judgment/v1",
  "investigation": {
    "target": "...",
    "required_evidence": ["..."],
    "inspected_evidence": ["..."],
    "gaps": ["..."]
  },
  "judgment": [
    {
      "claim": "...",
      "type": "declared | candidate | blocked",
      "confidence": "high | medium | low",
      "evidence_refs": ["..."],
      "recorded_at": "..."
    }
  ],
  "restrictions": ["..."]
}
```

Judgment types are EOS-owned categories, not runtime categories:

- declared — EOS commits to this judgment now
- candidate — EOS offers this judgment pending validation
- blocked — EOS cannot judge; conditions prevent it

---

## Boundaries

EOS reads the canonical observation model (inspect.json) as evidence.
EOS does not modify it.

EOS does not write PROJECT_STATE.md, PROJECT_BACKLOG.md, or any
reconciler artifact. Those are deterministic runtime outputs.

EOS never marks judgment as Observed, Derived, or Validated. Those
categories assert deterministic truth. EOS's claim is probabilistic.

EOS judgment is declared/candidate state. It is EOS-owned. It is
observable, timestamped, and explicitly non-canonical.

---

## Prediction

1. `.eos/judgment.json` is legible to any reader without IGE tooling.
2. The surface coexists with `.ige/` without modifying Runtime State.
3. OCS can observe `.eos/` the way it observes `.ai/NOW.md` — without
   knowing EOS.
4. No reconciler reads `.eos/` as canonical input.

---

## Falsification Design

### F5 — Projection Not Reconciler

Attempt to feed `.eos/judgment.json` into the runtime reconciler as
canonical state.

If the runtime accepts probabilistic judgment as canonical observation,
the boundary is broken and EOS judgment becomes a reconciler input.

FALSIFIED if true.

### F6 — Projection Not Runtime State

Attempt to classify EOS judgment as one of the five runtime categories.

If Observed, Derived, or Validated can honestly label a probabilistic
claim, the state model conflates EOS judgment with deterministic truth.

FALSIFIED if true.

### F7 — Legibility Without Knowledge

Remove all EOS and IGE tooling. Attempt to read `.eos/judgment.json`.

If the surface cannot be read by a plain consumer, EOS fails the
participation contract.

FALSIFIED if true.

### F8 — Runtime Purity

Run the runtime reconcile cycle with `.eos/` present.

If the runtime output changes because `.eos/` exists, the surface has
leaked into canonical state.

FALSIFIED if true.

---

## Next Step

Run F5-F8.

Do not implement the surface until F5-F8 survive.

---

## Blocking

No.
