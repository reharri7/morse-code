# M8 verification and calibration plan

Status: M8A and M8B code implemented on 2026-09-16; physical MacBook calibration and final acceptance remain open.

## M8A implementation record — 2026-09-16

- `src/app/verification/` now contains versioned case/result contracts, production-path PCM runs, shared stage diagnosis, bounded file decoding, WAV encode/decode, PCM-free report formatting, and the Angular result experience.
- `cw-benchmark.ts` exports the one unnormalized raw comparison/alignment used by both M5 and M8; context and edited text are not inputs.
- `clean-15-v2`, `clean-25-v2`, `weak-noisy-18-v1`, `drift-20-v1`, and `two-tone-v1` reproduce exact raw results. The 25 WPM case records its 64-sample detector frame setting; other cases retain 128 samples.
- WAV import is guaranteed for uncompressed PCM and 32-bit float. Other audio formats use browser decoding and are described as browser-dependent. The adapter caps files at 25 MB/five minutes and closes its decoding context.
- The generated mono 16-bit `clean-15-v2` WAV round trip decodes exactly. Reports contain case/version, source, browser string, ordered stages, raw expected/actual, metrics, and decoder observations, never PCM.
- Fifty ChromeHeadless tests, the unchanged M5 benchmark, and the production build pass. The cache-v3 browser gate reloads after its server stops and passes the quick verification offline while retaining saved M7 data/settings.

## M8B implementation record — 2026-09-16

- `acoustic-verification.ts` owns the guided controller and streams microphone frames directly into a fresh `StreamingVerificationRun` for each repetition. It never retains a recording or assumes playback/capture clocks align.
- `acoustic-playback.ts` is the only speaker-output adapter. It prepares an `AudioContext` during the explicit start gesture, plays only the level tone and known test phrase, and closes every source/context on completion or cancellation. Live transcription remains outputless.
- The workflow blocks concurrent live capture, collects room noise for two seconds, labels the level check as too quiet/usable/clipping, counts down, plays three repetitions with gaps, shows every raw result, and uses the planned two-of-three at 10% CER threshold only as visibly provisional.
- Automated lifecycle coverage includes permission denial, playback failure, device loss, cancellation, concurrent-start rejection, navigation cleanup, and two full consecutive runs. Aggregate reports include all stages/repetitions and no PCM.
- Fifty-seven ChromeHeadless tests, the unchanged M5 benchmark, the production build, and the cache-v4 server-offline gate pass. The offline run renders both verification layers and passes the quick test after its server stops. The physical volume/position matrix below remains required before replacing the provisional threshold or checking final acceptance.

## Goal

Make it easy for a new CW user to prove which parts of the app work without holding a phone beside the MacBook microphone and guessing whether a poor result came from the recording, speaker, room, microphone, tone lock, timing, or decoder.

M8 uses layered verification. Passing one layer proves only that layer and the layers below it:

1. **Quick decoder test:** generated audio enters the production acquisition and decode path directly. This proves the software path without a microphone.
2. **Audio-file test:** a user-selected recording enters the same PCM path. This proves file decoding and the decoder without room acoustics or microphone permission.
3. **Portable test clip:** the app creates a known WAV file that can be re-imported or played on another device.
4. **Guided microphone test:** the Mac plays a known message through its speakers while the selected microphone records it. This exercises the physical acoustic path.
5. **Real-radio listening:** remains field validation. M8 must not imply that a synthetic or speaker test proves universal over-the-air accuracy.

## Product shape

Add a clearly named **Verify the app** area to the existing single-page interface. Present three choices in beginner-friendly language:

- **Quick self-test — recommended:** one click, no microphone permission.
- **Test an audio file:** select a known CW recording and optionally enter the expected text.
- **Test microphone and speakers:** a guided test with a countdown, safe playback guidance, and a stage-by-stage result.

Keep advanced measurements available behind details, but lead with plain results such as “Audio was heard,” “Tone was found,” “Timing was steady,” and “Text matched.” Each choice must also say what it does and does not prove.

## Non-negotiable boundaries

- Verification stays local. No file, PCM, result, or transcript is uploaded.
- Every source feeds the same production `PcmFrame` acquisition/decoder path. Test adapters may supply PCM but may not define Morse meaning or bypass the production decoder.
- Expected text is compared with the immutable raw decode. Context annotations and the edited transcript are never used to improve a verification score.
- Pure scoring, alignment, and diagnostic logic stays framework-independent. Browser file APIs, `AudioContext`, playback, and microphone lifecycle remain at the edge.
- Live transcription remains outputless. Speaker playback exists only during an explicit guided microphone test and must stop on completion, cancellation, navigation, or error.
- PCM is held only for the active run and discarded afterward. Reports may be stored or exported, but audio is not stored by default.
- Uncertainty and failures remain visible. Do not change decoder thresholds merely to make a demonstration pass without measuring the protected corpus.

