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

export enum ResearchSourceRole {
  DISCOVERY = "discovery",
  VERIFICATION = "verification",
  BOTH = "both",
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

export enum ResearchVerificationStatus {
  INSUFFICIENT = 'insufficient',
  SINGLE_SOURCE = 'single_source',
  CORROBORATED = 'corroborated',
  CONFLICTING = 'conflicting',
  REVIEW_REQUIRED = 'review_required',
}

export enum TopicSelectionDecision {
  SELECTED = "selected",
  HOLD = "hold",
  REJECTED = "rejected",
}
export enum ProductionQueueStatus { QUEUED = 'queued', PROCESSING = 'processing', COMPLETED = 'completed', FAILED = 'failed', SKIPPED = 'skipped' }

export enum EditorialTimelinessPreference {
  BREAKING = "breaking",
  BALANCED = "balanced",
  EVERGREEN = "evergreen",
}

export enum EditorialAssessmentStatus { PENDING = 'pending', READY = 'ready', FAILED = 'failed', STALE = 'stale' }
export enum EditorialAssessmentBand { LOW = 'low', MEDIUM = 'medium', HIGH = 'high' }
export enum EditorialAssessmentLongevity { BREAKING = 'breaking', TIMELY = 'timely', EVERGREEN = 'evergreen' }
export enum EditorialAssessmentRecommendation { REJECT = 'reject', HOLD = 'hold', CONSIDER = 'consider', STRONG_CANDIDATE = 'strong_candidate' }
export enum ContentAngleType { BREAKING = 'breaking', EXPLAINER = 'explainer', FACT_CHECK = 'fact_check', ANALYSIS = 'analysis', UPDATE = 'update' }
export enum AiTask { CONTENT_ANGLE = 'content_angle', SCRIPT_GENERATION = 'script_generation', CONTENT_PACKAGE_GENERATION = 'content_package_generation', SEMANTIC_EMBEDDING = 'semantic_embedding', SEMANTIC_RERANKING = 'semantic_reranking' }
export enum ScriptStatus { GENERATING = 'generating', READY = 'ready', FAILED = 'failed' }
export enum ScriptFormat { YOUTUBE_SHORT = 'youtube_short', YOUTUBE_LONG = 'youtube_long' }
export enum ScriptLanguage { HINDI = 'Hindi', HINGLISH = 'Hinglish', ENGLISH = 'English' }
export enum ContentStylePreset { GEOPOLITICS_NEWS = 'geopolitics_news', EDUCATIONAL = 'educational', DOCUMENTARY = 'documentary', TECHNOLOGY = 'technology', FINANCE = 'finance', ENTERTAINMENT = 'entertainment', CUSTOM = 'custom' }
export enum ContentStyleIntensity { NONE = 'none', LOW = 'low', MEDIUM = 'medium', HIGH = 'high' }
export enum ContentTone { CONVERSATIONAL = 'conversational', AUTHORITATIVE = 'authoritative', CONVERSATIONAL_AUTHORITATIVE = 'conversational_authoritative', NEUTRAL = 'neutral' }
export enum NarrationStyle { EXPLAINER = 'explainer', COMMENTARY_EXPLAINER = 'commentary_explainer', DOCUMENTARY = 'documentary', STORYTELLING = 'storytelling' }
export enum HookStyle { PUNCHY = 'punchy', CURIOSITY_DRIVEN = 'curiosity_driven', DIRECT = 'direct', QUESTION = 'question' }
export enum AiCapability { STRUCTURED_GENERATION = 'structured_generation', TEXT_GENERATION = 'text_generation', EMBEDDING = 'embedding', RERANKING = 'reranking', CLASSIFICATION = 'classification' }
export enum AiExecutionStatus { SUCCEEDED = 'succeeded', FAILED = 'failed' }
export enum AiExecutionMode { SYNCHRONOUS = 'synchronous', BATCH = 'batch' }
export enum AiBatchStatus { QUEUED = 'queued', SUBMITTED = 'submitted', PROCESSING = 'processing', COMPLETED = 'completed', FAILED = 'failed', CANCELLED = 'cancelled', EXPIRED = 'expired' }
export enum AiBatchItemStatus { QUEUED = 'queued', SUBMITTED = 'submitted', PROCESSING = 'processing', COMPLETED = 'completed', FAILED = 'failed', CANCELLED = 'cancelled', EXPIRED = 'expired' }
