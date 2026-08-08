import { ContentType, ProjectStatus } from "@content-os/contracts";

export function formatProjectDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatContentType(contentType: ContentType) {
  return contentType.replace(/(^|[-_])(\w)/g, (_, __, character: string) => character.toUpperCase());
}

export function formatProjectStatus(status: ProjectStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export function getStatusVariant(status: ProjectStatus) {
  switch (status) {
    case ProjectStatus.ACTIVE:
      return "success" as const;
    case ProjectStatus.PAUSED:
      return "warning" as const;
    case ProjectStatus.ARCHIVED:
      return "muted" as const;
    default:
      return "default" as const;
  }
}
