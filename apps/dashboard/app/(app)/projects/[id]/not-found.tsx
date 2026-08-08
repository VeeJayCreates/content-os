import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProjectNotFound() {
  return <section className="mx-auto flex min-h-[calc(100svh-10rem)] max-w-4xl items-center justify-center"><Card className="w-full max-w-lg text-center"><CardHeader className="items-center"><span className="mb-2 grid size-10 place-items-center rounded-xl bg-secondary text-muted-foreground"><SearchX className="size-5" /></span><CardTitle>Project not found</CardTitle><CardDescription>This project may have been deleted or the link is no longer valid.</CardDescription></CardHeader><CardContent><Button asChild><Link href="/projects">Return to projects</Link></Button></CardContent></Card></section>;
}
