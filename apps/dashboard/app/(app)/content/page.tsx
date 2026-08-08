import { PanelTop } from "lucide-react";

import { PageEmptyState } from "@/components/layout/page-empty-state";

export default function ContentPage() {
  return <PageEmptyState title="Content" description="Plan and manage the content your team is bringing to life." icon={PanelTop} />;
}
