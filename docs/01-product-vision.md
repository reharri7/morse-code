# Product vision and non-goals

## Vision

Put a phone or laptop near a radio, select or acquire a CW signal, and receive a real-time, understandable transcript. Also give a learner an audio-first path from recognizing their first two Morse characters to copying ordinary amateur-radio traffic. The app should show what it heard—not merely assert text—and use the same Morse language and timing model when it generates practice audio.

The essential local path is:

```text
microphone → PCM → tone/no-tone evidence → timings → Morse symbols → raw transcript
```

It works offline once installed and requires no server, cloud model, account, or LLM for basic transcription.

The planned learning path is:

```text
known symbol → shared Morse timing → generated CW → typed answer → local per-character progress
```

## Product promises

- Decode International Morse/CW locally in real time on modern browsers.
- Preserve the evidence chain: signal/timing → dots and dashes → characters → raw transcript.
- Adapt to ordinary operator variation, modest frequency drift, noise, and practical radio audio over time.
- Offer ham-radio-aware annotations separately from raw decoding.
- Teach receive/copy skill with Koch-style character progression, Farnsworth spacing, immediate feedback, and local per-character progress.
- Teach straight-key sending fundamentals with local keyboard/touch input, sidetone, and explicit pattern/rhythm feedback.
- Reuse one canonical Morse alphabet and timing representation across generated practice, deterministic verification, and receive transcription.
- Be useful on a desktop today and installable/mobile-friendly as a PWA later.

## Non-goals and boundaries

- It is not speech recognition or a cloud transcription service.
- It does not silently “fix” a callsign, prosign, or message based on a database, language model, or heuristic.
- It does not require a backend for normal decoding, saved local data, settings, or export.
- It does not initially promise robust decoding of every weak, overlapping, or badly keyed signal; quality must be measured against a labeled corpus.
- It does not attempt to transmit, key a radio, control a rig, or make regulatory claims.
- Learning is not gamified competition or cloud sync. M13 straight-key feedback is not a rig controller and does not claim calibrated paddle, iambic, or long-form sending analysis.

## Success measures

- Correctness: character error rate (CER), word error rate (WER), unknown-symbol rate, and exact-message rate on versioned labeled fixtures.
- Usability: a user can choose a microphone/signal, see lock state and quality, start/stop/reset, read raw text, and export a local transcript.
- Trust: a user can distinguish raw output, uncertainty, and optional contextual suggestions at a glance.
- Learning: a new user can complete an audio-only hear-and-type session, retain progress across offline restarts, and advance only when documented unassisted accuracy criteria are met.
- Sending: a user can key an unlocked character by keyboard or touch and distinguish pattern correctness from timing quality without changing receive progress.
