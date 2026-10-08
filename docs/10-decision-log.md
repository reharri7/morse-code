# Decision log and engineering principles

Add new entries at the top. Record decisions that would otherwise make a future session revisit product or architecture debate. Include date, decision, rationale, consequences, and any revisitation trigger.

## 2026-10-07 — Default surfaces prioritize the operator's next action

**Decision:** Reduce the default Receive and Practice surfaces to a single task hierarchy. Receive combines state, input, and the relevant Start/Stop action into one console; hides live metrics until capture is active; keeps the immutable transcript dominant; and presents five secondary tools as a compact disclosure grid. Practice presents character training as the one recommended action and the seven specialized modes as a responsive three-column/two-column grid. Remove repeated section headings and explanatory copy while retaining labels at raw-data, privacy, consent, and recovery boundaries.

**Rationale:** The underlying progressive disclosure was correct, but the screens still narrated their own structure: Receive repeated page, live-status, transcript, and tool introductions, while Practice repeated its product name before a long menu. The repetition made a capable local-first application feel like a feature inventory. A stronger visual hierarchy lets the operator scan state → act → read, and lets the learner start or choose a mode without reading setup prose.

**Consequences:** No DSP, raw-transcript, uncertainty, context, scoring, progression, storage, audio, or permission behavior changes. Expanded tools and practice routes retain their specialized guidance. Responsive browser review covers 1440×1000, the default narrow viewport, and keying at 390×844 with no horizontal overflow. All 167 ChromeHeadless tests, the unchanged RF gate, a warning-free 536.04 kB initial build, and cache-v25 direct server-offline routes pass. Reintroduce default-surface guidance only when usability evidence identifies a specific missed action or misunderstood state.

## 2026-10-07 — Mobile keying treats touch as a held contact, not a tap action

**Decision:** Make touch the primary narrow-screen presentation of the existing straight-key mode. Keep method selection full width, place character and speed side by side, compress explanatory copy, use safe-area and coarse-pointer sizing, and scale the key against the dynamic viewport. Capture the primary pointer when a mark begins and accept only its matching release; retain Space-key input and the separate focused paddle workflow.

**Rationale:** The previous page was technically touch-capable, but its desktop spacing placed most of the 156 px key below the initial 390×844 view and labeled touch as a secondary alternative to Space. Window-wide release handling also allowed an unrelated pointer-up to end a held mark. A visible thumb-sized surface and contact ownership make the interaction legible and reliable without inventing another keying or scoring path.

**Consequences:** The change is confined to the learning presentation/input edge. Morse analysis, ideal timing, sidetone ownership, transient traces, listening progress, DSP, and raw transcripts do not change. One route check covers mismatched and matching pointer releases; all 167 tests, the warning-free 532.10 kB initial build, cache-v24 offline routes, and 1440×1000/390×844 browser reviews pass. Revisit haptic feedback or an installable native wrapper only after real phone use shows the browser surface needs it.

## 2026-10-06 — Angular 22 is the supported application baseline

**Decision:** Upgrade sequentially from Angular 19.2 through 20 and 21 to Angular 22.2 with the official migrations. Adopt TypeScript 6.0 and the current `@angular/build` builders, preserve pre-v22 component behavior with explicit eager change detection, convert templates to built-in control flow, and standardize local development on Node 24.15 through `.nvmrc` plus the package engine constraint.

**Rationale:** Angular 19 is out of support, Angular 21 is already in LTS, and Angular 22 is the active supported release. Jumping majors would bypass supported migrations. A recorded Node 24 LTS baseline avoids the unsupported Node 23 runtime previously first on this machine's path, while the maintained build/test builders remove the Angular 22 Webpack/Karma deprecation warning.

**Consequences:** TypeScript 6's typed-array generics require the browser playback edge to copy PCM into an `ArrayBuffer`-backed `Float32Array`, without changing the pure DSP contracts. Stable `@for` keys prevent regenerated view models from recreating controls during Angular's stricter checks. The Angular 22 runtime raises the optimized initial bundle from 489.35 kB to 521.93 kB (114.86 kB estimated transfer), so the warning budget moves from 500 to 550 kB while the 1 MB error limit remains. Cache v23 forces installed copies onto the new runtime. All 166 tests, the unchanged RF benchmark, warning-free production build, and direct server-offline routes pass. Revisit the pinned Node line and bundle warning only with a future framework major or measured delivery regression.

## 2026-10-05 — Receive defaults to the live job and discloses secondary tools

**Decision:** Make live status, microphone/start control, and immutable raw transcript the complete default `/transcribe` workflow. Collapse per-character evidence and present live copy, edited/session tools, signal detail, verification/calibration, and offline installation as five plainly labeled Operator-tool disclosures. Show Stop and Clear only when relevant, and omit generic automatic-lock guidance until loss, manual lock, or competing tones makes it actionable.

**Rationale:** The previous screen expanded diagnostics, three verification paths, acoustic calibration, live copy, context editing, timing, twelve metrics, troubleshooting, and installation around the basic receive task. All capabilities were visible, but the transcript was far down the page and the primary action competed with maintenance workflows. Compact named disclosures preserve feature discovery while returning the screen hierarchy to listen → read → inspect if needed.

