import { notFound } from "next/navigation";

import { getContentItem } from "@/features/content/api/server";
import { ContentDetails } from "@/features/content/components/content-details";

export const dynamic = "force-dynamic";

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = await getContentItem(id);

  if (!content) {
    notFound();
  }

  return <ContentDetails content={content} />;
}
