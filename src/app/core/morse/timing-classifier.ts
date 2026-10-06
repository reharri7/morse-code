import { TimingClassification, TimingEvent, ToneSegment } from './interfaces';

function durationMs(segment: ToneSegment): number {
  return ((segment.endSample - segment.startSample) / segment.sampleRate) * 1_000;
}

/**
 * Converts binary tone/silence segments into Morse timing events. The default
 * dit estimate is intentionally local to the raw timings, keeping later adaptive
 * WPM and Farnsworth policies replaceable.
 */
export function classifyCwTiming(segments: readonly ToneSegment[], knownDitDurationMs?: number): TimingClassification {
  const durations = segments.filter((segment) => segment.state === 'tone').map(durationMs);
  const estimatedDitDurationMs = knownDitDurationMs ?? estimateDitDurationMs(durations);
  if (!estimatedDitDurationMs) return { events: [], estimatedDitDurationMs: 0, estimatedWordsPerMinute: 0 };

  const events: TimingEvent[] = [];
  for (const segment of segments) {
    const length = durationMs(segment);
    const units = length / estimatedDitDurationMs;
    if (segment.state === 'tone') {
      events.push({ kind: units < 2 ? 'dit' : 'dah', durationMs: length });
    } else if (units >= 5.5) {
      events.push({ kind: 'word-gap', durationMs: length });
    } else if (units >= 2) {
      events.push({ kind: 'character-gap', durationMs: length });
    }
  }

  return {
    events,
    estimatedDitDurationMs,
    estimatedWordsPerMinute: 1_200 / estimatedDitDurationMs
  };
}

function estimateDitDurationMs(toneDurations: readonly number[]): number {
  if (toneDurations.length === 0) return 0;
  // CW marks are 1 or 3 dits.  The shortest detected mark is the most direct
  // estimate for clean initial input and remains replaceable by a robust tracker.
  return Math.min(...toneDurations);
}
