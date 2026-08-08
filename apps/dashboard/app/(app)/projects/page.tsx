import { FolderKanban } from "lucide-react";

import { PageEmptyState } from "@/components/layout/page-empty-state";

export default function ProjectsPage() {
  return <PageEmptyState title="Projects" description="Create focused initiatives and keep every content effort aligned." icon={FolderKanban} />;
}