## Delivery sequence

### M8A — Repeatable software and file verification

This is the first shippable increment and should be completed before acoustic playback.

#### 1. Shared verification model and scoring

Create a small framework-independent verification area outside Morse semantics, for example `src/app/verification/`. Define stable contracts for:

- the test case and its version;
- the source kind: generated, imported file, portable clip, or acoustic test;
- expected raw text and optional nominal tone/WPM metadata;
- the observed raw transcript and existing acquisition/timing metrics;
- stage results for input, tone, lock, timing, decode, and expected-text match;
- exact match, character error rate, word error rate, unknown-character rate, and an accessible alignment/diff;
- human-readable diagnostics tied to the first failed stage.

Reuse or extract the exact, unnormalized comparison logic in `src/app/core/morse/cw-benchmark.ts`; do not create a second scoring definition. Add focused tests for exact matches, substitutions, insertions, deletions, unknown characters, and empty expected/actual values.

#### 2. Built-in quick tests

Run versioned deterministic cases through `AcquiringCwDecoder` without Web Audio or microphone permission. Start with:

| Case | Purpose | Initial gate |
| --- | --- | --- |
| `clean-15-v2` | Beginner-facing quick check: `CQ CQ DE K6RHE`, 600 Hz, 15 WPM | Exact raw match |
| `clean-25-v2` | Faster clean timing check | Exact raw match |
| `weak-noisy-18-v1` | Reuse a representative M5 condition | Existing published corpus threshold |
| `drift-20-v1` | Acquisition and tracking check | Existing published corpus threshold |
| `two-tone-v1` | Show competing-tone diagnosis/manual choice | Correct labeled tone and raw result |

The default button runs only `clean-15-v2` and should finish quickly. An advanced control may run the full set. Display expected and received raw text, a character-level diff, stage checklist, tone/WPM observations, and a clear pass/fail result. Determinism is required: the same build and settings must produce the same result.

#### 3. Audio-file input

Add a browser-edge file adapter that decodes a selected recording to mono floating-point PCM and forwards bounded frames with the decoded sample rate and monotonic sample positions. Requirements:

- WAV is the required baseline format. MP3, M4A, and other formats may be accepted when the current browser can decode them; the UI must not promise universal compressed-format support.
- Use a provisional limit of 25 MB and five minutes to bound memory. Reject unsupported, oversized, corrupt, or empty files with useful messages.
- Do not request microphone permission for a file test.
- Let the user enter optional expected raw text. With expected text, show exact/CER/WER/diff; without it, show acquisition, tone, speed, confidence, and decoded raw text without claiming accuracy.
- Cancellation and reset must release decoded buffers and file references.

Protect the path with a small deterministic WAV fixture and adapter/component tests for success, unsupported input, oversize input, cancellation, and a second run after completion.

#### 4. Result experience and reports

Use a common result view for quick, file, and later acoustic tests. Show these stages in order:

1. **Audio input:** samples arrived and level was usable.
2. **Tone:** a CW tone was found, including its approximate pitch.
3. **Signal lock:** the tone remained stable or recovered.
4. **Timing:** a usable sending speed and spacing were learned.
5. **Raw decode:** characters were produced, with uncertainty retained.
6. **Expected match:** only when expected text was supplied.

Recommendations must follow the first failed stage. For example, no samples points to the file/device path; a very low level suggests increasing playback volume or moving closer; clipping suggests lowering volume; no lock suggests interference or a pitch outside the scan band; a text mismatch displays the raw diff instead of guessing a correction.

Provide local text and JSON export containing the case/version, date, source type, browser-reported settings, stage results, raw expected/actual text, exact metrics, and decoder observations. Exclude PCM and context-corrected text. If reports are retained in the app, use a separate versioned, bounded store rather than treating them as listening sessions.

#### 5. Portable WAV clip

Add a small local WAV encoder around the existing synthetic generator. Let the user download a versioned clip containing a short lead-in, `CQ CQ DE K6RHE` at 600 Hz and 15 WPM, and a trailing pause. The screen must show the exact message and settings.

The generated clip must re-import through the file test and meet the same exact gate. Include a short instruction explaining that the clip can be transferred to a phone when the user wants to exercise a different speaker or device; downloading it is not required for the quick self-test.

### M8B — Guided physical microphone verification

Implement this only after M8A is stable so a failed acoustic run can be compared against a known-good software run.

#### 6. Guided speaker-to-microphone workflow

Add a test-only playback adapter at the browser edge. A run should:

1. Explain that the Mac will make a CW sound and recommend disconnecting headphones.
2. Let the user select the microphone and confirm the speaker volume is moderate.
3. Request microphone permission and measure roughly two seconds of room noise.
4. Play a brief 600 Hz level-check tone and label the captured level as too quiet, usable, or clipping.
5. Show a countdown, then play the known 15 WPM phrase three times with clear gaps.
6. Decode each repetition through the normal live path, then stop and release playback nodes, worklet nodes, tracks, and audio contexts.
7. Show each repetition plus the aggregate stage result. Never silently choose only the best-looking transcript.

Playback and capture clocks must not be assumed to start together. Acquisition should find the message naturally. Echo cancellation, automatic gain control, and noise suppression remain requested off where the browser permits, while the result explains that some hardware or operating systems can still suppress self-playback.

Add an always-visible cancel button, prevent concurrent capture sessions, and handle permission denial, device removal, tab/background interruption, playback failure, and repeated start/stop runs. Do not route microphone input to speakers or create a monitoring loop.

#### 7. Acoustic acceptance calibration

Before fixing a permanent pass threshold, collect a small documented baseline on the target MacBook using three moderate system-volume levels and two ordinary laptop positions. Record all three repetitions rather than tuning to one lucky attempt.

The provisional product target is that at least two of three repetitions have character error rate at or below 10% on the documented 600 Hz/15 WPM setup, with usable input level and no false competing-tone lock. Replace the provisional target with the measured threshold in the fixture/test manifest and decision log before marking M8 complete. If the target is not repeatable, keep the diagnostic test useful and report the limitation rather than weakening raw-text scoring.

## Verification strategy

Automated checks should cover:

- score/alignment math and first-failed-stage diagnosis;
- every built-in case through the production acquiring decoder;
- file adapter framing and errors using a deterministic WAV fixture;
- downloadable WAV round-trip back through the decoder;
- result display with exact, partial, missing-expected, and failed-stage states;
- acoustic controller lifecycle with browser fakes, including cancellation, failure, and two complete runs;
- no context correction in scores or exports;
- no retained PCM after reset or completion;
- all existing M1–M7 tests, M5 benchmark, production build, and offline-reload gate.

Manual checks should cover:

- Quick self-test and imported WAV in the primary supported macOS browser.
- Compressed-file behavior in each browser where it is advertised.
- Guided acoustic run on a MacBook, including two consecutive runs and cancellation.
- Permission denial and a disconnected/changed input device.
- Narrow/mobile layout and keyboard/screen-reader labeling.
- Installed offline use of built-in tests, file import, clip generation, and reports.

## Completion criteria

M8 is complete only when:

- a beginner can open **Verify the app**, run the quick test in under two minutes, and understand what passed;
- the clean built-in case decodes exactly through the production acquisition path;
- a known WAV can be decoded without microphone permission and scored against optional expected text;
- the locally generated portable WAV passes a download/re-import round trip;
- every result preserves and compares immutable raw text, with context excluded;
- the guided acoustic test shows input, tone, lock, timing, decode, and match separately, then releases all audio resources across two runs;
- the measured acoustic threshold and setup are recorded honestly, including browser/hardware limitations;
- reports contain no PCM, work offline, and explain what each test proves;
- the full existing test/build/benchmark/offline gates remain green and the roadmap, architecture notes, and decision log reflect the delivered behavior.

## Deliberate exclusions

- No cloud upload, remote analysis, or account requirement.
- No virtual audio driver, system loopback setup, or headphone monitoring.
- No automatic microphone-volume change.
- No decoder changes made solely to pass the demo corpus.
- No context, callsign lookup, or edited-text scoring.
- No claim that speaker-to-microphone success proves all radios, rooms, noise conditions, pitches, or sending styles.
- No saved failure audio in M8. Consider an explicit opt-in diagnostic recording only in a later decision with privacy and retention rules.

## Handoff checklist for the implementation session

1. Re-read `AGENTS.md`, the roadmap, architecture, live-audio design, RF test design, UX/product design, this plan, and the latest decision-log entry.
2. Inspect current interfaces and tests before naming new contracts; prefer composing the existing acquiring decoder and benchmark functions.
3. Implement and finish M8A in the order above. Run all protected gates and update documentation before starting M8B.
4. Measure the acoustic baseline before finalizing its threshold. Record the exact laptop/browser/setup and keep the provisional result visible until evidence supports closure.
5. Update the service-worker cache revision when adding test assets or new shell files, and rerun the server-offline gate.
6. Mark roadmap checkboxes only for behavior that is both implemented and accepted; leave physical/manual checks open when they have not been performed.