**Consequences:** No DSP, capture, scoring, storage, raw-transcript, context, privacy, or verification contract changes. Live-copy mode still removes decoder evidence from the DOM while active, and the canonical decoder self-check remains visible. One component check protects default collapse and source order; all 166 tests, the warning-free 489.35 kB initial build, cache-v22 offline routes, and a desktop browser review pass. Revisit automatic tool opening only if real operator use shows an actionable state is being missed.

## 2026-10-05 — Successful paddle attempts advance automatically

**Decision:** During armed paddle practice, retain successful feedback for 1.2 seconds and then advance to the next unlocked character automatically. Let either paddle advance immediately during that pause, consuming the contact so it cannot key a character the learner has not yet seen. Keep failed attempts on the same target and use the next valid paddle contact to clear feedback and begin the retry. Retain the explicit Try again and Next character controls as fallbacks.

**Rationale:** Feedback actions sit below the practice content and interrupt the physical paddle rhythm. Success has an unambiguous next step, while a failed character should be repeated. A short visible result preserves useful feedback without requiring pointer travel.

**Consequences:** Automatic progression applies only while paddle practice is armed; straight-key behavior remains deliberate. Clear, settings changes, stop/focus loss, and route disposal cancel pending progression. A focused K→M timer check brings the suite to 165 passing tests; the warning-free initial build is 487.12 kB and cache-v21 offline routes pass. Physical hardware/sidetone acceptance remains open.

## 2026-10-05 — Armed paddle practice is self-contained

**Decision:** Keep target and speed selection, ideal playback, attempt controls, retry, and next-character progression inside the focused paddle modal. Treat only explicitly marked modal controls as ordinary UI during armed mouse capture; every other page click remains a paddle contact. Keep the modal open and the paddle armed when a learner chooses a different or next character.

**Rationale:** The modal correctly made the background inert, but it also stranded the only target selector and hid feedback progression actions outside that inert area. Closing and reopening practice for every new character broke the intended continuous training loop.

**Consequences:** Paddle input, transient scoring, and lifecycle cleanup are unchanged. Control actions stop scheduled marks and clear stale feedback where appropriate, while capture resumes immediately afterward. Next character is primary after a clean result and Try again is primary after an unsuccessful result. The existing mouse-paddle route acceptance now proves K→M progression inside the still-open dialog; all 164 tests, the warning-free 486.70 kB build, cache v20 offline routes, and desktop/390×844 no-overflow checks pass. Physical hardware/sidetone acceptance remains open.

## 2026-10-05 — Practice is a compact launcher with saved defaults

**Decision:** Make `/learn` a single concise launch surface. Keep one dominant character-practice action that resumes an interrupted session or starts with saved settings, place settings and progress beside it, collapse the character inventory, and show every specialized practice mode in one compact menu. Start group, word, callsign, contest, and QSO playback as part of the originating route action; retain the free-copy start state because that page also branches into consent-gated local recordings. Restart completed character sessions directly and keep feedback advancement explicit rather than timed.

**Rationale:** The prior page required scanning five large panels and added a redundant start screen after most choices. Existing saved defaults, automatic answer submission, explicit feedback, and service state machines already provide the safe automation boundaries; the hub should get the learner to those loops with less navigation without hiding mode breadth or rushing feedback.

**Consequences:** No DSP, timeline, scoring, progression, storage, or privacy contract changes. `/learn` is lazy-loaded to keep the initial bundle below its guardrail, while cache v19 preserves direct offline entry. Three route checks cover one-action character/group starts and one-action character restart; all 164 ChromeHeadless tests, the warning-free 484.12 kB build, the offline route gate, and 1440×1000/390×844 no-overflow checks pass. Angular's local LMDB cache is disabled after its corrupt 9.3 GB cache repeatedly aborted builds; this affects build reuse only, not application output. Revisit timed feedback only as a separate accessibility decision.

## 2026-10-04 — Learn keyboard paddle contacts through explicit setup

At the user's direction, extend sending practice while existing physical receiver/recording gates remain open. The user's YUEHISY paddle is recognized by macOS as a keyboard; capture its actual event codes through press-and-release setup rather than assuming a vendor mapping. Require distinct codes, allow swapping, and offer Iambic A held-contact repetition/squeeze alternation. Keep mappings and traces session-only. Focus loss, backgrounding, settings changes, and navigation stop the keyer. Standard keyboard events cannot distinguish the paddle from a typing keyboard or detect USB removal, so physical validation and browser-focus behavior must be confirmed on the user's device. No driver installation is required by this path. Cache v15 ships the feature; 159 automated tests pass.

## Principles

### 2026-10-05 — Focused native modal for paddle setup/practice

The user explicitly requests a focused modal. Use the browser's native modal dialog for focus containment and inert background, keeping target/marks/feedback in a shared Angular template. Confirmed setup transitions directly to practice; known mappings can reopen via Start. Escape/Close stop audio/capture and return focus. Existing browser-scoped input semantics remain unchanged; no new storage, permissions, DSP, or listening progress effects. This user-authorized M14 refinement proceeds while older physical gates remain pending. 161 tests and the warning-free 488.41 kB initial build pass; cache v18 ships it.

### 2026-10-05 — Explicit armed paddle capture instead of a mouse safe area

