import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ContentNotFound() {
  return <section className="mx-auto max-w-lg py-12 text-center"><p className="text-sm font-medium text-primary">Not found</p><h1 className="mt-2 text-2xl font-semibold">Content item unavailable</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">It may have been deleted or the link is no longer valid.</p><Button asChild className="mt-6"><Link href="/content">Back to content</Link></Button></section>;
}
