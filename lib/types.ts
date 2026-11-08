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
  | 'Archivo separado / Otro tema (No técnico)'
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
  agentEvaluation?: RepoAgentEvaluation
}

export interface RepoAgentEvaluation {
  /** Qué es y para qué sirve en español claro */
  whatIsItEs: string
  /** Área o dominio principal (ej. Agentes Autónomos & MCP, IA Generativa & LLMs, Video & Voz...) */
  areaCategory: string
  /** Empresa, laboratorio u organización creadora (ej. Anthropic, Microsoft, Google, Comunidad @owner) */
  companyOrAuthor: string
  /** Tipo de creador: oficial de empresa/org reconocida o independiente */
  creatorKind: 'Empresa / Laboratorio Oficial' | 'Organización Open Source' | 'Autor / Comunidad Independiente'
  /** Puntaje numérico calculado por el agente (1.0 a 10.0) */
  atlasScore: number
  /** Etiqueta formateada del puntaje (ej. "9.4 / 10 (Sobresaliente)") */
  atlasScoreLabel: string
  /** Grado de seguridad y confianza */
  securityGrade: 'Alto' | 'Medio' | 'Precaución'
  /** Explicación de seguridad (licencia, ejecución local/red, organización verificada) */
  securitySummary: string
  /** Para qué proyecto o caso de uso sirve concretamente */
  projectUseCases: string
  /** Nivel de madurez y tracción */
  maturityLevel: 'Producción / Consolidado' | 'En crecimiento activo' | 'Experimental / Reciente' | 'Referencia en guardados'
  /** Complejidad de integración en proyectos propios */
  integrationComplexity: 'Baja (Plug & Play / 1-Clic)' | 'Media (Configuración estándar)' | 'Alta (Infraestructura / Custom)'
  /** Evaluación comercial de la licencia */
  licenseSummary: string
  /** Estado de verificación de los datos */
  verificationStatusLabel: string
  /** Fuentes donde apareció (X, WhatsApp, Instagram, Lista GitHub, Cazador) */
  sourcesSummary: string
}

export interface FallbackReferenceLink {
  /** El enlace directo al post/hilo/comentario o al link intermedio expandido ("el link de ese link") */
  primaryUrl: string
  /** Etiqueta descriptiva del enlace primario (ej. "Abrir link intermedio (cleanapis.com)" o "Ver comentarios del hilo en X (@autor)") */
  primaryLabel: string
  /** URL de búsqueda inteligente en Google pre-armada para encontrar el repo en 1 clic */
  webSearchUrl: string
  /** URL de búsqueda directa en GitHub pre-armada */
  githubSearchUrl: string
  /** Términos clave extraídos por el agente para buscar */
  extractedQuery: string
  /** Explicación de por qué quedó como link de referencia */
  reasonEs: string
}

export interface DeepHuntResultItem {
  bookmarkId: string
  bookmarkTitle: string
  platform: SourcePlatform
  sourceUrl: string
  discoveredRepos: Array<{
    fullName: string
    url: string
    description: string
    stars?: number
    discoveryMethod:
      | 'tweet_hydration'
      | 'reply_or_thread'
      | 'external_page_scrape'
      | 'github_search_inference'
      | 'shortlink_expansion'
      | 'ai_web_grounding'
      | 'jina_reader_thread'
      | 'author_bio_or_quote'
    confidence: 'confirmado' | 'probable'
  }>
  /** Si no se halló repo directo en GitHub, se adjunta siempre "el link de ese link" + búsqueda asistida en 1 clic */
  fallbackReference?: FallbackReferenceLink
  /** Indica si el elemento fue apartado automáticamente por ser de otro tema no técnico (fotos personales, deportes, ocio, etc.) */
  isOffTopicSeparated?: boolean
  offTopicCategory?: string
}

export type ActivityFilterType =
  | 'ALL'
  | 'recent'
  | 'month'
  | 'quarter'
  | 'inactive'
  | 'active_week'
  | 'active_month'
  | 'active_quarter'
