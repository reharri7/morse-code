# Milestone roadmap and acceptance criteria

Complete milestones in order unless a documented decision says otherwise. Each milestone must add tests, update this checklist, and record material tradeoffs in the decision log.

SEO/Open Graph follow-up (2026-10-08): add crawler-readable default title/description/robots data, complete generic Open Graph and large-card metadata, WebApplication JSON-LD, `robots.txt`, and a 1200×630 share image based on the current Morse Practice visual system. Route data now drives unique titles and descriptions, base-aware absolute canonical/social URLs, and explicit indexing policy: public learning, free-copy, keying, and receiver surfaces are indexable; setup, active practice, results, progress, and query-driven copy/radio sessions are `noindex`. Practice-mode destinations use real links. The production browser gate validates static metadata before JavaScript, routed canonical/Open Graph/X values, PNG dimensions and offline caching, plus all prior offline routes. All 169 ChromeHeadless tests, the unchanged RF gate, a warning-free 546.58 kB initial build, and cache-v28 pass. A hostname-specific sitemap and search-engine submission remain deployment work because no production origin is recorded. No milestone checkbox or learning, DSP, storage, audio, permission, or raw-text behavior changes.

Learning-first product follow-up (2026-10-07): rename the user-facing shell and install identity to Morse Practice, redirect `/` and unknown routes to `/learn`, make the brand link open learning, and place Learn before Receive in top-level navigation. `/transcribe` remains directly addressable with its full local receiver, immutable raw text, verification, sessions, and offline support. Existing `cw-transcriber.*` storage keys remain unchanged so the hierarchy change cannot discard progress or receiver data. Route-shell and receiver-report checks pass in all 168 ChromeHeadless tests; the Node 24 production build is warning-free at 540.31 kB initial, cache-v27 passes the direct server-offline learning/free-copy/keying/receiver gate, and desktop plus 390×844 visual review confirms the identity and navigation on both surfaces. No learning, DSP, scoring, persistence, or microphone behavior changes.

Mobile receive-answer follow-up (2026-10-07): add a six-column tap pad of all currently unlocked characters to the single-character receive drill while retaining the typed form and direct hardware-key path. The candidate set is stable for the course level and never marks the expected character before feedback. On a coarse pointer, focus moves to the non-editable answer group instead of the text input, so the on-screen keyboard does not open automatically; tapping the input still opts into typing. One focused route check brings the suite to 168 passing ChromeHeadless tests. The unchanged RF gate, warning-free 540.29 kB initial production build, cache-v26 direct server-offline routes, and a 390×844 browser tap/feedback check pass. Scoring, progression, audio, persistence, DSP, and outstanding physical acceptance are unchanged.

Default-surface design follow-up (2026-10-07): remove repeated headings and low-value explanatory copy from `/transcribe` and `/learn`. The receiver now uses one state/input/action console, shows tone/signal/speed/text metrics only during live capture, keeps raw text dominant, and exposes the five unchanged secondary workflows in a compact tool grid. The practice hub now makes character training the single recommended action and fits all specialized modes in a responsive three-column/two-column grid. Expanded tools, practice routes, mobile keying, raw-text labels, accessibility semantics, and every architecture boundary remain intact. All 167 ChromeHeadless tests, the unchanged RF benchmark, a warning-free 536.04 kB initial build, cache-v25 direct server-offline routes, and 1440×1000 plus narrow/390×844 browser reviews pass.

Platform maintenance follow-up (2026-10-06): upgrade sequentially from Angular 19.2 through 20 and 21 to Angular 22.2 using the official migrations. The repository now uses TypeScript 6.0, `@angular/build`, built-in template control flow, explicit eager change detection, and Node 24.15 recorded in `.nvmrc` and `package.json`. Stable `@for` keys preserve learning/transcription DOM state under Angular 22's stricter checks; Web Audio receives an explicitly `ArrayBuffer`-backed PCM copy. All 166 ChromeHeadless tests, the unchanged 1.23% CER/5% WER benchmark, a warning-free 521.93 kB initial build, and cache-v23 direct server-offline route gate pass. No product milestone, DSP behavior, raw text, storage schema, or outstanding physical acceptance changed.

## M1 — Deterministic synthetic decoder — complete

- [x] Framework-independent TypeScript core under `src/app/core/morse/`.
- [x] Synthetic International-Morse audio generator, known-frequency Goertzel detection, timing classification, and raw decode.
- [x] Canonical automated acceptance case decodes `CQ CQ DE K6RHE` exactly back to `CQ CQ DE K6RHE`.
- [x] Synthetic Angular lab showing raw transcript and basic pipeline metrics.

