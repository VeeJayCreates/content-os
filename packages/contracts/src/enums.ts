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
export enum AiTask { CONTENT_ANGLE = 'content_angle', SCRIPT_GENERATION = 'script_generation', CONTENT_PACKAGE_GENERATION = 'content_package_generation', SCENE_PLANNING = 'scene_planning', SEMANTIC_EMBEDDING = 'semantic_embedding', SEMANTIC_RERANKING = 'semantic_reranking' }
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
export enum ScenePlanStatus { PENDING = 'pending', READY = 'ready', FAILED = 'failed' }
export enum SceneType { PRESENTER = 'presenter', B_ROLL = 'b_roll', MAP = 'map', ANIMATION = 'animation', IMAGE = 'image', GENERATED_VIDEO = 'generated_video', SCREEN_DEMO = 'screen_demo', CHART_OR_SCREENSHOT = 'chart_or_screenshot', TEXT = 'text' }
export enum SceneMediaStrategy { REUSABLE_ASSET = 'reusable_asset', EXISTING_ASSET = 'existing_asset', STOCK_OR_SOURCE_FOOTAGE = 'stock_or_source_footage', PROGRAMMATIC_ANIMATION = 'programmatic_animation', REUSABLE_MAP_ANIMATION = 'reusable_map_animation', AI_IMAGE = 'ai_image', AI_IMAGE_TO_VIDEO = 'ai_image_to_video', GENERATED_VIDEO = 'generated_video', SCREEN_CAPTURE = 'screen_capture', PRESENTER = 'presenter', TEXT_ONLY = 'text_only', MANUAL = 'manual' }
export enum AudioGenerationStatus { PENDING = 'pending', READY = 'ready', FAILED = 'failed' }
export enum AudioSegmentStatus { PENDING = 'pending', READY = 'ready', FAILED = 'failed' }
export enum VoiceEmotion { NEUTRAL = 'neutral', WARM = 'warm', SERIOUS = 'serious', URGENT = 'urgent', CURIOUS = 'curious', EMPATHETIC = 'empathetic', ENERGETIC = 'energetic' }
export enum VoiceIntensity { LOW = 'low', MEDIUM = 'medium', HIGH = 'high' }
export enum VoiceSpeakingRate { SLOW = 'slow', NORMAL = 'normal', FAST = 'fast' }
export enum VoicePitchDirection { LOWER = 'lower', NEUTRAL = 'neutral', HIGHER = 'higher' }
export enum VoiceNonVerbalEvent { LAUGH = 'laugh', CHUCKLE = 'chuckle', BREATH = 'breath', SIGH = 'sigh' }
