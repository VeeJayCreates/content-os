import { ProjectListSkeleton } from "@/features/projects/components/project-list-skeleton";

export default function ProjectsLoading() {
  return <section className="mx-auto max-w-6xl"><div className="mb-7"><div className="h-4 w-32 animate-pulse rounded bg-muted" /><div className="mt-3 h-8 w-40 animate-pulse rounded bg-muted" /></div><ProjectListSkeleton /></section>;
}
