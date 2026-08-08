"use client";

import * as React from "react";
import { ContentType } from "@content-os/contracts";
import { Plus } from "lucide-react";

import { createProject, ProjectsApiError } from "@/features/projects/api/client";
import { formatContentType } from "@/features/projects/project-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type CreateProjectDialogProps = {
  onCreated: () => void;
};

export function CreateProjectDialog({ onCreated }: CreateProjectDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const contentType = String(formData.get("contentType") ?? "") as ContentType;

    if (!name) {
      setError("Enter a project name.");
      return;
    }

    if (!contentType || !Object.values(ContentType).includes(contentType)) {
      setError("Select a content type.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createProject({ name, description: description || undefined, contentType });
      form.reset();
      setOpen(false);
      onCreated();
    } catch (requestError) {
      setError(requestError instanceof ProjectsApiError ? requestError.message : "Unable to create the project. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setError(null); }}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" />New project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>Start a focused initiative for the content your team wants to create.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-medium" htmlFor="project-name">
            Name
            <Input id="project-name" name="name" maxLength={100} placeholder="e.g. Global market briefing" disabled={isSubmitting} required autoFocus />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="project-description">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
            <textarea id="project-description" name="description" maxLength={500} placeholder="What is this project trying to achieve?" disabled={isSubmitting} className="min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="project-content-type">
            Content type
            <select id="project-content-type" name="contentType" defaultValue="" disabled={isSubmitting} required className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
              <option value="" disabled>Select a content type</option>
              {Object.values(ContentType).map((contentType) => <option key={contentType} value={contentType}>{formatContentType(contentType)}</option>)}
            </select>
          </label>
          {error && <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create project"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
