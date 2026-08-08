import { notFound } from "next/navigation";

import { getProject } from "@/features/projects/api/server";
import { ProjectDetails } from "@/features/projects/components/project-details";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) {
    notFound();
  }

  return <ProjectDetails project={project} />;
}
