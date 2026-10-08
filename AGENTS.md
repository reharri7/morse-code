# Morse Practice — Instructions for Future Codex Sessions

This repository is a local-first Angular application for Morse learning with real-time CW transcription as a secondary tool. Treat `docs/` as the project plan and update it whenever implementation changes a milestone, interface, decision, or test result.

## Start-of-session workflow

1. Read `README.md`, this file, and `docs/README.md`.
2. Inspect `docs/03-roadmap.md` and select the first incomplete milestone; do not skip prerequisites without recording a decision in `docs/10-decision-log.md`.
3. Inspect the existing code and tests before changing plans. Documentation describes intended design; code and passing tests establish current behavior.
4. Keep a change inside its layer. Add focused tests before or with behavior changes.
5. Run `npm test -- --watch=false --browsers=ChromeHeadless` and `npm run build` when relevant. For browser/audio work, manually verify the documented acceptance case as well.
6. Update milestone checkboxes, the implementation/status notes, test coverage, and the decision log in the same change.

## Non-negotiable architecture rules

- Basic transcription is local-first: no backend, cloud service, LLM, account, or network request is required for microphone-to-raw-text decoding.
- Keep DSP and Morse logic framework-independent TypeScript under `src/app/core/morse/`. It must not import Angular, DOM, Web Audio browser globals, storage, or context-analysis code.
- Keep input adapters at the edge. Web Audio and `AudioWorklet` may feed PCM frames and receive results, but cannot define Morse semantics.
- Preserve the raw decode exactly. Ham-radio context analysis may annotate or propose corrections, never overwrite the raw transcript silently or feed corrections back into DSP/timing.
- Make uncertainty explicit. Prefer a confidence score, unknown marker, or visible proposal over an invented character.
- Preserve testability: deterministic synthetic input and labeled recorded fixtures are first-class product assets.

## Current verified baseline (2026-10-06)

