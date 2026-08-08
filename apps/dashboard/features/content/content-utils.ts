import { ContentStatus, ContentType } from "@content-os/contracts";

export function formatContentDate(value: string) {
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

export function formatContentStatus(status: ContentStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export function getContentStatusVariant(status: ContentStatus) {
  switch (status) {
    case ContentStatus.READY:
      return "success" as const;
    case ContentStatus.ARCHIVED:
      return "muted" as const;
    default:
      return "warning" as const;
  }
}
