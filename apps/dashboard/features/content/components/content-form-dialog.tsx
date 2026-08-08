"use client";

import * as React from "react";
import { ContentStatus, ContentType, type Content, type CreateContentInput, type Project } from "@content-os/contracts";
import { FilePenLine, Pencil, Plus, RefreshCw } from "lucide-react";

import { createContent, ContentApiError, updateContent } from "@/features/content/api/client";
import { getProjects, ProjectsApiError } from "@/features/projects/api/client";
import { formatContentStatus, formatContentType } from "@/features/content/content-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ContentFormDialogProps = {
  content?: Content;
  onCompleted: () => void;
};

export function ContentFormDialog({ content, onCompleted }: ContentFormDialogProps) {
  const isEditing = Boolean(content);
  const [open, setOpen] = React.useState(false);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(false);
  const [projectsError, setProjectsError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const latestProjectRequestRef = React.useRef(0);

  const loadProjects = React.useCallback(async () => {
    const requestId = latestProjectRequestRef.current + 1;
    latestProjectRequestRef.current = requestId;
    setIsLoadingProjects(true);
    setProjectsError(null);

    try {
      const nextProjects = await getProjects();

      if (latestProjectRequestRef.current === requestId) {
        setProjects(nextProjects);
      }
    } catch (requestError) {
      if (latestProjectRequestRef.current === requestId) {
        setProjectsError(requestError instanceof ProjectsApiError ? requestError.message : "Unable to load projects. Please try again.");
      }
    } finally {
      if (latestProjectRequestRef.current === requestId) {
        setIsLoadingProjects(false);
      }
    }
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadProjects();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadProjects, open]);

  React.useEffect(() => () => {
    latestProjectRequestRef.current += 1;
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isLoadingProjects || projectsError) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const projectId = String(formData.get("projectId") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    const contentType = String(formData.get("contentType") ?? "") as ContentType;
    const body = String(formData.get("body") ?? "").trim();
    const status = String(formData.get("status") ?? "") as ContentStatus;

    if (!projectId) {
      setError("Select a project.");
      return;
    }

    if (!title) {
      setError("Enter a title.");
      return;
    }

    if (!Object.values(ContentType).includes(contentType)) {
      setError("Select a content type.");
      return;
    }

    if (!body) {
      setError("Enter the content body.");
      return;
    }

    if (!Object.values(ContentStatus).includes(status)) {
      setError("Select a status.");
      return;
    }

    const input: CreateContentInput = { projectId, title, contentType, body, status };
    setIsSubmitting(true);
    setError(null);

    try {
      if (content) {
        await updateContent(content.id, input);
      } else {
        await createContent(input);
      }

      form.reset();
      setOpen(false);
      onCompleted();
    } catch (requestError) {
      setError(requestError instanceof ContentApiError ? requestError.message : `Unable to ${isEditing ? "update" : "create"} content. Please try again.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) {
      return;
    }

    setOpen(nextOpen);
    if (!nextOpen) {
      setError(null);
      setProjectsError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isEditing ? <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Edit ${content?.title}`}><Pencil className="size-4" /></Button> : <Button><Plus className="size-4" />New content</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit content" : "Create content"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update this content item and keep it associated with the right project." : "Add a focused brief, script, or draft to an existing project."}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-medium" htmlFor={`content-project-${content?.id ?? "new"}`}>
            Project
            <select id={`content-project-${content?.id ?? "new"}`} name="projectId" defaultValue={content?.projectId ?? ""} disabled={isSubmitting || isLoadingProjects || Boolean(projectsError)} required className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
              <option value="" disabled>{isLoadingProjects ? "Loading projects…" : "Select a project"}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          {projectsError ? <div className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert"><p>{projectsError}</p><Button type="button" variant="ghost" size="sm" className="mt-1 px-0 text-red-100 hover:bg-transparent" onClick={() => void loadProjects()}><RefreshCw className="size-3.5" />Retry projects</Button></div> : null}
          {!isLoadingProjects && !projectsError && projects.length === 0 ? <p className="rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">Create a project before adding content.</p> : null}
          <label className="grid gap-2 text-sm font-medium" htmlFor={`content-title-${content?.id ?? "new"}`}>
            Title
            <Input id={`content-title-${content?.id ?? "new"}`} name="title" maxLength={160} defaultValue={content?.title} placeholder="e.g. Weekly geopolitical briefing" disabled={isSubmitting} required autoFocus />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium" htmlFor={`content-type-${content?.id ?? "new"}`}>
              Content type
              <select id={`content-type-${content?.id ?? "new"}`} name="contentType" defaultValue={content?.contentType ?? ""} disabled={isSubmitting} required className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"><option value="" disabled>Select a type</option>{Object.values(ContentType).map((type) => <option key={type} value={type}>{formatContentType(type)}</option>)}</select>
            </label>
            <label className="grid gap-2 text-sm font-medium" htmlFor={`content-status-${content?.id ?? "new"}`}>
              Status
              <select id={`content-status-${content?.id ?? "new"}`} name="status" defaultValue={content?.status ?? ContentStatus.DRAFT} disabled={isSubmitting} required className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">{Object.values(ContentStatus).map((value) => <option key={value} value={value}>{formatContentStatus(value)}</option>)}</select>
            </label>
          </div>
          <label className="grid gap-2 text-sm font-medium" htmlFor={`content-body-${content?.id ?? "new"}`}>
            Body or script
            <textarea id={`content-body-${content?.id ?? "new"}`} name="body" maxLength={20000} defaultValue={content?.body} placeholder="Write the content brief, script, or draft…" disabled={isSubmitting} required className="min-h-40 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-6 text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" />
          </label>
          {error ? <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || isLoadingProjects || Boolean(projectsError) || projects.length === 0}>{isSubmitting ? (isEditing ? "Saving…" : "Creating…") : <><FilePenLine className="size-4" />{isEditing ? "Save changes" : "Create content"}</>}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