- Learning-first product revision (2026-10-07): the user-facing product is Morse Practice; `/`, the app mark, installed launch, and unknown routes lead to `/learn`, while Learn precedes Receive in persistent navigation. `/transcribe` remains a complete secondary receiver tool. User-facing metadata and receiver report headings follow the new identity, and existing `cw-transcriber.*` storage keys remain stable to preserve local data. All 168 ChromeHeadless tests, the warning-free 540.31 kB Node 24 build, cache-v27 offline routes, and desktop/390×844 browser review pass.
- M1 is implemented in `src/app/core/morse/`; its exact synthetic check remains visible in the M6 live operator UI.
- The test suite passes the canonical exact decode: `CQ CQ DE K6RHE` → generated audio → `CQ CQ DE K6RHE`.
- M2 code and automated checks are implemented: microphone/device lifecycle, outputless AudioWorklet framing, bounded streaming decode, and live diagnostics. On 2026-09-15 the user reported that the MacBook's built-in microphone successfully decoded a known CW transmission. Repeated start/stop cleanup and device-loss behavior still need live confirmation before the final M2 checkbox closes.
- At the user's explicit direction, M3 implementation proceeded before M2 hardware acceptance. M3 automatic scan/lock, drift tracking, loss/reacquisition hysteresis, adaptive detector threshold, pre-roll, ranked candidates, and manual lock are implemented and pass synthetic acceptance tests. The successful live decode exercises the integrated microphone path, but the unknown-frequency details, loss/reacquisition, and two-signal manual-lock checks remain pending.
- At the user's explicit direction, M4 also proceeded while those remaining hardware edge cases stayed open. M4 adaptive timing, per-event/character confidence, gradual speed tracking, and separate element/Farnsworth spacing estimates are implemented. Its labeled synthetic acceptance corpus has zero CER at 8, 12, 20, 30, and 40 WPM, with 18% deterministic jitter, 20 WPM elements / 8 WPM spacing, and a gradual 12→20 WPM change.
- At the user's explicit direction, M5 proceeded while the remaining M2/M3 hardware edge cases stayed open. A versioned seven-fixture deterministic RF-like corpus, reusable exact-metric runner, DC/low-cut conditioning, impulse limiting, bounded level normalization, dynamic local-noise detection, persistent-candidate gating, locked-tone band-pass, and loss/reacquisition gate are implemented. Baseline CER 72% fell to 1.22%; WER is 5%, exact-message rate 85.7%, unknowns and false locks are zero, and the recovery case succeeds.
- At the user's explicit direction, M6 proceeded while those hardware edge checks stayed open. Its responsive operator UI exposes live state, raw text, a bounded timing timeline, Morse marks, character confidence/evidence, competing-tone choices, and plain-language lost-lock/timing guidance without developer tools.
- At the user's explicit direction, M7 proceeded while those hardware edge checks stayed open. Offline deterministic context annotations, a separate editable transcript, capped versioned local settings/sessions, labeled text/JSON export, install metadata/icons, and a versioned service-worker shell are implemented. The automated production-browser gate proves the app, cached audio worklet, manual 650 Hz setting, and saved transcript reload after its server is stopped.
- Fifty-seven ChromeHeadless tests, the unchanged M5 benchmark, the production build, and the cache-v4 server-offline quick-test/guided-UI gate passed at M8 delivery. Corpus v1 is modeled synthetic audio, not an over-the-air recording set; do not claim universal real-RF accuracy until labeled recordings validate it. The remaining M2/M3 hardware checks and M8 physical calibration are still open. Training exists, but no online callsign authority exists and no licensed over-the-air practice file has yet been evaluated.
- M8 software implementation is complete: M8A covers deterministic/file/WAV/report verification, and M8B provides an explicitly started room-noise/level-check/countdown/three-repetition acoustic workflow with complete lifecycle cleanup. Its two-of-three at 10% CER result remains visibly provisional until the real MacBook volume/position matrix is measured.
- M9–M11 are complete and M12 software implementation is complete with licensed recording validation pending. The shared timeline/audio engine powers adaptive characters, groups, words, simulated callsigns/contest/QSOs, and generated free copy. The receiver adds a text-only live-copy workspace; local recording practice reuses the bounded decoder without persisting PCM.
- At the user's explicit direction, M9A proceeded while the remaining M2/M3 hardware checks and M8 physical calibration stayed open. M9A is complete: the canonical catalog, explicit symbol/boundary sequence, true PARIS standard/Farnsworth timeline, and legacy spacing-WPM compatibility now live in pure `core/morse`; deterministic PCM generation consumes that shared timeline.
- M9B is complete. `learning/domain/` contains the fixed 36-symbol K/M-first course, seeded no-repeat exercise generation, answer scoring, bounded per-character/global evidence, exact unlock evaluation, one-step progression, and recent-session aggregation. `learning/infrastructure/learning-progress.store.ts` owns schema-v1 normalization, schema-0 migration, caps, non-fatal storage failure, and learning-only reset under `cw-transcriber.learning.v1`.
- M9C is complete. `learning/infrastructure/morse-audio.service.ts` renders the shared timeline through a lazily resumed Web Audio context with an attack/release envelope and explicit cancel/dispose cleanup. `learning/application/training-session.service.ts` owns playback, first-valid-answer scoring, post-playback latency, replay-assisted evidence, pause/resume, recoverable errors, per-attempt persistence, completion, and one-step progression without opening the microphone.
- M9D is complete. Angular Router preserves the operator product at `/transcribe` and adds `/learn`, setup, active session, results, and progress screens with sound introduction, separate character/effective speeds, hidden pre-answer content, keyboard/touch entry, live announcements, route cleanup, and responsive layouts. The cache-v5 service worker discovers routed chunks so both products work after a first server-offline reload.
- M9E is complete. Isolated recognition prompts now append a compiler-derived character boundary, so effective/Farnsworth WPM changes the actual thinking space without stretching the character rhythm. The release matrix covers standard and Farnsworth profiles at 12, 20, and 40 character WPM.
- One hundred twelve ChromeHeadless tests, the unchanged M5 benchmark, a warning-free production build, and the cache-v5 server-offline route gate pass after M9E. M9D route/UI coverage, M9C lifecycle/storage coverage, and the M9E timing matrix jointly cover the MVP release criteria. Default audio and desktop 1440×1000 plus narrow 390×844 layouts were manually exercised.
- One hundred fifty-one ChromeHeadless tests, including the unchanged RF benchmark, and a warning-free 459.12 kB initial production build pass. Cache v10 updates existing offline installations with the restrained radio-desk visual system, streamlined copy, and mouse-free practice loop; the direct server-offline `/`, `/learn`, `/learn/free-copy`, and `/transcribe` route gate passes. Development builds remove prior CW service workers and caches so older local bundles cannot mask current routes or UI. Normal character practice uses adaptive weights, submits a valid focused character immediately, and advances from feedback with Enter or Space; setup can review any earlier unlocked level without rolling back or unlocking progress. Closing M12 requires one authorized real-radio file run.
- M13 keying fundamentals are implemented at `/learn/keying`: unlocked-character selection, ideal-timing playback, Space/touch straight-key input, a local press-and-hold sidetone, deterministic mark/gap analysis, explicit decoded-character uncertainty, and separate pattern/rhythm feedback. Keying traces are session-only and do not alter listening progress, DSP, or raw transcripts. One hundred fifty-seven ChromeHeadless tests and a warning-free 476.07 kB initial production build pass; cache v12 adds the direct offline keying route gate.
- On 2026-10-04 the user changed their callsign from KO6PAS to K6RHE. The canonical decoder oracle, version-2 verification messages, UI examples, version-2 RF fixture, and documentation now use `K6RHE`. All 157 ChromeHeadless tests, the 1.23% CER/5% WER RF gate, a warning-free 476.07 kB initial production build, and the direct server-offline route gate pass; cache v13 delivers the identity update after the M13 cache-v12 release.

