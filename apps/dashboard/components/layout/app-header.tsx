"use client";

import { Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";

import { navigationItems } from "@/config/navigation";
import { useSidebar } from "@/components/providers/sidebar-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AppHeader() {
  const pathname = usePathname();
  const { setMobileOpen } = useSidebar();
  const currentPage = navigationItems.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{currentPage?.label ?? "ContentOS"}</p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">{currentPage?.description ?? "Your content operations workspace"}</p>
      </div>
      <div className="relative hidden w-64 md:block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search workspace" placeholder="Search workspace" className="pl-8" />
      </div>
      <Button variant="outline" size="sm" className="hidden sm:inline-flex">New project</Button>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground" aria-label="ContentOS account">CO</span>
    </header>
  );
}
