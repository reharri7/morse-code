# Morse Learning module plan

Status: **M9–M11 and M13 complete; M12 software implementation complete with licensed recording validation pending**. The shared timeline, course/progression/persistence foundation, cancellable browser audio, learner routes, adaptive review, groups, words, simulated radio formats, free copy, local recording practice, live receiver-copy bridge, and straight-key fundamentals are implemented without changing the verified M1–M8 transcription baseline.

## Product intent

Morse Learning is a first-class, local-first part of the app, inspired by the quick listen/type/feedback loop of Monkey Morse without depending on Monkeytype code or services. The goal is to teach recognition of a character as an audible rhythm and then carry that skill into ordinary CW traffic.

The primary loop is:

```text
hear generated CW → type what was heard → immediate feedback
        ↑                                      ↓
        └──── next exercise from progress ─────┘
```

Training is **audio first**:

- Send new characters at normal character speed from the beginning. Default to 20 character WPM and 10 effective WPM.
- Use Farnsworth spacing to make the overall exercise slower; do not stretch individual dits and dahs into countable sounds.
- Do not show the letter, dots/dashes, waveform, or answer before a recognition attempt. Those are teaching/review aids shown during introduction or after feedback.
- Keep keyboard entry and replay fast enough that the user spends the session listening rather than operating controls.
- Treat accuracy, latency, and replay use as practice evidence, not as a public or judgmental score.

M9's MVP teaches receiving/copying. M13 adds a separate straight-key fundamentals mode using explicit keyboard/touch input and different feedback; physical key hardware, iambic behavior, and calibrated long-form analysis remain later work.

## Architectural invariant: one Morse language across every direction

Generation/training, keying feedback, and transcription must share the same canonical alphabet and timing representation. They must not grow separate character tables, punctuation rules, or interpretations of Farnsworth timing.

```text
                         core/morse (pure TypeScript)
                 ┌─────────────────────────────────────┐
text / exercise ─┤ alphabet → tokens → timed segments  ├─→ PCM or Web Audio tones
                 │                                     │
radio PCM ───────┤ detector → observed segments        ├─→ adaptive timing → raw text
                 └─────────────────────────────────────┘
                              shared contracts

keyboard / touch key → transient mark and gap durations → pattern + rhythm feedback

learning/domain (pure TypeScript)             transcription/application
  Koch order, exercise selection, scoring       acquisition, confidence, raw evidence
             │                                                │
             └──────── Angular routes and presentation ────────┘
```

Sharing does not mean making the receive decoder depend on a browser audio player or forcing generated ideal timing through the adaptive estimator. The shared seam is the alphabet, token/boundary model, timing profile, and segment representation. Each direction keeps its own composition:

- Training: known tokens + requested timing profile → exact timeline → scheduled tone/PCM.
- Transcription: observed tone/silence → estimated timeline/events → raw characters and confidence.
- Keying: explicit press/release times + requested character speed → recognizable pattern and rhythm evidence.

`generateSyntheticCw` remains the deterministic PCM adapter used by tests and verification, but should delegate alphabet lookup and timeline compilation to the shared core. The browser training player consumes the same compiled timeline and schedules it with Web Audio at the edge. The existing canonical `CQ CQ DE K6RHE` round trip must remain exact after the extraction.

## Proposed source layout and dependency rules

```text
src/app/
  core/morse/
    morse-table.ts                 canonical symbols (existing)
    morse-sequence.ts              text/symbols → tokens and boundaries
    morse-timing.ts                timing profile and timeline compiler
    morse-timeline.ts              framework-free segment contracts
    synthetic-cw.ts                timeline → deterministic PCM (existing, refactored)
    ...                            existing receive DSP/timing/decoder
  learning/
    domain/
      learning-model.ts            course, trial, result, stats contracts
      koch-course.ts               versioned character order/progression policy
      exercise-generator.ts        deterministic, seeded trial selection
      learning-score.ts            attempt aggregation and unlock decisions
    application/
      training-session.service.ts  session state machine/facade
      learning-progress.service.ts profile updates and derived progress
    infrastructure/
      morse-audio.service.ts       Web Audio scheduling/cancellation only
      learning-progress.store.ts   versioned local persistence adapter
    pages/
      learn-home/
      learn-setup/
      learn-session/
      learn-results/
      learn-progress/
    components/
      audio-controls/
      answer-input/
      character-progress/
  transcription/
    ...                            current operator screen, moved without semantic changes
```

Rules:

1. `core/morse` and `learning/domain` are framework-independent TypeScript. They import no Angular, DOM, Web Audio, storage, network, or transcription UI code.
2. There is one exported Morse catalog. Exercise code references symbol IDs from that catalog; it cannot define Morse strings.
3. The core timeline compiler owns 1/3-unit mark timing and standard/Farnsworth boundary calculations. Neither Angular services nor components calculate milliseconds.
4. `MorseAudioService` owns `AudioContext`, oscillator/gain scheduling, short attack/release envelopes, cancellation, and cleanup. It receives a timeline; it does not know Koch levels, answers, or mastery.
5. `TrainingSessionService` owns the active session state machine and orchestrates pure domain functions, audio, and progress. It never accesses `localStorage` directly.
6. `LearningProgressStore` is the only learning persistence adapter. Storage failure must not stop a practice session.
7. Training playback never opens the microphone. Live capture and generated playback remain separate resource owners, as they are for M8 acoustic verification.
8. Learning results never mutate, correct, or calibrate raw transcription. A later live-copy bridge may compare separately labeled values only.

