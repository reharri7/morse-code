# Angular UX, ham context, PWA, and Morse Learning

## M6 operator interface — implemented 2026-09-15

The former debug surface is now an evidence-first operator screen. It shows:

1. Status strip: microphone/device, capture/lock state, tone frequency, signal/SNR/level, WPM/spacing estimate, and errors.
2. Bounded recent timeline: up to 42 classified tone/space events, sized relative to the learned dit duration and accompanied by a screen-reader text description.
3. Recent Morse mark stream: dots, dashes, spacing boundaries, and low-confidence cues.
4. Decoded-character stream: up to 24 recent characters, with qualitative confidence styling and selectable Morse/timing evidence.
5. Raw transcript: selectable, accessible, plainly labeled as raw decoder output.

Start/stop/clear and device choice stay primary. Acquisition and pitch controls live in a native collapsible Signal settings panel; automatic mode is the default, while detected candidates and manual lock remain available when tones compete. Every critical visual has text in the DOM rather than a canvas-only representation. Permission trouble, no signal, lost/degraded lock, manual lock, multiple candidates, uncertain timing, unknown Morse, and dropped blocks all have visible labels or guidance.

The wide layout keeps status facts in one strip and the transcript central; the narrow layout stacks controls, facts, evidence, and diagnostics without horizontal scrolling. Reduced-motion preferences disable the live beacon animation. The visual history is intentionally bounded and never changes the full raw session transcript.

## Ham-radio context layer (M7) — implemented 2026-09-15

Input is raw transcript plus immutable character IDs/confidence. It may recognize/annotate callsign-shaped tokens and operating language including `CQ`, `DE`, `K`, `KN`, `AR`, `SK`, `RST`, `QTH`, `QSL`, `73`, common abbreviations, contest exchanges, and prosigns. Prosign representation must be documented (e.g. a token/notation) and remain separate from decoded characters where needed.

`context/ham-context.ts` now performs that work deterministically and offline. It recognizes `CQ`, `DE`, `K`, `KN`, `AR`, `SK`, `BT`, `RST`, `QTH`, `QSL`, `73`, `88`, `5NN`, and practical letter/number callsign shapes. Prosigns are displayed as `<K>`, `<KN>`, `<AR>`, `<SK>`, and `<BT>` annotations while their source characters remain unchanged. Callsign results explicitly say they are shape matches and that no online lookup occurred.

The UI places clues under “Radio context,” with source text, type, explanation, and source-evidence confidence. Only `5NN` has a replacement proposal (`599`), reflecting common cut-number practice; it requires the user to press “Use 599 in edited copy.” That action modifies only the independently labeled textarea. Raw text is neither rewritten nor fed into DSP, and arbitrary/unknown text receives no invented context.

## PWA/product packaging (M7) — implemented 2026-09-15

- Installable Angular PWA with offline app shell and no core decoding dependency on network.
- Persist settings locally: selected device preference where permitted, manual frequency/scan band, visual/accessibility preferences, and advanced detector controls.
- Persist saved sessions/transcripts locally with schema version, timestamps, device/audio metadata where appropriate, raw text, optional user edits, and contextual annotations separately.
- Export at least plain text and structured JSON; label raw vs edited/contextual fields unambiguously.
- Test offline reload, storage migration/limits, mobile permissions, background/interruption recovery, and privacy disclosures.
- Consider Capacitor only later if native wrappers solve a demonstrated limitation; keep the core and browser PWA usable independently.

Implementation details:

- `cw-transcriber.product.v1` stores schema-versioned settings and at most 25 sessions. Each session caps raw and edited text at 100,000 characters and annotations at 500; audio samples are never stored. A schema-0 transcript shape migrates forward, corrupt values fall back safely, and quota/security errors do not interrupt decoding.
- Saved records keep timestamp, raw text, edited text, context annotations, device label, locked tone, character speed, and effective speed. The UI displays stored records locally and supports per-record deletion and export.
- Text export labels raw, edited, and context sections. JSON export carries `schemaVersion: 1` and distinct `rawText`, `editedText`, `annotations`, and metadata.
- `manifest.webmanifest` supplies standalone display, theme, description, and opaque 192/512 icons. `sw.js` derives hashed production assets from the built index, precaches the audio worklet and product shell, removes older CW caches on activation, and uses network-first updates with cache fallback.
- `index.html` supplies crawler-readable default descriptions, robots policy, Open Graph/large-card fields, and WebApplication JSON-LD. Route-owned metadata then provides unique titles/descriptions, one canonical URL, and explicit index/noindex policy without entering DSP or learning state. Canonical and social-image URLs resolve from the deployed base rather than a guessed hostname.
- The graphite/brass 1200×630 `morse-practice-social.png` is the social preview source; the editable SVG lives beside it. Public mode destinations use anchors so crawlers can discover them. Transient and personalized practice routes remain followable but are not indexed.
- The install card reports online/offline readiness and surfaces the browser-provided install prompt without pretending installation is available when the browser has not offered it.
- `npm run test:offline` starts the built app and an isolated production Chrome profile, verifies static/routed search and social metadata, share-image dimensions/cache, active service-worker control and cached worklet, persists a session and manual setting, removes the server, navigates again, and requires the full decoder plus retained data to render.

