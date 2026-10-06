# Architecture and strict layer boundaries

## Required pipeline

```text
Input adapter (synthetic, fixture, AudioWorklet)
  → PCM frames
  → signal analysis / tone detector
  → tone segments or transition evidence
  → timing classifier / adaptive tracker
  → Morse events
  → Morse decoder
  → raw transcript + per-character evidence/confidence
  → optional ham-context analysis
  → Angular presentation, storage, and export
```

M9 adds a reverse, generated-audio path without changing that receive pipeline:

```text
Exercise symbol/text
  → canonical Morse tokens and boundaries
  → shared standard/Farnsworth timeline compiler
  → deterministic PCM adapter OR browser Web Audio player
  → typed answer
  → pure learning score/progression
  → versioned local learning progress
```

Both paths share the alphabet, token/boundary vocabulary, timing profile, and timeline segment contracts in `core/morse`. They do not share browser resource ownership or application state. Receive timing estimates observed audio; generation compiles exact requested timing.

M13 adds a separate local sending-feedback path without entering receive DSP:

```text
Keyboard/touch press and release
  → transient mark and intra-character gap durations
  → pure keying pattern/rhythm analysis against the selected character speed
  → explicit decoded/unknown character and timing feedback
```

The browser sidetone owns its own lazy audio resources. Detailed key traces are session-only and cannot alter learning unlocks, raw transcripts, or detector timing.

## Layers and dependency rules

| Layer | Responsibility | May depend on | Must not depend on |
| --- | --- | --- | --- |
| `core/morse` | Pure DSP contracts, timing, Morse decoding | TypeScript only | Angular, DOM, Web Audio, storage, network, ham context |
| Input adapters | Convert synthetic fixtures or PCM into core calls | core contracts; browser APIs at edge | Angular component state, correction logic |
| AudioWorklet | Time-critical PCM framing/analysis | a small worklet-safe core subset | Angular, DOM, synchronous I/O, app services |
| Acquisition/lock | Search and select frequency; report lock quality | detector contracts | text/context inference |
| Context analysis | Annotate a raw transcript | raw tokens/evidence only | mutation of raw transcript; feedback to DSP |
| Angular UI | State, controls, visual display | application-facing adapters/results | DSP algorithm ownership |
| Persistence/export | Local settings/transcripts | versioned view models | unconsented cloud storage |
| Verification | Compose test/file PCM, raw scoring, diagnostics, reports | core contracts and browser APIs only at adapters | context correction, PCM persistence, network upload |
| Learning domain | Versioned Koch course, exercise selection, attempt scoring, progression, aggregate models | shared Morse contracts; injected random/clock abstractions | Angular, DOM, Web Audio, storage, network, receive correction |
| Training audio adapter | Schedule/cancel a compiled timeline with Web Audio | shared timeline contract; browser audio APIs | Koch policy, answer scoring, storage, microphone capture |
| Keying domain/adapter | Score transient mark/gap timing; own a press-and-hold sidetone | canonical Morse catalog; injected clock; browser audio only at adapter | receive DSP, listening unlocks, trace persistence, microphone capture |
| Learning application | Orchestrate active sessions and expose read-only UI state | learning domain; audio and persistence interfaces | DSP ownership, direct component DOM, raw-transcript mutation |
| Learning persistence | Normalize and store a bounded versioned learner profile | serializable learning models; local storage at the edge | audio/PCM, transcript-session deletion, unlock decisions |

## Existing M1/M2 contracts

`interfaces.ts` provides `CwAudio`, `PcmFrame`, `ToneSegment`, `TimingEvent`, `TimingClassification`, and `DecodeResult`. M2 added `PcmFrame` as a browser-free, bounded sample block with sample rate and monotonic start position. M3 added acquisition contracts in `tone-acquisition.ts`; `AcquiringCwDecoder` owns bounded pre-roll and composes acquisition with `StreamingCwDecoder`. M4 adds optional residual/confidence evidence to timing events, decoded-character evidence to results, and the browser-free `AdaptiveTimingTracker`. `MicrophoneCapture` remains outside core and owns browser APIs. Maintain backwards compatibility deliberately and keep UI-specific types out of DSP code.

The live M5 composition is `RfSignalConditioner → ToneAcquisitionTracker → locked StreamingCwDecoder → AdaptiveTimingTracker → StreamingMorseDecoder`. The conditioner and detectors retain only running filter/noise state; acquisition pre-roll remains bounded. The timing tracker retains bounded duration observations rather than PCM. Its bootstrap event buffer is also bounded by the short acquisition interval and drains once timing begins tracking.

The heavier adaptive-noise and narrow-band detector is enabled only by `AcquiringCwDecoder`, where acquisition supplies frequency and noise evidence. The deterministic known-tone `StreamingCwDecoder` reference path keeps its lighter detector defaults, protecting fast/jittered M1–M4 oracles from band-pass ringing. Benchmark generation lives under test support; production core metrics accept labels and observations but do not generate or modify decoder truth.

M6 is presentation-only: Angular maps existing snapshots into plain-language status, qualitative confidence, a maximum 42-event timeline, and a maximum 24-character evidence list. It does not reinterpret Morse, mutate the raw transcript, or retain PCM. Critical state and evidence remain accessible DOM text rather than being available only through color or canvas graphics.

