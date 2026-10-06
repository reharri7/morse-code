# Timing, WPM, Farnsworth, and confidence

## Morse timing model

At character speed, a dit is one unit, a dah is three, intra-character space is one, character space is three, and word space is seven. For standard PARIS timing, `ditMs ≈ 1200 / WPM`. These are target relationships, not brittle exact cutoffs for human/keyed radio audio.

## M1 versus adaptive design

M1 intentionally uses a clean known/generated dit estimate (or the shortest observed tone). Preserve it as a deterministic oracle. M4 must introduce a resettable streaming timing tracker that estimates dit duration from many reliable marks and gaps, excludes outliers, and changes slowly enough not to oscillate mid-character.

Recommended approach:

1. Begin `acquiring` with a broad prior/range; do not pretend early characters are certain.
2. Keep rolling, quality-weighted observations for short/long marks and gaps.
3. Fit unit length robustly (median/trimmed estimator or candidate 1:3 clustering), reject implausible ratios/outliers, then smooth updates with bounded rate of change.
4. Classify each duration by distance from expected units and retain that residual.
5. Finalize a character only after a sufficiently confident gap or controlled timeout; define behavior for stream end/reset.

## Farnsworth and spacing

Farnsworth sends character elements at a higher character speed but lengthens character/word spaces to lower effective text speed. Never infer one universal dit from all spaces. Maintain at least:

- `elementDitMs`: marks and intra-element gaps; used for dots/dashes.
- `spacingUnitMs` or a spacing multiplier: character/word gaps; used for boundaries.
- Effective WPM and character WPM as distinct UI fields when they differ.

The tracker must allow extended 3/7 gaps without reclassifying a correct dah as a dit or losing word boundaries. Add labeled synthetic Farnsworth fixtures before claiming support.

## Shared generation timing for M9 — M9A implemented 2026-09-24

The learning generator must use the same canonical timing vocabulary but a different composition from adaptive receive timing. A pure timeline compiler takes known Morse tokens plus `characterWpm` and true PARIS `effectiveWpm`; it preserves 1/3-unit marks and one-unit intra-character gaps at character speed and expands only character/word boundaries for Farnsworth. For a PARIS word, the 31 element/intra units remain at character speed and the remaining duration is distributed over the 19 character/word boundary units. The deterministic PCM generator and browser training player render that exact timeline. The receive tracker continues to estimate the same roles from observed audio and does not depend on the player.

The M9A extraction preserves the existing `SyntheticCwOptions.wordsPerMinute`/`spacingWordsPerMinute` behavior, the 20/8 adaptive fixture, and the distinction between character and effective speed. The legacy `spacingWordsPerMinute` controls boundary-unit duration rather than true overall PARIS speed, so its compatibility wrapper derives the equivalent effective WPM instead of reinterpreting the option. `morse-timing.spec.ts` protects catalog-wide generation/decoding, exact standard and 20/10 effective timing, the legacy 18/8 sample-duration contract, normalization/boundaries, and invalid profiles. The browser player and cross-renderer checks remain M9C work.

## Confidence model

Confidence is explanatory, not decorative. Produce confidence at observation, mark/gap, character, and session/lock levels where evidence exists. A simple initial character confidence can combine tone SNR/lock quality, timing residuals, timing-estimate stability, and Morse-table validity. Store the components/reasons so UI can explain low confidence.

- Unknown Morse sequence: raw output `?`, confidence 0, retain the sequence/evidence.
- Ambiguous timing: retain the chosen raw character plus low confidence (or a configured `?` threshold); do not call context to repair it.
- Context matches: may add a separate confidence/proposal, never increase or rewrite decoder confidence.

Calibrate thresholds against fixtures. Do not display a precise-looking percentage until its relationship to empirical correctness is understood; qualitative levels may be better initially.

## Implemented M4 tracker — 2026-09-15

`src/app/core/morse/adaptive-timing.ts` implements a resettable streaming tracker with bounded histories. During acquisition it robustly evaluates candidate unit lengths against 1/3-unit marks and waits for boundary evidence before replaying buffered timing segments. Once tracking, recent observations are recency weighted and each estimate update is capped, preventing a single unusual mark from swinging the decoder. Longer observations carry more weight because fixed detector-edge quantization is a smaller fraction of their duration.

Boundary gaps are fitted independently against 3/7 units. Character WPM is derived from element dits; overall/effective WPM uses the PARIS split of 31 element units and 19 spacing units, so Farnsworth is visible without changing mark classification. The live UI no longer asks for WPM and describes both speeds in plain language.

Every adaptive timing event carries a normalized residual, confidence, and low-confidence reasons. The raw Morse decoder aggregates mark evidence per character, assigns unknown sequences zero confidence, and preserves `?` plus the original Morse sequence. The UI intentionally reports qualitative timing/text confidence until a future real-RF corpus can calibrate numeric buckets.

The M4 fast-gate target is zero character error rate for the labeled deterministic cases: clean 8/12/20/30/40 WPM; 18% bounded timing jitter; 20 WPM elements with 8 WPM spacing; and a gradual 12→20 WPM transition. All pass as of 2026-09-15.
