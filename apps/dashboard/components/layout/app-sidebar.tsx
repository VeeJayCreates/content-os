"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, Command, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { navigationItems } from "@/config/navigation";
import { useSidebar } from "@/components/providers/sidebar-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type AppSidebarProps = {
  mobile?: boolean;
};

export function AppSidebar({ mobile = false }: AppSidebarProps) {
  const pathname = usePathname();
  const { isCollapsed, setMobileOpen, toggleSidebar } = useSidebar();
  const collapsed = !mobile && isCollapsed;

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground",
        !mobile && "hidden border-r border-sidebar-border lg:flex",
        !mobile && (collapsed ? "w-[4.5rem]" : "w-64"),
      )}
    >
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        <Link
          href="/"
          className={cn("flex min-w-0 items-center gap-2.5 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", collapsed && "justify-center")}
          onClick={() => mobile && setMobileOpen(false)}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Command className="size-4" strokeWidth={2.5} />
          </span>
          {!collapsed && <span className="truncate text-sm">ContentOS</span>}
        </Link>
        {!collapsed && !mobile && (
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={toggleSidebar} aria-label="Collapse sidebar">
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>

      <Separator className="bg-sidebar-border" />

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Primary navigation">
        <p className={cn("mb-2 px-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground", collapsed && "sr-only")}>Workspace</p>
        <ul className="space-y-1">
          {navigationItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            const link = (
              <Link
                href={item.href}
                onClick={() => mobile && setMobileOpen(false)}
                className={cn(
                  "group flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                  collapsed && "justify-center px-0",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );

            return (
              <li key={item.href}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : link}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="w-full text-muted-foreground hover:text-foreground" onClick={toggleSidebar} aria-label="Expand sidebar">
                <PanelLeftOpen className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>
        ) : (
          <button type="button" className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <span className="grid size-7 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">CO</span>
            <span className="min-w-0 flex-1 truncate">ContentOS workspace</span>
            <ChevronsLeft className="size-3.5 opacity-50" />
          </button>
        )}
      </div>
    </aside>
  );
}
