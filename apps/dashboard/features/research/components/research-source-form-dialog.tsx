"use client";

import * as React from "react";
import {
  type CreateResearchSourceInput,
  type Project,
  type ResearchSource,
  ResearchSourceType,
} from "@content-os/contracts";
import { Pencil, Plus } from "lucide-react";
import {
  createResearchSource,
  ResearchApiError,
  updateResearchSource,
} from "@/features/research/api/client";
import { formatResearchSourceType } from "@/features/research/research-utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function ResearchSourceFormDialog({
  projects,
  source,
  defaultProjectId,
  onCompleted,
}: {
  projects: Project[];
  source?: ResearchSource;
  defaultProjectId?: string;
  onCompleted: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const editing = Boolean(source);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const projectId = String(form.get("projectId") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const sourceType = String(
      form.get("sourceType") ?? "",
    ) as ResearchSourceType;
    const url = String(form.get("url") ?? "").trim();
    const enabled = form.get("enabled") === "on";
    if (
      !projectId ||
      !name ||
      !url ||
      !Object.values(ResearchSourceType).includes(sourceType)
    ) {
      setError("Complete all required fields with a valid source type.");
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      setError("Enter a valid HTTP(S) URL.");
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setError("Use an HTTP(S) URL.");
      return;
    }
    const input: CreateResearchSourceInput = {
      projectId,
      name,
      sourceType,
      url,
      enabled,
    };
    setBusy(true);
    setError(null);
    try {
      if (source) await updateResearchSource(source.id, input);
      else await createResearchSource(input);
      setOpen(false);
      onCompleted();
    } catch (requestError) {
      setError(
        requestError instanceof ResearchApiError
          ? requestError.message
          : "Unable to save the research source.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          if (!next) setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {editing ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Edit ${source?.name}`}
          >
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button disabled={projects.length === 0}>
            <Plus className="size-4" />
            New source
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit research source" : "Add research source"}
          </DialogTitle>
          <DialogDescription>
            Sources will later feed autonomous research and opportunity
            discovery.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-medium">
            Project
            <select
              name="projectId"
              defaultValue={source?.projectId ?? defaultProjectId ?? ""}
              disabled={busy}
              required
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="" disabled>
                Select a project
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Name
            <Input
              name="name"
              defaultValue={source?.name}
              maxLength={120}
              disabled={busy}
              required
              placeholder="e.g. Official policy updates"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Source type
              <select
                name="sourceType"
                defaultValue={source?.sourceType ?? ""}
                disabled={busy}
                required
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="" disabled>
                  Select a type
                </option>
                {Object.values(ResearchSourceType).map((type) => (
                  <option key={type} value={type}>
                    {formatResearchSourceType(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-7 text-sm font-medium">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={source?.enabled ?? true}
                disabled={busy}
                className="size-4 accent-primary"
              />
              Enabled
            </label>
          </div>
          <label className="grid gap-2 text-sm font-medium">
            URL or endpoint
            <Input
              name="url"
              type="url"
              defaultValue={source?.url}
              maxLength={2048}
              disabled={busy}
              required
              placeholder="https://example.com/feed"
            />
          </label>
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
            >
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button disabled={busy || projects.length === 0} type="submit">
              {busy ? "Saving…" : editing ? "Save changes" : "Add source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
