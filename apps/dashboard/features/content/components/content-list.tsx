"use client";

import Link from "next/link";
import type { Content } from "@content-os/contracts";
import { ArrowUpRight, CalendarDays, FileText, FolderKanban } from "lucide-react";

import { ContentFormDialog } from "@/features/content/components/content-form-dialog";
import { DeleteContentDialog } from "@/features/content/components/delete-content-dialog";
import { formatContentDate, formatContentStatus, formatContentType, getContentStatusVariant } from "@/features/content/content-utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ContentListProps = {
  content: Content[];
  onChanged: () => void;
};

export function ContentList({ content, onChanged }: ContentListProps) {
  return <div className="grid gap-3">{content.map((item) => <Card key={item.id} className="group overflow-hidden bg-card/60 transition-colors hover:border-primary/35"><CardHeader className="gap-3 p-4 sm:p-5"><div className="flex items-start gap-3"><span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><FileText className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><CardTitle className="truncate text-base">{item.title}</CardTitle><Badge variant={getContentStatusVariant(item.status)}>{formatContentStatus(item.status)}</Badge></div><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.body}</p></div><div className="flex shrink-0 items-center"><ContentFormDialog content={item} onCompleted={onChanged} /><DeleteContentDialog content={item} onDeleted={onChanged} /></div></div></CardHeader><CardContent className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><Link href={`/projects/${item.project.id}`} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"><FolderKanban className="size-3.5" />{item.project.name}</Link><span>{formatContentType(item.contentType)}</span><span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />Updated {formatContentDate(item.updatedAt)}</span></div><Link href={`/content/${item.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View content <ArrowUpRight className="size-3.5" /></Link></CardContent></Card>)}</div>;
}