- Keying automatically scores after a three-dit character gap; a new mark cancels the pending timer and keying after feedback starts a fresh attempt. Finish now is optional. Cache v14 delivers this follow-up; the 157-test suite passes.
- The project now uses Angular 22.2, TypeScript 6.0, and the `@angular/build` builders under Node 24.15. Official migrations were applied one major at a time from Angular 19.2, templates use built-in control flow, and Angular 22's eager change-detection behavior remains explicit. All 166 ChromeHeadless tests, the unchanged 1.23% CER/5% WER RF gate, a warning-free 521.93 kB initial build, and cache-v23 offline routes pass.
- Mobile keying revision (2026-10-07): `/learn/keying` now prioritizes the touch target in a compact 390×844 layout, keeps character and speed controls side by side, uses coarse-pointer 48 px controls and safe-area spacing, and presents a viewport-responsive full-width press-and-hold key. Pointer capture and primary-contact ownership prevent an unrelated second touch from ending a mark. The shared desktop layout, Space-key path, paddle modal, transient scoring, and architecture boundaries remain unchanged. All 167 ChromeHeadless tests, a warning-free 532.10 kB initial build, cache-v24 offline routes, and desktop/390×844 browser checks pass.
- Default-surface revision (2026-10-07): `/transcribe` now combines state, input, and action in one receiver console, with idle metrics deferred and the immutable raw transcript dominant. `/learn` makes character practice the single recommended action and presents specialized modes in a responsive compact grid. Expanded workflows, accessibility, mobile keying, local-first boundaries, and raw-text behavior are unchanged. All 167 ChromeHeadless tests, the unchanged RF gate, a warning-free 536.04 kB initial build, cache-v25 offline routes, and desktop/narrow browser checks pass.
- Mobile receive-answer revision (2026-10-07): single-character `/learn/session` shows a stable six-column pad containing every unlocked course character, while retaining the typed field, direct hardware-key answers, replay, and existing scoring/progression. Coarse-pointer entry focuses the non-editable answer group instead of the text field so a phone keyboard is not summoned automatically. The expected character and Morse pattern remain unidentified until feedback. All 168 ChromeHeadless tests, the unchanged RF gate, a warning-free 540.29 kB initial build, cache-v26 offline routes, and a 390×844 tap/feedback browser check pass.

