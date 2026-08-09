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

export enum SignalIngestionStatus {
  CREATED = "created",
  DUPLICATE = "duplicate",
  SKIPPED = "skipped",
}

export enum OpportunityStatus {
  DETECTED = "detected",
  SHORTLISTED = "shortlisted",
  REJECTED = "rejected",
  CONVERTED = "converted",
}

export enum ResearchPackageStatus {
  PENDING = "pending",
  READY = "ready",
  NEEDS_REVIEW = "needs_review",
  FAILED = "failed",
}

export enum ResearchFactStatus {
  SUPPORTED = "supported",
  CONFLICTING = "conflicting",
  UNVERIFIED = "unverified",
}

export enum TopicSelectionDecision {
  SELECTED = "selected",
  HOLD = "hold",
  REJECTED = "rejected",
}
