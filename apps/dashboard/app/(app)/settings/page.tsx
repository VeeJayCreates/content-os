import { Settings } from "lucide-react";

import { PageEmptyState } from "@/components/layout/page-empty-state";

export default function SettingsPage() {
  return <PageEmptyState title="Settings" description="Manage the preferences and configuration for this workspace." icon={Settings} />;
}
