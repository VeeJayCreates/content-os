"use client";

import * as React from "react";

type SidebarContextValue = {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isMobileOpen, setMobileOpen] = React.useState(false);

  const toggleSidebar = React.useCallback(() => {
    setIsCollapsed((collapsed) => !collapsed);
  }, []);

  const value = React.useMemo(
    () => ({ isCollapsed, isMobileOpen, setMobileOpen, toggleSidebar }),
    [isCollapsed, isMobileOpen, toggleSidebar],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = React.useContext(SidebarContext);

  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }

  return context;
}
