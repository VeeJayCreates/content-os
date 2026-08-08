import { Image } from "lucide-react";

import { PageEmptyState } from "@/components/layout/page-empty-state";

export default function MediaPage() {
  return <PageEmptyState title="Media" description="Give every asset a clear home and keep your creative library organized." icon={Image} />;
}
