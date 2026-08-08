import { CalendarDays } from "lucide-react";

import { PageEmptyState } from "@/components/layout/page-empty-state";

export default function SchedulerPage() {
  return <PageEmptyState title="Scheduler" description="Coordinate publishing activity across every channel and campaign." icon={CalendarDays} />;
}
