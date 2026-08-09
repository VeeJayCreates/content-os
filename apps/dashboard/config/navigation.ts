import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  CalendarDays,
  FolderKanban,
  Gauge,
  Image,
  PanelTop,
  Search,
  Settings,
  Workflow,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
};

export const navigationItems: readonly NavigationItem[] = [
  {
    href: "/",
    icon: Gauge,
    label: "Dashboard",
    description: "Your workspace overview",
  },
  {
    href: "/projects",
    icon: FolderKanban,
    label: "Projects",
    description: "Organize content initiatives",
  },
  {
    href: "/content",
    icon: PanelTop,
    label: "Content",
    description: "Create and manage content",
  },
  {
    href: "/research",
    icon: Search,
    label: "Research",
    description: "Manage research sources",
  },
  {
    href: "/ai-studio",
    icon: Bot,
    label: "AI Studio",
    description: "Build with AI assistance",
  },
  {
    href: "/workflows",
    icon: Workflow,
    label: "Workflows",
    description: "Automate repeatable work",
  },
  {
    href: "/media",
    icon: Image,
    label: "Media",
    description: "Manage creative assets",
  },
  {
    href: "/scheduler",
    icon: CalendarDays,
    label: "Scheduler",
    description: "Plan publishing activity",
  },
  {
    href: "/analytics",
    icon: BarChart3,
    label: "Analytics",
    description: "Understand performance",
  },
  {
    href: "/settings",
    icon: Settings,
    label: "Settings",
    description: "Manage workspace preferences",
  },
];