The user reports scrolling moves the pointer out of the practice area and explicitly authorizes page-wide armed capture. Setup and Start paddle practice activate capture-phase mouse handling, suppress normal clicks/menu actions, and block wheel/touch/scroll keys. Preserve a usable Stop control and Escape recovery; focus/background loss, pointer cancellation, and navigation stop audio and restore controls. Listeners are route-owned and removed on disposal; no Pointer Lock permission, OS-wide capture, device identity, or USB unplug detection is implied. This scoped M14 usability correction proceeds at the user's direction while earlier physical acceptance gates remain pending. Cache v17 delivers the change.

### 2026-10-05 — Accept mouse-button USB paddles at the input edge

The user reports their YUEHISY emits left/right mouse clicks, correcting the earlier keyboard-only assumption, and explicitly requests support. Reuse the existing session-only contact mapping and pure keyer. Scope mouse-down and context-menu suppression to a labeled practice area so normal page controls remain usable; handle mouse-up window-wide to avoid stuck contacts when the pointer leaves the area. Pointer cancellation, focus loss, and navigation stop output. No device identity or unplug detection is claimed. This authorized M14 correction proceeds without closing earlier physical receiver gates. Cache v16 delivers it; 160 browser tests and the production build pass.

1. Local-first raw transcription is a hard product constraint.
2. Preserve the evidence chain and uncertainty; do not invent certainty.
3. Raw decoder output is immutable with respect to context intelligence.
4. Pure, framework-independent TypeScript enables deterministic testability and portability.
5. Measure DSP robustness using labeled data and published metrics, not intuition.
6. Keep product/UI convenience outside time-critical signal processing.
7. Prefer reversible, additive interfaces and explicit state transitions.

## 2026-10-04 — Keying feedback follows the character gap automatically

**Decision:** Score a keying attempt after three dit units of silence at the selected character speed. Each new mark cancels the pending check. Keep an optional Finish now action, and let the next key press begin a fresh attempt after feedback.

**Rationale:** The learner can send and retry continuously without reaching for a check button. The standard character gap supplies an explicit completion boundary.

**Consequences:** Clear, setting changes, and route exit cancel pending checks. At 20 WPM the completion delay is 180 ms; internal pauses longer than that complete the character. Cache v14 delivers this interaction. The updated route test verifies automatic completion and cancellation between marks; all 157 browser tests pass.

## 2026-10-04 — Sending practice starts with a local straight-key surface

**Decision:** Add M13 as a separate `/learn/keying` mode using Space or press-and-hold pointer input, a locally generated sidetone, and pure deterministic analysis of mark lengths and intra-character gaps. Limit targets to the learner's unlocked Koch characters. Keep attempts session-only and keep sending feedback out of receive progress, DSP, and raw transcription.

**Rationale:** Keyboard and touch provide an immediately usable sending exercise without microphone permission, acoustic calibration, external hardware, or a second Morse alphabet. Pattern correctness and rhythm quality are different facts, so the UI reports both and explicitly labels sequences that do not decode to a supported symbol.

**Consequences:** The browser edge owns only sidetone resources; `learning/domain/keying-analysis.ts` owns classification and scoring. Leaving the route stops and disposes the sidetone. Physical paddle/serial interfaces, iambic keying, persistent sending statistics, and calibration against real hardware remain future decisions. The M2/M3/M8 physical checks and M12 recording validation remain open. Six focused checks bring the suite to 157 passing tests; the warning-free initial build is 476.07 kB and cache v12 covers the lazy offline route.

## 2026-10-04 — The protected self-check follows the operator's current callsign

**Decision:** Replace `KO6PAS` with the user's new callsign, `K6RHE`, across the canonical M1 round trip, built-in verification audio, UI examples, context tests, and deterministic clean RF fixture. Keep the same local-only generation and exact raw-decode criteria.

**Rationale:** The callsign in these messages represents the app's operator, so the visible self-checks and reusable verification clip should reflect the operator's current identity while continuing to exercise letters and a digit through the complete Morse path.

**Consequences:** Expected strings and documentation change, but DSP, timing, scoring, storage, and architecture do not. Changed verification artifacts and the RF corpus advance to version 2. The clean oracle and verification cases decode exactly; all 157 tests, the 1.23% CER/5% WER RF gate, warning-free production build, and cache-v13 offline route gate pass.

## 2026-10-02 — Development previews must not be controlled by the offline shell

**Decision:** Register the production offline service worker only outside Angular development mode. On a development load, unregister the service worker at this app's exact scope and remove only `cw-transcriber-shell-*` caches. Keep `/` as the tested full-match redirect to `/transcribe`, and include the root entry in the production offline route gate.

**Rationale:** Development bundles use stable names such as `main.js`, while the production shell intentionally serves cached assets first. A service worker left behind on `127.0.0.1:4200` could therefore keep running an older app whose root route rendered only the shell, even though the current route table and tests correctly redirected `/`.

**Consequences:** Local development reflects current source after the cleanup load. Production builds retain installable offline behavior, including direct root navigation. Cache v10 carries the production shell; all 151 tests, the warning-free 459.12 kB build, and the server-offline route gate pass.

## 2026-10-02 — Use a quiet radio-desk interface instead of a generic card dashboard

