import Link from "next/link";
import type { ReactNode } from "react";
import type { Content } from "@content-os/contracts";
import { ArrowLeft, CalendarDays, FileText, FolderKanban } from "lucide-react";

import { formatContentDate, formatContentStatus, formatContentType, getContentStatusVariant } from "@/features/content/content-utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ContentDetailsProps = {
  content: Content;
};

export function ContentDetails({ content }: ContentDetailsProps) {
  return <section className="mx-auto max-w-4xl" aria-labelledby="content-detail-title"><Link href="/content" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="size-4" />Back to content</Link><Card className="overflow-hidden bg-card/60"><CardHeader className="gap-4 border-b border-border p-5 sm:p-7"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CardTitle id="content-detail-title" className="text-xl sm:text-2xl">{content.title}</CardTitle><Badge variant={getContentStatusVariant(content.status)}>{formatContentStatus(content.status)}</Badge></div><Link href={`/projects/${content.project.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><FolderKanban className="size-4" />{content.project.name}</Link></div></div></CardHeader><CardContent className="grid gap-6 p-5 sm:p-7"><div className="grid gap-5 sm:grid-cols-3"><Metadata label="Content type" value={formatContentType(content.contentType)} /><Metadata label="Created" value={formatContentDate(content.createdAt)} /><Metadata label="Last updated" value={formatContentDate(content.updatedAt)} icon={<CalendarDays className="size-3.5" />} /></div><div className="border-t border-border pt-6"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Body or script</p><div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{content.body}</div></div></CardContent></Card></section>;
}

function Metadata({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1.5 flex items-center gap-1.5 text-sm text-foreground">{icon}{value}</p></div>;
}
