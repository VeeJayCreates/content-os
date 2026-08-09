jest.mock('@content-os/contracts', () => ({
  ResearchSourceType: {
    RSS: 'rss',
    WEBSITE: 'website',
    YOUTUBE: 'youtube',
  },
}));

import {
  clusterKey,
  normalizeUrl,
  scoreOpportunity,
  titlesMatch,
} from './opportunity-detection';

const recent = new Date().toISOString();
const stale = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
const signal = (
  overrides: Partial<{
    id: string;
    title: string;
    url: string;
    researchSourceId: string;
    discoveredAt: string;
  }> = {},
) => ({
  id: 'signal-1',
  projectId: 'project-1',
  title: 'Space agency launches climate satellite mission',
  url: 'https://example.com/story?tracking=1',
  summary: null,
  researchSourceId: 'source-1',
  sourceType: 'rss' as const,
  discoveredAt: recent,
  ...overrides,
});

describe('opportunity detection logic', () => {
  it('matches identical and punctuation/case title variations', () => {
    expect(
      titlesMatch(
        'Space Agency Launches Climate Satellite Mission',
        'space agency launches climate satellite mission',
      ),
    ).toBe(true);
    expect(
      titlesMatch(
        'Space agency: launches climate-satellite mission!',
        'SPACE AGENCY launches climate satellite mission',
      ),
    ).toBe(true);
  });

  it('matches only strongly near-identical titles', () => {
    expect(
      titlesMatch(
        'Space agency launches climate satellite mission',
        'Space agency launches climate satellite mission update',
      ),
    ).toBe(true);
    expect(
      titlesMatch(
        'India government gives AI update',
        'India election news and war update',
      ),
    ).toBe(false);
    expect(
      titlesMatch(
        'Climate satellite launch succeeds',
        'Local election results announced today',
      ),
    ).toBe(false);
  });

  it('uses canonical URL regardless of title variation', () => {
    expect(clusterKey(signal({ title: 'First title' }))).toBe(
      clusterKey(
        signal({
          title: 'Completely different title',
          url: 'https://example.com/story?other=2#section',
        }),
      ),
    );
  });

  it('preserves a YouTube video ID while removing tracking parameters', () => {
    expect(normalizeUrl('https://www.youtube.com/watch?v=AAA')).not.toBe(
      normalizeUrl('https://www.youtube.com/watch?v=BBB'),
    );
    expect(
      normalizeUrl('https://www.youtube.com/watch?v=AAA&utm_source=x'),
    ).toBe('https://www.youtube.com/watch?v=AAA');
    expect(
      normalizeUrl('https://www.youtube.com/watch?v=AAA&utm_campaign=y'),
    ).toBe('https://www.youtube.com/watch?v=AAA');
  });

  it('keeps news URL normalization stable for tracking and fragments', () => {
    expect(
      normalizeUrl('https://news.example.com/story?utm_source=x#section'),
    ).toBe('https://news.example.com/story');
    expect(
      clusterKey(signal({ url: 'https://news.example.com/story#one' })),
    ).toBe(
      clusterKey(
        signal({ id: 'signal-2', url: 'https://news.example.com/story#two' }),
      ),
    );
  });

  it('keeps scores within bounds and rewards fresh multi-source signals', () => {
    const staleSingle = scoreOpportunity(
      [signal({ discoveredAt: stale })],
      new Date(),
    );
    const freshMulti = scoreOpportunity(
      [signal(), signal({ id: 'signal-2', researchSourceId: 'source-2' })],
      new Date(),
    );
    expect(staleSingle).toBeGreaterThanOrEqual(0);
    expect(freshMulti).toBeLessThanOrEqual(100);
    expect(freshMulti).toBeGreaterThan(staleSingle);
  });
});
