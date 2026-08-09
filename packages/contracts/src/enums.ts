export enum ProjectStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  PAUSED = "paused",
  ARCHIVED = "archived",
}

export enum JobStatus {
  QUEUED = "queued",
  RUNNING = "running",
  WAITING_HUMAN = "waiting-human",
  COMPLETED = "completed",
  FAILED = "failed",
}

export enum ContentType {
  GEOPOLITICS = "geopolitics",
  ASTROLOGY = "astrology",
}

export enum ContentStatus {
  DRAFT = "draft",
  READY = "ready",
  ARCHIVED = "archived",
}

export enum ResearchSourceType {
  RSS = "rss",
  WEBSITE = "website",
  YOUTUBE = "youtube",
  X = "x",
  REDDIT = "reddit",
  OFFICIAL = "official",
  API = "api",
}
