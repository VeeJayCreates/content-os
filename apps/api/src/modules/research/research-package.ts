export interface ResearchPackageSignal {
  id: string;
  title: string;
  summary: string | null;
  researchSourceId: string;
  discoveredAt: string;
}

export function normalizeClaimKey(claim: string): string {
  return claim
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Research facts are evidence-backed propositions, not an arbitrary fragment
 * from a source headline.  This deliberately conservative screen keeps
 * topical/editorial framing out of the fact store; it does not rewrite a
 * source into a supposedly factual claim.
 */
export function isVerifiableResearchClaim(claim: string): boolean {
  const normalized = claim.replace(/\s+/g, ' ').trim();
  if (normalized.length < 12) return false;

  // Time-sensitive title labels and unqualified superlative/metaphorical
  // framing require editorial judgement or an explicit comparison dataset.
  // They cannot be promoted to a verified proposition from title metadata.
  return !/\b(?:latest\s+updates?|breaking\s+news|biggest|best|worst|most\s+important|bargaining\s+chip)\b/i.test(
    normalized,
  );
}

export function summarizeResearchPackage(
  title: string,
  opportunitySummary: string | null,
  signals: ResearchPackageSignal[],
): string {
  const summary =
    opportunitySummary ??
    signals.find((signal) => signal.summary)?.summary ??
    title;
  return summary.replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function scoreResearchConfidence(
  signals: ResearchPackageSignal[],
  now = new Date(),
): number {
  if (!signals.length) return 0;
  const firstSignal = signals[0];
  if (!firstSignal) return 0;
  const sources = new Set(signals.map((signal) => signal.researchSourceId))
    .size;
  const latest = signals.reduce(
    (current, signal) =>
      signal.discoveredAt > current ? signal.discoveredAt : current,
    firstSignal.discoveredAt,
  );
  const ageInDays = Math.max(
    0,
    (now.getTime() - new Date(latest).getTime()) / 86_400_000,
  );
  const freshness = Math.max(0, 15 - Math.floor(ageInDays) * 2);
  return Math.max(
    0,
    Math.min(
      100,
      20 +
        Math.min(45, sources * 20) +
        Math.min(20, signals.length * 5) +
        freshness,
    ),
  );
}

export function factStatusForSources(
  sourceCount: number,
): 'supported' | 'unverified' {
  return sourceCount >= 2 ? 'supported' : 'unverified';
}
