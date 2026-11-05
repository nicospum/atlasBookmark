export type SourcePlatform = 'x' | 'instagram' | 'whatsapp' | 'github'

export type AnalysisMethod = 'rules' | 'gemini' | 'ollama' | 'manual' | 'investigator'
export type ClassificationStatus = 'deterministic' | 'manual' | 'llm' | 'pending'
export type ContentStatus = 'text' | 'link-only'

export type ResourceType =
  | 'Aplicación o herramienta'
  | 'Librería, framework o SDK'
  | 'Skill'
  | 'Servidor MCP o conector'
  | 'Agente o workflow'
  | 'Modelo o dataset'
  | 'Artículo, tutorial, investigación o material educativo'
  | 'Idea o proyecto'
  | 'Otro / pendiente de clasificar'

export type AnalysisState = 'pending' | 'partial' | 'completed' | 'error'

export type VerificationStatus =
  | 'uninvestigated'
  | 'confirmed'
  | 'candidate'
  | 'not_found'
  | 'inaccessible'
  | 'error'

export type LinkedResourceKind =
  | 'github_repo'
  | 'github_other'
  | 'docs'
  | 'webapp'
  | 'article'
  | 'video'
  | 'other'

export interface LinkedResource {
  id: string
  url: string
  resolvedUrl: string
  domain: string
  kind: LinkedResourceKind
  name: string
  fullName?: string
  description: string
  purpose: string
  resourceType: ResourceType
  topics: string[]
  howToUse?: string
  hasDocs?: boolean
  hasExamples?: boolean
  maintenanceStatus?: 'activo' | 'archivado' | 'desconocido'
  license?: string
  stars?: number
  archived?: boolean
  limitations?: string
  evaluation?: string
  verificationStatus: VerificationStatus
  verifiedAt?: string
  provenanceChain: string[]
  evidenceBasis: 'post_text' | 'har_metadata' | 'http_metadata' | 'github_api' | 'manual'
  error?: string
}

export interface BookmarkItem {
  id: string
  platform: SourcePlatform
  sourceUrl: string
  authorName: string
  authorHandle: string
  authorAvatar?: string
  domain?: string
  publishedAt: string
  savedAt: string
  importedAt?: string
  caption: string
  /** Comprehensible short name of the resource, tool, repo, or post subject */
  title?: string
  /** Concrete 1-2 sentence explanation of what it is for ("Para qué sirve") */
  purpose?: string
  /** Canonical resource type taxonomy ("Tipo") */
  resourceType?: ResourceType
  /** Brief utility + main limitation ("Evaluación breve") */
  evaluation?: string
  /** Current state of the analysis & link investigation ("Estado del análisis") */
  analysisState?: AnalysisState
  /** User personal notes (protected across re-imports and re-analysis) */
  notes?: string
  /** Linked external resources (GitHub repos, docs, apps, articles) */
  resources?: LinkedResource[]
  /** Fields manually edited by the user that must not be overwritten automatically */
  manualFields?: string[]
  /** Batch ID of the import event that created this bookmark */
  importBatchId?: string
  contentType?: string
  collections?: string[]
  topics: string[]
  entities: string[]
  aiSummary: string
  language: string
  outgoingLinks: string[]
  mediaType: 'image' | 'video' | 'album' | 'none'
  mediaUrls: string[]
  mediaPaths?: string[]
  mediaStatus?: string
  reviewed: boolean
  likesCount?: number
  repostsCount?: number
  analysisMethod?: AnalysisMethod
  analyzedAt?: string
  classificationStatus?: ClassificationStatus
  classificationMatches?: Record<string, string[]>
  confidence?: number | string
  contentStatus?: ContentStatus
  captureSource?: string
  provenance?: string
  error?: string
}

export interface TopicStat {
  name: string
  count: number
  color: string
  description?: string
}

export interface SourceStat {
  handle: string
  name: string
  platform: SourcePlatform
  avatar?: string
  count: number
}