Known limitation: timing uses clean-input assumptions (the shortest mark / known generated dit); it is not adaptive or Farnsworth-aware.

## M2 — Live microphone input — implementation complete; hardware acceptance pending

- [x] Request microphone access with speech-oriented processing disabled where supported.
- [x] Enumerate/select input devices and handle permission/device loss gracefully.
- [x] Feed PCM from an `AudioWorklet` through a thin adapter into the existing core pipeline without Angular imports in core.
- [x] Provide a live debug surface: selected/locked frequency, signal level, tone state, marks, raw text, start/stop/reset.
- [ ] Acceptance: playing a clean, known CW signal through a speaker/radio into a selected microphone yields recognizable, continuously updating raw text at normal CW speed; capture can start/stop repeatedly without leaked tracks or contexts.

Automated status (2026-09-14): 8 browser tests pass. The streaming path decodes the canonical M1 PCM exactly from bounded chunks; adapter fakes verify disabled speech processing, frame forwarding, permission denial, device labels, and two complete start/stop cleanup cycles. Partial hardware status (2026-09-15): the user found the MacBook's built-in microphone and reported a successful recognizable decode of a known CW transmission. The final checkbox remains open until repeated start/stop cleanup and device-loss behavior are confirmed live using the protocol in `06-live-audio-acquisition.md`.

## M3 — Automatic tone acquisition and lock — implementation complete; hardware acceptance pending

- [x] Scan configured CW band with spectral analysis; select candidate tone by persistence, narrowness, duty evidence, and SNR.
- [x] Lock a candidate, use a cheaper narrow detector while locked, and report lock quality/frequency.
- [x] Track modest drift; define loss/reacquisition hysteresis.
- [x] Support manual frequency selection/lock when nearby CW signals compete.
- [ ] Acceptance: a clean signal at an unknown frequency in the supported band is found and decoded; a manual choice remains respected with two nearby tones.

Automated status (2026-09-15): an unknown 735 Hz clean message at a browser-standard 48 kHz sample rate is acquired and decoded exactly using bounded pre-roll; a lock tracks 650→675 Hz, declares sustained loss, and reacquires at 820 Hz; a manual 640 Hz choice remains fixed beside a stronger 700 Hz signal. The successful user-reported MacBook microphone decode exercises the integrated path, but the final checkbox remains open until the live run records automatic frequency acquisition, loss/reacquisition, and manual selection between two nearby tones.

## M4 — Adaptive WPM and timing — complete

- [x] Estimate and continually update dit duration from robust observations rather than a known value or minimum mark.
- [x] Classify 1/3/7-unit structure with tolerances and per-event confidence.
- [x] Handle speed changes gradually and separate element speed from spacing speed for Farnsworth.
- [x] Acceptance: labeled synthetic variations across the chosen WPM range, jitter, and Farnsworth spacing meet documented CER targets without entering WPM manually.

Automated status (2026-09-15): the bounded streaming tracker fits recent 1/3-unit marks robustly, delays initial output until it has enough element/boundary evidence, independently fits 3/7-unit spaces, limits live estimate movement, and retains residual/confidence reasons. The labeled fast gate has zero CER at 8, 12, 20, 30, and 40 WPM, at 18% deterministic section jitter, with 20 WPM elements / 8 WPM Farnsworth spacing, and across a gradual 12→20 WPM change. Unknown Morse outputs `?` with zero character confidence. No manual WPM field remains in the live UI.

## M5 — Noisy real-RF robustness — deterministic gate complete

- [x] Create a versioned labeled corpus and benchmark runner before major tuning.
- [x] Add evidence-backed filtering, dynamic noise floor, hysteresis, normalization, drift resilience, and lock recovery.
- [x] Publish per-fixture and aggregate CER/WER/unknown/lock metrics.
- [x] Acceptance: agreed benchmark thresholds pass with no regression to M1 clean exact decoding.

Automated status (2026-09-15): corpus v1 contains seven labeled deterministic fixtures and exact, unnormalized raw-text metrics. Before tuning, the original six fixtures measured 72% CER, 77.78% WER, 16.67% exact messages, 13.33% unknowns, and one false lock. The final seven-fixture gate measures 1.22% CER, 5% WER, 85.7% exact messages, zero unknowns, zero false locks, 100% acquisition, 201 ms mean acquisition, and 100% recovery for the labeled loss. Thresholds are 2% CER, 5% WER, 85% exact, at most 1% unknowns, 100% acquisition within 300 ms mean, zero false locks, and 100% labeled recovery. At M5 completion, all 18 tests passed including the unchanged M1 exact oracle.

