import { ResearchPackageScreen } from "@/features/research/components/research-package-screen";

export default async function ResearchPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResearchPackageScreen packageId={id} />;
}
