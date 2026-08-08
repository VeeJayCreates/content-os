"use client";

import * as React from "react";
import type { Project } from "@content-os/contracts";
import { Trash2 } from "lucide-react";

import { deleteProject, ProjectsApiError } from "@/features/projects/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type DeleteProjectDialogProps = {
  project: Project;
  onDeleted: () => void;
};

export function DeleteProjectDialog({ project, onDeleted }: DeleteProjectDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await deleteProject(project.id);
      setOpen(false);
      onDeleted();
    } catch (requestError) {
      setError(requestError instanceof ProjectsApiError ? requestError.message : "Unable to delete the project. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:bg-red-400/10 hover:text-red-300" aria-label={`Delete ${project.name}`}>
          <Trash2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete project?</DialogTitle>
          <DialogDescription>
            This will permanently delete <span className="font-medium text-foreground">{project.name}</span>. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isDeleting}>Cancel</Button>
          <Button type="button" className="bg-red-500 text-white hover:bg-red-500/90" onClick={handleDelete} disabled={isDeleting}>{isDeleting ? "Deleting…" : "Delete project"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
