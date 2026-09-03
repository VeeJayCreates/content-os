import { normalizeTitle, normalizeUrl } from './opportunity-detection';

export type ExtractedTopicCandidate = { text: string; normalizedText: string };
export type CandidateRejectionCategory = 'attribution' | 'branding' | 'generic_explanation' | 'empty_or_short';
export type CandidateRejection = { text: string; category: CandidateRejectionCategory };
export type TopicCandidateExtraction = { candidates: ExtractedTopicCandidate[]; rejected: CandidateRejection[] };

const STRONG_SEPARATOR = /\s*(?:\||;|\u2022|\u00b7)\s*/;
const HASHTAG = /(?:\s|^)#[\p{L}\p{N}_-]+/gu;
const ATTRIBUTION = /^(?:by\s+|presented\s+by\s+|with\s+)[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,5}$/iu;
const CHANNEL_MARKER = /\b(?:podcast|channel|shorts?|hindi)\b/i;
const EXPLANATION = /^(?:(?:what|why|how)\s+(?:it|this|that|the\s+[^ ]+)?\s*(?:means(?:\s+for\s+[^ ]+(?:\s+[^ ]+)?)?|matters|is\s+happening|happening)|(?:[\p{L}\s,-]+,\s*)?(?:geography|geology|history|politics|defen[cs]e)\s+explained)$/iu;
const PRESENTER_TITLE = /^(?:major|dr|prof)\.?\s+[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){1,4}$/iu;
const PRESENTER_SUFFIX = /\b(?:major|dr|prof)\.?\s+[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){1,4}$/iu;

/**
 * Stable, precision-first extraction. Metadata fragments are rejected before
 * embedding; only deterministic title structure is used.
 */
export function extractTopicCandidates(title: string): ExtractedTopicCandidate[] {
  return extractTopicCandidatesWithDiagnostics(title).candidates;
}

export function extractTopicCandidatesWithDiagnostics(title: string): TopicCandidateExtraction {
  const value = title.trim();
  if (!value) return { candidates: [], rejected: [] };
  const strong = value.split(STRONG_SEPARATOR).map(clean).filter(Boolean);
  const parts = strong.length > 1 ? strong : updateList(value);
  const rawCandidates = parts.length > 1 ? parts : [value];
  const rejected: CandidateRejection[] = [];
  const candidates = new Map<string, ExtractedTopicCandidate>();
  for (const [index, raw] of rawCandidates.entries()) {
    const { text, category } = classifyCandidate(raw);

    if (
      strong.length > 1 &&
      index > 0 &&
      text &&
      !category &&
      !hasEventShape(text)
    ) {
      rejected.push({ text, category: 'branding' });
      continue;
    }
    if (!text || category) {
      rejected.push({ text: clean(raw), category: category ?? 'empty_or_short' });
      continue;
    }
    const normalizedText = normalizeTitle(text);
    if (normalizedText.length < 8) {
      rejected.push({ text, category: 'empty_or_short' });
      continue;
    }
    if (!candidates.has(normalizedText)) candidates.set(normalizedText, { text, normalizedText });
  }
  return { candidates: [...candidates.values()], rejected };
}

function updateList(title: string): string[] {
  const match = title.match(/^(?:[^-:]+?(?:updates?|headlines?|briefing))\s*[-:]\s*(.+)$/i);
  if (!match?.[1]) return [title];
  const parts = match[1].split(/\s*,\s*/).map(clean).filter(Boolean);
  return parts.length > 1 ? parts : [title];
}

function stripSecondaryContext(value: string): string {
  const patterns = [
    // Event/venue context:
    // "Indus waters at SCO Summit" -> "Indus waters"
    /\s+(?:at|during|amid|on the sidelines of)\s+(?:the\s+)?[^,.!?|]{0,80}\b(?:summit|conference|forum|meeting|session|event)\b.*$/iu,

    // Timing/background context:
    // Keep the primary proposition instead of allowing the surrounding event
    // to become part of the Topic identity.
    /\s+(?:during|amid)\s+[^,.!?|]{0,80}$/iu,
  ];

  let result = value;

  for (const pattern of patterns) {
    const stripped = clean(result.replace(pattern, ''));

    // Never destroy a short/invalid title while removing context.
    if (stripped.split(/\s+/).length >= 3) {
      result = stripped;
    }
  }

  return result;
}

function classifyCandidate(value: string): { text: string; category?: CandidateRejectionCategory } {
  const cleaned = clean(value);

  if (!cleaned || cleaned.split(/\s+/).length < 2) {
    return { text: cleaned, category: 'empty_or_short' };
  }

  if (ATTRIBUTION.test(cleaned) || PRESENTER_TITLE.test(cleaned)) {
    return { text: cleaned, category: 'attribution' };
  }

  const withoutHashtags = clean(cleaned.replace(HASHTAG, ''));
  const primaryEvent = stripSecondaryContext(withoutHashtags);

  if (!primaryEvent || primaryEvent.split(/\s+/).length < 2) {
    return { text: primaryEvent, category: 'branding' };
  }

  if (EXPLANATION.test(primaryEvent)) {
    return { text: primaryEvent, category: 'generic_explanation' };
  }

  if (PRESENTER_SUFFIX.test(primaryEvent) && !hasEventShape(primaryEvent)) {
    return { text: primaryEvent, category: 'branding' };
  }

  if (CHANNEL_MARKER.test(primaryEvent) && !hasEventShape(primaryEvent)) {
    return { text: primaryEvent, category: 'branding' };
  }

  return { text: primaryEvent };
}

function hasEventShape(value: string): boolean {
  return /\b(?:attack|signs?|joins?|hits?|tests?|deploys?|buys?|launches?|bans?|wins?|counters?|protest|earthquake|wildfire|pact|deal|swap|missile|fighter|border|meeting|alliance|happened)\b/i.test(value);
}

function clean(value: string): string {
  return value.replace(/^[-:\s]+|[-:\s]+$/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizedCandidateUrl(url: string): string {
  try { return normalizeUrl(url); } catch { return url; }
}
