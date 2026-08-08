"use client";

import * as React from "react";
import type { Content } from "@content-os/contracts";
import { FilePlus2, RefreshCw } from "lucide-react";

import { ContentApiError, getContent } from "@/features/content/api/client";
import { ContentFormDialog } from "@/features/content/components/content-form-dialog";
import { ContentList } from "@/features/content/components/content-list";
import { ContentListSkeleton } from "@/features/content/components/content-list-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ContentScreen() {
  const [content, setContent] = React.useState<Content[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const isMountedRef = React.useRef(false);
  const latestRequestRef = React.useRef(0);

  const loadContent = React.useCallback(async () => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    setIsLoading(true);
    setError(null);

    try {
      const nextContent = await getContent();

      if (isMountedRef.current && latestRequestRef.current === requestId) {
        setContent(nextContent);
      }
    } catch (requestError) {
      if (isMountedRef.current && latestRequestRef.current === requestId) {
        setError(requestError instanceof ContentApiError ? requestError.message : "Unable to load content. Please try again.");
      }
    } finally {
      if (isMountedRef.current && latestRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    isMountedRef.current = true;
    const timeoutId = window.setTimeout(() => {
      void loadContent();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      isMountedRef.current = false;
      latestRequestRef.current += 1;
    };
  }, [loadContent]);

  return (
    <section className="mx-auto max-w-6xl" aria-labelledby="content-title">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">Content library</p>
          <h1 id="content-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Content</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Create and refine the briefs, scripts, and drafts that belong to each project.</p>
        </div>
        <ContentFormDialog onCompleted={() => void loadContent()} />
      </div>

      {isLoading ? <ContentListSkeleton /> : null}

      {!isLoading && error ? <Card className="border-red-400/20 bg-red-400/5"><CardHeader><CardTitle>We couldn’t load content</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => void loadContent()}><RefreshCw className="size-4" />Try again</Button></CardContent></Card> : null}

      {!isLoading && !error && content.length === 0 ? <Card className="border-dashed bg-card/40"><CardHeader className="items-center pt-10 text-center"><span className="mb-2 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><FilePlus2 className="size-5" /></span><CardTitle className="text-lg">Create your first content item</CardTitle><CardDescription className="max-w-sm">Attach a concise brief, script, or draft to an existing project.</CardDescription></CardHeader><CardContent className="pb-10 text-center"><ContentFormDialog onCompleted={() => void loadContent()} /></CardContent></Card> : null}

      {!isLoading && !error && content.length > 0 ? <ContentList content={content} onChanged={() => void loadContent()} /> : null}
    </section>
  );
}
