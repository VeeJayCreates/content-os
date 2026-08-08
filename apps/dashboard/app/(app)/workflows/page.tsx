import { Workflow } from "lucide-react";

import { PageEmptyState } from "@/components/layout/page-empty-state";

export default function WorkflowsPage() {
  return <PageEmptyState title="Workflows" description="Design repeatable processes that move content from idea to outcome." icon={Workflow} />;
}