M7 adds two downstream layers only. `context/ham-context.ts` is a deterministic, network-free reader of raw text and character evidence; its offset-based annotations cannot call or configure DSP. `product/` owns a separate edited copy, schema-v1 local settings/sessions, exports, and install state. The versioned service worker caches the built shell and AudioWorklet but contains no decoder semantics. Persisted sessions cap record count and text/annotation sizes and never contain PCM.

M8A adds `verification/` outside Morse semantics. `verification-runner.ts` creates bounded `PcmFrame` blocks and composes `AcquiringCwDecoder`; it does not classify Morse itself. `cw-benchmark.ts` exports the single exact raw-text scoring/alignment definition used by both corpus and verification results. `wav-codec.ts` is pure PCM/WAV conversion, while `audio-file-adapter.ts` owns `File`, optional browser decoding, limits, cancellation, and `AudioContext` cleanup. PCM exists only during a run; result models and exports contain measurements and raw text only.

M8B keeps speaker output in the test-only `acoustic-playback.ts` edge adapter. `acoustic-verification.ts` coordinates it with `MicrophoneCapture`, but each captured frame streams directly to `StreamingVerificationRun`; it never monitors microphone input through the speakers and retains no PCM. The UI prevents the live and acoustic capture owners from running concurrently. Playback sources, worklet/source nodes, tracks, and both audio contexts are released on every terminal path.

M9A implements the shared foundation from `12-morse-learning-plan.md`. `morse-table.ts` exposes the canonical categorized catalog, `morse-sequence.ts` normalizes text into explicit symbols and boundaries, and `morse-timing.ts` compiles those tokens into renderer-neutral segments using `morse-timeline.ts` contracts. `synthetic-cw.ts` renders that timeline while an explicit compatibility conversion preserves the legacy boundary-unit `spacingWordsPerMinute` API.

M9B implements the pure learning and persistence layers. `learning/domain/koch-course.ts` is the versioned source of course order; `exercise-generator.ts` uses a local seeded PRNG and never global randomness; `learning-score.ts` owns answer normalization, replay exclusion, bounded evidence, unlock evaluation, and one-step advancement. `learning-progress.store.ts` is the only local storage boundary for schema-v1 learning data and migrations. It never stores audio or deletes product/transcription keys.

M9C implements two browser-facing boundaries without moving Morse semantics out of the shared core. `learning/infrastructure/morse-audio.service.ts` lazily creates/resumes one `AudioContext`, renders an existing `MorseTimeline` with one oscillator/gain pair and a short attack/release envelope, cancels stale playback, and releases nodes/context on exit or disposal. `learning/application/training-session.service.ts` composes the course, scoring, progress store, timeline compiler, and fakeable audio/clock ports into an explicit session state machine. Revision tokens prevent stale playback completions from advancing trials; answer latency starts only after playback completes; replay, background pause/resume, per-attempt persistence, recoverable audio/storage errors, completion, and one-step progression stay outside UI components. Practice playback never opens the microphone or stores PCM.

M9D makes routing a thin presentation boundary. `app.routes.ts` lazily loads the preserved operator component at `/transcribe`, while the shell-cached learning pages expose `/learn`, setup, session, results, and progress. Components subscribe to the session facade and never score answers or calculate Morse timing. Setup may compile a shared timeline for unscored character introduction; recognition screens omit answers and patterns until feedback. Leaving or backgrounding an active route pauses/cancels playback while already completed attempts remain persisted. Cache v5 discovers hashed route chunks during installation so direct `/learn` and `/transcribe` navigation survive a server-offline reload.

M9E adds `learning/domain/recognition-timeline.ts` as the pure prompt adapter. It compiles the character and derives one trailing character boundary from the same two-symbol core timeline; it does not duplicate timing math. This makes standard versus Farnsworth effective speed observable in isolated recognition practice while keeping dit/dah/intra-character segments identical. The browser player still receives only a complete renderer-neutral timeline.

M13 adds `learning/domain/keying-analysis.ts` for browser-free mark/gap classification and `learning/infrastructure/keying-sidetone.service.ts` for the momentary browser tone. The lazy `/learn/keying` page owns only transient strokes and presentation state. It draws targets from the unlocked Koch set but never writes attempts to receive progress.

## State and data ownership

- Audio capture owns devices, permissions, `AudioContext`, and cleanup.
- Learning audio owns only its playback `AudioContext` and scheduled nodes; the training session owns trial state and delegates persistence to the learning store.
- Keying sidetone owns only its lazy `AudioContext` and current oscillator/gain; the keying page owns transient press/release times and discards them on exit.
- Core owns no mutable browser/global state. Streaming trackers may be stateful but are instantiated per session and resettable.
- A decode session owns its raw events/evidence and timestamps.
- Context results reference raw text offsets or character IDs; they never replace the underlying values.
- UI can trim display history, but persisted/exported transcript metadata must label raw and suggested/contextual fields separately.
- A learning session owns only its trials, attempts, and presentation state. Its audio player owns scheduled browser nodes and must cancel them on replay, pause, navigation, error, or disposal.
- Learning persistence stores bounded aggregates and recent summaries under its own schema/key. It never stores PCM and resetting it cannot delete transcription records.

## Performance constraints

PCM work must never run in an Angular template, event callback loop, or timer as a substitute for an audio processing path. Keep allocations bounded in per-frame code. Transfer compact measurements/events from the worklet rather than unbounded sample buffers. Establish a maximum retained visualization history and a dropped-frame/overrun indicator.