**Decision:** Unify Receive and Practice around flat warm-graphite surfaces, bone text, a muted brass signal accent, compact rectangular controls, hairline divisions, restrained heading scale, and monospace only for Morse or measured data. Remove gradients, broad shadows, pill navigation, large-radius card stacks, and decorative reassurance. Keep pills only for terse status values and keep guidance only where it changes safety, consent, uncertainty, progression, or the next action.

**Rationale:** The previous dark-green/neon system was internally consistent but read like a generated landing-page template: every concept was a card, hierarchy depended on ornament, and repeated explanations competed with the work. A receiver and practice tool benefits from the calm density and legibility of a well-made instrument panel.

**Consequences:** Presentation templates and component-scoped styles change, while DSP, audio ownership, scoring, raw-text integrity, storage, and route behavior do not. The receiver header and troubleshooting are quieter, learning copy is shorter, diagnostic/safety language stays available, and installation metadata matches the new shell color. Cache v9 ships the redesign. Desktop and 390×844 views were reviewed; all 151 tests, the warning-free 458.62 kB build, and the server-offline route gate pass.

## 2026-10-02 — Learning home prioritizes actions over repeated reassurance

**Decision:** Remove the standalone “Practice stays on this device” card from the learning home. Keep local-only, microphone, account, and recording assurances at the setup and recording boundaries where they inform a user decision.

**Rationale:** The card interrupted the sequence of practice choices without adding an action, while the same product guarantee is already established in context. Removing it makes the page shorter and keeps the hierarchy centered on what the learner can do next.

**Consequences:** Privacy behavior and architecture are unchanged. A route-level test protects the practice-choice sequence and the removed heading. Cache v8 carries the presentation change to installed copies; the 151-test suite, production build, and server-offline route gate pass.

## 2026-10-02 — Character practice uses an explicit mouse-free keyboard loop

**Decision:** Submit a focused single-character answer immediately when it is a valid letter or number, then keep feedback visible until the learner presses Enter or Space (or activates the existing Next control). Preserve focus management so the next answer field is ready after playback.

**Rationale:** Direct typing outside the input already submitted immediately, but the auto-focused input required a separate Check action, creating an inconsistent mouse-heavy loop. Keeping feedback advancement explicit avoids a rushed timer while allowing uninterrupted keyboard practice and preserving touch and assistive-technology controls.

**Consequences:** The presentation layer owns the shortcut and does not change scoring, playback, progression, or stored evidence. Cache v7 delivers the UI update to existing installations. A route-level browser test covers focused typing through the next trial, and manual default-speed verification confirms the visible type → feedback → Enter → next-sound flow. The full 150-test suite, warning-free 454.68 kB production build, and server-offline route gate pass; physical-audio and milestone status are unchanged.

## 2026-09-25 — M12 comparisons never promote receiver output to truth

**Decision:** Keep user copy, immutable raw decoder output, and optional trusted reference text as three separately labeled values. Score accuracy only when reference text is supplied; otherwise show decoder alignment as explicitly unscored. Hide raw text, context annotations, character evidence, and dot/dash timing while a live-copy attempt is active, then reveal confidence and timing evidence afterward.

**Rationale:** Receiver output can be uncertain and must not become a misleading answer key. The user’s typing and reference must never feed detection, timing, context correction, or raw decode. Post-attempt evidence is useful for diagnosis without leaking answers during practice.

**Consequences:** `LiveCopyComponent` owns text state only and has no audio/DSP port. Generated free copy remains on the training audio owner. Local recording practice requires rights confirmation, uses the existing size/duration-bounded in-memory adapter, creates only an ephemeral playback URL, and revokes it on replacement/navigation. Cache v6 recursively pre-caches nested lazy chunks and serves immutable assets cache-first. The 149-test, RF benchmark, warning-free 454.40 kB build, and direct offline route gates pass.

## 2026-09-25 — M11 radio practice is deterministic simulation, never an authority

**Decision:** Generate region-neutral callsign shapes, contest groups, and scripted QSO turns locally from seeded data. Label every identity/contact as simulated; perform no network lookup. Represent procedural signals through reversible shared-catalog mappings (`=` displayed as `<BT>`, `+` displayed as `<AR>`) rather than adding a second encoder.

**Rationale:** Amateur-radio formats are valuable ear training, but generated identifiers must not imply assignment or validity. Reusing canonical catalog symbols preserves one audio/timing engine and makes every exercise deterministic and encodable.

**Consequences:** Callsigns use only unlocked letters/numbers and remain unavailable until a digit is unlocked. Six-turn QSO transitions and post-session truth are reproducible, while typed answers and explanations remain separate. M11 closed at 139 passing tests with benchmark/build/offline gates green.

## 2026-09-25 — M10 copy practice scores character evidence through one audio path

**Decision:** Present groups and eligible words through one `CopyPracticeService` and `/learn/copy` route. Generate every prompt from the unlocked alphabet with deterministic seeds, compile it through the shared token/timeline engine, keep expected text hidden until submission, and align the typed answer back to expected characters for bounded per-character evidence.

**Rationale:** Longer-copy practice should exercise audible character and word spacing without creating a second Morse renderer or an unrelated progress model. Character alignment makes substitutions and omissions useful to the existing adaptive policy while preserving the exact learner answer for feedback.