## Shared Morse domain model

Names may change during implementation, but the responsibilities and serializable shapes should remain stable.

```ts
type MorseSymbolId = string; // canonical uppercase character for v1

interface MorseSymbolDefinition {
  readonly id: MorseSymbolId;
  readonly display: string;
  readonly pattern: string; // canonical dot/dash representation
  readonly category: 'letter' | 'number' | 'punctuation' | 'prosign';
}

type MorseToken =
  | { readonly kind: 'symbol'; readonly symbolId: MorseSymbolId }
  | { readonly kind: 'character-boundary' }
  | { readonly kind: 'word-boundary' };

interface MorseTimingProfile {
  readonly characterWpm: number;
  readonly effectiveWpm: number;
  readonly toneFrequencyHz: number;
}

interface MorseTimelineSegment {
  readonly kind: 'tone' | 'silence';
  readonly durationMs: number;
  readonly role: 'dit' | 'dah' | 'intra-character' | 'character-gap' | 'word-gap';
  readonly symbolIndex: number | null;
}
```

Validation requirements:

- `characterWpm` and `effectiveWpm` are finite and positive; MVP UI bounds are 12–40 character WPM and 5 WPM through the selected character WPM for effective speed.
- `effectiveWpm` cannot exceed `characterWpm` in a Farnsworth profile.
- Tone frequency is bounded to a comfortable documented UI range, initially 300–1,000 Hz with 600 Hz default.
- Standard timing uses one-unit dits/intra-character gaps, three-unit dahs/character gaps, and seven-unit word gaps.
- Farnsworth preserves element and intra-character durations at `characterWpm` and expands only character/word boundary time to reach the requested effective speed. For the standard PARIS word, `elementDitMs = 1200 / characterWpm`, `targetWordMs = 60000 / effectiveWpm`, and `spacingUnitMs = (targetWordMs - 31 * elementDitMs) / 19`; character and word gaps use 3 and 7 spacing units. Reject a profile when that budget cannot preserve standard-or-longer boundaries. Compute in floating milliseconds and round only in the final renderer; the formula and renderer tolerance receive exact tests.
- Timeline duration is authoritative. Audio adapters may convert it to samples or audio-clock times but may not reinterpret units.

The current `SyntheticCwOptions.wordsPerMinute` and `spacingWordsPerMinute` API must remain output-compatible. Today `spacingWordsPerMinute` directly sets the boundary-unit duration (`1200 / spacingWordsPerMinute`); it is not the resulting PARIS effective speed. During M9A the compatibility wrapper converts that boundary unit to its derived effective WPM before calling the shared compiler, preserving existing samples and the 20/8 fixture. New learning UI and domain code use true `effectiveWpm`. Removing or silently redefining the legacy option is not part of MVP.

## Learning domain model

### Versioned course

```ts
interface KochCourse {
  readonly id: 'international-receive';
  readonly version: 1;
  readonly symbolOrder: readonly MorseSymbolId[];
  readonly initialSymbolCount: 2;
}
```

The v1 course order is `K M U R E S N A P T L W I J Z F O Y V G 5 Q 9 2 H 3 8 B 4 7 C 1 D 6 0 X`. It covers all letters and numbers, begins with K/M, and is checked into `koch-course.ts`; it must never depend on object-key order. Punctuation and prosigns remain outside the M9 progression even though the shared catalog can encode them. Changing the order after release creates a new course version and a deliberate progress migration rather than silently reinterpreting a learner's level.

### Session and trial

```ts
type TrainingSessionState =
  | 'idle' | 'preparing' | 'playing' | 'awaiting-answer'
  | 'showing-feedback' | 'paused' | 'complete' | 'error';

interface TrainingSettings {
  readonly characterWpm: number;       // default 20
  readonly effectiveWpm: number;       // default 10
  readonly toneFrequencyHz: number;    // default 600
  readonly sessionLength: 20 | 40 | 60; // scored trials; default 40
}

interface RecognitionTrial {
  readonly id: string;
  readonly ordinal: number;
  readonly expectedSymbolId: MorseSymbolId;
  readonly timeline: readonly MorseTimelineSegment[];
}

interface RecognitionAttempt {
  readonly trialId: string;
  readonly expectedSymbolId: MorseSymbolId;
  readonly enteredSymbolId: MorseSymbolId | null;
  readonly correct: boolean;
  readonly replayCount: number;
  readonly recognitionLatencyMs: number | null;
  readonly answeredAt: string;
}
```

