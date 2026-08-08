"use client";

import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider, useSidebar } from "@/components/providers/sidebar-provider";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";

function AppShellContent({ children }: Readonly<{ children: ReactNode }>) {
  const { isMobileOpen, setMobileOpen } = useSidebar();

  return (
    <div className="flex min-h-svh bg-background">
      <AppSidebar />
      <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent className="p-0 lg:hidden">
          <AppSidebar mobile />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppShellContent>{children}</AppShellContent>
      </SidebarProvider>
    </TooltipProvider>
  );
}