Scope note: these fixtures deterministically model RF-like problems and make tuning reproducible; they are not recordings of over-the-air signals. Do not present the gate as universal field accuracy. Add licensed/consented labeled recordings as they become available and publish their results separately.

## M6 — Polished visualization and UX — complete

- [x] Replace the debug lab with accessible, responsive live operator UI.
- [x] Show live status, signal/timing timeline, dots/dashes, character stream, transcript, confidence, and diagnostic states.
- [x] Acceptance: users can identify signal loss, wrong lock, timing uncertainty, and raw text without developer tools.

Verified status (2026-09-15): the primary screen uses readable capture/acquisition headings and guidance, a large immutable raw transcript, a bounded 42-event timing strip with a text equivalent, a Morse-mark readout, and up to 24 selectable characters with confidence and evidence. Competing candidates become explicit tone choices under advanced signal settings. Component tests cover ready, lost/recovery, competing-tone, and uncertain-character views; desktop and narrow layouts were visually inspected. All 21 browser tests, the unchanged M5 benchmark, strict TypeScript, and the optimized production build pass.

Concise receive-workspace follow-up (2026-10-05): make live receiving the complete default view: status, remembered/default microphone, one relevant Start/Stop action, and immutable raw transcript. Hide generic automatic-lock guidance until it becomes actionable; show Clear only when text exists. Character evidence is one disclosure. Five compact Operator tools keep live copy, edited copy/session export, signal/timing detail, verification/calibration, and offline installation findable without rendering their full workflows at once. A focused component check protects transcript-before-tools order and collapsed defaults. All 166 ChromeHeadless tests, the warning-free 489.35 kB initial build, cache-v22 server-offline route gate, and desktop browser review pass. DSP, raw text, uncertainty, context separation, local storage, verification, and physical-acceptance status are unchanged.

## M7 — Ham context and product packaging — complete

- [x] Add separate ham-context annotations/proposals; raw text is immutable and visibly distinct.
- [x] Add local transcript/settings persistence, export, PWA/offline install, and mobile review.
- [x] Acceptance: an installed offline app can select/capture, decode locally, retain settings/transcripts locally, export, and show contextual suggestions without silent correction.

Verified status (2026-09-15): context analysis recognizes a deliberately bounded offline vocabulary, callsign shapes, and `<K>`, `<KN>`, `<AR>`, `<SK>`, and `<BT>` display notation. It produces annotations only; the single text-replacement proposal, 5NN→599, requires a button press and applies solely to the edited copy. Schema-v1 local storage retains scan/manual/device settings and at most 25 raw/edited session records, never PCM; corrupt/legacy/full storage paths are covered. Text and JSON exports preserve labeled raw truth. The production manifest, opaque icons, and service-worker cache include the audio worklet. The automated offline gate loads the built app, confirms an active controller and cached worklet, stops the server, then proves the decoder screen, saved transcript, and manual 650 Hz setting survive navigation. The prior physical MacBook microphone decode verifies the unchanged capture path; the mobile layout was visually reviewed without requesting microphone permission. All 36 browser tests, RF benchmark, strict TypeScript, warning-free production build, and offline gate pass.

## M8 — Verification and calibration — implementation complete; physical calibration pending

- [x] Add a one-click deterministic quick self-test that feeds known CW through the production acquisition/decoder path without microphone permission.
- [x] Add local audio-file decoding with optional expected raw text, exact/CER/WER scoring, character diff, and stage diagnostics.
- [x] Add a locally generated, versioned portable WAV clip whose download/re-import round trip passes the protected clean gate.
- [x] Add plain-language results and local text/JSON reports for input, tone, lock, timing, raw decode, and expected-text match; never store PCM or score context-corrected text.
- [x] Add a guided, explicitly started speaker-to-microphone test with level calibration, three known repetitions, cancellation, error handling, and complete audio cleanup.
- [ ] Measure and document the MacBook acoustic baseline before replacing the provisional threshold and closing physical acceptance.
- [ ] Acceptance: a beginner can identify which verification layer passed or failed; deterministic and file gates are reproducible offline; the measured acoustic test is repeatable; all M1–M7 gates remain green.

