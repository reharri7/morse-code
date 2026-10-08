# Morse CW Transcriber

A local-first Angular 22 and TypeScript application for real-time CW transcription and Morse learning. Milestone 8 adds layered local verification: deterministic production-path checks, bounded audio-file decoding, raw scoring and character differences, portable WAV generation, reports, and an explicitly started three-repetition microphone/speaker test. The raw decode remains visible and immutable: verification, learning, live copy, keying feedback, and contextual hints never feed back into detection or silently correct text. The physical workflow is implemented, while its permanent MacBook threshold remains pending real acoustic calibration. M9–M11 are complete and M12 software is implemented: the app has a shared Morse timing engine, versioned Koch course, adaptive listening practice, groups, words, simulated radio formats, generated free copy, consent-gated local-recording practice, and a receiver-side live-copy workspace. The default Receive and Practice surfaces use a concise task-first hierarchy: one receiver console, a dominant raw transcript, one recommended character drill, and compact progressive disclosure for specialized tools and modes. Character receive practice offers a tap pad of unlocked answers without automatically opening the mobile keyboard; typed and hardware-key answers remain available. M13 adds local straight-key sending practice with keyboard/touch input, sidetone, deterministic character recognition, and rhythm feedback; its mobile layout provides a large press-and-hold key with contact-safe pointer handling. One authorized over-the-air recording run remains before M12 fully closes.

## Continuing the project

The complete autonomous implementation guide lives in [docs/README.md](docs/README.md). Future Codex sessions should begin with [AGENTS.md](AGENTS.md), select the next incomplete milestone in [docs/03-roadmap.md](docs/03-roadmap.md), implement and test it, then update the roadmap and [decision log](docs/10-decision-log.md). M1 and M4–M7 are verified complete. M2 and M3 code plus automated acceptance are implemented, and basic real microphone decoding has succeeded. Remaining physical edge cases and labeled over-the-air recordings are still honest validation gaps. The implemented learning architecture, routes, models, algorithms, and remaining acceptance gates are documented in [docs/12-morse-learning-plan.md](docs/12-morse-learning-plan.md).

## Run

Use Node.js 24.15 or newer within the Node 24 LTS line. The repository's `.nvmrc` records the tested runtime.

```bash
nvm use
npm install
npm test -- --watch=false --browsers=ChromeHeadless
npm run benchmark
npm run build
npm run test:offline
npm start
```

Open the local address shown by the development server. Use **Verify the app** for a microphone-free software check or local audio-file test, or choose a microphone and start listening. The app learns CW speed itself. Live audio never connects to the speakers and no audio leaves the browser. Save a session locally, export text or structured JSON, or install the app for offline use. The protected deterministic acceptance test in `src/app/core/morse/cw-pipeline.spec.ts` still verifies this full path:

```text
CQ CQ DE K6RHE → generated samples → Goertzel tone detection → timing events → transcript
```

## Architecture

`src/app/core/morse` remains framework-independent TypeScript:

- `interfaces.ts` is the stable boundary between input, DSP, timing, and text layers.
- `synthetic-cw.ts` creates deterministic International-Morse audio at configurable text, WPM, tone, sample rate, and standard 1/3/7-dit spacing.
- `goertzel-tone-detector.ts` detects a known narrow-band CW tone in short frames without a full FFT.
- `timing-classifier.ts` preserves the simple known-timing M1 reference path.
- `adaptive-timing.ts` robustly learns 1/3-unit marks, independently fits 3/7-unit spacing, changes estimates gradually, and attaches timing confidence and reasons to events.
- `rf-signal-conditioner.ts` removes DC/very-low-frequency energy, limits impulses, and applies bounded level normalization to the live/acquiring path.
- `cw-benchmark.ts` computes exact per-fixture and aggregate CER/WER/unknown/acquisition/lock metrics without contextual correction.
- `morse-decoder.ts` maps events to raw transcript text with unknown-symbol reporting.
- `tone-acquisition.ts` performs a bounded, windowed spectral scan, ranks persistent narrow candidates by SNR/shape/duty evidence, and owns automatic/manual lock state.
- `acquiring-cw-decoder.ts` keeps bounded pre-roll, replays it after acquisition, adapts detector thresholds, tracks lock drift, and composes raw streaming decode.
- `streaming-cw-decoder.ts` consumes bounded, monotonically positioned PCM frames without retaining audio and supports narrow-detector retuning.
- `src/app/input/microphone-capture.ts` owns browser permissions, devices, Web Audio setup, worklet messages, and complete cleanup.
- `public/cw-audio-processor.js` frames mono PCM with sample rate and monotonic sample position; it defines no Morse semantics and has no audio output.
- `src/app/context/ham-context.ts` recognizes a bounded offline vocabulary and callsign shapes without mutating raw text or making network requests.
- `src/app/product/` owns local settings/sessions, edited copies, exports, and install/offline presentation.
- `src/app/verification/` owns shared raw scoring/alignment, production-path deterministic/file runs, WAV handling, stage results, and PCM-free reports.
- `src/app/verification/acoustic-*.ts` owns guided test-only playback/capture coordination; live transcription remains outputless.
- `public/sw.js` and `public/manifest.webmanifest` provide the versioned offline app shell and install metadata.
- M9 implements the shared text → token → timeline contract, Koch progression, playback, persistence, and learner routes. M10 adds adaptive groups/words, M11 adds clearly simulated callsign/contest/QSO practice, and M12 adds generated free copy, bounded local recordings, and receiver-side live copy without introducing another Morse renderer or feeding answers into DSP. See [docs/12-morse-learning-plan.md](docs/12-morse-learning-plan.md).

The local path is:

```text
Microphone → Web Audio API → AudioWorklet → input adapter → detector → timing → decoder → raw transcript
                                                              └→ visualization / confidence
raw transcript → separate ham-radio context analysis
```

The learning path uses the same alphabet and timing contracts in the other direction:

```text
exercise text → shared Morse tokens/timeline → Web Audio tones → tap/typed answer → local progress
unlocked character → keyboard/touch key → local sidetone + timing trace → explicit sending feedback
```

The implemented M7 context layer is deliberately explanatory, not an online callsign authority or autocorrector. M5 measures modeled noisy-channel resilience but does not claim universal real-RF accuracy; labeled recordings must be added before making that stronger claim.
