"use client";

import { useEffect, useState } from "react";
import { Network } from "lucide-react";
import type { ProjectChannelHierarchy } from "@content-os/contracts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProjectChannelHierarchy } from "@/features/projects/api/client";

export function ProjectChannelHierarchy({ projectId }: { projectId: string }) {
  const [hierarchy, setHierarchy] = useState<ProjectChannelHierarchy | null>(null);

  useEffect(() => {
    let active = true;
    void getProjectChannelHierarchy(projectId)
      .then((value) => active && setHierarchy(value))
      .catch(() => active && setHierarchy({ productProfile: null, channels: [] }));
    return () => {
      active = false;
    };
  }, [projectId]);

  if (!hierarchy) {
    return null;
  }

  return <ProjectChannelHierarchyContent hierarchy={hierarchy} />;
}

export function ProjectChannelHierarchyContent({ hierarchy }: { hierarchy: ProjectChannelHierarchy }) {
  return (
    <Card className="mt-5 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Network className="size-4 text-primary" />Project hierarchy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Product</p><p className="mt-1 font-medium">{hierarchy.productProfile?.name ?? "Not configured"}</p></div>
        <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Channels</p><ul className="mt-1 space-y-1">{hierarchy.channels.map((channel) => <li key={channel.id}>{channel.name}</li>)}{hierarchy.channels.length === 0 && <li className="text-muted-foreground">No channels configured</li>}</ul></div>
      </CardContent>
    </Card>
  );
}
