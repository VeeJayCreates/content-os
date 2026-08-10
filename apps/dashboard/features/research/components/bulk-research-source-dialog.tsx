"use client";

import * as React from "react";
import {
  type BulkCreateResearchSourcesResult,
  type Project,
  ResearchSourceRole,
  ResearchSourceType,
} from "@content-os/contracts";
import { ListPlus } from "lucide-react";

import {
  bulkCreateResearchSources,
  ResearchApiError,
} from "@/features/research/api/client";
import {
  formatResearchSourceRole,
  formatResearchSourceType,
} from "@/features/research/research-utils";
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

const MAX_SOURCES = 100;

export function BulkResearchSourceDialog({
  projects,
  defaultProjectId,
  onCompleted,
}: {
  projects: Project[];
  defaultProjectId?: string;
  onCompleted: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? "");
  const [sourceType, setSourceType] = React.useState(ResearchSourceType.YOUTUBE);
  const [defaultRole, setDefaultRole] = React.useState(
    ResearchSourceRole.DISCOVERY,
  );
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] =
    React.useState<BulkCreateResearchSourcesResult | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const parsed = parseSources(value);
    if (!projectId) {
      setError("Select a Project.");
      return;
    }
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    if (parsed.sources.length > MAX_SOURCES) {
      setError(`Add at most ${MAX_SOURCES} sources at a time.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const next = await bulkCreateResearchSources({
        projectId,
        sourceType,
        defaultRole,
        sources: parsed.sources,
      });
      setResult(next);
      if (next.added > 0) onCompleted();
    } catch (reason) {
      setError(
        reason instanceof ResearchApiError
          ? reason.message
          : "Unable to add Research Sources.",
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
          if (!next) {
            setError(null);
            setResult(null);
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={projects.length === 0}>
          <ListPlus className="size-4" />
          Bulk add
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk add Research Sources</DialogTitle>
          <DialogDescription>
            Paste one URL per line. Optionally add a role after a vertical bar,
            for example: https://youtube.com/@ORFOnline | verification
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="grid gap-2 text-sm font-medium sm:col-span-3">
              Project
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                disabled={busy}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select a project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Source Type
              <select
                value={sourceType}
                onChange={(event) =>
                  setSourceType(event.target.value as ResearchSourceType)
                }
                disabled={busy}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {Object.values(ResearchSourceType).map((type) => (
                  <option key={type} value={type}>
                    {formatResearchSourceType(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium sm:col-span-2">
              Default Source Role
              <select
                value={defaultRole}
                onChange={(event) =>
                  setDefaultRole(event.target.value as ResearchSourceRole)
                }
                disabled={busy}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {Object.values(ResearchSourceRole).map((role) => (
                  <option key={role} value={role}>
                    {formatResearchSourceRole(role)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-2 text-sm font-medium">
            Paste one source per line
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={busy}
              rows={10}
              className="min-h-52 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              placeholder={"https://www.youtube.com/@WorldAffairsUnacademy\nhttps://www.youtube.com/@ORFOnline | verification"}
            />
            <span className="text-xs font-normal text-muted-foreground">
              Blank lines are ignored. Up to {MAX_SOURCES} sources per batch.
            </span>
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {result ? <BulkResult result={result} /> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
            <Button type="submit" disabled={busy || projects.length === 0}>
              {busy ? "Adding sources…" : "Add sources"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkResult({ result }: { result: BulkCreateResearchSourcesResult }) {
  const problems = result.results.filter((item) => item.status !== "added");

  return (
    <section className="rounded-md border border-border p-3 text-sm" aria-live="polite">
      <p className="font-medium">
        {result.added} added · {result.existing} already existed · {result.failed} failed
      </p>
      {problems.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-muted-foreground">
          {problems.map((item) => (
            <li key={`${item.inputUrl}-${item.status}`}>
              {item.status === "existing" ? "•" : "×"} {item.inputUrl} — {item.message ?? item.status}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

type ParsedSources =
  | { sources: { url: string; role?: ResearchSourceRole }[] }
  | { error: string };

function parseSources(value: string): ParsedSources {
  const sources: { url: string; role?: ResearchSourceRole }[] = [];
  const allowedRoles = new Set(Object.values(ResearchSourceRole));

  for (const [index, line] of value.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split("|");
    if (parts.length > 2 || !parts[0]?.trim()) {
      return { error: `Line ${index + 1} must contain a URL, optionally followed by | role.` };
    }
    const role = parts[1]?.trim();
    if (role && !allowedRoles.has(role as ResearchSourceRole)) {
      return { error: `Line ${index + 1} has an invalid Source Role.` };
    }
    sources.push({ url: parts[0].trim(), ...(role ? { role: role as ResearchSourceRole } : {}) });
  }

  return sources.length ? { sources } : { error: "Paste at least one source URL." };
}