Implementation order, architecture boundaries, test cases, provisional acoustic target, and manual acceptance protocol are specified in `11-verification-and-calibration-plan.md`. M8A (software/file verification) is deliberately shippable before M8B (guided physical verification).

M8A automated status (2026-09-16; callsign fixture updated 2026-10-04): all five versioned cases are deterministic and exact through `AcquiringCwDecoder`; the default `CQ CQ DE K6RHE` check passes at 600 Hz/15 WPM. The file adapter handles PCM/float WAV directly, uses browser decoding as an optional compressed-format fallback, rejects empty/corrupt/oversize/overlong input, releases browser decoder resources, and can run twice. The generated 16-bit mono WAV re-imports and decodes exactly. Fifty tests and the cache-v3 offline gate passed at M8A delivery; M8B subsequently extended the current totals below.

M8B automated status (2026-09-16): the explicitly started workflow prepares test-only speaker output during the user gesture, prevents concurrent live capture, measures two seconds of room noise, classifies a 600 Hz level check, counts down, and streams all three repetitions independently through the normal acquiring decoder without retaining PCM. It reports every repetition and the provisional two-of-three/10% CER result, exports aggregate text/JSON, and releases capture/playback on success, cancellation, permission denial, playback failure, device loss, navigation, and two consecutive runs. Fifty-seven ChromeHeadless tests, the unchanged M5 benchmark, the production build, and the cache-v4 server-offline gate pass. The provisional threshold remains deliberately uncalibrated until the documented real MacBook matrix is performed.

## M9 — Audio-first Morse Learning MVP — complete

M9 is specified in `12-morse-learning-plan.md`. It may proceed as a separately documented sequencing decision while the M8 physical calibration remains open, but it cannot mark or imply M8 physical acceptance.

- [x] M9A: extract a pure canonical symbol/token/timeline engine and refactor deterministic PCM generation to use it without breaking M1–M8 gates.
- [x] M9B: add a versioned Koch course, deterministic exercise/progression logic, hear-and-type scoring, and bounded schema-v1 per-character progress.
- [x] M9C: add a cancellable browser audio adapter and a tested training-session state machine with replay, pause, latency, cleanup, and recoverable errors.
- [x] M9D: introduce Angular Router; preserve the current product at `/transcribe`; add `/learn`, setup, session, results, and progress screens with audio-first accessible interaction.
- [x] M9E: pass all legacy tests/benchmarks/build/offline gates plus new domain, service, component, lifecycle, persistence, and production-route checks.
- [x] Acceptance: a first-time offline user can learn K/M at default 20 character WPM and 10 effective WPM, complete a 40-trial hear-and-type session without seeing answers before responding, receive immediate accessible feedback, reload, and retain accurate per-character attempts/correctness/replay/latency statistics.
- [x] Acceptance: documented unassisted thresholds unlock at most one next character; failed thresholds never unlock or roll progress backward; storage failure cannot stop an in-memory session.
- [x] Acceptance: generated practice and deterministic PCM use the same compiled timeline; no learning flow requests microphone permission or stores PCM; all M1–M8 automated gates remain green.

M9A automated status (2026-09-24): `morse-table.ts` now exposes a categorized canonical catalog; `morse-sequence.ts` produces normalized symbol and boundary tokens; `morse-timeline.ts` defines renderer-neutral segments; and `morse-timing.ts` implements standard timing, true PARIS effective-WPM Farnsworth spacing, and explicit legacy boundary-WPM conversion. `generateSyntheticCw` renders the shared timeline while retaining its sample-unit rounding, deterministic jitter, fading, and drift behavior. Seven new tests cover catalog uniqueness, every supported symbol through generation/decode, normalization and boundaries, exact 1/3/7 timing, 20/10 effective timing, legacy 18/8 duration, and invalid profiles. All 64 ChromeHeadless tests, the unchanged RF benchmark, production build, and cache-v4 offline gate pass. M9A does not add a trainer or browser playback.

M9B automated status (2026-09-25): `international-receive` v1 fixes the documented 36-symbol K/M-first order. Exercise selection is seed-reproducible, avoids immediate repeats, excludes locked symbols, and gives the newest symbol double weight until eight unassisted attempts. Scoring normalizes one-character answers, records accuracy/replay/latency, excludes replay-assisted attempts from mastery, caps per-character/global evidence, evaluates the latest 40 active-set attempts at 90% aggregate plus eight/85% newest-symbol thresholds, and advances at most one symbol. The separate `cw-transcriber.learning.v1` store normalizes schema v1, migrates schema 0, bounds all records, ignores unknown symbols, recovers from corrupt/unsupported data, reports quota failure without losing the in-memory profile, and resets without touching product data. Twenty-three new tests bring the full suite to 87 passing ChromeHeadless tests; the RF benchmark, production build, and cache-v4 offline gate remain green. M9B has no browser audio or learner-facing UI.