export interface ExportHistoryItem {
  id: string
  filename: string
  date: string
  sheets: string[]
  totalItems: number
  sizeKb: number
  format?: 'xlsx' | 'csv' | 'json'
}

export interface CaptureLog {
  id: string
  time: string
  platform: SourcePlatform
  type: 'info' | 'success' | 'duplicate' | 'error'
  message: string
}

export type ImportDiagnosticCase =
  | 'ok'
  | 'empty_file'
  | 'invalid_json'
  | 'har_no_bookmark_responses'
  | 'har_empty_bodies'
  | 'no_items_found'
  | 'write_error'

export interface ImportStageMetrics {
  networkEntries: number
  recognizedResponses: number
  emptyBodyResponses: number
  incidentalSkipped: number
  detectedItems: number
  added: number
  updated: number
  duplicates: number
  errors: number
  persistedTotal: number
  diagnosticCase: ImportDiagnosticCase
  diagnosticHint?: string
}

export interface ImportResult {
  added: number
  duplicates: number
  updated: number
  errors: number
  total: number
  messages: string[]
  filename?: string
  captureSource?: string
  stages?: ImportStageMetrics
}

export interface ImportHistoryEntry {
  event_id: string
  created_at: string
  kind: string
  source_file: string
  status: string
  added: number
  duplicates: number
  updated: number
  errors: number
  total_records: number
}

export interface TopicRulesMeta {
  rules: Record<string, string[]>
  sha256: string
  revision: number
  updatedAt: string
  hasBackup: boolean
  backupSha256?: string
  backupUpdatedAt?: string
}

export interface StorageDiagnostics {
  mode: 'local_persistent' | 'cloud_ephemeral'
  platformEnv: 'local' | 'vercel' | 'netlify'
  dbPath: string
  writable: boolean
  isEphemeralFallback?: boolean
  warning?: string
  totalBookmarks: number
  totalResourcesCached: number
}

export interface WhatsAppParsedMessage {
  id: string
  timestamp: string
  sender: string
  text: string
  urls: string[]
  hasLinks: boolean
}

export interface GalleryRepoLanguage {
  name: string
  bytes: number
  percentage?: number
}

export interface GalleryRepoRelease {
  tag: string
  name: string
  publishedAt: string
}

export interface GalleryRepository {
  id: number
  owner: string
  name: string
  fullName: string
  url: string
  avatarUrl: string
  description: string
  explanation: string
  shortExplanationEs?: string
  longExplanationEs?: string
  explanationGeneratedAt?: string
  readme?: string
  imageUrl: string | null
  imageSource: 'readme' | 'opengraph' | 'fallback'
  stars: number
  forks: number
  openIssues: number
  primaryLanguage: string | null
  languages: GalleryRepoLanguage[]
  topics: string[]
  license: string | null
  createdAt: string
  updatedAt: string
  pushedAt: string
  latestRelease: GalleryRepoRelease | null
  addedAt: string
  homepage?: string | null
  defaultBranch?: string
  resourceType?: ResourceType
  linkedBookmarkIds?: string[]
  notes?: string
  customOrder?: number
}

export type ActivityFilterType = 'ALL' | 'recent' | 'month' | 'quarter' | 'inactive'
export type CreatedAtFilterType = 'ALL' | 'week' | 'month' | 'three_months' | 'six_months' | 'year'
export type RepoSortByType = 'custom' | 'stars' | 'bookmarks' | 'recent_added' | 'updated' | 'created' | 'name'
export type DiscoverCategory =
  | 'all'
  | 'recommended'
  | 'trending'
  | 'new'
  | 'ai'
  | 'mcp_agents'
  | 'devtools'
  | 'cli'
  | 'design'
  | 'automation'

export interface RateLimitInfo {
  limit: number
  remaining: number
  resetTime: string
}

export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'local_rules'

export interface AiProviderInfo {
  id: AiProviderId
  displayName: string
  description: string
  configured: boolean
  defaultModel: string
  defaultBaseUrl?: string
  requiresApiKey: boolean
}
