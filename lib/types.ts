export type SourcePlatform = 'x' | 'instagram'

export type AnalysisMethod = 'rules' | 'gemini' | 'ollama' | 'manual'
export type ClassificationStatus = 'deterministic' | 'manual' | 'llm' | 'pending'
export type ContentStatus = 'text' | 'link-only'

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
}

export interface CaptureLog {
  id: string
  time: string
  platform: SourcePlatform
  type: 'info' | 'success' | 'duplicate' | 'error'
  message: string
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