**Consequences:** Random groups and words are first-class scored modes, early Koch levels receive an honest unavailable-word message, navigation cancels playback and resets transient state, and completed evidence is immediately persisted. The release gate passes 129 tests, the RF benchmark, a warning-free 427.54 kB initial build, and offline route reload. M10 is complete.

## 2026-09-25 — M10 adaptation is bounded, explainable, and progress-safe

**Decision:** Derive adaptive character weights from capped local evidence only: newest-character underexposure, recent unassisted error rate, relative rolling latency, and bounded confusion counts. Clamp every raw weight to 1×–3×, retain deterministic seeded selection, reject locked focus symbols, and treat earlier-level review as session scope rather than a change to permanent Koch progress.

**Rationale:** Weak-character repetition should be measurable and understandable without becoming an opaque mastery score or starving the rest of the active set. Review needs freedom to narrow practice while preserving the monotonic progression contract.

**Consequences:** Normal character sessions now use adaptive policy v1. Results can explain the actual inputs (“recent accuracy is lower”, “recognition is slower”, or “answers show confusion”). Rolling latency holds 50 samples and confusion maps keep the top 10 symbols. Pure group and CC0 word generators feed the learner-facing copy service. The foundation passed 121 tests before the complete scored-route gate expanded the suite to 129.

## 2026-09-25 — M9E makes Farnsworth spacing real for isolated prompts

**Decision:** Close the learning MVP only after each isolated recognition prompt appends one character boundary derived from the shared two-symbol core timeline. Do not reimplement spacing math in the session or audio service.

**Rationale:** A single character contains no character boundary, so effective WPM previously changed stored settings but not the audible practice interval. Appending the compiler-owned boundary gives the learner real Farnsworth thinking space while preserving the exact character rhythm and the one-timeline architecture.

**Consequences:** Recognition latency begins after the configured standard/Farnsworth space. Tests cover 12/12, 12/6, 20/20, 20/10, 40/40, and 40/20 profiles and prove only the trailing boundary changes. The full M9 release gate passes with 112 tests, the RF benchmark, warning-free production build, and server-offline `/learn` and `/transcribe` reload. M9 is complete; M10 may extend the exercise model to groups and words.

## 2026-09-25 — M9D routes both products through one local-first shell

**Decision:** Introduce Angular Router with a small shared navigation shell, preserve the existing operator component intact at `/transcribe`, and expose learning home, setup, session, results, and progress at `/learn` sibling routes. Keep learning routes in the install-time shell, lazy-load the much larger transcription screen, and have cache v5 discover hashed lazy chunks during installation.

**Rationale:** Transcription and learning are first-class sibling workflows but have different resource owners and visual priorities. A thin shell avoids coupling them while route-level loading protects initial size. Learning must also be genuinely offline on first reload, so route chunks cannot depend on having been visited after service-worker control begins.

**Consequences:** The old operator tests now run against `TranscriptionPageComponent` without semantic changes. Learning setup exposes separate character/effective speeds and visible patterns only for introduction; scored trials reveal no answer or Morse pattern until feedback. Keyboard and touch entry, live text announcements, reduced-motion-safe styling, route/background pause, results, and per-character evidence are available. The production initial bundle is 403.78 kB raw (101.51 kB estimated transfer), within budget; the transcription route is a 156.39 kB lazy chunk. All 105 tests, RF benchmark, production build, and offline route gate pass, with desktop and narrow layouts manually reviewed. M9E remains the release gate.

## 2026-09-25 — M9C separates browser playback from session orchestration

**Decision:** Render the shared `MorseTimeline` through a small Web Audio adapter that owns its context/nodes and explicit prepare, play, cancel, and dispose lifecycle. Keep the active practice flow in a separate application state machine with injected audio, progress, and clock ports; use playback revisions to ignore stale async completion and persist every completed attempt through the M9B store.

**Rationale:** Browser autoplay and background behavior are edge concerns, while exercise selection, scoring, and progression must remain deterministic and independently testable. Explicit state transitions and fakeable ports make rapid replay, first-answer semantics, post-playback latency, navigation, storage failure, and consecutive sessions testable without real-time sleeps or microphone access.

**Consequences:** Recognition latency begins only after the tone ends. Replay cancels prior playback and marks the scored attempt assisted; visibility pause cancels playback, while resume replays without adding an assistance penalty and resets latency. Audio failure is recoverable and non-scoring; storage failure does not stop the in-memory session. Exit/disposal release all owned playback resources, no PCM is retained, and no microphone is opened. Ninety-eight tests, the RF benchmark, production build, and offline gate pass. M9D still owns routes, accessible screens, and the first learner-facing flow.

## 2026-09-25 — M9B keeps progression pure, deterministic, and independently persisted

**Decision:** Implement the versioned 36-symbol K/M-first course, seeded exercise generation, answer/attempt aggregation, unlock evaluation, and one-step progression as pure TypeScript under `learning/domain`. Persist only normalized bounded aggregates and summaries through a separate `cw-transcriber.learning.v1` adapter; replay-assisted attempts remain practice evidence but never count toward unlocking.

**Rationale:** A deterministic domain makes course and threshold behavior reproducible before browser audio or UI exists. Keeping raw aggregates instead of a stored mastery score allows future policies to evolve. A separate storage schema/key prevents learning reset or migration from affecting immutable transcription sessions and operator settings.