Latency begins when scheduled playback finishes and ends on the first committed answer. Paused/background time is excluded. An attempt after replay is valid practice evidence but is marked assisted; MVP unlock calculations use unassisted attempts so repeated playback cannot accidentally inflate mastery. Escape/pause and abandoned trials do not count as incorrect answers.

### Persistent progress

```ts
interface CharacterStatistics {
  readonly symbolId: MorseSymbolId;
  readonly attempts: number;
  readonly correct: number;
  readonly unassistedAttempts: number;
  readonly unassistedCorrect: number;
  readonly replayCount: number;
  readonly latencyTotalMs: number;
  readonly latencySampleCount: number;
  readonly rollingUnassistedResults: readonly boolean[]; // capped at 50
  readonly lastPracticedAt: string | null;
}

interface LearningSessionSummary {
  readonly id: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly courseId: string;
  readonly courseVersion: number;
  readonly level: number;
  readonly settings: TrainingSettings;
  readonly attempts: number;
  readonly correct: number;
  readonly unassistedAccuracy: number | null;
  readonly meanRecognitionLatencyMs: number | null;
  readonly introducedSymbolId: MorseSymbolId | null;
}

interface RecentUnassistedAttempt {
  readonly symbolId: MorseSymbolId;
  readonly correct: boolean;
  readonly answeredAt: string;
}

interface LearnerProfileV1 {
  readonly schemaVersion: 1;
  readonly courseId: string;
  readonly courseVersion: number;
  readonly currentSymbolCount: number;
  readonly settings: TrainingSettings;
  readonly characters: Readonly<Record<MorseSymbolId, CharacterStatistics>>;
  readonly recentUnassistedAttempts: readonly RecentUnassistedAttempt[]; // capped at 200
  readonly recentSessions: readonly LearningSessionSummary[]; // capped at 100
  readonly updatedAt: string;
}
```

Persist under a separate key, `cw-transcriber.learning.v1`, so transcript/session retention and learning migrations are independent. Do not store PCM, generated buffers, per-key timing traces, or abandoned in-progress trials. Normalize all loaded data, cap arrays/counters, ignore unknown character IDs, recover safely from corrupt JSON, and report quota/security failure without losing the in-memory session.

Accuracy and mean latency are derived for display. Do not persist a floating “mastery score” whose definition may change. Later adaptive algorithms can derive mastery from versioned raw aggregates.

## MVP training algorithm

The algorithm must be deterministic with an injected seeded random source and clock in tests.

1. Start with the first two symbols in the versioned course. `currentSymbolCount` never drops automatically.
2. Build the active pool from the first `currentSymbolCount` symbols.
3. Give the newest symbol twice the base selection weight until it has eight unassisted attempts. All other MVP symbols have equal weight. Avoid an immediate repeat when the pool has more than one symbol. This is exposure balancing, not the later weak-character adaptation.
4. Compile one symbol into the shared Morse timeline using the current character/effective speed and play it without displaying the answer. Allow replay while awaiting an answer; each replay marks the eventual attempt as assisted.
5. When playback ends, accept one supported keyboard character. Show correct/incorrect feedback immediately and reveal the character and dot/dash representation. A post-answer sound comparison is unscored. Do not advance from an empty answer.
6. Record correctness, replay use, and recognition latency, update the per-character aggregate, then continue after a short user-adjustable-or-accessible feedback interval. MVP may use an explicit **Next** action for reduced-motion or screen-reader stability.
7. At the end of a session, evaluate an unlock against the most recent unassisted results across the active set:
   - at least 40 unassisted attempts across the active set;
   - at least 90% aggregate unassisted accuracy in that window;
   - at least eight unassisted attempts and 85% accuracy for the newest symbol.
8. If all conditions pass and the course has another symbol, unlock exactly one symbol. Apply the unlock after showing results, persist it, and introduce the new sound at the start of the next session. Never unlock multiple characters from one session and never roll a learner backward.

The setup screen allows manual review of any already-unlocked level. Review does not reduce permanent progress. A developer/test seed may reproduce a trial sequence but is not a user-facing MVP setting.

### Later adaptive selection

M10 replaces equal weighting with a bounded weak-character policy. A candidate weight may combine recent error rate, slower relative latency, recency, and confusion pairs, but must retain a minimum probability for every active character and a maximum share for any one character. The policy must be versioned, deterministic in tests, and explainable in results (“More N because recent accuracy is lower”), not presented as AI.

## Angular boundaries

| Unit | Owns | Does not own |
| --- | --- | --- |
| `MorseAudioService` | Lazy `AudioContext`, oscillator/gain scheduling, envelope, completion/cancel signal, cleanup | Morse lookup, trial choice, scoring, persistence |
| `TrainingSessionService` | Session state machine, current trial, answer/replay/pause/next commands, orchestration | `localStorage`, timing math, component rendering |
| `LearningProgressService` | In-memory profile, aggregate updates, unlock evaluation, derived selectors | Browser audio, route navigation, DOM |
| `LearningProgressStore` | Schema-v1 load/save/normalization/migration and non-fatal storage errors | Unlock policy, UI state, transcript records |
| `Learn*Page` components | Route-level presentation, keyboard/focus handling, accessible announcements | Domain calculations, direct audio/storage access |
| Existing transcription facade/component | Microphone acquisition and raw receive UI | Training answers or mastery |

