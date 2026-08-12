import { normalizeTitle, normalizeUrl } from './opportunity-detection';

export type ExtractedTopicCandidate = { text: string; normalizedText: string };
export type CandidateRejectionCategory = 'attribution' | 'branding' | 'generic_explanation' | 'empty_or_short';
export type CandidateRejection = { text: string; category: CandidateRejectionCategory };
export type TopicCandidateExtraction = { candidates: ExtractedTopicCandidate[]; rejected: CandidateRejection[] };

const STRONG_SEPARATOR = /\s*(?:\||;|\u2022|\u00b7)\s*/;
const HASHTAG = /(?:\s|^)#[\p{L}\p{N}_-]+/gu;
const ATTRIBUTION = /^(?:by\s+|presented\s+by\s+|with\s+)[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){0,5}$/iu;
const CHANNEL_MARKER = /\b(?:dialogues?|podcast|channel|shorts?|hindi)\b/i;
const EXPLANATION = /^(?:(?:what|why|how)\s+(?:it|this|that|the\s+[^ ]+)?\s*(?:means(?:\s+for\s+[^ ]+(?:\s+[^ ]+)?)?|matters|is\s+happening|happening)|(?:[\p{L}\s,-]+,\s*)?(?:geography|geology|history|politics|defen[cs]e)\s+explained)$/iu;
const PRESENTER_TITLE = /^(?:major|dr|prof)\.?\s+[\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*){1,4}$/iu;

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
  for (const raw of rawCandidates) {
    const { text, category } = classifyCandidate(raw);
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

function classifyCandidate(value: string): { text: string; category?: CandidateRejectionCategory } {
  const cleaned = clean(value);
  if (!cleaned || cleaned.split(/\s+/).length < 2) return { text: cleaned, category: 'empty_or_short' };
  if (ATTRIBUTION.test(cleaned) || PRESENTER_TITLE.test(cleaned)) return { text: cleaned, category: 'attribution' };
  const withoutHashtags = clean(cleaned.replace(HASHTAG, ''));
  if (!withoutHashtags || withoutHashtags.split(/\s+/).length < 2) return { text: withoutHashtags, category: 'branding' };
  if (EXPLANATION.test(withoutHashtags)) return { text: withoutHashtags, category: 'generic_explanation' };
  // Channel/series labels are not event propositions. Require a title-shaped
  // label rather than rejecting ordinary story titles that mention a channel.
  if (CHANNEL_MARKER.test(withoutHashtags) && !hasEventShape(withoutHashtags)) return { text: withoutHashtags, category: 'branding' };
  return { text: withoutHashtags };
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
