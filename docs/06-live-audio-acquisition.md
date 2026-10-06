# Live Web Audio, AudioWorklet, and acquisition plan

## M2 capture lifecycle

1. On an explicit user gesture, enumerate/select devices and call `getUserMedia` for the chosen microphone.
2. Request audio with `echoCancellation`, `noiseSuppression`, and `autoGainControl` disabled where the browser honors them. Display that browser/device processing may still apply.
3. Create/resume an `AudioContext`, `MediaStreamAudioSourceNode`, and registered `AudioWorkletNode`.
4. Send PCM-derived measurements or bounded frames from worklet to a main-thread adapter; route to framework-independent core code.
5. On stop/device change/unmount: disconnect nodes, stop tracks, reset decode session, and close/suspend the context as appropriate.

Capture permission and device errors are normal UI states—not exceptions hidden in a console. Support start, stop, reset, denied permission, unavailable device, and source/device change. Device labels may be blank until permission is granted.

## Implemented M2 boundary — 2026-09-14

- `public/cw-audio-processor.js` collects mono render quanta into transferable blocks of at most 512 samples. Every message carries the browser sample rate and a monotonic sample position. It has zero outputs and interprets no Morse timing.
- `src/app/input/microphone-capture.ts` owns `getUserMedia`, device enumeration/change, permission/error states, the `AudioContext` graph, worklet flush, track loss, and idempotent cleanup. It requests echo cancellation, noise suppression, and automatic gain control off.
- `src/app/core/morse/streaming-cw-decoder.ts` consumes the browser-free `PcmFrame` contract, retains no PCM, merges detector segments across message boundaries, exposes bounded recent timing events, and reports sample discontinuities.
- The original M2 boundary deliberately took a manual target frequency, nominal WPM timing guide, and power threshold. M3 replaced the manual-only target with acquisition; M4 removed the WPM input and now learns timing from the live signal.
- The Angular surface throttles display updates to roughly 20 Hz while every PCM frame continues through the decoder.

## AudioWorklet boundary

Use an `AudioWorkletProcessor` for continuous processing, not Angular change detection, animation frames, or timers. Keep worklet code browser-safe and allocation-light. Its main responsibility is reliable frame sequencing; detector placement can begin on the main-thread adapter for simplicity if messages remain bounded, then move time-critical analysis into the worklet based on profiling. Messages must include sample-rate and monotonic sample position/timestamp.

Do not connect microphone audio to destination merely to process it; avoid feedback. Capture must be HTTPS/localhost and user-initiated under browser permission rules.

## M8B explicit acoustic verification boundary — implemented 2026-09-16

The live transcription graph remains outputless. Only the explicitly started guided test creates `SpeakerPlayback`, which prepares its playback context during the initiating gesture and emits a short 600 Hz level tone plus three known phrases. Microphone audio is never connected to the destination. The controller prevents concurrent live capture, treats playback/capture clocks as independent, streams each repetition through a fresh production acquiring decoder, and releases playback sources/context plus worklet/source nodes, tracks, and capture context on success, cancellation, permission denial, device loss, playback failure, or component destruction.

## M3 spectrum/acquisition UX

- State machine: `idle → requesting-permission → listening/searching → locked → degraded/lost → stopped/error`.
- Display selected device, observed lock frequency, signal level/SNR, WPM estimate, and transition reason.
- While searching, expose ranked candidates or spectrum/waterfall; manual selection freezes/sets the lock policy.
- A manual unlock/reacquire action is always available. Never use text content (e.g. a likely callsign) to select a frequency.

Implemented in the live operator interface on 2026-09-15. The band defaults to 300–1200 Hz with 10 Hz scan steps. Ranked candidates show pitch and plain-language clarity; selecting one enters manual mode. Automatic state, transition guidance, frequency, lock quality, signal level, tone state, marks, confidence, and raw text remain visible without developer tools.

## Manual acceptance protocol

For M2, play a clean generated/labeled CW sample or a radio speaker at a selected microphone. Record browser/device, tone frequency, nominal WPM, text, start/stop behavior, and whether raw output remains recognizable. For M3, repeat at unknown frequency and with two nearby tones including manual selection. Add reusable audio fixtures when sharing/reproducibility is permitted.

### M2 run record

Partially performed on 2026-09-15. The user located the MacBook's physical built-in microphone, played a known CW transmission, and reported that the app decoded it successfully. Unknown fields and lifecycle edge cases remain intentionally pending rather than inferred.

| Field | Result |
| --- | --- |
| Browser and version | Browser used successfully; name/version not recorded |
| Input device | MacBook built-in microphone |
| Source and placement | Known CW transmission played near the physical microphone; exact source/placement not recorded |
| Reference text | Known transmission; exact text not recorded |
| Tone / WPM / threshold | Pending |
| Continuously recognizable raw text | Successful recognizable decode reported; duration not recorded |
| Two start/stop cycles; browser indicator turns off each time | Pending |
| Device disconnect or removal produces visible error | Pending |

### M3 run record

Partially exercised by the successful integrated microphone decode on 2026-09-15, but the acquisition-specific observations below were not recorded. Before checking the final M3 roadmap item, repeat the setup and record:

| Field | Result |
| --- | --- |
| Unknown source tone / automatic acquired tone | Pending |
| Acquisition time and lock quality | Pending |
| Recognizable continuously updating raw text | Pending |
| Drift source/range and tracked frequency | Pending |
| Two nearby tones and their relative levels | Pending |
| Manually selected tone stays selected | Pending |
| Loss and automatic reacquisition behavior | Pending |
