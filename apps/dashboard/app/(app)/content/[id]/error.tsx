"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ContentDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <section className="mx-auto max-w-lg py-12 text-center"><p className="text-sm font-medium text-red-300">Unable to load content</p><h1 className="mt-2 text-2xl font-semibold">Something went wrong</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Please try loading this content item again.</p><Button className="mt-6" onClick={reset}>Try again</Button></section>;
}
