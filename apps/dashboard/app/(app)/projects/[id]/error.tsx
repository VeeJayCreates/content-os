"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProjectError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="mx-auto flex min-h-[calc(100svh-10rem)] max-w-4xl items-center justify-center"><Card className="w-full max-w-lg"><CardHeader><CardTitle>We couldn’t load this project</CardTitle><CardDescription>The project service may be temporarily unavailable. Please try again.</CardDescription></CardHeader><CardContent><Button onClick={reset}><RefreshCw className="size-4" />Try again</Button></CardContent></Card></section>;
}