Prefer Angular signals or read-only observables from the services; expose commands rather than making mutable service state public. Components must be testable with fake audio, clock, random source, and progress store. Route destruction, navigation, pause, and browser visibility changes must cancel scheduled audio and leave the session in a resumable state.

## Routes and screens

Introduce Angular Router while preserving the existing transcription behavior:

| Route | Screen | Required behavior |
| --- | --- | --- |
| `/` | Redirect | Redirect to `/transcribe`; no change to the app's current primary purpose. |
| `/transcribe` | Transcription | Current M6–M8 operator, verification, context, save/export, and install UI moved without semantic changes. |
| `/learn` | Learning home | Continue/new-session action, unlocked characters, recent accuracy, speed summary, links to setup/progress. |
| `/learn/setup` | Session setup | Character/effective WPM, tone, length, unlocked-level review, and a short sound check. Enforce effective ≤ character WPM. |
| `/learn/session` | Hear and type | Dominant audio/answer loop, replay/pause/exit, progress count, immediate accessible feedback. Guard or redirect when no configured session exists. |
| `/learn/results` | Results | Accuracy, unassisted accuracy, average latency, replay count, per-character summary, and a clearly announced unlock. |
| `/learn/progress` | Progress | Course order, locked/unlocked state, per-character attempts/accuracy/latency, and local-data reset action. |

A persistent top-level **Transcribe / Learn** navigation makes the two first-class modes clear. Do not nest the trainer below verification. The session screen suppresses unrelated cards and live diagnostics so attention stays on listening.

Screen requirements:

- The initial character-introduction view may show the letter and dot/dash representation while playing it repeatedly. Recognition trials hide both until feedback.
- Space/Enter replays only when focus is not in another control; printable supported keys answer; Escape pauses. Touch users get an answer field with an explicit submit path.
- Audio state, correctness, and unlocks have text announcements and do not rely on color, pitch animation, or motion alone.
- A first-run sound check explains that practice audio uses speakers/headphones and does not request microphone permission.
- Leaving an active session asks only when scored work would be discarded; completed attempts already aggregated in memory may be persisted on orderly exit.
- Resetting learning data is explicit, scoped only to the learning key, and requires confirmation. It never deletes transcription sessions/settings.

## Phased implementation plan

### M9 — Learning MVP

#### M9A — Shared representation and timing engine

- [x] Add token/timeline/timing-profile contracts to `core/morse` and make the canonical Morse table expose validated symbol definitions.
- [x] Implement standard and Farnsworth timeline compilation as pure TypeScript.
- [x] Refactor `generateSyntheticCw` to render the shared timeline while keeping its public options and deterministic output contract compatible.
- [x] Protect every supported symbol, boundary timing, and the existing M1/M4/M8 decode and WAV gates with tests.

Acceptance criteria:

- Every supported catalog character round-trips through encode/timeline/PCM/decode in deterministic tests where the receive gate supports it.
- At 20 character WPM, dit/dah/intra-character timing remains 1/3/1 at the 20 WPM unit; a 10 effective WPM profile changes only character and word boundaries and has the expected PARIS duration within the documented rounding tolerance.
- The exact `CQ CQ DE K6RHE` oracle, adaptive Farnsworth fixture, RF benchmark, verification fixtures, and portable WAV round trip remain green.
- No new core file imports Angular, DOM, Web Audio, storage, or network APIs.

Implemented 2026-09-24: all four tasks and acceptance criteria pass. The seven new focused tests plus the existing suite total 64 passing ChromeHeadless tests; the RF benchmark, production build, and cache-v4 offline gate also pass. Browser audio remains correctly deferred to M9C.

#### M9B — Course, scoring, and persistence

- [x] Check in `international-receive` course v1 and pure progression/exercise/scoring functions.
- [x] Add profile/stat/session contracts, schema-v1 normalization, bounded local store, and migration hooks.
- [x] Unit-test seeded selection, newest-character exposure, replay treatment, every unlock boundary, final-course behavior, corruption, quota failure, and independent reset.

Acceptance criteria:

- The course always starts with exactly two symbols and a single passing evaluation unlocks at most one next symbol.
- 39 eligible attempts, 89% aggregate accuracy, fewer than eight newest-symbol attempts, or less than 85% newest-symbol accuracy cannot unlock; the documented passing boundary does.
- Refresh restores settings, level, and per-character aggregates exactly. Corrupt/unsupported storage falls back safely and storage failure leaves the current session usable.
- Learning reset removes only learning data; saved transcription sessions and operator settings remain unchanged.

