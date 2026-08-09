import { ResearchSourceType } from "@content-os/contracts";

export function formatResearchSourceType(type: ResearchSourceType) {
  return type === ResearchSourceType.X
    ? "X"
    : type === ResearchSourceType.API
      ? "API"
      : type.charAt(0).toUpperCase() + type.slice(1);
}
export function formatResearchDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}