**Consequences:** The newest underexposed symbol has double selection weight until eight unassisted attempts, while immediate repeats are excluded. Unlocking examines the latest 40 unassisted active-set attempts, requires at least 90% overall and eight attempts/85% for the newest symbol, and adds exactly one symbol. Histories and sessions are capped; corrupt, unsupported, full, or unavailable storage cannot stop an in-memory session. Eighty-seven tests, the RF benchmark, build, and offline gate pass. M9C still owns browser audio and active-session orchestration; no trainer UI exists yet.

## 2026-09-24 — M9A proceeds while physical receive checks remain open

**Decision:** At the user's explicit direction, begin Morse Learning with M9A while the remaining M2/M3 live edge checks and M8 MacBook acoustic calibration stay open. Implement only the pure shared catalog/sequence/timeline foundation in this increment; do not claim those physical checks or any learner-facing training capability are complete.

**Rationale:** M9A is framework-free deterministic work with complete regression coverage and does not depend on microphone hardware. Establishing one Morse representation and exact standard/Farnsworth generation now reduces later duplication without changing receive acquisition or its honest validation gaps.

**Consequences:** Deterministic PCM generation now consumes the shared timeline through a legacy spacing-WPM compatibility conversion. All 64 tests, the unchanged RF benchmark, production build, and offline gate pass. M2/M3 hardware and M8 acoustic status remain unchanged. M9B is the next learning increment; browser playback, progress persistence, routes, and UI are still unimplemented.

## 2026-09-24 — Learning is audio-first and shares the canonical Morse timeline

**Decision:** Plan Morse Learning as a first-class sibling of transcription. M9 first extracts a pure character/token/timeline contract used by deterministic PCM and browser practice audio, then adds a versioned Koch course, Farnsworth hear-and-type sessions, separate local per-character progress, and `/learn` routes. Training playback, progression, persistence, and UI remain separate owners; the receive decoder continues to estimate observed timing and preserve immutable raw text.

**Rationale:** Learners should recognize whole audible rhythms rather than count visible dots and dashes. Reusing the Morse table and timing representation prevents generated practice, verification, and transcription from disagreeing, while separate application compositions avoid coupling ideal playback to adaptive receive DSP. A versioned course and raw aggregate statistics allow progression and later adaptive practice to evolve without silently changing past progress.

**Consequences:** The current single screen must move intact to `/transcribe` when the router is introduced. MVP training is local-only and does not request microphone permission; it stores no PCM and uses a learning-specific storage key/reset. The default course starts with K/M, character and effective speed remain distinct, and unlocks use documented unassisted evidence. Random groups, words, weak-character adaptation, callsigns, simulated QSOs, free copy, live-radio comparison, and sending analysis follow only after their milestone gates. Full contracts and acceptance criteria live in `12-morse-learning-plan.md`; no training capability is claimed until M9 passes.

## 2026-09-16 — M8B isolates explicit playback and keeps the acoustic threshold provisional

**Decision:** Implement acoustic verification with a test-only speaker adapter and a controller that coordinates the existing microphone edge. Prepare playback during the explicit start gesture, stream each of three repetitions directly into a new production verification session, show every raw result, and label the planned two-of-three at 10% CER rule as provisional until measured.

**Rationale:** Browser autoplay rules require playback preparation close to the user gesture, while safety and feedback prevention require speaker output to remain completely separate from live transcription. Independent repetition sessions prevent a lucky result from hiding failures and avoid assuming capture/playback clock alignment.

**Consequences:** Live listening and acoustic verification cannot own the microphone concurrently. The test measures room noise and level, handles all failure/cancellation paths, and retains no PCM. Automated fakes prove two complete runs and cleanup, but only a user-started physical MacBook matrix can replace the provisional threshold or close M8 acceptance.

## 2026-09-16 — M8A reuses raw scoring and keeps imported PCM ephemeral

**Decision:** Implement the repeatable M8A layer before acoustic playback. Export the M5 raw comparison as the sole exact/CER/WER/alignment definition; route generated and imported PCM through `AcquiringCwDecoder`; guarantee bounded PCM/float WAV locally and treat compressed formats as browser-dependent; retain only result metadata and raw text.

**Rationale:** One scoring definition prevents the benchmark and user-facing verification from disagreeing. The production acquisition composition makes a quick-test pass meaningful without pretending it tests microphone hardware. Explicit file limits, cancellation, browser-decoder cleanup, and PCM-free reports preserve the local privacy boundary.

**Consequences:** Five versioned deterministic cases now pass exactly, including a 25 WPM case that records a 64-sample detector frame setting while the other cases use 128. The portable `clean-15-v1` 16-bit mono WAV round trip is protected. M8B cannot close until the three-repetition speaker-to-microphone workflow is implemented and a real MacBook baseline replaces the provisional acoustic threshold.

## 2026-09-16 — M8 uses layered verification and ships the repeatable path first

**Decision:** Plan M8 as two increments. M8A adds a deterministic quick self-test, direct local audio-file verification, exact raw-text scoring, stage diagnostics, reports, and a portable known WAV. M8B then adds an explicitly started speaker-to-microphone test with level calibration and three repetitions. Every source must feed the production PCM acquisition/decoder path; verification never scores context-corrected or edited text.

