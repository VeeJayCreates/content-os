"use client";

import * as React from "react";
import {
  EditorialTimelinessPreference,
  type ProjectEditorialProfile,
} from "@content-os/contracts";

import {
  getProjectEditorialProfile,
  ProjectsApiError,
  toProjectEditorialProfileUpdateInput,
  updateProjectEditorialProfile,
} from "@/features/projects/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ProjectEditorialProfileProps = {
  projectId: string;
};

type TextField =
  | "mission"
  | "targetAudience"
  | "primaryLanguage"
  | "primaryGeography";
type ArrayField =
  | "topicThemes"
  | "excludedTopics"
  | "contentGoals"
  | "preferredFormats";

const MAX_TEXT_LENGTH = 1_000;

export function ProjectEditorialProfileEditor({
  projectId,
}: ProjectEditorialProfileProps) {
  const [profile, setProfile] = React.useState<ProjectEditorialProfile | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const requestId = React.useRef(0);
  const saveRequestId = React.useRef(0);

  const loadProfile = React.useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setLoadError(null);

    try {
      const nextProfile = await getProjectEditorialProfile(projectId);
      if (request === requestId.current) {
        setProfile(nextProfile);
      }
    } catch (error) {
      if (request === requestId.current) {
        setLoadError(
          error instanceof ProjectsApiError
            ? error.message
            : "Unable to load the editorial profile.",
        );
      }
    } finally {
      if (request === requestId.current) {
        setLoading(false);
      }
    }
  }, [projectId]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadProfile(), 0);

    return () => {
      requestId.current += 1;
      saveRequestId.current += 1;
      window.clearTimeout(timer);
    };
  }, [loadProfile]);

  function updateText(field: TextField, value: string) {
    setProfile((current) =>
      current ? { ...current, [field]: value } : current,
    );
  }

  function updateArray(field: ArrayField, value: string) {
    const items = value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    setProfile((current) =>
      current ? { ...current, [field]: items } : current,
    );
  }

  async function save() {
    if (!profile || saving) return;

    if (
      profile.mission.length > MAX_TEXT_LENGTH ||
      profile.targetAudience.length > MAX_TEXT_LENGTH
    ) {
      setSaveError("Mission and target audience must be 1,000 characters or fewer.");
      return;
    }

    const request = ++saveRequestId.current;
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const persisted = await updateProjectEditorialProfile(
        projectId,
        toProjectEditorialProfileUpdateInput(profile),
      );
      if (request === saveRequestId.current) {
        setProfile(persisted);
        setSaveMessage("Editorial profile saved.");
      }
    } catch (error) {
      if (request === saveRequestId.current) {
        setSaveError(
          error instanceof ProjectsApiError
            ? error.message
            : "Unable to save the editorial profile.",
        );
      }
    } finally {
      if (request === saveRequestId.current) {
        setSaving(false);
      }
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Editorial Profile</CardTitle>
        <CardDescription>
          Define what this project covers. Operational selection thresholds stay
          separate in Selection Policy.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Loading editorial profile…</p> : null}
        {loadError ? (
          <div className="space-y-3 text-sm text-destructive" role="alert">
            <p>{loadError}</p>
            <Button type="button" variant="outline" onClick={() => void loadProfile()}>
              Retry
            </Button>
          </div>
        ) : null}
        {profile ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextAreaField label="Mission" value={profile.mission} onChange={(value) => updateText("mission", value)} className="sm:col-span-2" />
            <TextAreaField label="Target audience" value={profile.targetAudience} onChange={(value) => updateText("targetAudience", value)} className="sm:col-span-2" />
            <InputField label="Primary language" value={profile.primaryLanguage} onChange={(value) => updateText("primaryLanguage", value)} />
            <InputField label="Primary geography" value={profile.primaryGeography} onChange={(value) => updateText("primaryGeography", value)} />
            <TextAreaField label="Topic themes" hint="Separate items with commas or new lines." value={profile.topicThemes.join("\n")} onChange={(value) => updateArray("topicThemes", value)} />
            <TextAreaField label="Excluded topics" hint="Separate items with commas or new lines." value={profile.excludedTopics.join("\n")} onChange={(value) => updateArray("excludedTopics", value)} />
            <TextAreaField label="Content goals" hint="Separate items with commas or new lines." value={profile.contentGoals.join("\n")} onChange={(value) => updateArray("contentGoals", value)} />
            <TextAreaField label="Preferred formats" hint="Separate items with commas or new lines." value={profile.preferredFormats.join("\n")} onChange={(value) => updateArray("preferredFormats", value)} />
            <label className="grid gap-1 text-sm font-medium text-foreground">
              Timeliness preference
              <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={profile.timelinessPreference} onChange={(event) => setProfile({ ...profile, timelinessPreference: toTimelinessPreference(event.currentTarget.value) })}>
                <option value={EditorialTimelinessPreference.BREAKING}>Breaking</option>
                <option value={EditorialTimelinessPreference.BALANCED}>Balanced</option>
                <option value={EditorialTimelinessPreference.EVERGREEN}>Evergreen</option>
              </select>
            </label>
            <div className="flex items-end gap-3">
              <Button type="button" disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save editorial profile"}
              </Button>
              <span className="text-xs text-muted-foreground">Revision {profile.revision}</span>
            </div>
            {saveError ? <p className="sm:col-span-2 text-sm text-destructive" role="alert">{saveError}</p> : null}
            {saveMessage ? <p className="sm:col-span-2 text-sm text-muted-foreground" role="status">{saveMessage}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InputField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-sm font-medium text-foreground"><span>{label}</span><Input value={value} maxLength={120} onChange={(event) => onChange(event.currentTarget.value)} /></label>;
}

function TextAreaField({ label, hint, value, onChange, className }: { label: string; hint?: string; value: string; onChange: (value: string) => void; className?: string }) {
  return <label className={`grid gap-1 text-sm font-medium text-foreground ${className ?? ""}`}><span>{label}</span><textarea className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={value} maxLength={MAX_TEXT_LENGTH} onChange={(event) => onChange(event.currentTarget.value)} />{hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}</label>;
}

function toTimelinessPreference(value: string): EditorialTimelinessPreference {
  switch (value) {
    case EditorialTimelinessPreference.BREAKING:
      return EditorialTimelinessPreference.BREAKING;
    case EditorialTimelinessPreference.EVERGREEN:
      return EditorialTimelinessPreference.EVERGREEN;
    default:
      return EditorialTimelinessPreference.BALANCED;
  }
}