export type CreatedAtFilterType = 'ALL' | 'week' | 'month' | 'three_months' | 'six_months' | 'year'
export type RepoSortByType =
  | 'custom'
  | 'stars'
  | 'bookmarks'
  | 'recent_added'
  | 'updated'
  | 'created'
  | 'name'
  | 'score_desc'
  | 'bookmarks_desc'
  | 'stars_desc'
  | 'updated_desc'
  | 'created_desc'
  | 'added_desc'
  | 'name_asc'
export type DiscoverCategory =
  | 'all'
  | 'featured'
  | 'recommended'
  | 'for_you'
  | 'trending'
  | 'new'
  | 'new_noteworthy'
  | 'ai'
  | 'mcp_agents'
  | 'devtools'
  | 'cli'
  | 'ui'
  | 'design'
  | 'automation'

export interface RateLimitInfo {
  limit: number
  remaining: number
  resetTime: string
}

export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'local_rules' | 'deterministic'

export interface AiProviderInfo {
  id: AiProviderId
  displayName?: string
  name?: string
  description?: string
  configured: boolean
  defaultModel?: string
  model?: string
  defaultBaseUrl?: string
  requiresApiKey?: boolean
}

export interface InstallSnippetInfo {
  primaryCommand: string
  commands: string[]
  allCommands?: string[]
  mcpConfigJson?: string
  category: 'mcp' | 'skill' | 'npm' | 'pip' | 'docker' | 'git'
  installKind?: 'npx' | 'mcp' | 'skill' | 'pip' | 'uv' | 'npm' | 'docker' | 'cargo' | 'git'
}

export interface ProjectBlueprint {
  id: string
  name: string
  description: string
  goal: string
  repoFullNames: string[]
  bookmarkIds: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface RepoSecurityAuditResult {
  fullName: string
  auditedAt: string
  riskLevel: 'Bajo' | 'Medio' | 'Alto'
  securityScore: number
  summaryEs: string
  manifestFilesFound: string[]
  capabilitiesDetected: {
    executesShellCommands: boolean
    networkAccess: boolean
    fileSystemWrite: boolean
    readsEnvSecrets: boolean
    usesBrowserAutomation: boolean
  }
  hasAutomatedTests: boolean
  hasSkillMd: boolean
  hasMcpServerConfig: boolean
  dependenciesPreview: string[]
  recommendationsEs: string[]
}

export interface LocalInstallResult {
  success: boolean
  fullName: string
  installMode: 'skill_clone' | 'mcp_config' | 'repo_clone'
  targetPath: string
  messageEs: string
  commandExecuted?: string
}

export interface StackRecommendationItem {
  fullName: string
  url: string
  roleInProject: string
  roleInStack?: string
  resourceType?: ResourceType | string
  areaCategory?: string
  companyOrAuthor?: string
  whySelectedEs: string
  atlasScore: number
  securityGrade: 'Alto' | 'Medio' | 'Precaución'
  primaryLanguage: string | null
  installCommand: string
}

export interface StackRecommendationResult {
  projectIdea: string
  idea?: string
  suggestedName: string
  projectName?: string
  architectureSummaryEs: string
  recommendedRepos: StackRecommendationItem[]
  selectedRepos?: StackRecommendationItem[]
  compatibilityNotesEs: string[] | string
  generatedBlueprint: ProjectBlueprint
  masterPromptMarkdown: string
}

export interface ReleaseRadarItem {
  fullName: string
  url: string
  avatarUrl: string
  resourceType?: ResourceType
  areaCategory: string
  companyOrAuthor: string
  stars: number
  atlasScore: number
  latestRelease?: GalleryRepoRelease | null
  latestReleaseTag?: string | null
  latestReleaseDate?: string | null
  pushedAt: string
  daysSincePush: number
  daysSinceLastPush?: number
  highlightReasonEs: string
  shortExplanationEs?: string
}