Implemented 2026-09-25: all M9B tasks and acceptance criteria pass. Twenty-three focused tests cover the fixed course, deterministic/no-repeat generation, underexposed-newest weighting, assisted-attempt handling, rolling caps, each unlock failure boundary, the exact passing boundary, one-step/final-course behavior, session caps, exact persistence, schema-0 migration, corrupt/unsupported input, quota failure, and learning-only reset. The full suite now has 87 passing ChromeHeadless tests; the RF benchmark, production build, and cache-v4 offline gate also pass.

#### M9C — Browser audio and session orchestration

- [x] Implement `MorseAudioService` with an injected/fakeable audio environment and explicit prepare/play/cancel/dispose lifecycle.
- [x] Implement the training session state machine, answer validation, replay/assisted flags, latency timing, pause/resume, completion, and persistence handoff.
- [x] Add service tests for rapid replay, double answer, navigation/cancel, visibility pause, audio start failure, and two consecutive sessions.

Acceptance criteria:

- One user action unlocks/resumes browser audio; a trial schedules the shared timeline once and signals completion without opening a microphone.
- Replay cancels the previous schedule before starting another. Route exit and service disposal leave no live oscillator, gain node, timer, or `AudioContext` owned by the session.
- Only the first valid committed answer scores a trial. Time before playback completion and paused/background time never enters recognition latency.
- Audio failure produces a recoverable, plain-language state and does not record an incorrect attempt.

Implemented 2026-09-25: all M9C tasks and acceptance criteria pass. `MorseAudioService` renders the M9A timeline with a lazily prepared/resumed `AudioContext`, one oscillator/gain pair, a short gain envelope, cancellation, abort handling, and explicit context disposal. `TrainingSessionService` composes the M9B course, generator, scoring, store, and a fakeable audio/clock boundary into preparing, playing, awaiting-answer, feedback, paused, complete, and recoverable-error states. Eleven focused tests cover exact shared-timeline scheduling, prepare/resume, rapid replay cancellation, abort/disposal cleanup, first-valid/double answers, post-playback latency, assisted replay, background pause/resume, audio and storage failure, two sessions with unlock evaluation, exit, and disposal. The full suite now has 98 passing ChromeHeadless tests; the unchanged RF benchmark, production build, and cache-v4 offline gate also pass. M9D remains responsible for routes and learner-facing screens.

#### M9D — Routes and audio-first screens

- [x] Introduce the router and move the current screen to `/transcribe` without changing decoder behavior.
- [x] Build learning home, setup, session, results, and progress routes plus first-run character introduction.
- [x] Add keyboard/touch interaction, focus management, screen-reader announcements, reduced-motion behavior, and responsive layouts.
- [x] Add top-level Transcribe/Learn navigation and update service-worker/offline coverage for route navigation and learning assets.

Acceptance criteria:

- Existing transcription, verification, context, persistence, export, install, and offline tests still pass at `/transcribe`.
- A first-time offline user can hear K/M at 20/10 WPM, complete a 40-trial hear-and-type session, receive immediate accessible feedback, reload, and see preserved per-character statistics.
- During a scored trial the answer and dot/dash pattern are not present visually or in prematurely announced accessibility text; they appear after answer/reveal.
- Desktop keyboard and narrow touch flows work without horizontal scrolling. Correct/incorrect/replay/unlock states are understandable without color or animation.
- Direct navigation and refresh work for all routes in the production service-worker build.

Implemented 2026-09-25: all M9D tasks and acceptance criteria pass at the route/presentation layer. The existing operator UI and tests moved intact to `/transcribe`; `/learn` now provides home, setup, active hear-and-type practice, results, and persistent per-character progress. Setup includes local sound introduction, 20/10 WPM defaults, and independent speed/pitch/session controls. Recognition screens keep the answer and dot/dash pattern out of visual and accessibility content until feedback, accept direct keyboard or labeled touch/form input, announce transitions, and cancel playback on background/route exit. Seven new tests bring the suite to 105 passing ChromeHeadless tests. The RF benchmark and warning-free production build pass; cache v5 plus the browser offline gate prove both products and saved data after the server stops. Default practice audio and desktop 1440×1000/narrow 390×844 layouts were manually exercised without horizontal overflow.

#### M9E — MVP release gate

- [x] Run all unit/component tests, RF benchmark, production build, and offline browser gate.
- [x] Verify 12, 20, and 40 character WPM with standard and Farnsworth spacing, plus desktop and narrow layouts.
- [x] Record browser audio lifecycle, keyboard, touch, screen-reader, and persistent reload results.
- [x] Update roadmap/status/decision docs with measured outcomes; do not mark M9 complete from plan-only work.

Acceptance criteria:

- All M1–M8 automated gates remain green and no microphone permission is requested anywhere in the learning flow.
- The same compiled timeline produces matching segment durations in deterministic PCM and browser-audio adapter tests.
- Two consecutive sessions, mid-session pause/resume, route exit, refresh, storage failure, and offline restart have no stale playback or lost completed statistics.

