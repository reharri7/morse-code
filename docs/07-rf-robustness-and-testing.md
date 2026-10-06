# Noisy RF robustness and automated testing

## Test pyramid

- Unit tests: Morse table, generator timing, Goertzel/window behavior, segment transitions, timing classes, adaptive tracker, confidence math, context boundaries.
- Deterministic pipeline tests: generated audio to exact raw transcript. Preserve the M1 `CQ CQ DE K6RHE` test permanently.
- Fixture benchmarks: labeled WAV/PCM recordings through the same production decode path, reporting metrics per fixture and aggregate.
- Browser integration tests: device lifecycle/worklet message protocol with fakes where possible; manual hardware checks for actual microphone behavior.
- UI tests: raw/context distinction, accessibility, lock/error states, start/stop/reset, exports.

## Current automated coverage — 2026-09-16

Fifty-seven ChromeHeadless tests pass. They retain M1–M7 coverage and add raw alignment, five production-path cases, WAV round-trip/file limits, PCM-free reports, the guided acoustic controller, and complete playback/capture lifecycle checks for success, cancellation, permission denial, playback failure, device loss, concurrent start, navigation, and repeated runs. The M5 benchmark remains unchanged. `npm run test:offline` proves cache v4 reloads after its server stops, retains M7 data/settings, renders both M8 verification layers, and passes the quick test offline. Real acoustic browser scheduling, hardware suppression, volume/position results, and the permanent threshold remain manual checks.

## M5 corpus v1 and published result — 2026-09-15

The manifest is `test/fixtures/cw/manifest.json`; `npm run benchmark` executes the production acquisition/conditioning/decoding path and `test/fixtures/cw/latest-report.json` publishes the latest result. No transcript normalization or contextual correction is applied.

| Fixture | Condition | Raw result | CER | Lock result |
| --- | --- | --- | ---: | --- |
| clean-oracle | M1 clean regression | `CQ CQ DE K6RHE` | 0% | acquired, no false lock |
| broadband-noise | weak tone + broadband noise | `CQ DE K1AXC` | 9.09% | acquired, no false lock |
| deep-slow-fading | 78% slow fading + noise | `TEST FADING 73` | 0% | acquired, held |
| dc-hum-impulses | DC, 60 Hz hum, clicks, noise | `NOISE TEST 5NN` | 0% | acquired, held |
| adjacent-carrier | keyed target beside steady carrier | `QRM TEST` | 0% | correct tone, no false lock |
| drifting-weak-tone | weak/noisy + 55 Hz linear drift | `DRIFT TEST 73` | 0% | tracked |
| loss-and-reacquisition | 1.1 s loss, new tone pitch | `CQ TEST` | 0% | one loss, one recovery |

Aggregate: 1.22% CER, 5% WER, 85.7% exact-message rate, 0% unknown-symbol rate, 100% acquisition, 201 ms mean acquisition, zero false locks, and 100% recovery for the labeled loss. The pre-tuning six-fixture baseline was 72% CER and 77.78% WER. Corpus v1 is modeled synthetic audio rather than an over-the-air recording set; this limitation travels with every published result.

## Corpus structure

Keep fixtures versioned and manifest-driven, for example `test/fixtures/cw/<id>.wav` plus `<id>.json`. The manifest should specify exact raw reference transcript, source type (synthetic/recorded), sample rate, nominal/observed tone and WPM if known, conditions, license/consent, and tags. Never use an unlabeled recording as a tuning oracle.

Grow deliberately:

1. clean synthetic: varying characters, WPM, tone, sample rate;
2. timing variation: jitter, speed shifts, Farnsworth, hand-key-like imperfection;
3. channel effects: noise/SNR steps, fading, amplitude changes, frequency offset/drift;
4. interference: adjacent CW tones, broad noise, impulsive noise, hum;
5. real radio/speaker/microphone recordings with consent and stable labels.

Keep a small fast “gate” corpus and a larger nightly/manual benchmark. Keep hard fixtures that exposed old bugs.

## Metrics

Compute against raw reference text after a documented normalization only. Default to no normalization beyond line-ending/recording metadata removal; do not erase errors by stripping punctuation or callsign differences. Report:

- CER: edit distance / reference character count;
- WER: token edit distance / reference word count;
- exact-message rate;
- unknown-symbol count/rate;
- lock-acquisition time, lock loss/recovery, and false lock rate;
- confidence calibration (accuracy by confidence bucket).

Set thresholds per corpus tier in the benchmark manifest/roadmap only after baseline measurements. Every DSP change must show no regression to clean exact cases and explain benchmark movement. Do not tune using context correction—the benchmark target is raw decoder output.