M9C automated status (2026-09-25): the browser audio adapter lazily prepares/resumes Web Audio, renders the shared `MorseTimeline` at its requested pitch with a short envelope, cancels superseded playback, and explicitly releases nodes/context. The application state machine compiles every hear-and-type trial through that shared timeline, accepts only the first valid answer, starts latency after playback completion, marks replay-assisted evidence, pauses safely when backgrounded, replays on resume without an assistance penalty, records each completed attempt, survives storage failure in memory, exposes recoverable audio errors, completes/summarizes sessions, and evaluates one-step unlocking. Eleven focused service tests bring the full suite to 98 passing ChromeHeadless tests; the unchanged RF benchmark, production build, and cache-v4 server-offline gate pass. No M9C path requests microphone permission or stores PCM. Learner routes and screens remain M9D work.

M9D automated and manual status (2026-09-25): Angular Router redirects the root to the unchanged operator product at `/transcribe` and adds `/learn`, setup, session, results, and per-character progress screens. Setup separates character/effective WPM, provides unscored K/M sound introduction, and explains the no-microphone boundary. Recognition hides answer/pattern content until a typed or direct keyboard answer, announces state changes, supports replay/pause/retry, persists each completed attempt, and pauses/cancels when its route is left. Seven new route/UI tests bring the full suite to 105 passing ChromeHeadless tests; the unchanged RF benchmark and warning-free production build pass. Cache v5 discovers the hashed lazy transcription chunk, and the browser gate proves both `/learn` and `/transcribe`, saved settings/progress, and the decoder self-test survive a server-offline reload. Default 20/10 WPM practice was exercised in the browser; desktop 1440×1000 and narrow 390×844 layouts have no horizontal overflow and expose the same labeled controls. M9E remains the final MVP release gate.

M9E release status (2026-09-25): the audit found that isolated symbols had no boundary on which effective WPM could act. `recognition-timeline.ts` now appends the exact character boundary derived from the shared two-symbol compiler, so standard/Farnsworth prompts preserve identical mark rhythm while providing the requested thinking space. Seven tests cover standard and Farnsworth profiles at 12, 20, and 40 character WPM plus explicit non-stretching behavior. The full suite now has 112 passing ChromeHeadless tests. The unchanged RF benchmark, warning-free 404.08 kB initial production build, and cache-v5 server-offline `/learn` plus `/transcribe` gate pass. M9 lifecycle, persistence, route exit, two-session, accessibility-content, responsive, and no-microphone/no-PCM criteria are covered by the combined M9B–M9E tests and manual review. M9 is complete.

Keyboard-flow follow-up (2026-10-02): single-character practice now treats one valid focused letter or number exactly like direct keyboard entry and submits it immediately. Feedback keeps the explicit Next control for touch and assistive technology while Enter or Space advances without a mouse; the next answer field regains focus after playback. A route-level browser test and a manual 20/10 WPM K/M loop cover type → feedback → Enter → next sound. Cache v7 carries the update to existing installations. All 150 ChromeHeadless tests, including the RF benchmark, the warning-free 454.68 kB production build, and the direct server-offline `/learn`, `/learn/free-copy`, and `/transcribe` route gate pass. No milestone checkbox or outstanding physical validation status changed.

Practice-hub follow-up (2026-10-05): replace the long stack of feature panels with one primary character-practice action, a compact complete mode menu, a three-item current-settings summary, and collapsed character detail. The primary action resumes an interrupted session or starts immediately with saved settings; group, word, callsign, contest, and QSO choices start during route entry rather than showing a redundant ready screen. Completed character sessions restart directly, with settings still one action away. `/learn` is lazy-loaded to keep the production initial bundle at a warning-free 484.12 kB. Three focused route checks bring the suite to 164 tests; cache v19 and the direct server-offline route gate pass. No scoring, progression, audio, privacy, or milestone acceptance changed.

Learning-home follow-up (2026-10-02): remove the standalone “Practice stays on this device” card so the home page moves directly from practice breadth to amateur-radio and long-form choices. The same privacy guarantees remain stated at setup and local-recording decision points. Cache v8 carries the streamlined home to installed copies. All 151 ChromeHeadless tests, including the RF benchmark, the warning-free production build, and the direct server-offline route gate pass. No milestone checkbox or privacy boundary changed.