Implemented 2026-09-25: M9E and the full M9 MVP acceptance gate pass. The release audit added a pure recognition-prompt adapter that appends the shared compiler's character boundary, making effective WPM real for isolated hear-and-type trials without changing character rhythm. Standard/Farnsworth profiles at 12, 20, and 40 character WPM are protected. The complete suite has 112 passing ChromeHeadless tests; the RF benchmark, warning-free production build, and cache-v5 server-offline route gate pass. Prior M9 tests cover two sessions, pause/resume, route exit, storage failure, persistence, keyboard/form interaction, answer hiding, and resource cleanup; desktop and narrow layouts plus default audio were manually exercised.

Keyboard-flow follow-up 2026-10-02: the auto-focused one-character field now submits as soon as it receives a valid letter or number, removing the inconsistent extra Check click that applied only while the field held focus. The feedback screen retains its visible Next action and also accepts Enter or Space, so a practice loop can stay entirely on the keyboard without an automatic timer. The focused type → feedback → advance path is protected by a route-level browser test and was manually exercised at the default 20/10 WPM settings. Cache v7 delivers the change to installed copies. All 150 ChromeHeadless tests, the warning-free 454.68 kB production build, and the direct server-offline route gate pass.

Practice-hub follow-up 2026-10-05: `/learn` is now a compact launcher instead of a sequence of promotional panels. It uses stored course/speed/session defaults for a one-action character drill, resumes an interrupted drill from the same primary control, exposes settings and progress beside it, and keeps the full character set in optional detail. A two-column/one-column mode menu lists groups, words, callsigns, contest copy, QSO, free copy/recordings, and sending. Group/word/radio selections pass an explicit route-start flag so playback begins from the originating click; free copy retains its short start screen because its generated and local-recording paths share that page. Results restart immediately while preserving an Adjust settings path. The home route is lazy-loaded, cache v19 includes it for offline entry, and three route checks protect direct start and restart behavior. All 164 tests, the warning-free 484.12 kB production build, and the offline gate pass.

### M10 — Practice breadth and adaptive review — complete

- [x] Add random groups using only unlocked characters, with configurable group length and explicit character/word gaps.
- [x] Add words filtered to the unlocked alphabet; version and license the local word list.
- [x] Track bounded confusion pairs and rolling latency distributions.
- [x] Add explainable weak-character weighting with minimum/maximum exposure bounds.
- [x] Let users choose focused review without changing permanent Koch progress.

Acceptance: seeded sessions are reproducible; content never contains a locked symbol; adaptive selection measurably raises weak-symbol exposure without starving any active symbol; result explanations match the actual weighting inputs.

Implemented 2026-09-25: `practice-content.ts` and the CC0-v1 local corpus provide deterministic unlocked-only group/word content; `adaptive-selection.ts` exposes policy-v1 weights and reasons; learning statistics/store normalization cap latency and confusion evidence; ordinary sessions opt into the adaptive policy; setup offers earlier-level review that cannot mutate permanent progress. `CopyPracticeService` and `/learn/copy` add answer-hidden, cancellable, scored group/word sessions using the same timing and browser-audio boundaries as character practice. A bounded alignment converts substitutions/deletions into per-character evidence and persists once per completed answer. Seventeen tests added across the M10 increment bring the suite to 129 passing tests; the RF benchmark, warning-free build, and offline gate pass. All M10 acceptance criteria are met.

### M11 — Amateur-radio practice — complete

- [x] Generate syntactically plausible, locally sourced callsigns using unlocked letters/numbers and region-neutral templates; label them as simulated, not assigned or validated callsigns.
- [x] Add common CW vocabulary, prosigns, signal reports, and contest-style groups with explicit display/token conventions.
- [x] Add scripted simulated QSOs such as CQ/call, RST, name, QTH, and sign-off exchanges.
- [x] Score typed copy separately from explanatory ham-context annotations; hints never rewrite the user's answer.

Acceptance: every generated answer is reproducible from its seed, representable by the shared catalog, and visible in a post-session transcript; QSO state transitions are deterministic; no network or callsign authority is implied.

Implemented 2026-09-25: versioned pure generators, explicit procedural-signal display mapping, a cancellable scored service, and `/learn/radio` cover callsign, contest, and six-turn QSO practice. Locked content is withheld honestly, truth/explanations appear only after an answer, and the completed transcript keeps expected copy, entered copy, and explanation separate. All acceptance criteria pass in focused and full-suite tests.

### M12 — Free copy and live-radio bridge — implementation complete; licensed recording validation pending

- [x] Add generated free-copy sessions for longer text with live typing, pause/resume, and post-session alignment.
- [x] Add a live-copy workspace that can run beside the existing receive pipeline without feeding user answers or context corrections into DSP.
- [x] Compare user copy, immutable raw decoder output, and optional expected/reference text as three separately labeled values.
- [x] Use receive confidence/timing evidence to explain difficult passages after the attempt, not to reveal answers during it.
- [x] Evaluate optional import of licensed/consented real-radio practice recordings using the existing bounded file adapter and privacy rules.

Acceptance: free-copy playback remains bounded and cancellable; live-copy preserves raw decoder truth; no score treats the decoder's uncertain output as guaranteed ground truth; microphone/audio ownership prevents feedback and resource conflicts; recordings remain local and PCM is not persisted without an explicit future decision.