## Layered verification (M8A) — implemented 2026-09-16

The main page now includes **Verify the app** before the live transcript. Its recommended action runs `clean-15-v2` without microphone permission; an advanced action runs clean 25 WPM, weak/noisy, drifting-tone, and nearby-carrier cases as well. Each result lists audio input, tone, lock, timing, raw decode, and optional expected match in order, then points to the first failed stage. Expected and received values are labeled as raw text, and character differences remain keyboard/screen-reader-readable rather than color-only.

Local audio-file verification guarantees PCM/float WAV and offers compressed formats only when browser decoding succeeds. The 25 MB/five-minute limits, cancellation, error states, second-run behavior, and ephemeral PCM ownership are explicit. A generated `clean-15-v2` mono WAV shows its exact message/settings and passes download/re-import decoding. Text/JSON reports include version, source, browser string, stages, raw score, and decoder observations; they contain no PCM, edited copy, or context-corrected text.

The M8B speaker-to-microphone card is implemented and explicitly opt-in. It requires confirmation that headphones are disconnected and volume is moderate, allows microphone selection, shows room-noise/level/countdown/repetition progress, keeps Cancel visible, displays all three raw decodes, and labels its two-of-three/10% CER outcome as provisional. It cannot run beside live listening. The permanent pass threshold remains open until the documented MacBook volume/position matrix is measured.

## Morse Learning routes — implemented M9–M13

Learning is the primary product rather than another card on the operator screen. Angular Router preserves the full receiver at `/transcribe` and provides `/learn`, `/learn/setup`, `/learn/session`, `/learn/results`, and `/learn/progress`. The app brand links to `/learn`, persistent navigation lists Learn before Receive, and `/` plus unknown routes redirect to `/learn`. The receiver remains directly addressable and fully functional without competing with the learner's default path.

The training screen is deliberately quieter than the operator screen. During a scored trial it presents sound, an answer control, replay/pause/exit, progress count, and accessible state text. The answer, dot/dash representation, waveform, and visual timing stay hidden until the learner answers or explicitly reveals. Character introduction and post-answer feedback may show them as teaching aids. Keyboard, touch, reduced-motion, and screen-reader flows are release criteria rather than later polish.

Learning has its own bounded local profile and reset action. It must not reuse or erase saved transcription sessions. Practice playback uses a dedicated cancellable Web Audio adapter and never requests the microphone. Direct route refresh and offline service-worker navigation must work for both product modes.

The learning home prioritizes available practice modes and does not carry a standalone privacy card. Local-only and microphone boundaries remain visible where the user makes the relevant choice: practice setup and consent-gated local recording.

## Shared visual language

The Receive and Practice products use one restrained, instrument-like system rather than a generic marketing dashboard. The base is warm graphite with bone text and a muted brass signal accent. Depth comes from spacing, hairlines, and tonal shifts rather than gradients, large shadows, or a rounded card around every section. Buttons and fields are compact and rectangular; pills are reserved for short status values. Morse, transcripts, and measured values use monospace details while navigation and explanatory copy stay in the system sans-serif stack.

Copy is operational and contextual. A hint remains when it affects safety, consent, uncertainty, progression, or the next action. Repeated statements about local processing, hidden answers, or evidence separation are removed from overview pages and retained at setup, recording, scoring, and raw-output boundaries. Troubleshooting is collapsed until requested. The visual and content hierarchy must continue to work at 390×844 without horizontal scrolling.

The full screen contracts, service boundaries, training algorithms, storage model, groups/words/callsigns/QSOs/free copy/keying modes, and acceptance gates are in `12-morse-learning-plan.md`.

## Straight-key sending — implemented M13

`/learn/keying` keeps sending distinct from receive learning. It accepts an explicit Space or press-and-hold pointer gesture, plays a route-owned local sidetone, and compares transient mark/gap durations to the selected character speed. It reports the sent pattern, decoded/unknown character, and rhythm quality separately; it neither persists the trace nor changes receive mastery or transcription. Physical paddle/serial input, iambic keying, and calibrated long-form consistency metrics remain later proposals.
