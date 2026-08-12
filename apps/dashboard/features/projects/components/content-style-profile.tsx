'use client';

import * as React from 'react';
import { ContentStyleIntensity, ContentStylePreset, ContentTone, HookStyle, NarrationStyle, ScriptLanguage, type ProjectContentStyleProfile } from '@content-os/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getContentStyleProfile, ProjectsApiError, updateContentStyleProfile } from '@/features/projects/api/client';

const baselinePreset: Omit<ProjectContentStyleProfile, 'projectId' | 'preset' | 'createdAt' | 'updatedAt'> = { primaryLanguage: ScriptLanguage.ENGLISH, secondaryLanguage: null, tone: ContentTone.CONVERSATIONAL_AUTHORITATIVE, narrationStyle: NarrationStyle.EXPLAINER, hookStyle: HookStyle.DIRECT, desiWordingLevel: ContentStyleIntensity.LOW, sarcasmLevel: ContentStyleIntensity.NONE, humorLevel: ContentStyleIntensity.NONE, energyLevel: ContentStyleIntensity.MEDIUM, sensationalismLevel: ContentStyleIntensity.LOW, audienceDescription: '', preferredVocabulary: [], avoidedVocabulary: [], customInstructions: '', sensitiveTopicSarcasmEnabled: false };
const presetDefaults: Record<ContentStylePreset, Omit<ProjectContentStyleProfile, 'projectId' | 'preset' | 'createdAt' | 'updatedAt'>> = {
  geopolitics_news: { ...baselinePreset, primaryLanguage: ScriptLanguage.HINGLISH, secondaryLanguage: ScriptLanguage.HINDI, narrationStyle: NarrationStyle.COMMENTARY_EXPLAINER, hookStyle: HookStyle.CURIOSITY_DRIVEN, desiWordingLevel: ContentStyleIntensity.HIGH, sarcasmLevel: ContentStyleIntensity.MEDIUM, humorLevel: ContentStyleIntensity.LOW, energyLevel: ContentStyleIntensity.HIGH, audienceDescription: 'Indian geopolitics and news audience' },
  educational: { ...baselinePreset }, documentary: { ...baselinePreset }, technology: { ...baselinePreset }, finance: { ...baselinePreset }, entertainment: { ...baselinePreset }, custom: { ...baselinePreset },
};

export function ContentStyleProfileEditor({ projectId }: { projectId: string }) {
  const [profile, setProfile] = React.useState<ProjectContentStyleProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try { setProfile(await getContentStyleProfile(projectId)); }
    catch (reason) { setError(reason instanceof ProjectsApiError ? reason.message : 'Unable to load content style.'); }
    finally { setLoading(false); }
  }, [projectId]);
  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const update = <K extends keyof ProjectContentStyleProfile>(key: K, value: ProjectContentStyleProfile[K]) => setProfile(current => current ? { ...current, [key]: value } : current);

  async function save() {
    if (!profile || saving) return;
    setSaving(true); setSaved(false); setError(null);
    try { setProfile(await updateContentStyleProfile(projectId, toUpdate(profile))); setSaved(true); }
    catch (reason) { setError(reason instanceof ProjectsApiError ? reason.message : 'Unable to save content style.'); }
    finally { setSaving(false); }
  }
  if (loading) return <Card className="mt-6"><CardContent className="pt-6 text-sm text-muted-foreground">Loading content style…</CardContent></Card>;
  if (!profile) return <Card className="mt-6"><CardContent className="pt-6 text-sm text-destructive">{error ?? 'Content style is unavailable.'} <Button variant="outline" onClick={() => void load()}>Retry</Button></CardContent></Card>;
  return <Card className="mt-6"><CardHeader><CardTitle>Content Style</CardTitle><CardDescription>Presentation settings only. They never change verified facts, citations, or Research Verification.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
    <Select label="Preset" value={profile.preset} values={Object.values(ContentStylePreset)} onChange={value => { const preset = value as ContentStylePreset; setProfile({ ...profile, ...presetDefaults[preset], preset }); }} />
    <Select label="Primary language" value={profile.primaryLanguage} values={Object.values(ScriptLanguage)} onChange={value => update('primaryLanguage', value as ScriptLanguage)} />
    <Select label="Tone" value={profile.tone} values={Object.values(ContentTone)} onChange={value => update('tone', value as ContentTone)} />
    <Select label="Narration style" value={profile.narrationStyle} values={Object.values(NarrationStyle)} onChange={value => update('narrationStyle', value as NarrationStyle)} />
    <Select label="Hook style" value={profile.hookStyle} values={Object.values(HookStyle)} onChange={value => update('hookStyle', value as HookStyle)} />
    {(['desiWordingLevel', 'sarcasmLevel', 'humorLevel', 'energyLevel', 'sensationalismLevel'] as const).map(key => <Select key={key} label={key.replace(/([A-Z])/g, ' $1')} value={profile[key]} values={Object.values(ContentStyleIntensity)} onChange={value => update(key, value as ContentStyleIntensity)} />)}
    <TextArea label="Audience description" value={profile.audienceDescription} onChange={value => update('audienceDescription', value)} className="sm:col-span-2" />
    <TextArea label="Preferred vocabulary" hint="Separate words with commas or new lines." value={profile.preferredVocabulary.join(', ')} onChange={value => update('preferredVocabulary', toWords(value))} />
    <TextArea label="Avoided vocabulary" hint="Separate words with commas or new lines." value={profile.avoidedVocabulary.join(', ')} onChange={value => update('avoidedVocabulary', toWords(value))} />
    <TextArea label="Custom instructions" value={profile.customInstructions} onChange={value => update('customInstructions', value)} className="sm:col-span-2" />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={profile.sensitiveTopicSarcasmEnabled} onChange={event => update('sensitiveTopicSarcasmEnabled', event.currentTarget.checked)} />Enable sarcasm for sensitive topics</label>
    <div className="flex items-center gap-3"><Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save content style'}</Button>{saved ? <span className="text-sm text-muted-foreground">Content style saved.</span> : null}</div>
    {error ? <p className="sm:col-span-2 text-sm text-destructive" role="alert">{error}</p> : null}
  </CardContent></Card>;
}
function Select({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) { return <label className="grid gap-1 text-sm capitalize">{label}<select className="h-9 rounded border px-2" value={value} onChange={event => onChange(event.currentTarget.value)}>{values.map(item => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>; }
function TextArea({ label, hint, value, onChange, className }: { label: string; hint?: string; value: string; onChange: (value: string) => void; className?: string }) { return <label className={`grid gap-1 text-sm ${className ?? ''}`}>{label}<textarea className="min-h-20 rounded border p-2" value={value} onChange={event => onChange(event.currentTarget.value)} />{hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}</label>; }
function toWords(value: string) { return value.split(/[\n,]/).map(item => item.trim()).filter(Boolean); }
function toUpdate(profile: ProjectContentStyleProfile) { return { preset: profile.preset, primaryLanguage: profile.primaryLanguage, secondaryLanguage: profile.secondaryLanguage, tone: profile.tone, narrationStyle: profile.narrationStyle, hookStyle: profile.hookStyle, desiWordingLevel: profile.desiWordingLevel, sarcasmLevel: profile.sarcasmLevel, humorLevel: profile.humorLevel, energyLevel: profile.energyLevel, sensationalismLevel: profile.sensationalismLevel, audienceDescription: profile.audienceDescription, preferredVocabulary: profile.preferredVocabulary, avoidedVocabulary: profile.avoidedVocabulary, customInstructions: profile.customInstructions, sensitiveTopicSarcasmEnabled: profile.sensitiveTopicSarcasmEnabled }; }