## Useful locations

- Receive-workspace revision (2026-10-05): `/transcribe` now defaults to the live status, microphone/start control, and raw transcript. Character evidence is collapsed, and live copy, edited/session tools, signal detail, verification/calibration, and install state are five visible but collapsed Operator tools. Stop/Clear appear only when relevant and routine automatic-lock guidance stays hidden until actionable. Raw text, uncertainty, live-copy evidence hiding, local-only verification, and all architecture boundaries are unchanged. 166 tests, the warning-free 489.35 kB initial build, cache-v22 offline routes, and a desktop browser review pass.

- M14 automatic-loop revision (2026-10-05): successful armed paddle attempts keep feedback visible for 1.2 seconds, then load the next unlocked character automatically; either paddle can advance immediately during that pause. An unsuccessful attempt stays on the same target and the next paddle contact clears feedback and begins the retry. Manual feedback actions remain as fallbacks. 165 tests, the warning-free 487.12 kB initial build, and cache-v21 offline routes pass; physical acceptance remains pending.

- M14 focused-modal revision (2026-10-05): native modal setup automatically advances into paddle practice, with shared target/marks/feedback and inert background. Close/Escape stop output and restore focus. 161 tests and the warning-free production build pass; cache v18 ships it. Physical acceptance remains pending.

- M14 in-modal controls revision (2026-10-05): armed paddle practice now keeps character and speed selection, ideal playback, Finish/Clear, Try again, and Next character inside the focused modal. These explicit controls are exempt from mouse-paddle capture without disarming it. The existing route acceptance changes K→M while the dialog remains open; 164 tests, the warning-free 486.70 kB initial build, cache v20 offline routes, and desktop/390×844 modal checks pass. Physical acceptance remains pending.

- Practice-hub revision (2026-10-05): `/learn` now uses one primary start/continue action, a compact complete mode menu, saved defaults, collapsed character detail, direct group/word/radio starts, and one-action session restart. The hub is lazy-loaded; cache v19, 164 ChromeHeadless tests, the warning-free 484.12 kB initial build, and the direct server-offline route gate pass. Angular's local LMDB build cache is disabled after a corrupt 9.3 GB cache repeatedly aborted production builds; generated output is unaffected.

- M14 armed-mode revision (2026-10-05) supersedes the safe area below: setup and explicitly started paddle practice capture mouse input anywhere on the page, block scrolling/ordinary clicks, and restore controls with Escape/Stop, focus loss, pointer cancellation, or navigation. Route disposal removes manual capture listeners. Cache v17 ships the change; hardware acceptance remains pending.

- M14 mouse-contact follow-up (2026-10-05): the unified USB paddle option supports keyboard or left/right mouse contacts. Mouse-down/menu suppression stays inside the labeled practice area; release is window-wide. 160 tests and the production build pass; cache v16 ships the correction. Physical paddle/sidetone acceptance remains pending.

- M14 USB keyboard paddle software is implemented with explicit distinct-code press/release setup, side swap, Iambic A repetition/squeeze, and focus/navigation cleanup. 159 tests pass; the user's YUEHISY physical input validation remains pending. Mappings are session-only; browser keyboard events cannot identify devices or detect unplug directly. Cache v15 ships this mode.
- `src/app/learning/domain/paddle-keyer.ts`: pure held-contact element selection.