**Rationale:** Holding a phone beside the MacBook makes a single result depend on the phone speaker, room, placement, microphone, browser processing, acquisition, timing, and decoder at once. A layered test identifies the failed stage and gives a new user a repeatable software proof before introducing the physical path. File import also permits real recordings to be tested without microphone permission or acoustic loss.

**Consequences:** Passing the quick test does not prove the microphone, and passing the acoustic test does not prove universal radio performance. Browser file decoding, playback, and capture remain edge adapters; scoring and alignment stay framework-independent and use immutable raw text. PCM remains ephemeral and reports contain metrics rather than audio. The acoustic 10% CER target is provisional until measured across the documented MacBook setup; evidence, not demo convenience, decides the final threshold. Full implementation details and closure criteria live in `11-verification-and-calibration-plan.md`.

## 2026-09-15 — M7 stays offline, downstream, explicit, and bounded

**Decision:** Proceed with M7 at the user's direction while the remaining M2/M3 physical edge checks stay open. Implement ham context as deterministic annotations over immutable raw text, permit only explicit changes to a separate edited copy, store versioned bounded product records locally without audio, and package the same browser decoder with a small versioned service-worker shell.

**Rationale:** Callsign-shaped text and common operating shorthand are useful to a new CW user, but a plausible interpretation must never become decoder truth. Local persistence and offline installation preserve the privacy promise. Bounded schemas, visible quota failure, labeled exports, and a production-browser offline gate make those product conveniences testable without introducing a backend or widening the DSP layer.

**Consequences:** Callsign recognition means shape only; no authority or network lookup is implied. Prosigns appear as `<K>`, `<KN>`, `<AR>`, `<SK>`, and `<BT>` annotations. The only replacement proposal is the well-defined cut-number expansion 5NN→599 and it changes only the edited copy after a button press. Storage retains at most 25 sessions, 100,000 characters per text field, and 500 annotations. Cache revisions must increment when shell behavior changes; `test:offline` protects server-offline navigation and the cached audio worklet. Physical mobile permission behavior and the outstanding M2/M3 device edge cases remain honest manual checks.

## 2026-09-15 — M6 uses an evidence-first DOM interface while hardware edge checks remain open

**Decision:** Proceed with M6 at the user's direction without closing the remaining M2/M3 physical edge checks. Present the existing decoder snapshot as a responsive, plain-language DOM interface with a dominant immutable raw transcript, bounded 42-event and 24-character views, explicit competing-tone choices, and text equivalents for every critical visual state.

**Rationale:** New CW users need to distinguish no signal, lost lock, a wrong candidate, uncertain timing, and an unknown character without understanding DSP terms or opening developer tools. Reusing the existing evidence avoids putting Morse semantics in Angular. Bounded display history protects rendering while the session transcript remains intact.

**Consequences:** M6 is independently verifiable through state-driven component tests and visual review, but it does not prove the outstanding physical device-loss or competing-signal cases. The richer single-component responsive design raises the component-style production guardrail from 6/10 kB to 13/15 kB warning/error; the optimized initial bundle remains 283.01 kB raw and 77.54 kB estimated transfer. Revisit component splitting if the style bundle reaches the new warning.

## 2026-09-15 — M5 advances with modeled fixtures and an explicit field-validation limit

**Decision:** Proceed with M5 at the user's direction while the remaining M2/M3 physical edge cases stay open. Establish a deterministic RF-like corpus and thresholds now, but label it as modeled synthetic audio rather than evidence of universal over-the-air performance.

**Rationale:** Reproducible noise, fading, hum, impulses, interference, drift, and loss fixtures enable measured tuning immediately. Inventing or silently adopting an unlabeled recording would violate the evidence requirements.

**Consequences:** The deterministic M5 gate can complete, and `npm run benchmark` protects it. Labeled licensed/consented real-radio recordings remain a validation gap and must be reported separately when available.

## 2026-09-15 — Robust filtering is scoped to the acquisition/live path

**Decision:** Apply DC removal, impulse limiting, bounded normalization, dynamic reference-bin thresholds, two-frame hysteresis, and a Q=12 locked-tone band-pass in the acquiring/live composition. Keep the clean known-tone streaming reference on its lighter detector defaults.

**Rationale:** The first corpus baseline measured 72% CER. Conditioning reduced broadband/DC/impulse failures, candidate power/persistence rejected a nearby carrier, and the locked band-pass decoded it. Applying that band-pass globally then broke the protected 40 WPM and 18% jitter cases because filter ringing blurred short timing; scoping it restored every prior oracle.

**Consequences:** Robust detection depends on acquisition evidence and remains opt-in at the lower-level streaming interface. Final corpus v1 measures 1.22% CER with zero false locks and full labeled recovery, while all M1–M4 tests remain unchanged and green.

## 2026-09-15 — M4 advanced after a successful basic microphone decode

**Decision:** Proceed with M4 at the user's explicit direction while leaving the untested M2 repeated-lifecycle/device-loss and M3 physical acquisition edge cases open.

**Rationale:** The user successfully decoded a known CW transmission through the MacBook microphone and considered the physical path sufficient to continue. The remaining cases do not block deterministic development or measurement of adaptive timing.