Implemented 2026-09-25: generated passages use unlocked local words and the shared timeline/audio service; pause cancels playback and resume restarts explicitly without losing typed copy. The receiver-side live-copy component owns text only, hides answer-bearing decoder/context/timeline surfaces during the attempt, and reveals evidence afterward. Optional local recordings are rights-confirmed, bounded, decoded in memory, played from a revoked object URL, and compared without treating raw decode as truth. Cache v6 recursively discovers nested lazy chunks and serves hashed assets cache-first, allowing direct offline reload of the split free-copy and transcription routes. The software gate passes 149 tests, the RF benchmark, warning-free build, offline route gate, and narrow visual review. A user-supplied licensed/consented over-the-air file is still required for the final content-validation run.

### M13 — Straight-key sending fundamentals — complete

- [x] Offer every unlocked Koch character as a visible sending target with ideal timing playback.
- [x] Capture Space or press-and-hold pointer marks and play a local sidetone without microphone access.
- [x] Classify dits/dahs and intra-character gaps in pure TypeScript at the selected character WPM.
- [x] Report the sent pattern, decoded/unknown character, pattern correctness, and rhythm score as separate evidence.
- [x] Release the sidetone on key-up, pointer cancellation, route exit, and disposal; suppress a delayed tone when the user releases before audio startup finishes.
- [x] Keep detailed timing traces transient and do not use sending attempts to unlock receive characters.

Acceptance: at 20 WPM, the deterministic 180/60/180 ms marks with 60 ms internal gaps pass as K at 100%; a mistyped sequence reports the character it resembles; recognizable but badly timed sending does not pass as clean. The route supports keyboard and touch controls, survives unavailable audio with visual timing feedback, and is available from a direct offline reload.

Implemented 2026-10-04: `keying-analysis.ts` provides deterministic browser-free scoring, `keying-sidetone.service.ts` owns the press-and-hold Web Audio edge, and the lazy `/learn/keying` route provides the learner surface. Six new checks bring the full suite to 157 passing tests; the RF benchmark, warning-free 476.07 kB initial production build, and cache-v12 direct offline keying route gate pass.

Keying interaction follow-up (2026-10-04): each release schedules automatic feedback after the standard three-dit character gap at the selected speed. The next mark cancels that check. After feedback, keying begins a fresh attempt without clicking Try again. Finish now remains an optional fallback. Clear, settings changes, and route exit cancel the timer; the injected scheduler keeps the route acceptance deterministic.

### M14 — USB keyboard paddle practice

Automatic-loop revision (2026-10-05): armed paddle practice no longer depends on feedback actions at the bottom of the modal. A passed attempt remains visible for 1.2 seconds, then advances to the next unlocked character automatically. A valid paddle press during the feedback pause advances immediately and is consumed so it cannot accidentally become the first mark of a target the learner had not yet seen. A failed attempt remains on the current character; the next paddle press clears the old trace/feedback and starts the retry. Manual Try again and Next character actions remain available for deliberate control. Automatic-advance timers are cancelled by clearing, settings changes, stopping, focus loss, and route disposal. A focused route test covers timed K→M progression, bringing the suite to 165 tests. The warning-free 487.12 kB initial build and cache-v21 offline gate pass; physical paddle acceptance remains open.

In-modal controls revision (2026-10-05): armed paddle practice no longer requires closing the dialog to change the target or continue. The modal includes unlocked-character and speed selectors, Hear target, Finish now, Clear, Try again, and Next character. Explicitly marked modal controls are excluded from the otherwise page-wide mouse-contact capture; using them stops any scheduled element/attempt as appropriate but keeps the paddle armed and the modal open. Next character becomes the primary feedback action after a clean result, while Try again is primary after an unsuccessful result. The route acceptance proves K→M progression with cleared feedback in the still-open dialog. All 164 tests, the warning-free 486.70 kB production build, cache-v20 offline gate, and desktop/390×844 modal checks pass.

Focused-modal revision (2026-10-05): at the user's direction, wrap setup and active practice in a native `dialog.showModal()` presentation. The background is inert and focus remains in the dialog. Setup advances straight into practice after confirmed distinct contacts; Start reopens practice with the current mapping. One shared template renders target, marks, and feedback either in the modal or on the ordinary straight-key page, avoiding duplicate active readouts. Close/Escape stop capture/audio and restore the launching focus. Backgrounding/navigation also close/dispose it. Mouse capture and scrolling protection remain; no Pointer Lock or OS-level grab is introduced. This supersedes the page-only armed presentation below. Physical paddle acceptance remains open.

Modal acceptance: 161 browser tests, a warning-free production build, and cache-v18 offline routes pass. Manual desktop and 390×844 checks verify setup-to-practice transition, right-click dah with automatic T feedback, inactive background, contained target/readouts, and Escape/Close recovery. At 390×844 the feedback dialog has no internal vertical or horizontal overflow (754 px content/client height; 350 px content/client width). Actual hardware/sidetone validation remains pending.