- `src/app/core/morse/interfaces.ts`: current stable DSP/timing contracts.
- `src/app/core/morse/cw-pipeline.ts`: M1 reference composition for deterministic audio.
- `src/app/core/morse/morse-sequence.ts`: canonical text normalization plus explicit symbol/character/word-boundary tokens.
- `src/app/core/morse/morse-timeline.ts` and `morse-timing.ts`: renderer-neutral standard/Farnsworth contracts and compiler shared by generation and future training.
- `src/app/learning/domain/`: M9B course, serializable models, deterministic exercise selection, scoring, and Koch progression.
- `src/app/learning/infrastructure/learning-progress.store.ts`: bounded versioned local learning persistence and migration boundary.
- `src/app/learning/infrastructure/morse-audio.service.ts`: M9C Web Audio timeline renderer and resource lifecycle boundary.
- `src/app/learning/application/training-session.service.ts`: M9C active-session state machine and application orchestration.
- `src/app/learning/domain/recognition-timeline.ts`: M9E single-character prompt plus shared standard/Farnsworth thinking-space compiler.
- `src/app/learning/domain/practice-content.ts` and `copy-scoring.ts`: M10 deterministic groups/words and bounded character alignment.
- `src/app/learning/application/copy-practice.service.ts`: M10 scored group/word orchestration and persistence.
- `src/app/learning/domain/radio-practice.ts` and `application/radio-practice.service.ts`: M11 deterministic simulated callsign/contest/QSO content and scored orchestration.
- `src/app/learning/domain/free-copy.ts` and `application/free-copy.service.ts`: M12 longer-copy generation, alignment, and pause/restart orchestration.
- `src/app/learning/domain/keying-analysis.ts`, `infrastructure/keying-sidetone.service.ts`, and `pages/keying-practice/`: M13 pure straight-key feedback, browser sidetone edge, and keyboard/touch practice UI.
- `src/app/live-copy/`: M12 receiver-side text workspace that cannot mutate DSP or raw decoder output.
- `src/app/app.routes.ts` and `src/app/learning/pages/`: M9D transcription/learning routes and accessible learner screens.
- `src/app/transcription/transcription-page.component.*`: the preserved M6–M8 operator product at `/transcribe`.
- `src/app/core/morse/cw-pipeline.spec.ts`: canonical M1 acceptance test.
- `src/app/core/morse/streaming-cw-decoder.ts`: browser-free M2 streaming composition.
- `src/app/core/morse/tone-acquisition.ts`: M3 spectral scan and lock state machine.
- `src/app/core/morse/acquiring-cw-decoder.ts`: M3 pre-roll/acquisition/decoder composition.
- `src/app/core/morse/adaptive-timing.ts`: M4 robust streaming timing and confidence tracker.
- `src/app/core/morse/rf-signal-conditioner.ts`: M5 live-path filtering and bounded normalization.
- `src/app/core/morse/cw-benchmark.ts`: M5 exact raw-decode metrics.
- `test/fixtures/cw/manifest.json`: versioned M5 corpus labels, baseline, and thresholds.
- `test/fixtures/cw/latest-report.json`: published per-fixture and aggregate gate result.
- `src/app/input/microphone-capture.ts`: browser capture/device lifecycle boundary.
- `src/app/app.component.{ts,html,css}`: M6 presentation mapping and accessible operator interface.
- `src/app/context/ham-context.ts`: M7 offline annotations and explicit proposals.
- `src/app/product/`: M7 local product state, exports, session tools, and install status.
- `src/app/verification/`: M8A verification contracts, runner, file adapter, portable WAV, reports, and result UI.
- `src/app/verification/acoustic-verification.ts` and `acoustic-playback.ts`: M8B guided controller and explicit test-only speaker edge.
- `public/manifest.webmanifest` and `public/sw.js`: install metadata and offline shell.
- `test/pwa-offline-check.mjs`: production-browser offline/restart acceptance gate.
- `docs/11-verification-and-calibration-plan.md`: M8 phased implementation, verification cases, architecture boundaries, and acceptance protocol.
- `docs/12-morse-learning-plan.md`: M9–M13 learning architecture, domain/storage models, routes, algorithms, implementation tasks, and acceptance criteria.
- `docs/`: roadmap, acceptance criteria, design constraints, and decisions.