Interface-design follow-up (2026-10-02): replace the neon-green, gradient, pill-navigation, large-radius card-stack treatment with a quieter radio-desk system shared by Receive and Practice. Warm graphite surfaces, a muted brass signal color, hairline structure, compact rectangular controls, restrained heading scale, and deliberate monospace details now carry hierarchy without ornamental depth. Repeated privacy, hidden-answer, evidence, and process explanations were shortened or moved to the decision points where they matter; diagnostic detail and safety language remain intact. Desktop and 390×844 layouts for learning home, setup, receiver status, controls, and verification were visually reviewed. Cache v9, all 151 ChromeHeadless tests, the warning-free 458.62 kB initial production build, and the direct server-offline route gate pass. No DSP, scoring, persistence, privacy, or milestone status changed.

Root-route follow-up (2026-10-02): `/` remains a full-match redirect to `/transcribe`, but a production service worker previously registered during local development could serve an older un-hashed `main.js` and leave the current root outlet empty. Development mode now unregisters the worker at this app's exact scope and removes only CW shell caches; production offline behavior remains enabled. Cache v10 and the offline gate cover direct `/`, `/learn`, `/learn/free-copy`, and `/transcribe` entry. No milestone or decoder behavior changed.

Callsign follow-up (2026-10-04): replace the user's former `KO6PAS` identity with `K6RHE` in the protected M1 oracle, built-in verification audio, UI examples, context coverage, and deterministic RF clean fixture. The changed verification artifacts and RF corpus advance to version 2. All 157 ChromeHeadless tests, the 1.23% CER/5% WER RF gate, warning-free 476.07 kB production build, and cache-v13 server-offline route gate pass. No decoder algorithm, milestone checkbox, or validation boundary changed.

## M10 — Groups, words, and adaptive review — complete

- [x] Add seeded random groups limited to unlocked characters and explicit group/word spacing.
- [x] Add a versioned, licensed local word corpus filtered to the unlocked alphabet.
- [x] Track bounded confusion pairs and rolling latency evidence.
- [x] Add explainable weak-character weighting with minimum exposure for every active symbol and a maximum share for any one symbol.
- [x] Add focused review that never reduces permanent Koch progress.
- [x] Acceptance: seeded sessions are reproducible, no content contains a locked symbol, and weak-character practice raises relevant exposure without starving the rest of the active set.

M10 release status (2026-09-25): pure seeded generators produce unlocked-only fixed-length groups with explicit character/word boundary tokens and filter a project-curated CC0-v1 common-word corpus to the active alphabet. Per-character evidence adds capped rolling recognition latencies and top confusion counts with safe schema-v1 defaults/normalization. Adaptive policy v1 combines underexposure, recent errors, relative latency, and confusions into explainable weights bounded from 1× to 3×; a 2,000-trial deterministic test raises the weak symbol while every active symbol retains material exposure. Normal character sessions use this policy, and setup can review any earlier unlocked Koch level without changing permanent progress. `/learn/copy` now provides scored, answer-hidden random-group and eligible-word sessions through the shared timeline/audio engine; bounded alignment records character-level accuracy and confusions after each answer. The full suite has 129 passing ChromeHeadless tests. The unchanged RF benchmark, warning-free 427.54 kB initial production build, and cache-v5 server-offline route gate pass.

## M11 — Callsigns and simulated CW QSOs — complete

- [x] Add locally generated, clearly simulated amateur-radio callsign practice using unlocked letters/numbers.
- [x] Add common CW vocabulary, prosigns, RST values, abbreviations, and contest-style groups using documented token/display conventions.
- [x] Add deterministic scripted CQ/call, RST, name, QTH, and sign-off QSO flows.
- [x] Keep typed copy, expected text, and optional ham-context annotations separate; hints never rewrite an answer.
- [x] Acceptance: every exercise is seed-reproducible and encodable by the shared catalog, post-session truth is inspectable, QSO transitions are deterministic, and no network/callsign authority is implied.

M11 release status (2026-09-25): `radio-practice.ts` generates seed-reproducible, region-neutral simulated callsigns from unlocked letters/numbers, contest exchanges with RST and serial groups, and six deterministic CQ-to-sign-off turns. Versioned local vocabulary plus reversible `=` → `<BT>` and `+` → `<AR>` display conventions keep every sound in the shared catalog. `RadioPracticeService` and `/learn/radio` hide truth until submission, persist course-character evidence, retain a separately labeled post-session transcript, and repeatedly state that no station/contact is assigned, validated, or looked up. Ten tests added in this increment brought the suite to 139 before M12 work began; the RF benchmark, warning-free build, and offline gate passed.