**Consequences:** M4 can be complete on its synthetic acceptance criteria without implying that the outstanding hardware cases passed. Complete those live records before M5 unless the user explicitly directs another sequencing exception.

## 2026-09-15 — Adaptive timing buffers bootstrap evidence and separates spacing

**Decision:** Fit element duration from recent 1/3-unit marks, fit boundary spacing separately from 3/7-unit gaps, briefly buffer timing segments during bootstrap, cap tracking updates, and propagate residual-based confidence into immutable raw character evidence.

**Rationale:** Early mark lengths are ambiguous in isolation, Farnsworth gaps cannot share a universal dit unit, and immediate classification would permanently corrupt early raw text before the timing clusters are established.

**Consequences:** Initial text may appear after a short learning delay. Character and overall speed are distinct. Numeric confidence remains internal evidence while the UI uses qualitative labels until real-RF calibration. Unknown Morse remains visible as `?` with zero confidence.

## 2026-09-15 — M3 uses a windowed Goertzel bank and bounded pre-roll

**Decision:** Scan the configured audio band with a Hann-windowed Goertzel bank, rank local peaks with spectral and temporal evidence, then switch to the existing narrow detector using thresholds derived from the selected peak and noise floor. Retain up to three seconds of PCM only while acquiring or lost, and replay it after lock.

**Rationale:** The configured CW band is small enough for a deterministic Goertzel bank, which avoids a general FFT dependency and gives direct power at user-facing 10 Hz steps. Pre-roll lets acquisition wait for persistence without discarding the start of the raw message.

**Consequences:** Automatic mode tracks only a bounded neighborhood until sustained loss; manual mode never chases another peak. The scan cost is bounded by a 4096-sample window and configured bin count. Revisit with an FFT only if profiling or a materially wider band makes the bank too expensive.

## 2026-09-15 — M3 advanced before pending M2 hardware sign-off

**Decision:** Proceed with M3 implementation at the user's explicit direction while leaving the M2 hardware acceptance checkbox open.

**Rationale:** M3 acquisition can be implemented and measured deterministically through the same `PcmFrame` boundary without pretending that synthetic tests validate a physical microphone path.

**Consequences:** M2 and M3 code/automated acceptance can be complete while both live run records remain pending. Do not begin M4 until those run records are completed or another explicit sequencing decision is logged.

## 2026-09-14 — M2 streams bounded PCM into a fixed-guide core session

**Decision:** Use an outputless AudioWorklet only to frame mono PCM, then transfer bounded 512-sample blocks into a browser-free streaming core session. The M2 session uses explicit manual tone frequency, nominal WPM, and power threshold settings.

**Rationale:** This keeps permissions and Web Audio lifecycle at the edge, preserves the existing Goertzel/Morse implementation, avoids feedback, retains no microphone audio, and does not pull M3 tone acquisition or M4 adaptive timing into M2.

**Consequences:** UI updates are throttled independently of PCM processing; worklet messages include sample rate and monotonic sample position; discontinuities are visible. Hardware acceptance remains required because fake lifecycle tests and synthetic PCM cannot prove real browser/device capture behavior. Revisit detector placement only if profiling shows bounded main-thread messages are insufficient.

## 2026-09-14 — M1 establishes a deterministic clean-input oracle

**Decision:** Implement synthetic CW generation, known-frequency Goertzel detection, basic timing classification, and raw Morse decoding before microphone capture.

**Rationale:** A deterministic pipeline isolates audio/DSP/timing failures from browser capture and creates a permanent correctness baseline.

**Consequences:** M1 does not claim real-world robustness. The exact test `CQ CQ DE K6RHE` is protected from regression. M2 adds an input adapter rather than changing core semantics.

## 2026-09-14 — Basic transcription requires no backend/cloud/LLM

**Decision:** The microphone-to-raw-transcript path runs locally in browser TypeScript/Web Audio.

**Rationale:** Offline use, privacy, latency, reliability, and a direct fit for CW DSP.

**Consequences:** Any future network feature is optional, clearly disclosed, and cannot become a decoder dependency.

## 2026-09-14 — Ham context is an annotation layer, never an auto-corrector

**Decision:** Callsign/prosign/operating-language intelligence consumes raw text and evidence but never mutates it or feeds DSP.

**Rationale:** A plausible-looking “correction” is dangerous if it hides what the receiver actually decoded.

**Consequences:** UI, persistence, and exports represent raw text, user edits, and context proposals as distinct fields.

## 2026-09-14 — Goertzel first; acquisition scan later

**Decision:** M1/M2 use a known/manual narrow target frequency. M3 adds spectrum scan, lock quality, drift tracking, and manual selection.

**Rationale:** Goertzel is efficient and easy to validate when the target is known; automatic selection is a separate, measurable signal-acquisition problem.

**Consequences:** M2 exposes an explicit target setting and lock status rather than pretending it is automatic.

## 2026-09-14 — Separate character and spacing timing for Farnsworth

**Decision:** Adaptive timing will not force all silence gaps into one dit-duration model.

**Rationale:** Farnsworth uses normal element speed with expanded character/word spaces.

**Consequences:** M4 maintains distinct element and spacing estimates and documents both WPM concepts when relevant.
