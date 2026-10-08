# Product vision and non-goals

## Vision

Give a learner an audio-first path from recognizing their first two Morse characters to copying and sending ordinary amateur-radio traffic. Learning is the product's primary purpose and the default installed experience. A capable real-time receiver remains available as a secondary tool for live copy, verification, and the transition from generated practice to radio audio.

The app should teach audible rhythm rather than visual memorization, keep progress local, and use the same Morse language and timing model for every generated exercise. When it receives live audio, it should show what it heard—not merely assert text—and preserve uncertainty and raw decoder truth.

The primary learning path is:

```text
known symbol → shared Morse timing → generated CW → learner answer → local per-character progress
```

The secondary receiver path is:

```text
microphone → PCM → tone/no-tone evidence → timings → Morse symbols → raw transcript
```

Both paths work offline once installed and require no server, cloud model, account, or LLM.

## Product promises

- Teach receive/copy skill with Koch-style character progression, Farnsworth spacing, immediate feedback, and local per-character progress.
- Teach straight-key and paddle sending practice with local input, sidetone, and explicit pattern/rhythm feedback.
- Decode International Morse/CW locally in real time as an advanced receiving tool on modern browsers.
- Preserve the evidence chain: signal/timing → dots and dashes → characters → raw transcript.
- Adapt to ordinary operator variation, modest frequency drift, noise, and practical radio audio over time.
- Offer ham-radio-aware annotations separately from raw decoding.
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
- Usability: a learner can open the installed app directly into a clear next practice action, while the receiver remains one top-level action away.
- Trust: a user can distinguish raw output, uncertainty, and optional contextual suggestions at a glance.
- Learning: a new user can complete an audio-only hear-and-answer session, retain progress across offline restarts, and advance only when documented unassisted accuracy criteria are met.
- Receiving: a user can choose a microphone/signal, see lock state and quality, start/stop/reset, read raw text, and export a local transcript.
- Sending: a user can key an unlocked character by keyboard or touch and distinguish pattern correctness from timing quality without changing receive progress.