## M12 — Free copy and live-radio/transcription bridge — implementation complete; licensed recording validation pending

- [x] Add longer generated free-copy sessions with live typing, pause/resume, and post-session alignment.
- [x] Add a live-copy workspace beside the existing receiver without feeding user answers or context into DSP.
- [x] Keep user copy, immutable raw decoder text, and optional reference text separately labeled.
- [x] Use receive confidence/timing evidence only for post-attempt explanation, never for answer leakage.
- [ ] Evaluate at least one user-supplied licensed/consented real-radio practice file through the existing bounded local adapter.
- [x] Acceptance: live copy preserves raw decoder truth and cannot treat uncertain decoder output as guaranteed ground truth; audio ownership prevents feedback/resource conflicts; no recording or PCM is persisted without a new explicit decision.

M12 implementation status (2026-09-25): `/learn/free-copy` generates bounded eight-word passages from unlocked local-corpus words, supports live typing plus cancel-safe pause/restart, hides truth until review, aligns the final answer, and persists only character aggregates. Its optional recording flow requires an explicit rights/consent confirmation, reuses the 25 MB/five-minute local adapter and production raw decoder, uses an ephemeral object URL, never persists PCM, and scores only against optional trusted reference text; uncertain raw decode is separately labeled as an unscored comparison. `LiveCopyComponent` sits beside the receiver, never owns audio or touches DSP, hides raw/context/timing answers while active, and reveals user copy, immutable raw text, optional reference, confidence, and timing evidence only after completion. Ten M12 tests bring the full suite to 149 passing ChromeHeadless tests. The RF benchmark, warning-free 454.40 kB initial build, cache-v6 direct server-offline `/learn`, `/learn/free-copy`, and `/transcribe` reload gate, and narrow browser review pass. No licensed/consented over-the-air recording was supplied in this implementation session, so that final content-validation checkbox remains open.

## M13 — Straight-key sending fundamentals — complete

- [x] Add Space and press-and-hold pointer input for straight-key marks without microphone permission.
- [x] Add a cancellable, route-owned local sidetone with complete release/disposal behavior.
- [x] Reuse the unlocked Koch set and shared ideal timeline; do not create a second symbol catalog.
- [x] Analyze mark lengths and intra-character gaps in pure TypeScript, reporting pattern correctness, the decoded/unknown character, and rhythm quality separately.
- [x] Keep detailed key traces session-only and keep sending results out of listening mastery, DSP, and raw transcripts.
- [x] Acceptance: an offline keyboard- or touch-user can hear a target, send it, receive honest character/timing feedback, retry, and move through unlocked characters without stale audio after navigation.

M13 release status (2026-10-04): `/learn/keying` provides unlocked-character and 12–40 WPM selection, ideal playback, a large touch key, a Space shortcut, live mark display, and feedback that never confuses a recognizable pattern with clean timing. `keying-analysis.ts` is browser-free; `keying-sidetone.service.ts` owns only a lazy AudioContext/oscillator/gain and suppresses delayed tones after an early release. Six new domain, adapter, and route checks bring the full suite to 157 passing ChromeHeadless tests. The unchanged RF benchmark and warning-free 476.07 kB initial build pass; cache v12 adds a direct server-offline `/learn/keying` gate. This does not close the separate M2/M3/M8 hardware checks or M12 recording validation.

Keying interaction follow-up (2026-10-04): feedback appears automatically after a three-dit character gap (180 ms at 20 WPM). A new mark cancels the pending check; a key press after feedback starts another attempt. Finish now remains optional. Clear, speed/target changes, and navigation cancel pending checks. The updated keyboard route acceptance and all 157 browser tests pass; cache v14 delivers the change.

Mobile touch follow-up (2026-10-07): the straight-key route now names touch as a first-class keying method and brings its target plus full-width press-and-hold surface into the initial 390×844 workflow. On narrow screens, target and speed stay side by side, supporting copy is reduced, coarse-pointer controls meet a 48 px minimum, safe-area insets are respected, and the paddle dialog can use the full dynamic viewport. The active primary pointer is captured and must supply the matching release; unrelated contacts cannot truncate a mark. One focused route check brings the suite to 167 passing ChromeHeadless tests. The warning-free initial production build is 532.10 kB, cache v24 passes direct server-offline routes, and 1440×1000 plus 390×844 browser reviews show no horizontal overflow. No scoring, persistence, DSP, listening progress, or physical-hardware acceptance changed.

