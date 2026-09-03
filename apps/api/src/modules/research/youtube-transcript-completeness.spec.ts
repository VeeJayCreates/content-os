import { assessYouTubeTranscriptCompleteness } from './youtube-transcript-completeness';

const sentence = 'This is a substantive timestamped transcript segment with enough spoken words to establish useful research evidence.';

describe('assessYouTubeTranscriptCompleteness', () => {
  it('accepts a substantial early-to-late transcript with trusted duration coverage', () => {
    const result = assessYouTubeTranscriptCompleteness([
      { text: sentence, startMs: 4_000, endMs: 110_000 },
      { text: sentence, startMs: 130_000, endMs: 340_000 },
      { text: sentence, startMs: 360_000, endMs: 590_000 },
    ], 600_000);
    expect(result).toMatchObject({ classification: 'complete', reason: 'sufficient_timeline_coverage', metrics: { firstTimestampMs: 4_000, lastTimestampMs: 590_000 } });
  });

  it('rejects the known outro-only failure shape instead of accepting non-empty text', () => {
    const result = assessYouTubeTranscriptCompleteness([
      { text: sentence, startMs: 550_000, endMs: 575_000 },
      { text: sentence, startMs: 575_000, endMs: 592_000 },
      { text: sentence, startMs: 592_000, endMs: 598_000 },
    ], 600_000);
    expect(result).toMatchObject({ classification: 'incomplete', reason: 'transcript_starts_too_late' });
  });

  it('rejects malformed, tiny, or insufficiently timed outputs and never upgrades unknown coverage to complete', () => {
    expect(assessYouTubeTranscriptCompleteness([{ text: 'short', startMs: 0, endMs: 1_000 }], 60_000).classification).toBe('incomplete');
    expect(assessYouTubeTranscriptCompleteness([{ text: sentence, startMs: 0, endMs: 30_000 }, { text: sentence, startMs: 30_000, endMs: 60_000 }, { text: sentence, startMs: 60_000, endMs: 90_000 }], null).classification).toBe('unknown');
    expect(assessYouTubeTranscriptCompleteness([{ text: sentence, startMs: Number.NaN, endMs: 30_000 }, { text: sentence, startMs: 30_000, endMs: 60_000 }, { text: sentence, startMs: 60_000, endMs: 90_000 }], 100_000).classification).toBe('incomplete');
  });
});
