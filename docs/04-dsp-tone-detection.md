# DSP and tone-detection design

## M1 baseline

`synthetic-cw.ts` creates phase-continuous, deterministic clean audio using standard 1/3/7-unit timing. `GoertzelToneDetector` measures normalized power at a supplied tone frequency in short frames (64 samples by default), then emits contiguous `tone`/`silence` segments. This is correct for a known clean sidetone and deliberately not a full RF receiver.

## Streaming target

Feed fixed-size PCM windows into a detector that emits measurements with sample index/timestamp, target frequency, energy, estimated noise floor, SNR/quality, and binary tone state. Preserve enough evidence to render/debug a transition and attach confidence later. Avoid manufacturing long segments before edge timing has stabilized; expose finalization/reset behavior.

Suggested pure contracts (names are illustrative, not a mandate):

```ts
type ToneObservation = {
  startSample: number; endSample: number; frequencyHz: number;
  power: number; noisePower: number; snrDb?: number; active: boolean;
};
```

## Detector policy

1. M2: manual/known `targetFrequencyHz`, Goertzel windows, sensible frame size, configurable threshold, and clearly exposed level/state.
2. M3: spectrum scan across a bounded user-configurable band. Rank candidates by persistence, narrow peak shape, duty-cycle plausibility, and SNR—not peak amplitude alone.
3. Once locked, run Goertzel or a narrow band-pass + energy detector around the chosen frequency. Use overlapping/windowed frames only if tests show timing benefit.
4. Track a small frequency neighborhood to tolerate drift. Use hysteresis: acquire only after enough good evidence; drop only after sustained poor evidence; report `searching`, `locked`, `degraded`, and `lost`.
5. With several signals, never silently chase a stronger neighbor while manually locked. Let the user tap/select a peak/waterfall candidate.

## Signal conditioning and thresholds

Do not make fixed amplitude threshold the production default. Normalize or estimate an adaptive noise floor, then use separate on/off thresholds (hysteresis) to avoid rapid chatter near the boundary. Preserve raw power and threshold state for diagnostics. Avoid browser voice enhancements when possible; they can alter CW timing/energy.

Add filtering only when a fixture justifies it: DC removal, bounded band-pass, level normalization/AGC-like behavior, and interference rejection should each have test cases and a measurable impact. A filter that makes a clean fixture worse needs explicit justification.

## Frequency constraints

Support documented min/max target frequency appropriate for radio/sidetone audio, but make them settings rather than hard-coded RF assumptions. Account for microphone sampling rate and Nyquist. Treat frequency labels as observed audio pitch, not an RF frequency or tuning claim.

## Implemented M3 acquisition — 2026-09-15

- `SpectralToneScanner` uses a 64 ms Hann-windowed Goertzel bank over a configurable audio band. It scans on a 50% overlap, caps the analysis window at 4096 samples, and retains only one rolling window plus per-bin evidence.
- Local peaks are ranked by SNR, peak narrowness, persistence, and an always-on-carrier duty penalty. Default automatic acquisition requires three consistent scans.
- `ToneAcquisitionTracker` reports `searching`, `locked`, `degraded`, and `lost`; it degrades after six poor scans and loses after eighteen. A nearby peak updates the reported/decoder frequency smoothly; a lost automatic lock can choose a new persistent candidate.
- Detector on/off thresholds are derived from observed noise and candidate power. The cheaper locked Goertzel detector uses a lower release threshold to reduce chatter.
- Manual mode holds the exact selected frequency even when another candidate is stronger. Candidate ranking remains visible so the operator can deliberately switch or return to automatic reacquisition.
- `AcquiringCwDecoder` retains at most three seconds of pre-roll and replays it through the raw decoder when lock is acquired, avoiding silent loss of the message prefix.

## Implemented M5 signal robustness — 2026-09-15

- `RfSignalConditioner` applies a stateful 25 Hz high-pass/DC blocker, robust percentile level estimates, sparse-impulse limiting, and bounded 0.45×–7× normalization before acquisition. Raw sample position is unchanged.
- The scanner smooths its spectral median as a dynamic local noise floor. Candidate ranking includes relative power and strongly penalizes an implausibly continuous carrier; acquisition/tracking now requires persistent score evidence rather than a single narrow random-noise peak.
- While automatically/manual locked in the live path, the short-frame detector compares target power with nearby reference bins, derives separate dynamic on/off thresholds, requires two-frame attack/release evidence, and uses a Q=12 band-pass to reject adjacent energy.
- The heavier locked filter is deliberately scoped out of the clean known-tone reference path after regression tests showed it smeared very fast and highly jittered clean fixtures. This is an evidence-backed boundary, not a global filter assumption.
- Timing excludes outages longer than ten element units from its Farnsworth spacing fit while still treating them as word-boundary evidence, allowing lock loss/recovery without stretching normal spaces.