Armed interaction revision (2026-10-05, supersedes safe-area instructions below): choose Set up paddle and press/release both sides anywhere on the page, then Start paddle practice. During setup/armed practice, capture-phase input blocks ordinary clicks and context menus; non-passive wheel/touch listeners and scrolling-key prevention keep the page still. The Stop control remains usable. Escape/Stop, focus/background loss, pointer cancellation, and navigation stop the keyer; route disposal removes every manually registered listener. Once stopped, normal mouse actions and scrolling resume. Input remains browser-page-scoped, not an OS-wide mouse grab, and cannot distinguish paddle events from a normal mouse. Traces, pure keyer, raw decoding, and listening progress remain unchanged.

Release verification: 161 ChromeHeadless tests pass, the production build is warning-free (476.07 kB initial), and cache-v17 server-offline route checks pass. Manual browser checks captured contacts over the page heading, generated a dah over the back link without navigation or a context menu, kept scrollY at zero after a scroll attempt, and restored controls via both Escape and Stop. Physical paddle/sidetone acceptance remains pending.

Mouse-contact extension (2026-10-05): the user's device reports left/right clicks. The unified USB paddle option now captures mouse contacts in a labeled practice area, using the same confirmed-release setup, swapping, timing, and feedback as keyboard contacts. Keep the pointer inside this area for setup and practice; page controls are not paddle inputs. Mouse releases are handled across the window, and right-click menus are suppressed only inside the area. Pointer cancellation stops the keyer. Browser verification mapped left/right and generated a dah with automatic T feedback without opening a menu; the 160-test suite, warning-free production build, and cache-v16 server-offline route gate pass. Real device/sidetone validation is still pending.

The keying input selector adds USB keyboard paddle / Iambic A. Set up paddle captures and confirms release of the dit contact, then the distinct dah contact. Swap sides changes handedness. The pure `paddle-keyer.ts` chooses repeated or alternating elements; the browser scheduler supplies one/three dit mark lengths and one dit internal spacing. Release finishes the current element. Generated mark traces feed existing automatic character feedback. Since the keyer supplies element lengths, rhythm feedback in this mode describes generated timing and user spacing, not manual dit/dah weighting skill.

Mappings are transient. Keyboard events have no device identity, so any keyboard key matching the learned code operates the paddle while this route is focused. Clear, settings changes, focus/background loss, and route exit cancel timers and sound. Hardware acceptance requires the user to confirm distinct codes/releases, repeat both sides, squeeze, release mid-element, and disconnect/focus-loss behavior. The software suite passes 159 tests; physical acceptance remains pending.

Verification: the warning-free production build is 476.07 kB initially; cache-v15 server-offline route checks pass. Browser verification captured two distinct keyboard contacts, generated a dot, and displayed automatic E feedback without Finish now. This verifies the keyboard pathway, not the physical YUEHISY device or audible sidetone.

## Test strategy

### Pure domain tests

- Catalog uniqueness and reversible lookup for every supported symbol.
- Exact standard/Farnsworth timelines, validation errors, floating/rounding bounds, empty/unsupported input, and word boundaries.
- Versioned course order, seeded selection distributions, no-repeat behavior, answer normalization, rolling-window caps, and unlock thresholds.
- Aggregate accuracy/latency/replay math, null latency behavior, final-level behavior, and profile normalization.

### Angular and adapter tests

- Fake audio clock asserts schedules and cleanup without relying on real sound hardware.
- Session-service transition table covers every command from every relevant state.
- Route/component tests cover first run, introduction, hidden answer, correct/incorrect, replay, pause, results, unlock, refresh, storage failure, and reset scope.
- Existing microphone and acoustic-verification tests prove learning playback cannot claim their active resources.

### End-to-end/manual checks

- Production routes and direct refresh while online and server-offline.
- Audible distinction and comfortable envelope at low/high supported speed and pitch.
- Keyboard-only, touch/narrow, reduced motion, and a screen-reader pass.
- Browser autoplay recovery, tab background/foreground, rapid route change, and repeated sessions.

## Observability and privacy

All learning is local in M9–M13 unless a later explicit decision says otherwise. No account, analytics endpoint, cloud model, or network content source is required. Useful development diagnostics are session state, scheduled duration, cancellation reason, and storage status—not PCM or full key-event traces. User-facing exports may be considered later, but an MVP profile stays browser-local and resettable.

## Deferred decisions

- Any proposed change to the documented v1 Koch order must create a new course version and an explicit migration decision.
- Whether interrupted sessions persist trial-by-trial or only on orderly exit should be chosen with a write-frequency/quota test; completed aggregate correctness must never be fabricated after a crash.
- Localization, expanded prosign input, cloud sync, accounts, achievements, and competitive leaderboards remain outside the implemented roadmap.
- Physical paddle/serial-key input, iambic behavior, calibration, and persistent long-form sending metrics need a separate proposal. They must reuse the shared timeline vocabulary and cannot block receive learning.