## M14 — USB keyboard paddle practice — software implemented; hardware acceptance pending

- [x] Advance successful armed-paddle attempts automatically and restart failed attempts from the next paddle contact (2026-10-05).

Automatic practice-loop follow-up: a clean armed-paddle attempt now holds its feedback for 1.2 seconds and advances to the next unlocked character without a button press. Pressing either paddle during that pause advances immediately without treating the contact as part of the unseen next target. After an unsuccessful attempt, the next valid paddle contact clears feedback and starts a fresh attempt on the same target. The manual Try again and Next character controls remain available. A focused route test protects timed K→M progression, bringing the suite to 165 passing tests; the warning-free initial build is 487.12 kB and cache-v21 offline routes pass. Physical validation remains pending.

- [x] Keep target/speed selection, ideal playback, attempt controls, retry, and next-character progression inside armed modal practice (2026-10-05).

In-modal control follow-up: the focused dialog is now a complete practice surface. Character and speed selectors plus Hear target remain available while armed; automatic feedback exposes Try again and Next character without closing the dialog. Finish now and Clear remain available as explicit fallbacks. Marked modal controls bypass page-wide mouse-paddle capture while all other clicks remain paddle contacts. The route acceptance changes K to M and clears feedback while the dialog stays open. All 164 ChromeHeadless tests, the warning-free 486.70 kB initial build, cache-v20 offline gate, and desktop/390×844 no-overflow checks pass. Physical validation remains pending.

- [x] Move setup and armed practice into a native focused modal with shared target/marks/feedback, inactive background, and Escape/Close focus restoration (2026-10-05).

Latest modal revision supersedes the page-only presentation below. Setup opens the modal and automatically transitions to practice when both contacts are learned. Start paddle practice reopens it with known mappings. Close/Escape stop output and return focus; native modal behavior keeps background controls inactive. 161 ChromeHeadless tests and a warning-free 488.41 kB initial build pass. Physical validation remains pending.

- [x] Replace pointer-dependent mouse area with explicit page-wide armed capture, scroll blocking, and Escape/Stop recovery (2026-10-05).

Current interaction supersedes the safe-area follow-up below: setup captures contacts anywhere on the page; practice requires Start paddle practice. Capture-phase listeners suppress ordinary mouse actions and non-passive wheel/touch listeners block scrolling. Escape, Stop, focus/background loss, pointer cancellation, and route disposal release capture/audio. Standard browser events still do not expose device identity or reliable USB unplug detection; physical acceptance remains open.

- [x] Capture two distinct keyboard contacts with confirmed key-up events and swap-side control.
- [x] Add held-contact repeats and alternating squeeze elements in Iambic A mode at selected WPM.
- [x] Reuse local sidetone, automatic character feedback, and transient attempt scoring.
- [x] Stop paddle timers and sound on clear, settings changes, focus loss, backgrounding, and route exit.
- [ ] Confirm the user's YUEHISY paddle reports distinct contacts/releases and exercise repeated dits, dahs, squeeze, and unplug/focus-loss cleanup on the MacBook.

Software status: 159 ChromeHeadless tests pass, including pure contact selection and keyboard setup/release integration. Browser keyboard events cannot identify which physical keyboard produced a signal; mapping applies only while the practice page is open. Setup mappings are session-only. Physical verification remains pending the user operating the connected paddle.

## Later, not prerequisites

M14 mouse-button follow-up (2026-10-05): at the user's direction, extend the existing paddle adapter for the YUEHISY's reported left/right mouse contacts while earlier physical gates remain open. Setup captures either keyboard or mouse press/release pairs. Mouse presses are accepted only in the labeled paddle area; releases are handled window-wide, and context menus are suppressed only in that area. A route test covers distinct sides, duplicate rejection, scoped input/menu handling, outside release, and automatic feedback. All 160 tests and the warning-free 476.07 kB initial production build pass. Browser clicks verified left/right mapping and a generated dah; actual paddle/sidetone/squeeze acceptance remains pending.

- Optional Capacitor wrapper if PWA APIs prove insufficient.
- Serial-key input, Iambic B, and calibrated long-form sending statistics remain future proposals.
- Optional opt-in callsign lookup or external integrations; never required for transcription.
