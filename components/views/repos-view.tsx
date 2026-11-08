'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  FolderGit2,
  GitBranch as Github,
  Star,
  GitFork,
  ExternalLink,
  Search,
  Sparkles,
  Plus,
  RefreshCw,
  Download,
  Upload,
  Settings2,
  Trash2,
  Check,
  Copy,
  FileText,
  X,
  Compass,
  LayoutGrid,
  List,
  MessageSquare,
  Send,
  Calendar,
  Scale,
  AlertCircle,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Bot,
  KeyRound,
  CheckCircle2,
  Loader2,
  Globe,
  Terminal,
  Layers,
  Columns,
  Pause,
  Link2,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Cloud,
  Rocket,
  Cpu
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  generateRepositoriesExcelFile,
  downloadRepositoriesCsvFile
} from '@/lib/excel-export'
import { ReposSkillsExcelTable } from '@/components/repos-skills-excel-table'
import type {
  ActivityFilterType,
  AiProviderId,
  AiProviderInfo,
  BookmarkItem,
  CreatedAtFilterType,
  DiscoverCategory,
  GalleryRepository,
  InstallSnippetInfo,
  LocalInstallResult,
  ProjectBlueprint,
  RateLimitInfo,
  ReleaseRadarItem,
  RepoSecurityAuditResult,
  RepoSortByType,
  ResourceType,
  StackRecommendationResult
} from '@/lib/types'

interface ReposViewProps {
  bookmarks: BookmarkItem[]
  onOpenBookmarkDetail: (item: BookmarkItem) => void
  onRefreshBookmarks: () => Promise<void>
  initialSelectedRepoFullName?: string | null
  onClearInitialSelectedRepo?: () => void
}

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  PHP: '#4F5D95',
  Ruby: '#701516',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Shell: '#89e051',
  Jupyter: '#DA5B0B',
  MDX: '#fcb32c'
}

const SEARCH_SYNONYMS: Record<string, string[]> = {
  voice: ['speech', 'audio', 'tts', 'stt', 'sound', 'whisper', 'voz'],
  voz: ['voice', 'speech', 'audio', 'tts', 'stt', 'whisper'],
  ai: ['llm', 'machine-learning', 'claude', 'gemini', 'gpt', 'agent', 'rag', 'mcp', 'ia'],
  ia: ['ai', 'llm', 'agent', 'claude', 'gemini', 'mcp', 'skill', 'rag'],
  agents: ['agent', 'autonomous', 'crew', 'assistant', 'swarm', 'subagent', 'agentes'],
  agentes: ['agent', 'agents', 'autonomous', 'swarm', 'subagents', 'claude-code'],
  mcp: ['model-context-protocol', 'connector', 'server', 'claude-code', 'cursor'],
  skill: ['skills', 'claude-code', 'cursor', 'commands', 'prompts', 'agent-skills'],
  ui: ['components', 'design-system', 'tailwind', 'styling', 'frontend', 'css', 'shadcn'],
  cli: ['terminal', 'command-line', 'shell', 'bash', 'consola'],
  video: ['ffmpeg', 'remotion', 'media', 'mp4', 'render']
}

const RESOURCE_TYPE_OPTIONS: ResourceType[] = [
  'Skill',
  'Servidor MCP o conector',
  'Agente o workflow',
  'Librería, framework o SDK',
  'Aplicación o herramienta',
  'Modelo o dataset',
  'Artículo, tutorial, investigación o material educativo',
  'Idea o proyecto',
  'Otro / pendiente de clasificar'
]

const DISCOVER_CATEGORIES: Array<{ id: DiscoverCategory; label: string; desc: string }> = [
  { id: 'featured', label: '⭐ Destacados', desc: 'Repositorios open-source con mayor impacto global' },
  { id: 'mcp_agents', label: '🧩 Agentes, MCP & Skills', desc: 'Servidores MCP, Skills para Claude/Cursor y agentes autónomos' },
  { id: 'ai', label: '🤖 IA & LLMs', desc: 'Modelos, inferencia, RAG y herramientas de IA generativa' },
  { id: 'devtools', label: '🛠️ DevTools & Editores', desc: 'Herramientas para desarrolladores, IDEs y productividad' },
  { id: 'cli', label: '💻 Terminal & CLI', desc: 'Utilidades de línea de comandos rápidas y modernas' },
  { id: 'ui', label: '🎨 UI & Componentes', desc: 'Sistemas de diseño, componentes React y animaciones' },
  { id: 'automation', label: '⚡ Automatización', desc: 'Workflows, scraping, bots y orquestadores' },
  { id: 'new_noteworthy', label: '🚀 Nuevos Lanzamientos', desc: 'Proyectos creados en los últimos 30 días con tracción rápida' },
  { id: 'for_you', label: '💡 Recomendados para vos', desc: 'Basado en las etiquetas y lenguajes de tu galería actual' }
]

function getLanguageColor(lang: string | null | undefined): string {
  if (!lang) return '#7c6cf0'
  return LANGUAGE_COLORS[lang] || '#7c6cf0'
}

function formatNum(num: number | undefined | null): string {
  const n = Number(num) || 0
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return n.toString()
}

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

function getActivityBadge(dateStr: string | null | undefined) {
  if (!dateStr) {
    return { label: 'En archivo', dot: 'bg-[#9b91f5]', cls: 'border-[#35314f] bg-[#1a1829] text-[#bfb8ff]', days: 30 }
  }
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) {
    return { label: 'En archivo', dot: 'bg-[#9b91f5]', cls: 'border-[#35314f] bg-[#1a1829] text-[#bfb8ff]', days: 30 }
  }
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)))
  if (days <= 7) {
    return {
      label: days === 0 ? 'Activo hoy' : `Activo hace ${days}d`,
      dot: 'bg-emerald-400',
      cls: 'border-emerald-800/40 bg-emerald-950/40 text-emerald-300',
      days
    }
  }
  if (days <= 30) {
    return {
      label: 'Activo este mes',
      dot: 'bg-teal-400',
      cls: 'border-teal-800/40 bg-teal-950/40 text-teal-300',
      days
    }
  }
  if (days <= 90) {
    return {
      label: `Hace ${Math.max(1, Math.floor(days / 30))}m`,
      dot: 'bg-amber-400',
      cls: 'border-amber-800/40 bg-amber-950/40 text-amber-300',
      days
    }
  }
  return {
    label: `Hace ${Math.max(3, Math.floor(days / 30))}m`,
    dot: 'bg-zinc-500',
    cls: 'border-border bg-[#161821] text-muted-foreground',
    days
  }
}

function getResourceTypeStyle(rt?: ResourceType): string {
  switch (rt) {
    case 'Skill':
      return 'border-fuchsia-500/40 bg-fuchsia-950/40 text-fuchsia-300'
    case 'Servidor MCP o conector':
      return 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300'
    case 'Agente o workflow':
      return 'border-violet-500/40 bg-violet-950/40 text-violet-300'
    case 'Librería, framework o SDK':
      return 'border-blue-500/40 bg-blue-950/40 text-blue-300'
    case 'Aplicación o herramienta':
      return 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
    case 'Modelo o dataset':
      return 'border-amber-500/40 bg-amber-950/40 text-amber-300'
    default:
      return 'border-[#383456] bg-[#211f33] text-[#c5bfff]'
  }
}

function extractGitHubReposFromFreeText(text: string): Array<{ owner: string; repo: string; cleanUrl: string; contextHint?: string }> {
  if (!text) return []
  const rx = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)(?:[^\s<>"'`)\]]*)?/gi
  const reserved = new Set([
    'about', 'pricing', 'features', 'enterprise', 'topics', 'trending', 'collections',
    'events', 'sponsors', 'readme', 'settings', 'notifications', 'new', 'organizations',
    'orgs', 'users', 'marketplace', 'explore', 'search', 'login', 'join', 'pulls', 'issues',
    'http', 'https', 'www', 'src', 'app', 'lib', 'components', 'data', 'scripts', 'tests'
  ])
  const seen = new Set<string>()
  const out: Array<{ owner: string; repo: string; cleanUrl: string; contextHint?: string }> = []
  let m: RegExpExecArray | null
  while ((m = rx.exec(text)) !== null) {
    const owner = m[1].trim()
    let repo = m[2].trim().replace(/[.,;:!?)\],'">]+$/, '')
    if (repo.endsWith('.git')) repo = repo.slice(0, -4)
    repo = repo.replace(/\/+$/, '')
    if (!owner || !repo) continue
    if (reserved.has(owner.toLowerCase()) || reserved.has(repo.toLowerCase())) continue
    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push({ owner, repo, cleanUrl: `https://github.com/${owner}/${repo}` })
    }
  }
  // Also support shorthand `owner/repo` lines!
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || /github\.com\//i.test(line)) continue
    const sm = line.match(
      /^(?:[-*•\d.)\s`[\]]*)?([a-zA-Z][a-zA-Z0-9_-]{1,38})\/([a-zA-Z0-9_.-]{2,80})(?:\s*[-:–—|]\s*(.*))?$/
    )
    if (!sm) continue
    const owner = sm[1].trim()
    let repo = sm[2].trim().replace(/[.,;:!?)\],'`">]+$/, '')
    if (repo.endsWith('.git')) repo = repo.slice(0, -4)
    if (
      !owner ||
      !repo ||
      reserved.has(owner.toLowerCase()) ||
      reserved.has(repo.toLowerCase()) ||
      /\.(?:ts|tsx|js|jsx|json|md|py|css|html|yml|yaml|sh|txt|csv)$/i.test(repo)
    ) {
      continue
    }
    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push({
        owner,
        repo,
        cleanUrl: `https://github.com/${owner}/${repo}`,
        contextHint: sm[3]?.trim() || undefined
      })
    }
  }
  return out
}

function getRepoInstallSnippets(repo: GalleryRepository): InstallSnippetInfo {
  const fullName = repo.fullName || `${repo.owner || 'owner'}/${repo.name || 'repo'}`
  const name = repo.name || fullName.split('/')[1] || 'repo'
  const readme = repo.readme || ''
  const rType = repo.resourceType || 'Otro / pendiente de clasificar'
  const lang = (repo.primaryLanguage || '').toLowerCase()

  const commands: string[] = []
  const cmdRegexes = [
    /^\s*(?:\$\s*)?((?:npx|bunx|pnpx)\s+[^\r\n`#"]+)/gim,
    /^\s*(?:\$\s*)?(claude\s+mcp\s+add[^\r\n`#"]+)/gim,
    /^\s*(?:\$\s*)?(uvx\s+[^\r\n`#"]+)/gim,
    /^\s*(?:\$\s*)?((?:pip|pip3|uv\s+pip|uv\s+tool)\s+install\s+[^\r\n`#"]+)/gim,
    /^\s*(?:\$\s*)?((?:npm|pnpm|yarn|bun)\s+(?:install|i|add)\s+[^\r\n`#"]+)/gim,
    /^\s*(?:\$\s*)?(cargo\s+install\s+[^\r\n`#"]+)/gim,
    /^\s*(?:\$\s*)?(docker\s+(?:run|pull)\s+[^\r\n`#"]+)/gim,
    /^\s*(?:\$\s*)?(git\s+clone\s+https?:\/\/github\.com\/[^\r\n`#"]+)/gim
  ]

  for (const rx of cmdRegexes) {
    let m: RegExpExecArray | null
    while ((m = rx.exec(readme)) !== null) {
      const clean = m[1].trim().replace(/\s+/g, ' ')
      if (clean.length >= 8 && clean.length <= 140 && !commands.includes(clean)) {
        commands.push(clean)
        if (commands.length >= 5) break
      }
    }
    if (commands.length >= 5) break
  }

  let primaryCommand = commands[0] || ''
  let category: InstallSnippetInfo['category'] = 'git'

  if (!primaryCommand) {
    if (rType === 'Skill') {
      primaryCommand = `git clone https://github.com/${fullName}.git ~/.claude/skills/${name}`
      category = 'skill'
    } else if (rType === 'Servidor MCP o conector') {
      if (lang === 'python') {
        primaryCommand = `uvx --from git+https://github.com/${fullName} ${name}`
      } else {
        primaryCommand = `npx -y github:${fullName}`
      }
      category = 'mcp'
    } else if (lang === 'python') {
      primaryCommand = `git clone https://github.com/${fullName}.git && cd ${name} && pip install -e .`
      category = 'pip'
    } else if (lang === 'typescript' || lang === 'javascript') {
      primaryCommand = `git clone https://github.com/${fullName}.git && cd ${name} && npm install`
      category = 'npm'
    } else {
      primaryCommand = `git clone https://github.com/${fullName}.git`
      category = 'git'
    }
    commands.unshift(primaryCommand)
  } else {
    if (/mcp/i.test(primaryCommand) || rType === 'Servidor MCP o conector') category = 'mcp'
    else if (rType === 'Skill') category = 'skill'
    else if (/^(?:npx|npm|pnpm|yarn|bun)/i.test(primaryCommand)) category = 'npm'
    else if (/^(?:pip|uv)/i.test(primaryCommand)) category = 'pip'
    else if (/^docker/i.test(primaryCommand)) category = 'docker'
  }

  let mcpConfigJson: string | undefined
  if (rType === 'Servidor MCP o conector' || (repo.topics || []).some(t => t.includes('mcp'))) {
    const serverKey = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    mcpConfigJson = JSON.stringify(
      {
        mcpServers: {
          [serverKey]:
            lang === 'python'
              ? { command: 'uvx', args: ['--from', `git+https://github.com/${fullName}`, name] }
              : { command: 'npx', args: ['-y', `github:${fullName}`] }
        }
      },
      null,
      2
    )
  }

  return { primaryCommand, commands: commands.slice(0, 5), mcpConfigJson, category }
}

function getLicenseAssessment(license: string | null | undefined) {
  if (!license || license === 'NOASSERTION') {
    return { label: 'Sin especificar (Revisar repo)', cls: 'text-amber-300 border-amber-700/40 bg-amber-950/30' }
  }
  const upper = license.toUpperCase()
  if (upper.includes('MIT') || upper.includes('APACHE') || upper.includes('BSD') || upper.includes('ISC') || upper.includes('0BSD')) {
    return { label: `${license} · Comercial permitido ✅`, cls: 'text-emerald-300 border-emerald-700/40 bg-emerald-950/30' }
  }
  if (upper.includes('GPL') || upper.includes('AGPL')) {
    return { label: `${license} · Copyleft / Restringido ⚠️`, cls: 'text-amber-300 border-amber-700/40 bg-amber-950/30' }
  }
  return { label: license, cls: 'text-zinc-300 border-border bg-[#161821]' }
}

export function ReposView({
  bookmarks,
  onOpenBookmarkDetail,
  onRefreshBookmarks,
  initialSelectedRepoFullName,
  onClearInitialSelectedRepo
}: ReposViewProps) {
  const [repositories, setRepositories] = useState<GalleryRepository[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeSubTab, setActiveSubTab] = useState<'gallery' | 'discover' | 'blueprints' | 'radar'>('gallery')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedResourceType, setSelectedResourceType] = useState<string>('all')
  const [selectedLanguage, setSelectedLanguage] = useState<string>('')
  const [selectedTopic, setSelectedTopic] = useState<string>('')
  const [selectedArea, setSelectedArea] = useState<string>('')
  const [selectedSecurityGrade, setSelectedSecurityGrade] = useState<'all' | 'Alto' | 'Medio' | 'Precaución'>('all')
  const [selectedActivity, setSelectedActivity] = useState<ActivityFilterType>('ALL')
  const [selectedCreatedAt, setSelectedCreatedAt] = useState<CreatedAtFilterType>('ALL')
  const [originFilter, setOriginFilter] = useState<'all' | 'from_bookmarks' | 'direct'>('all')
  const [sortBy, setSortBy] = useState<RepoSortByType>('bookmarks_desc')
  const [visibleCount, setVisibleCount] = useState<number>(36)

  // SSE Live Deep Hunter Stream (#2)
  const [huntStreamStatus, setHuntStreamStatus] = useState<{
    current?: number
    total?: number
    authorHandle?: string
    platform?: string
    discoveredReposCount?: number
    message?: string
  } | null>(null)

  // Security Audit (#6) & 1-Click Local Installer (#7)
  const [securityAuditByRepo, setSecurityAuditByRepo] = useState<Record<string, RepoSecurityAuditResult>>({})
  const [isAuditingSecurity, setIsAuditingSecurity] = useState(false)
  const [localInstallResultByRepo, setLocalInstallResultByRepo] = useState<Record<string, LocalInstallResult>>({})
  const [isInstallingLocal, setIsInstallingLocal] = useState(false)

  // Stack Recommender (#8) & Release Radar (#10)
  const [stackIdeaInput, setStackIdeaInput] = useState('')
  const [isRecommendingStack, setIsRecommendingStack] = useState(false)
  const [stackRecommendation, setStackRecommendation] = useState<StackRecommendationResult | null>(null)
  const [radarItems, setRadarItems] = useState<ReleaseRadarItem[]>([])
  const [isRadarLoading, setIsRadarLoading] = useState(false)

  // Cloud Gist Sync (#5)
  const [gistIdInput, setGistIdInput] = useState('')
  const [isSyncingCloud, setIsSyncingCloud] = useState(false)

  // Multi-selection & 1-click command copy
  const [selectedRepoKeys, setSelectedRepoKeys] = useState<Set<string>>(new Set())
  const [copiedType, setCopiedType] = useState<'urls' | 'markdown' | null>(null)
  const [copiedCmdKey, setCopiedCmdKey] = useState<string | null>(null)

  // Detail modal
  const [detailRepo, setDetailRepo] = useState<GalleryRepository | null>(null)
  const [isRefreshingRepo, setIsRefreshingRepo] = useState(false)
  const [isRegeneratingAi, setIsRegeneratingAi] = useState(false)
  const [repoChatHistory, setRepoChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [repoChatInput, setRepoChatInput] = useState('')
  const [isRepoChatLoading, setIsRepoChatLoading] = useState(false)

  // Modals: Add URL, Bulk Text Import, Settings, GitHub Stars, Comparator
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addUrlInput, setAddUrlInput] = useState('')
  const [addNotesInput, setAddNotesInput] = useState('')
  const [isAddingRepo, setIsAddingRepo] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [isBulkTextModalOpen, setIsBulkTextModalOpen] = useState(false)
  const [bulkTextInput, setBulkTextInput] = useState('')
  const [bulkPageUrlInput, setBulkPageUrlInput] = useState('')
  const [isPreviewingPageUrl, setIsPreviewingPageUrl] = useState(false)
  const [bulkSelectedUrls, setBulkSelectedUrls] = useState<Set<string>>(new Set())
  const [isBulkImporting, setIsBulkImporting] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null)
  const [isHuntingMissingRepos, setIsHuntingMissingRepos] = useState(false)
  const listFileInputRef = useRef<HTMLInputElement | null>(null)

  const [isStarsModalOpen, setIsStarsModalOpen] = useState(false)
  const [starsUsernameInput, setStarsUsernameInput] = useState('')
  const [starsCountInput, setStarsCountInput] = useState(50)
  const [isImportingStars, setIsImportingStars] = useState(false)
  const [starsError, setStarsError] = useState<string | null>(null)

  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false)
  const [compareVerdict, setCompareVerdict] = useState<string>('')
  const [isComparingAi, setIsComparingAi] = useState(false)
  const [copiedComparison, setCopiedComparison] = useState(false)

  // Project Blueprints & Master Prompt Generator state
  const [blueprints, setBlueprints] = useState<ProjectBlueprint[]>([])
  const [activeBlueprintId, setActiveBlueprintId] = useState<string>('')
  const [blueprintRepoSearch, setBlueprintRepoSearch] = useState('')
  const [generatedMasterPrompt, setGeneratedMasterPrompt] = useState('')
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [copiedMasterPrompt, setCopiedMasterPrompt] = useState(false)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [githubToken, setGithubToken] = useState('')
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null)
  const [isCheckingRateLimit, setIsCheckingRateLimit] = useState(false)
  const [aiProviders, setAiProviders] = useState<AiProviderInfo[]>([])
  const [selectedAiProvider, setSelectedAiProvider] = useState<AiProviderId>('gemini')

  // Progressive Batch GitHub API enrichment & Short-link expander state
  const [isBatchEnriching, setIsBatchEnriching] = useState(false)
  const [batchEnrichProgress, setBatchEnrichProgress] = useState<{
    processed: number
    total: number
    currentBatchLabel: string
  } | null>(null)
  const stopBatchEnrichRef = useRef(false)
  const [isExpandingShortLinks, setIsExpandingShortLinks] = useState(false)
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'info' | 'error'; text: string } | null>(null)

  // Discover state
  const [discoverCategory, setDiscoverCategory] = useState<DiscoverCategory>('mcp_agents')
  const [discoverQuery, setDiscoverQuery] = useState('')
  const [discoverLanguage, setDiscoverLanguage] = useState('')
  const [discoverCreated, setDiscoverCreated] = useState<CreatedAtFilterType>('ALL')
  const [discoverPage, setDiscoverPage] = useState(1)
  const [discoverItems, setDiscoverItems] = useState<GalleryRepository[]>([])
  const [discoverTotal, setDiscoverTotal] = useState(0)
  const [discoverHasMore, setDiscoverHasMore] = useState(false)
  const [isDiscoverLoading, setIsDiscoverLoading] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [savingDiscoverKey, setSavingDiscoverKey] = useState<string | null>(null)

  // Global Gallery Assistant state
  const [isGalleryChatOpen, setIsGalleryChatOpen] = useState(false)
  const [galleryChatMessages, setGalleryChatMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([
    {
      role: 'assistant',
      content:
        '¡Hola! Soy el Asistente de tu Galería de GitHub en Atlas. Puedo ayudarte a encontrar qué repositorios, Skills, Servidores MCP o librerías tenés guardados para un proyecto, compararlos o recomendarte alternativas.'
    }
  ])
  const [galleryChatInput, setGalleryChatInput] = useState('')
  const [isGalleryChatLoading, setIsGalleryChatLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Load token, AI provider preference and Gist ID from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTok = localStorage.getItem('atlas_github_pat') || ''
      const savedProv = (localStorage.getItem('atlas_ai_provider') as AiProviderId) || 'gemini'
      const savedGist = localStorage.getItem('atlas_gist_id') || ''
      setGithubToken(savedTok)
      setSelectedAiProvider(savedProv)
      setGistIdInput(savedGist)
    }
  }, [])

  const fetchRepositories = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/github/repos')
      const data = await res.json()
      if (res.ok && data.success && Array.isArray(data.repositories)) {
        setRepositories(data.repositories)
        if (Array.isArray(data.blueprints)) {
          setBlueprints(data.blueprints)
          setActiveBlueprintId(prev => prev || data.blueprints[0]?.id || '')
        }
        setDetailRepo(prev => {
          if (!prev) return null
          return (
            data.repositories.find(
              (r: GalleryRepository) => r.fullName.toLowerCase() === prev.fullName.toLowerCase()
            ) || prev
          )
        })
      }
    } catch (err) {
      console.error('Error cargando galería de repositorios:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchAiProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/github/ai')
      const data = await res.json()
      if (res.ok && data.success && Array.isArray(data.providers)) {
        setAiProviders(data.providers)
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchRepositories()
    fetchAiProviders()
  }, [fetchRepositories, fetchAiProviders])

  // Open initial repo if navigated from LibraryView / DetailSheet
  useEffect(() => {
    if (initialSelectedRepoFullName && repositories.length > 0) {
      const target = repositories.find(
        r => r.fullName.toLowerCase() === initialSelectedRepoFullName.toLowerCase()
      )
      if (target) {
        setDetailRepo(target)
        setRepoChatHistory([])
        onClearInitialSelectedRepo?.()
      }
    }
  }, [initialSelectedRepoFullName, repositories, onClearInitialSelectedRepo])

  // Map bookmark IDs for instant lookup of linked saved posts
  const bookmarksById = useMemo(() => {
    const map = new Map<string, BookmarkItem>()
    for (const b of bookmarks) {
      map.set(b.id, b)
    }
    return map
  }, [bookmarks])

  // Get all bookmarks linked to a given repository
  const getLinkedBookmarksForRepo = useCallback(
    (repo: GalleryRepository): BookmarkItem[] => {
      const ids = new Set<string>(repo.linkedBookmarkIds || [])
      const fullLower = repo.fullName.toLowerCase()
      for (const b of bookmarks) {
        if (ids.has(b.id)) continue
        const mentionsInResources = (b.resources || []).some(
          r =>
            r.kind === 'github_repo' &&
            (r.fullName?.toLowerCase() === fullLower ||
              (r.resolvedUrl || r.url).toLowerCase().includes(`github.com/${fullLower}`))
        )
        const mentionsInLinks = (b.outgoingLinks || []).some(u =>
          u.toLowerCase().includes(`github.com/${fullLower}`)
        )
        if (mentionsInResources || mentionsInLinks) {
          ids.add(b.id)
        }
      }
      return Array.from(ids)
        .map(id => bookmarksById.get(id))
        .filter((b): b is BookmarkItem => Boolean(b))
    },
    [bookmarks, bookmarksById]
  )

  // Available languages and topics across the gallery
  const availableLanguages = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of repositories) {
      if (r.primaryLanguage) {
        counts.set(r.primaryLanguage, (counts.get(r.primaryLanguage) || 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
  }, [repositories])

  const availableTopics = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of repositories) {
      for (const t of r.topics || []) {
        if (t) counts.set(t, (counts.get(t) || 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([name]) => name)
  }, [repositories])

  const availableAreas = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of repositories) {
      const area = r.agentEvaluation?.areaCategory
      if (area) counts.set(area, (counts.get(area) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
  }, [repositories])

  // Filtered and sorted repositories
  const filteredRepositories = useMemo(() => {
    const rawQ = searchQuery.trim().toLowerCase()
    const words = rawQ ? rawQ.split(/\s+/).filter(Boolean) : []

    return repositories
      .filter(repo => {
        if (selectedResourceType !== 'all' && repo.resourceType !== selectedResourceType) {
          return false
        }
        if (selectedLanguage && repo.primaryLanguage !== selectedLanguage) {
          return false
        }
        if (selectedTopic && !(repo.topics || []).includes(selectedTopic)) {
          return false
        }
        if (selectedArea && repo.agentEvaluation?.areaCategory !== selectedArea) {
          return false
        }
        if (selectedSecurityGrade !== 'all' && repo.agentEvaluation?.securityGrade !== selectedSecurityGrade) {
          return false
        }
        if (originFilter === 'from_bookmarks') {
          const nonGhLinks = (repo.linkedBookmarkIds || []).filter(id => !id.startsWith('github:'))
          if (nonGhLinks.length === 0) return false
        } else if (originFilter === 'direct') {
          const nonGhLinks = (repo.linkedBookmarkIds || []).filter(id => !id.startsWith('github:'))
          if (nonGhLinks.length > 0) return false
        }

        if (selectedActivity !== 'ALL') {
          const act = getActivityBadge(repo.pushedAt || repo.updatedAt)
          if (selectedActivity === 'active_week' && act.days > 7) return false
          if (selectedActivity === 'active_month' && act.days > 30) return false
          if (selectedActivity === 'active_quarter' && act.days > 90) return false
          if (selectedActivity === 'inactive' && act.days <= 90) return false
        }

        if (selectedCreatedAt !== 'ALL' && repo.createdAt) {
          const daysOld = Math.max(0, (Date.now() - new Date(repo.createdAt).getTime()) / (1000 * 60 * 60 * 24))
          if (selectedCreatedAt === 'week' && daysOld > 7) return false
          if (selectedCreatedAt === 'month' && daysOld > 30) return false
          if (selectedCreatedAt === 'three_months' && daysOld > 90) return false
          if (selectedCreatedAt === 'six_months' && daysOld > 180) return false
          if (selectedCreatedAt === 'year' && daysOld > 365) return false
        }

        if (words.length > 0) {
          const hay = [
            repo.owner,
            repo.name,
            repo.fullName,
            repo.description,
            repo.shortExplanationEs || '',
            repo.longExplanationEs || '',
            repo.resourceType || '',
            repo.primaryLanguage || '',
            repo.notes || '',
            repo.agentEvaluation?.areaCategory || '',
            repo.agentEvaluation?.companyOrAuthor || '',
            repo.agentEvaluation?.projectUseCases || '',
            ...(repo.topics || [])
          ]
            .join(' ')
            .toLowerCase()

          const matchesAllWords = words.every(w => {
            const expanded = [w, ...(SEARCH_SYNONYMS[w] || [])]
            return expanded.some(term => hay.includes(term))
          })
          if (!matchesAllWords) return false
        }

        return true
      })
      .sort((a, b) => {
        if (sortBy === 'score_desc') {
          const sDiff = (b.agentEvaluation?.atlasScore || 0) - (a.agentEvaluation?.atlasScore || 0)
          if (sDiff !== 0) return sDiff
          return (b.stars || 0) - (a.stars || 0)
        }
        if (sortBy === 'bookmarks_desc') {
          const bCount = (b.linkedBookmarkIds || []).length - (a.linkedBookmarkIds || []).length
          if (bCount !== 0) return bCount
          return (b.stars || 0) - (a.stars || 0)
        }
        if (sortBy === 'stars_desc') {
          return (b.stars || 0) - (a.stars || 0)
        }
        if (sortBy === 'updated_desc') {
          return new Date(b.pushedAt || b.updatedAt || 0).getTime() - new Date(a.pushedAt || a.updatedAt || 0).getTime()
        }
        if (sortBy === 'created_desc') {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        }
        if (sortBy === 'added_desc') {
          return new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime()
        }
        if (sortBy === 'name_asc') {
          return a.fullName.localeCompare(b.fullName)
        }
        return 0
      })
  }, [
    repositories,
    searchQuery,
    selectedResourceType,
    selectedLanguage,
    selectedTopic,
    selectedArea,
    selectedSecurityGrade,
    originFilter,
    selectedActivity,
    selectedCreatedAt,
    sortBy
  ])

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(36)
  }, [
    searchQuery,
    selectedResourceType,
    selectedLanguage,
    selectedTopic,
    selectedArea,
    selectedSecurityGrade,
    originFilter,
    selectedActivity,
    selectedCreatedAt,
    sortBy
  ])

  const paginatedRepositories = useMemo(
    () => filteredRepositories.slice(0, visibleCount),
    [filteredRepositories, visibleCount]
  )

  // KPI metrics
  const kpis = useMemo(() => {
    const total = repositories.length
    const linkedToPosts = repositories.filter(r =>
      (r.linkedBookmarkIds || []).some(id => !id.startsWith('github:'))
    ).length
    const skillsAndMcp = repositories.filter(
      r =>
        r.resourceType === 'Skill' ||
        r.resourceType === 'Servidor MCP o conector' ||
        r.resourceType === 'Agente o workflow'
    ).length
    const enrichedWithStars = repositories.filter(r => (r.stars || 0) > 0).length
    return { total, linkedToPosts, skillsAndMcp, enrichedWithStars }
  }, [repositories])

  // Discover fetcher
  const loadDiscoverRepos = useCallback(
    async (pageToLoad = 1) => {
      setIsDiscoverLoading(true)
      setDiscoverError(null)
      try {
        const params = new URLSearchParams()
        params.set('category', discoverCategory)
        if (discoverQuery.trim()) params.set('query', discoverQuery.trim())
        if (discoverLanguage) params.set('language', discoverLanguage)
        if (discoverCreated !== 'ALL') params.set('createdFilter', discoverCreated)
        params.set('page', String(pageToLoad))
        params.set('perPage', '15')
        if (availableTopics.length > 0) {
          params.set('userTopics', availableTopics.slice(0, 5).join(','))
        }
        if (availableLanguages.length > 0) {
          params.set('userLanguages', availableLanguages.slice(0, 3).join(','))
        }

        const headers: Record<string, string> = {}
        if (githubToken.trim()) headers['x-github-token'] = githubToken.trim()

        const res = await fetch(`/api/github/discover?${params.toString()}`, { headers })
        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'No se pudo consultar GitHub Discover.')
        }
        setDiscoverItems(data.items || [])
        setDiscoverTotal(data.totalCount || 0)
        setDiscoverHasMore(Boolean(data.hasMore))
        setDiscoverPage(pageToLoad)
      } catch (err: any) {
        setDiscoverError(err.message || 'Error al explorar GitHub.')
      } finally {
        setIsDiscoverLoading(false)
      }
    },
    [discoverCategory, discoverQuery, discoverLanguage, discoverCreated, availableTopics, availableLanguages, githubToken]
  )

  useEffect(() => {
    if (activeSubTab === 'discover') {
      loadDiscoverRepos(1)
    }
  }, [activeSubTab, discoverCategory, discoverLanguage, discoverCreated, loadDiscoverRepos])

  // Check rate limit
  const handleCheckRateLimit = async () => {
    setIsCheckingRateLimit(true)
    try {
      const headers: Record<string, string> = {}
      if (githubToken.trim()) headers['x-github-token'] = githubToken.trim()
      const res = await fetch('/api/github/discover?checkRateLimit=true', { headers })
      const data = await res.json()
      if (res.ok && data.rateLimit) {
        setRateLimit(data.rateLimit)
      }
    } catch {} finally {
      setIsCheckingRateLimit(false)
    }
  }

  // Save settings
  const handleSaveSettings = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('atlas_github_pat', githubToken.trim())
      localStorage.setItem('atlas_ai_provider', selectedAiProvider)
    }
    setStatusBanner({
      type: 'ok',
      text: 'Preferencias de GitHub Token y Proveedor de IA guardadas correctamente.'
    })
    setIsSettingsOpen(false)
  }

  // Add single repo by URL
  const handleAddSingleRepo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addUrlInput.trim()) return
    setIsAddingRepo(true)
    setAddError(null)
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-url',
          url: addUrlInput.trim(),
          notes: addNotesInput.trim(),
          token: githubToken.trim() || undefined,
          provider: selectedAiProvider
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo obtener el repositorio.')
      }
      await fetchRepositories()
      await onRefreshBookmarks()
      setAddUrlInput('')
      setAddNotesInput('')
      setIsAddModalOpen(false)
      setDetailRepo(data.repository)
      setStatusBanner({
        type: 'ok',
        text: `Repositorio ${data.repository.fullName} agregado a la Galería y sincronizado con tu Biblioteca.`
      })
    } catch (err: any) {
      setAddError(err.message || 'Error al agregar repositorio.')
    } finally {
      setIsAddingRepo(false)
    }
  }

  // Save repo from Discover or Chatbot
  const handleSaveDiscoverRepo = async (repo: GalleryRepository) => {
    const key = repo.fullName.toLowerCase()
    setSavingDiscoverKey(key)
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-repo',
          repository: repo
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        await fetchRepositories()
        await onRefreshBookmarks()
        setStatusBanner({
          type: 'ok',
          text: `${repo.fullName} guardado en tu Galería y Biblioteca de Atlas.`
        })
      }
    } catch (err) {
      console.error('Error guardando repo de Discover:', err)
    } finally {
      setSavingDiscoverKey(null)
    }
  }

  // Enrich single or batch of repos from GitHub API with live progress & pause/stop support
  const handleEnrichReposWithGitHubApi = async (repoNames: string[]) => {
    if (repoNames.length === 0) return
    setIsBatchEnriching(true)
    stopBatchEnrichRef.current = false
    const total = repoNames.length
    const chunkSize = 4
    let processed = 0
    let refreshedTotal = 0
    let errorsTotal = 0

    try {
      for (let i = 0; i < total; i += chunkSize) {
        if (stopBatchEnrichRef.current) break
        const chunk = repoNames.slice(i, i + chunkSize)
        setBatchEnrichProgress({
          processed,
          total,
          currentBatchLabel: chunk.join(', ')
        })

        const res = await fetch('/api/github/repos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'refresh-repo',
            repos: chunk,
            token: githubToken.trim() || undefined,
            provider: selectedAiProvider
          })
        })
        const data = await res.json()
        if (res.ok && data.success) {
          refreshedTotal += Number(data.refreshedCount) || 0
          errorsTotal += Array.isArray(data.errors) ? data.errors.length : 0
        } else {
          errorsTotal += chunk.length
        }

        processed = Math.min(total, i + chunk.length)
        setBatchEnrichProgress({
          processed,
          total,
          currentBatchLabel: chunk.join(', ')
        })
      }

      await fetchRepositories()
      await onRefreshBookmarks()
      setStatusBanner({
        type: 'ok',
        text: `${stopBatchEnrichRef.current ? 'Enriquecimiento pausado: ' : ''}Se enriquecieron ${refreshedTotal} de ${total} repositorio(s) con estrellas reales, lenguajes, imagen de README y análisis en español.${
          errorsTotal > 0 ? ` (${errorsTotal} omitidos por límite de API).` : ''
        }`
      })
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Error de red al consultar GitHub API.'
      })
    } finally {
      setIsBatchEnriching(false)
      setBatchEnrichProgress(null)
    }
  }

  // Expand shortened links (t.co / bit.ly) across saved bookmarks to uncover hidden GitHub repos
  const handleExpandShortLinks = async () => {
    setIsExpandingShortLinks(true)
    setStatusBanner({
      type: 'info',
      text: 'Desacortando enlaces t.co / bit.ly en tus guardados para descubrir repositorios ocultos...'
    })
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'expand-short-links', limit: 35 })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        await fetchRepositories()
        await onRefreshBookmarks()
        setStatusBanner({
          type: 'ok',
          text: `Desacortador completado: ${data.checkedBookmarks} guardados revisados, ${data.expandedUrls} enlaces expandidos y ${data.newGitHubRepos} nuevos repositorios de GitHub descubiertos.`
        })
      } else {
        setStatusBanner({
          type: 'error',
          text: data.error || 'No se pudieron expandir los enlaces cortos.'
        })
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Error al expandir enlaces cortos.'
      })
    } finally {
      setIsExpandingShortLinks(false)
    }
  }

  // Import GitHub Stars from any username
  const handleImportGitHubStars = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!starsUsernameInput.trim()) return
    setIsImportingStars(true)
    setStarsError(null)
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import-github-stars',
          username: starsUsernameInput.trim(),
          perPage: starsCountInput,
          token: githubToken.trim() || undefined
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudieron importar los GitHub Stars.')
      }
      await fetchRepositories()
      await onRefreshBookmarks()
      setIsStarsModalOpen(false)
      setStatusBanner({
        type: 'ok',
        text: `⭐ Stars de @${data.username} importados: ${data.added} nuevos repositorios y ${data.updated} actualizados en tu Galería.`
      })
    } catch (err: any) {
      setStarsError(err.message || 'Error al importar GitHub Stars.')
    } finally {
      setIsImportingStars(false)
    }
  }

  // Copy 1-click CLI command
  const handleCopyCmd = async (cmd: string, key: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      await navigator.clipboard.writeText(cmd)
      setCopiedCmdKey(key)
      setTimeout(() => setCopiedCmdKey(null), 2000)
    } catch {}
  }

  // Side-by-side repository comparator
  const comparedRepos = useMemo(() => {
    const selected = repositories.filter(r => selectedRepoKeys.has(r.fullName.toLowerCase()))
    if (selected.length >= 2) return selected.slice(0, 4)
    return filteredRepositories.slice(0, 3)
  }, [repositories, selectedRepoKeys, filteredRepositories])

  const handleRunCompareAi = useCallback(
    async (reposToCompare: GalleryRepository[]) => {
      if (reposToCompare.length < 2) return
      setIsComparingAi(true)
      try {
        const res = await fetch('/api/github/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'compare-repos',
            repos: reposToCompare,
            provider: selectedAiProvider
          })
        })
        const data = await res.json()
        if (res.ok && data.comparison) {
          setCompareVerdict(data.comparison)
        }
      } catch {
        setCompareVerdict('No se pudo generar el veredicto comparativo.')
      } finally {
        setIsComparingAi(false)
      }
    },
    [selectedAiProvider]
  )

  const handleOpenCompareModal = () => {
    setIsCompareModalOpen(true)
    handleRunCompareAi(comparedRepos)
  }

  // Project Blueprints & Master Prompt Generator helpers
  const activeBlueprint = useMemo(
    () => blueprints.find(b => b.id === activeBlueprintId) || blueprints[0] || null,
    [blueprints, activeBlueprintId]
  )

  const handleSaveBlueprint = async (patch: Partial<ProjectBlueprint> & { name: string }) => {
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-blueprint',
          blueprint: patch
        })
      })
      const data = await res.json()
      if (res.ok && data.success && Array.isArray(data.blueprints)) {
        setBlueprints(data.blueprints)
        if (data.blueprint?.id) {
          setActiveBlueprintId(data.blueprint.id)
        }
      }
    } catch {}
  }

  const handleCreateNewBlueprint = async () => {
    const selectedNames = repositories
      .filter(r => selectedRepoKeys.has(r.fullName.toLowerCase()))
      .map(r => r.fullName)
    await handleSaveBlueprint({
      name: `Proyecto IA #${blueprints.length + 1}`,
      description: 'Stack curado desde tu Galería de Repositorios y Guardados de Atlas.',
      goal: 'Construir e integrar herramientas open-source, Skills y servidores MCP en mi flujo de desarrollo.',
      repoFullNames: selectedNames,
      bookmarkIds: [],
      notes: ''
    })
    setGeneratedMasterPrompt('')
    setActiveSubTab('blueprints')
  }

  const handleAddReposToActiveBlueprint = async (repoFullNamesToAdd: string[]) => {
    if (repoFullNamesToAdd.length === 0) return
    const targetBp = activeBlueprint || {
      name: 'Stack Principal IA & MCP',
      description: 'Proyecto creado automáticamente desde tu selección de repositorios.',
      goal: 'Integrar estos repositorios y herramientas en mi entorno de desarrollo.',
      repoFullNames: [],
      bookmarkIds: [],
      notes: ''
    }
    const mergedNames = Array.from(new Set([...(targetBp.repoFullNames || []), ...repoFullNamesToAdd]))
    await handleSaveBlueprint({
      ...targetBp,
      repoFullNames: mergedNames
    })
    setStatusBanner({
      type: 'ok',
      text: `${repoFullNamesToAdd.length} repositorio(s) añadido(s) al proyecto "${targetBp.name}". Podés generar su PROMPT_MAESTRO.md en la pestaña Armador de Proyectos.`
    })
  }

  const handleDeleteBlueprint = async (id: string) => {
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-blueprint', id })
      })
      const data = await res.json()
      if (res.ok && Array.isArray(data.blueprints)) {
        setBlueprints(data.blueprints)
        setActiveBlueprintId(data.blueprints[0]?.id || '')
      }
    } catch {}
  }

  const handleGenerateMasterPrompt = async (bp?: ProjectBlueprint) => {
    const target = bp || activeBlueprint
    if (!target) return
    setIsGeneratingPrompt(true)
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-master-prompt',
          blueprint: target
        })
      })
      const data = await res.json()
      if (res.ok && data.markdown) {
        setGeneratedMasterPrompt(data.markdown)
      }
    } catch {} finally {
      setIsGeneratingPrompt(false)
    }
  }

  const handleDownloadMasterPrompt = (filename = 'PROMPT_MAESTRO.md') => {
    if (!generatedMasterPrompt) return
    const blob = new Blob([generatedMasterPrompt], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Refresh single repo inside detail modal
  const handleRefreshDetailRepo = async () => {
    if (!detailRepo) return
    setIsRefreshingRepo(true)
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refresh-repo',
          fullName: detailRepo.fullName,
          token: githubToken.trim() || undefined,
          provider: selectedAiProvider
        })
      })
      const data = await res.json()
      if (res.ok && data.success && data.repositories?.[0]) {
        setDetailRepo(data.repositories[0])
        await fetchRepositories()
        await onRefreshBookmarks()
      }
    } catch {} finally {
      setIsRefreshingRepo(false)
    }
  }

  // Regenerate Spanish explanation with AI inside detail modal
  const handleRegenerateRepoAi = async () => {
    if (!detailRepo) return
    setIsRegeneratingAi(true)
    try {
      const res = await fetch('/api/github/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'explain-repo',
          repo: detailRepo,
          provider: selectedAiProvider,
          token: githubToken.trim() || undefined
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const updated = data.repository || {
          ...detailRepo,
          shortExplanationEs: data.shortExplanationEs,
          longExplanationEs: data.longExplanationEs,
          resourceType: data.resourceType || detailRepo.resourceType
        }
        setDetailRepo(updated)
        await fetchRepositories()
      }
    } catch {} finally {
      setIsRegeneratingAi(false)
    }
  }

  // Update repo fields (resourceType / notes)
  const handleUpdateRepoFields = async (patch: Partial<GalleryRepository>) => {
    if (!detailRepo) return
    const optimistic = { ...detailRepo, ...patch }
    setDetailRepo(optimistic)
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-repo',
          fullName: detailRepo.fullName,
          ...patch
        })
      })
      const data = await res.json()
      if (res.ok && data.repository) {
        setDetailRepo(data.repository)
        await fetchRepositories()
        await onRefreshBookmarks()
      }
    } catch {}
  }

  // Ask per-repo AI chat
  const handleAskRepoChat = async (questionText?: string) => {
    if (!detailRepo) return
    const q = (questionText ?? repoChatInput).trim()
    if (!q || isRepoChatLoading) return
    const nextHist: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...repoChatHistory,
      { role: 'user', content: q }
    ]
    setRepoChatHistory(nextHist)
    if (!questionText) setRepoChatInput('')
    setIsRepoChatLoading(true)

    try {
      const res = await fetch('/api/github/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'repo-chat',
          repo: detailRepo,
          question: q,
          history: repoChatHistory,
          provider: selectedAiProvider
        })
      })
      const data = await res.json()
      setRepoChatHistory([
        ...nextHist,
        {
          role: 'assistant',
          content: data.answer || data.error || 'No se pudo obtener respuesta.'
        }
      ])
    } catch {
      setRepoChatHistory([
        ...nextHist,
        { role: 'assistant', content: 'Error de conexión al consultar al asistente del repositorio.' }
      ])
    } finally {
      setIsRepoChatLoading(false)
    }
  }

  // Ask global Gallery Assistant
  const handleAskGalleryChat = async (questionText?: string) => {
    const q = (questionText ?? galleryChatInput).trim()
    if (!q || isGalleryChatLoading) return
    const nextHist: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...galleryChatMessages,
      { role: 'user', content: q }
    ]
    setGalleryChatMessages(nextHist)
    if (!questionText) setGalleryChatInput('')
    setIsGalleryChatLoading(true)

    try {
      const res = await fetch('/api/github/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gallery-chat',
          question: q,
          history: galleryChatMessages.slice(-8),
          provider: selectedAiProvider
        })
      })
      const data = await res.json()
      setGalleryChatMessages([
        ...nextHist,
        {
          role: 'assistant',
          content: data.answer || data.error || 'No se pudo generar respuesta.'
        }
      ])
    } catch {
      setGalleryChatMessages([
        ...nextHist,
        { role: 'assistant', content: 'Error al conectar con el asistente de galería.' }
      ])
    } finally {
      setIsGalleryChatLoading(false)
    }
  }

  // Bulk text & Awesome-List import detection
  const detectedBulkRepos = useMemo(() => {
    const extracted = extractGitHubReposFromFreeText(bulkTextInput)
    const existingSet = new Set(repositories.map(r => r.fullName.toLowerCase()))
    return extracted.map(item => ({
      ...item,
      fullName: `${item.owner}/${item.repo}`,
      alreadyInGallery: existingSet.has(`${item.owner.toLowerCase()}/${item.repo.toLowerCase()}`)
    }))
  }, [bulkTextInput, repositories])

  useEffect(() => {
    const newOnes = detectedBulkRepos.filter(d => !d.alreadyInGallery).map(d => d.cleanUrl)
    setBulkSelectedUrls(new Set(newOnes))
  }, [detectedBulkRepos])

  const handleExtractFromPageUrl = async () => {
    if (!bulkPageUrlInput.trim()) return
    setIsPreviewingPageUrl(true)
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview-list-import',
          pageUrl: bulkPageUrlInput.trim(),
          token: githubToken.trim() || undefined
        })
      })
      const data = await res.json()
      if (res.ok && data.success && Array.isArray(data.items)) {
        const lines = data.items.map((it: any) =>
          it.contextHint ? `${it.cleanUrl} - ${it.contextHint}` : it.cleanUrl
        )
        setBulkTextInput(prev => [prev.trim(), ...lines].filter(Boolean).join('\n'))
        setStatusBanner({
          type: 'ok',
          text: `Extraídos ${data.totalDetected} repositorios desde ${data.sourceLabel} (${data.newCount} nuevos, ${data.duplicateCount} ya estaban en tu catálogo).`
        })
      }
    } catch {} finally {
      setIsPreviewingPageUrl(false)
    }
  }

  const handleLoadListFileIntoModal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      setBulkTextInput(prev => [prev.trim(), text.trim()].filter(Boolean).join('\n'))
    } catch {} finally {
      if (listFileInputRef.current) listFileInputRef.current.value = ''
    }
  }

  const handleRunBulkTextImport = async () => {
    const urls = Array.from(bulkSelectedUrls)
    if (urls.length === 0 && !bulkPageUrlInput.trim()) return
    setIsBulkImporting(true)
    setBulkProgress({ current: 1, total: Math.max(1, urls.length) })

    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import-repo-list',
          text: urls.length > 0 ? urls.join('\n') : bulkTextInput,
          pageUrl: urls.length === 0 ? bulkPageUrlInput.trim() : undefined,
          enrichLiveCount: Math.min(10, urls.length || 8),
          token: githubToken.trim() || undefined
        })
      })
      const data = await res.json()
      await fetchRepositories()
      await onRefreshBookmarks()
      setIsBulkTextModalOpen(false)
      setBulkTextInput('')
      setBulkPageUrlInput('')
      if (res.ok && data.success) {
        setStatusBanner({
          type: 'ok',
          text: `✅ Super-Importador completado: ${data.added} nuevos repositorios incorporados y ${data.duplicatesSkipped} duplicados omitidos automáticamente (${data.total} total en catálogo).`
        })
      }
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'Ocurrió un error al importar la lista de repositorios.'
      })
    } finally {
      setIsBulkImporting(false)
      setBulkProgress(null)
    }
  }

  const handleHuntMissingRepos = async () => {
    if (isHuntingMissingRepos) return
    setIsHuntingMissingRepos(true)
    setHuntStreamStatus({
      current: 0,
      total: 24,
      message: 'Iniciando rastreo profundo SSE en guardados sin repositorio directo...'
    })
    setStatusBanner({
      type: 'info',
      text: '🕵️ Cazador Profundo activo (Streaming SSE): hidratando links de WhatsApp/X, inspeccionando hilos y buscando repositorios mencionados en videos/posts...'
    })
    try {
      const res = await fetch('/api/github/hunt-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 24,
          token: githubToken.trim() || undefined
        })
      })
      if (res.ok && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let finalSummary: any = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() || ''
          for (const chunk of chunks) {
            const dataLine = chunk
              .split('\n')
              .find(l => l.startsWith('data:'))
            if (!dataLine) continue
            try {
              const payload = JSON.parse(dataLine.slice(5).trim())
              if (payload.type === 'progress' || payload.type === 'start') {
                setHuntStreamStatus({
                  current: payload.scanned ?? payload.current ?? 0,
                  total: payload.total ?? 24,
                  discoveredReposCount: payload.discovered ?? payload.discoveredReposCount ?? 0,
                  message:
                    payload.latestFindings?.[0]?.discoveredRepos?.join(', ') ||
                    `Escaneados ${payload.scanned ?? 0}/${payload.total ?? 24} guardados · ${
                      payload.discovered ?? 0
                    } repositorios descubiertos`
                })
              } else if (payload.type === 'done') {
                finalSummary = payload.summary || payload
              }
            } catch {}
          }
        }

        await fetchRepositories()
        await onRefreshBookmarks()
        if (finalSummary) {
          setStatusBanner({
            type: 'ok',
            text: `🕵️ Cazador Profundo SSE completado: se escanearon ${finalSummary.scannedCount ?? 0} guardados, se hidrataron ${finalSummary.hydratedPostsCount ?? 0} posts de WhatsApp/X y se descubrieron ${finalSummary.discoveredReposCount ?? 0} repositorios ocultos (${finalSummary.newGalleryReposCount ?? 0} nuevos en Galería).`
          })
        }
        return
      }

      // Fallback al endpoint clásico JSON si SSE no está disponible
      const fallbackRes = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hunt-missing-repos',
          limit: 25,
          token: githubToken.trim() || undefined
        })
      })
      const data = await fallbackRes.json()
      if (fallbackRes.ok && data.success) {
        await fetchRepositories()
        await onRefreshBookmarks()
        setStatusBanner({
          type: 'ok',
          text: `🕵️ Cazador Profundo completado: se escanearon ${data.scannedCount} guardados sin repo directo, se hidrataron ${data.hydratedPostsCount} posts de WhatsApp/X y se descubrieron ${data.discoveredReposCount} repositorios ocultos (${data.newGalleryReposCount} nuevos en Galería).`
        })
      }
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'Error de red al ejecutar el Cazador Profundo de Repositorios.'
      })
    } finally {
      setIsHuntingMissingRepos(false)
      setHuntStreamStatus(null)
    }
  }

  // #6: Auditar Seguridad y Permisos profundos del repositorio
  const handleAuditRepoSecurity = async (repo: GalleryRepository) => {
    setIsAuditingSecurity(true)
    try {
      const res = await fetch('/api/github/install-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installMode: 'audit',
          fullName: repo.fullName,
          repository: repo,
          token: githubToken.trim() || undefined
        })
      })
      const data = await res.json()
      if (res.ok && data.audit) {
        setSecurityAuditByRepo(prev => ({
          ...prev,
          [repo.fullName.toLowerCase()]: data.audit
        }))
      }
    } catch {} finally {
      setIsAuditingSecurity(false)
    }
  }

  // #7: Instalar Skill o registrar Servidor MCP en 1 clic en la PC local
  const handleInstallRepoLocal = async (
    repo: GalleryRepository,
    installMode: 'skill_clone' | 'mcp_config' | 'repo_clone'
  ) => {
    setIsInstallingLocal(true)
    try {
      const res = await fetch('/api/github/install-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installMode,
          fullName: repo.fullName,
          repository: repo,
          token: githubToken.trim() || undefined
        })
      })
      const data = await res.json()
      const installRes: LocalInstallResult = data.result || data
      setLocalInstallResultByRepo(prev => ({
        ...prev,
        [repo.fullName.toLowerCase()]: installRes
      }))
      if (installRes.success) {
        setStatusBanner({
          type: 'ok',
          text: `⚡ ${installRes.messageEs} (${installRes.targetPath})`
        })
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'No se pudo completar la instalación local.'
      })
    } finally {
      setIsInstallingLocal(false)
    }
  }

  // #8: Recomendador de Stack Ideal a partir de una Idea de Proyecto en lenguaje natural
  const handleRecommendStackByIdea = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!stackIdeaInput.trim() || isRecommendingStack) return
    setIsRecommendingStack(true)
    try {
      const res = await fetch('/api/github/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recommend-stack',
          idea: stackIdeaInput.trim(),
          maxRepos: 6,
          autoSaveBlueprint: true,
          provider: selectedAiProvider
        })
      })
      const data = await res.json()
      if (res.ok && data.success && data.recommendation) {
        const rec: StackRecommendationResult = data.recommendation
        setStackRecommendation(rec)
        setGeneratedMasterPrompt(rec.masterPromptMarkdown || '')
        await fetchRepositories()
        if (rec.generatedBlueprint?.id) {
          setActiveBlueprintId(rec.generatedBlueprint.id)
        }
        setStatusBanner({
          type: 'ok',
          text: `🚀 Stack recomendado creado: "${rec.projectName}" con ${rec.selectedRepos.length} repositorios óptimos de tu catálogo y su PROMPT_MAESTRO.md listo.`
        })
      }
    } catch {} finally {
      setIsRecommendingStack(false)
    }
  }

  // #10: Cargar Radar de Releases y Tendencias
  const loadReleaseRadar = useCallback(async () => {
    setIsRadarLoading(true)
    try {
      const res = await fetch('/api/github/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release-radar' })
      })
      const data = await res.json()
      if (res.ok && Array.isArray(data.radarItems)) {
        setRadarItems(data.radarItems)
      }
    } catch {} finally {
      setIsRadarLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeSubTab === 'radar') {
      loadReleaseRadar()
    }
  }, [activeSubTab, loadReleaseRadar])

  // #5: Sincronización Cloud con GitHub Gist (Push / Pull)
  const handleCloudGistSync = async (mode: 'push' | 'pull') => {
    setIsSyncingCloud(true)
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cloud-sync-gist',
          mode,
          gistId: gistIdInput.trim() || undefined,
          token: githubToken.trim() || undefined
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo sincronizar con GitHub Gist.')
      }
      if (data.gistId) {
        setGistIdInput(data.gistId)
        if (typeof window !== 'undefined') {
          localStorage.setItem('atlas_gist_id', data.gistId)
        }
      }
      if (mode === 'pull') {
        await fetchRepositories()
        await onRefreshBookmarks()
        setStatusBanner({
          type: 'ok',
          text: `☁️ Catálogo restaurado desde GitHub Gist (${data.counts?.repositories || 0} repositorios y ${data.counts?.bookmarks || 0} guardados).`
        })
      } else {
        setStatusBanner({
          type: 'ok',
          text: `☁️ Respaldo sincronizado en GitHub Gist (${data.gistId}): ${data.counts?.repositories || 0} repositorios y ${data.counts?.bookmarks || 0} guardados.`
        })
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Error al sincronizar con GitHub Gist.'
      })
    } finally {
      setIsSyncingCloud(false)
    }
  }

  const handleExportMasterExcel = () => {
    const targetList =
      selectedRepoKeys.size > 0
        ? repositories.filter(r => selectedRepoKeys.has(r.fullName.toLowerCase()))
        : filteredRepositories.length > 0
        ? filteredRepositories
        : repositories
    const fname = generateRepositoriesExcelFile(targetList, bookmarks)
    setStatusBanner({
      type: 'ok',
      text: `📊 Excel Maestro exportado (${fname}) con ${targetList.length} repositorios y 5 pestañas clasificadas por agente (Qué es, Área, Empresa, Estrellas, Puntaje 1-10, Seguridad y Proyectos).`
    })
  }

  const handleExportMasterCsv = () => {
    const targetList =
      selectedRepoKeys.size > 0
        ? repositories.filter(r => selectedRepoKeys.has(r.fullName.toLowerCase()))
        : filteredRepositories.length > 0
        ? filteredRepositories
        : repositories
    const fname = downloadRepositoriesCsvFile(targetList, bookmarks)
    setStatusBanner({
      type: 'ok',
      text: `📄 CSV Maestro exportado (${fname}) con ${targetList.length} repositorios clasificados.`
    })
  }

  // Export gallery JSON (compatible with github-visual-gallery v2.0)
  const handleExportGalleryJson = (onlySelected = false) => {
    const list = onlySelected
      ? repositories.filter(r => selectedRepoKeys.has(r.fullName.toLowerCase()))
      : repositories
    const payload = {
      repositories: list,
      customOrder: list.map(r => r.id),
      exportedAt: new Date().toISOString(),
      version: '2.0'
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `github-visual-gallery-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Import gallery JSON file
  const handleImportGalleryJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import-json',
          jsonText: text
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo importar el archivo JSON.')
      }
      await fetchRepositories()
      await onRefreshBookmarks()
      setStatusBanner({
        type: 'ok',
        text: `JSON de galería importado: ${data.added} nuevos, ${data.updated} actualizados (${data.total} total en galería).`
      })
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err.message || 'Error al importar JSON de galería.'
      })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Multi-selection helpers
  const toggleSelectRepo = (fullName: string) => {
    const key = fullName.toLowerCase()
    setSelectedRepoKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleCopySelected = async (mode: 'urls' | 'markdown') => {
    const selected = repositories.filter(r => selectedRepoKeys.has(r.fullName.toLowerCase()))
    if (selected.length === 0) return
    const text =
      mode === 'urls'
        ? selected.map(r => `https://github.com/${r.fullName}`).join('\n')
        : selected
            .map(r => {
              const desc = r.shortExplanationEs || r.description || 'Sin descripción'
              const meta = [
                r.resourceType ? `[${r.resourceType}]` : '',
                r.stars > 0 ? `⭐ ${formatNum(r.stars)}` : '',
                r.primaryLanguage || ''
              ]
                .filter(Boolean)
                .join(' · ')
              return `- [**${r.fullName}**](https://github.com/${r.fullName}) — ${desc}${meta ? ` (${meta})` : ''}`
            })
            .join('\n')

    await navigator.clipboard.writeText(text)
    setCopiedType(mode)
    setTimeout(() => setCopiedType(null), 2200)
  }

  const handleDeleteSelectedRepos = async () => {
    const keys = Array.from(selectedRepoKeys)
    if (keys.length === 0) return
    try {
      const res = await fetch('/api/github/repos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repos: keys })
      })
      if (res.ok) {
        setSelectedRepoKeys(new Set())
        await fetchRepositories()
      }
    } catch {}
  }

  const existingFullNamesSet = useMemo(
    () => new Set(repositories.map(r => r.fullName.toLowerCase())),
    [repositories]
  )

  return (
    <div className="space-y-6 pb-20">
      {/* Hidden JSON & List file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportGalleryJsonFile}
        className="hidden"
      />
      <input
        ref={listFileInputRef}
        type="file"
        accept=".txt,.md,.csv,.json,.html"
        onChange={handleLoadListFileIntoModal}
        className="hidden"
      />

      {/* Header Principal */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-[#15171f] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-[#7c6cf0]/20 text-[#b4abff] border border-[#7c6cf0]/40">
              <FolderGit2 className="size-5" />
            </div>
            <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">
              Galería Visual de Repositorios GitHub
            </h1>
            <Badge className="bg-[#28263b] text-[#bfb8ff] border-[#3d3960]">
              {kpis.total} repositorios
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground max-w-3xl">
            Unifica automáticamente los repositorios descubiertos en tus guardados de X, Instagram y WhatsApp con el explorador visual de GitHub. Clasificá Skills, Servidores MCP, Agentes y Librerías, cazá repositorios ocultos en hilos/videos y exportá el Excel Maestro clasificado por Agente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handleExportMasterExcel}
            className="bg-emerald-600 text-white hover:bg-emerald-500 text-xs gap-1.5 shadow-sm"
            title="Exporta un libro Excel (.xlsx) con 5 pestañas clasificadas por Agente: Qué es, Área, Empresa, Estrellas, Puntaje 1-10, Seguridad y Proyectos"
          >
            <Download className="size-3.5" /> 📊 Excel Maestro (.xlsx)
          </Button>
          <Button
            size="sm"
            onClick={() => setIsAddModalOpen(true)}
            className="bg-[#7c6cf0] text-white hover:bg-[#6d5ce0] text-xs gap-1.5"
          >
            <Plus className="size-3.5" /> Agregar Repo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsBulkTextModalOpen(true)}
            className="border-[#5a50a3] bg-[#231f3d] text-[#dcd7ff] hover:bg-[#2d284e] text-xs gap-1.5"
            title="Super-Importador de listas de repositorios (URLs, owner/repo, archivos .txt/.md/.csv o páginas Awesome List) sin duplicados"
          >
            <FileText className="size-3.5 text-[#a59cf5]" /> Super-Importar Lista / Awesome
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isHuntingMissingRepos}
            onClick={handleHuntMissingRepos}
            className="border-fuchsia-600/40 bg-fuchsia-950/25 text-fuchsia-200 hover:bg-fuchsia-950/45 text-xs gap-1.5"
            title="Hidrata links de WhatsApp/X, inspecciona hilos/comentarios y busca en GitHub API repositorios mencionados en videos o posteos"
          >
            <Sparkles className={`size-3.5 text-fuchsia-400 ${isHuntingMissingRepos ? 'animate-spin' : ''}`} />
            {isHuntingMissingRepos ? 'Cazando Repos...' : '🕵️ Cazar Repos Ocultos'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsStarsModalOpen(true)}
            className="border-amber-600/40 bg-amber-950/20 text-amber-200 hover:bg-amber-950/40 text-xs gap-1.5"
            title="Importar todos los repositorios con estrella (GitHub Stars) de cualquier usuario"
          >
            <Star className="size-3.5 fill-amber-400 text-amber-400" /> Importar Stars
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isBatchEnriching}
            onClick={() => {
              const targetNames =
                selectedRepoKeys.size > 0
                  ? Array.from(selectedRepoKeys)
                  : filteredRepositories
                      .filter(r => (r.stars || 0) === 0)
                      .slice(0, 20)
                      .map(r => r.fullName)
              if (targetNames.length === 0 && filteredRepositories.length > 0) {
                handleEnrichReposWithGitHubApi(filteredRepositories.slice(0, 12).map(r => r.fullName))
              } else {
                handleEnrichReposWithGitHubApi(targetNames)
              }
            }}
            className="border-border bg-[#1b1d27] text-xs gap-1.5"
            title="Consulta la API de GitHub en lotes con barra de progreso pausable"
          >
            <RefreshCw className={`size-3.5 text-emerald-400 ${isBatchEnriching ? 'animate-spin' : ''}`} />
            {isBatchEnriching ? 'Enriqueciendo...' : 'Enriquecer Lote (GitHub API)'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isExpandingShortLinks}
            onClick={handleExpandShortLinks}
            className="border-border bg-[#1b1d27] text-xs gap-1.5"
            title="Expande enlaces t.co y bit.ly en tus guardados para descubrir repositorios ocultos"
          >
            <Link2 className={`size-3.5 text-cyan-400 ${isExpandingShortLinks ? 'animate-pulse' : ''}`} />
            {isExpandingShortLinks ? 'Desacortando...' : 'Desacortar t.co'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleExportGalleryJson(false)}
            className="border-border bg-[#1b1d27] text-xs gap-1.5"
            title="Exportar galería en formato JSON compatible con GitHub Visual Gallery"
          >
            <Download className="size-3.5" /> JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="border-border bg-[#1b1d27] text-xs gap-1.5"
            title="Importar archivo JSON de GitHub Visual Gallery"
          >
            <Upload className="size-3.5" /> Importar JSON
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setIsSettingsOpen(true)
              handleCheckRateLimit()
            }}
            className="border border-border bg-[#161821] text-xs gap-1.5"
          >
            <Settings2 className="size-3.5 text-[#a59cf5]" /> Token & IA
          </Button>
        </div>
      </div>

      {/* Barra de Progreso en Vivo para Enriquecimiento Masivo (Pausable) */}
      {isBatchEnriching && batchEnrichProgress && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-200 font-medium">
              <Loader2 className="size-4 animate-spin text-emerald-400" />
              <span>
                Enriqueciendo desde GitHub API: <strong>{batchEnrichProgress.processed}</strong> de{' '}
                <strong>{batchEnrichProgress.total}</strong> repositorios ({batchEnrichProgress.currentBatchLabel})
              </span>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                stopBatchEnrichRef.current = true
              }}
              className="border-amber-500/50 bg-amber-950/40 text-amber-200 hover:bg-amber-950/70 gap-1"
            >
              <Pause className="size-3" /> Pausar / Detener
            </Button>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/50">
            <div
              className="h-full bg-emerald-400 transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((batchEnrichProgress.processed / Math.max(1, batchEnrichProgress.total)) * 100)
                )}%`
              }}
            />
          </div>
        </div>
      )}

      {/* Barra de Progreso SSE en Vivo para el Cazador Profundo de Repositorios (#2) */}
      {isHuntingMissingRepos && huntStreamStatus && (
        <div className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-950/25 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fuchsia-200">
            <div className="flex items-center gap-2 font-medium">
              <Loader2 className="size-4 animate-spin text-fuchsia-400" />
              <span>
                🕵️ Cazador Profundo SSE en vivo: <strong>{huntStreamStatus.current || 0}</strong> de{' '}
                <strong>{huntStreamStatus.total || 24}</strong> guardados inspeccionados ·{' '}
                <strong className="text-emerald-300">
                  {huntStreamStatus.discoveredReposCount || 0} repositorios descubiertos
                </strong>
              </span>
            </div>
            {huntStreamStatus.message && (
              <span className="text-[11px] text-fuchsia-300/90 truncate max-w-md">
                {huntStreamStatus.message}
              </span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/50">
            <div
              className="h-full bg-fuchsia-400 transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    ((huntStreamStatus.current || 1) / Math.max(1, huntStreamStatus.total || 24)) * 100
                  )
                )}%`
              }}
            />
          </div>
        </div>
      )}

      {/* Banner informativo */}
      {statusBanner && (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs ${
            statusBanner.type === 'error'
              ? 'border-red-500/40 bg-red-950/30 text-red-200'
              : statusBanner.type === 'info'
              ? 'border-blue-500/40 bg-blue-950/30 text-blue-200'
              : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
          }`}
        >
          <span>{statusBanner.text}</span>
          <button onClick={() => setStatusBanner(null)} className="text-muted-foreground hover:text-white">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Tarjetas de Resumen Rápido */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-[#15171f] p-3.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total en Galería</p>
          <p className="mt-1 font-serif text-2xl font-medium text-foreground">{kpis.total}</p>
          <p className="mt-0.5 text-[11px] text-[#9b91f5]">Proyectos únicos en SQLite</p>
        </div>
        <div className="rounded-xl border border-border bg-[#15171f] p-3.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Desde tus Guardados</p>
          <p className="mt-1 font-serif text-2xl font-medium text-emerald-300">{kpis.linkedToPosts}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Vinculados a posts de X / IG / WA</p>
        </div>
        <div className="rounded-xl border border-border bg-[#15171f] p-3.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Skills, MCP & Agentes</p>
          <p className="mt-1 font-serif text-2xl font-medium text-fuchsia-300">{kpis.skillsAndMcp}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Herramientas para agentes de IA</p>
        </div>
        <div className="rounded-xl border border-border bg-[#15171f] p-3.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Lenguajes Detectados</p>
          <p className="mt-1 font-serif text-2xl font-medium text-cyan-300">{availableLanguages.length}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {availableLanguages.slice(0, 3).join(', ') || 'TypeScript, Python, Rust'}
          </p>
        </div>
      </div>

      {/* Sub-pestañas: Mi Galería vs Descubrir en GitHub vs Armador de Proyectos */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveSubTab('gallery')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-all ${
              activeSubTab === 'gallery'
                ? 'bg-[#7c6cf0] text-white shadow-sm'
                : 'bg-[#161821] text-muted-foreground hover:text-foreground'
            }`}
          >
            <FolderGit2 className="size-4" />
            <span>Mi Galería de Repositorios ({filteredRepositories.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('discover')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-all ${
              activeSubTab === 'discover'
                ? 'bg-[#7c6cf0] text-white shadow-sm'
                : 'bg-[#161821] text-muted-foreground hover:text-foreground'
            }`}
          >
            <Compass className="size-4" />
            <span>Descubrir en GitHub (Live)</span>
          </button>
          <button
            onClick={() => setActiveSubTab('blueprints')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-all ${
              activeSubTab === 'blueprints'
                ? 'bg-[#7c6cf0] text-white shadow-sm'
                : 'bg-[#161821] text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="size-4" />
            <span>Armador de Proyectos & Prompts ({blueprints.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('radar')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium transition-all ${
              activeSubTab === 'radar'
                ? 'bg-[#7c6cf0] text-white shadow-sm'
                : 'bg-[#161821] text-muted-foreground hover:text-foreground'
            }`}
          >
            <Radio className="size-4 text-emerald-400" />
            <span>Radar de Releases & Top Puntaje</span>
          </button>
        </div>

        {activeSubTab === 'gallery' && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={handleOpenCompareModal}
              className="border-cyan-700/50 bg-cyan-950/30 text-xs text-cyan-200 hover:bg-cyan-950/50 gap-1.5"
              title="Comparar repositorios lado a lado (estrellas, actividad, licencia y veredicto IA)"
            >
              <Columns className="size-3.5 text-cyan-400" />
              Comparar ({selectedRepoKeys.size >= 2 ? selectedRepoKeys.size : 'Top 3'})
            </Button>

            <Button
              size="xs"
              variant="outline"
              onClick={() => setIsGalleryChatOpen(true)}
              className="border-[#3c3761] bg-[#211e34] text-xs text-[#cfcaff] hover:bg-[#2b2744] gap-1.5"
            >
              <Bot className="size-3.5 text-[#a59cf5]" /> Consultar a la Galería con IA
            </Button>

            <div className="flex items-center rounded-lg border border-border bg-[#15171f] p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                  viewMode === 'grid' ? 'bg-[#28263b] text-[#bfb8ff]' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Vista de tarjetas visuales"
              >
                <LayoutGrid className="size-3.5" />
                <span>Tarjetas</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                  viewMode === 'table' ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Vista Planilla tipo Excel con 2 Pestañas (Repositorios + Skills dentro de los Repos)"
              >
                <List className="size-3.5" />
                <span>📊 Tabla Excel (Repos + Skills)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* SUB-VISTA 1: MI GALERÍA DE REPOSITORIOS                              */}
      {/* ===================================================================== */}
      {activeSubTab === 'gallery' && (
        <div className="space-y-5">
          {/* Buscador y Filtros Multidimensionales */}
          <div className="rounded-xl border border-border bg-[#15171f] p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="relative lg:col-span-5">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, propósito, lenguaje o sinónimos (ej: mcp, skill, agentes, voz, video, ui)..."
                  className="w-full rounded-lg border border-border bg-[#101218] py-2 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:col-span-7">
                <select
                  value={selectedResourceType}
                  onChange={e => setSelectedResourceType(e.target.value)}
                  className="rounded-lg border border-border bg-[#101218] px-2.5 py-2 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                >
                  <option value="all">Tipo: Todos ({repositories.length})</option>
                  {RESOURCE_TYPE_OPTIONS.map(rt => (
                    <option key={rt} value={rt}>
                      {rt}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedLanguage}
                  onChange={e => setSelectedLanguage(e.target.value)}
                  className="rounded-lg border border-border bg-[#101218] px-2.5 py-2 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                >
                  <option value="">Lenguaje: Todos</option>
                  {availableLanguages.map(lang => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>

                <select
                  value={originFilter}
                  onChange={e => setOriginFilter(e.target.value as any)}
                  className="rounded-lg border border-border bg-[#101218] px-2.5 py-2 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                >
                  <option value="all">Origen: Todos</option>
                  <option value="from_bookmarks">📌 De Guardados (X/IG/WA)</option>
                  <option value="direct">➕ Agregados directo en Galería</option>
                </select>

                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as RepoSortByType)}
                  className="rounded-lg border border-border bg-[#101218] px-2.5 py-2 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                >
                  <option value="score_desc">Orden: ★ Mayor Puntaje Atlas (1-10)</option>
                  <option value="bookmarks_desc">Orden: Más guardados vinculados</option>
                  <option value="stars_desc">Orden: Más estrellas ★</option>
                  <option value="updated_desc">Orden: Última actividad</option>
                  <option value="created_desc">Orden: Fecha de lanzamiento</option>
                  <option value="added_desc">Orden: Agregados recientemente</option>
                  <option value="name_asc">Orden: Nombre (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Segunda fila de filtros rápidos: Actividad, Área, Seguridad, Fecha de lanzamiento y Topics */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground mr-1 flex items-center gap-1">
                  <SlidersHorizontal className="size-3" /> Filtros rápidos:
                </span>
                {(['Skill', 'Servidor MCP o conector', 'Agente o workflow', 'Librería, framework o SDK'] as ResourceType[]).map(
                  rt => {
                    const active = selectedResourceType === rt
                    return (
                      <button
                        key={rt}
                        onClick={() => setSelectedResourceType(active ? 'all' : rt)}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-all ${
                          active
                            ? 'border-[#7c6cf0] bg-[#7c6cf0]/20 text-white'
                            : 'border-border bg-[#11131a] text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {rt}
                      </button>
                    )
                  }
                )}

                {selectedTopic && (
                  <Badge className="gap-1 bg-[#28263b] text-[#bfb8ff] border-[#423d66] text-[11px]">
                    #{selectedTopic}
                    <button onClick={() => setSelectedTopic('')}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedArea}
                  onChange={e => setSelectedArea(e.target.value)}
                  className="rounded-md border border-border bg-[#101218] px-2 py-1 text-[11px] text-muted-foreground"
                >
                  <option value="">Área: Todas ({availableAreas.length})</option>
                  {availableAreas.map(area => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedSecurityGrade}
                  onChange={e => setSelectedSecurityGrade(e.target.value as any)}
                  className="rounded-md border border-border bg-[#101218] px-2 py-1 text-[11px] text-muted-foreground"
                >
                  <option value="all">🛡️ Seguridad: Todas</option>
                  <option value="Alto">🛡️ Seguridad: Alto</option>
                  <option value="Medio">🛡️ Seguridad: Medio</option>
                  <option value="Precaución">⚠️ Seguridad: Precaución</option>
                </select>

                <select
                  value={selectedActivity}
                  onChange={e => setSelectedActivity(e.target.value as ActivityFilterType)}
                  className="rounded-md border border-border bg-[#101218] px-2 py-1 text-[11px] text-muted-foreground"
                >
                  <option value="ALL">Actividad: Cualquiera</option>
                  <option value="active_week">Activo últimos 7 días</option>
                  <option value="active_month">Activo últimos 30 días</option>
                  <option value="active_quarter">Activo últimos 90 días</option>
                  <option value="inactive">Sin actividad reciente</option>
                </select>

                <select
                  value={selectedCreatedAt}
                  onChange={e => setSelectedCreatedAt(e.target.value as CreatedAtFilterType)}
                  className="rounded-md border border-border bg-[#101218] px-2 py-1 text-[11px] text-muted-foreground"
                >
                  <option value="ALL">Lanzamiento: Cualquier fecha</option>
                  <option value="week">Lanzados esta semana</option>
                  <option value="month">Lanzados este mes</option>
                  <option value="three_months">Últimos 3 meses</option>
                  <option value="six_months">Últimos 6 meses</option>
                  <option value="year">Último año</option>
                </select>

                {(searchQuery ||
                  selectedResourceType !== 'all' ||
                  selectedLanguage ||
                  selectedTopic ||
                  selectedArea ||
                  selectedSecurityGrade !== 'all' ||
                  originFilter !== 'all' ||
                  selectedActivity !== 'ALL' ||
                  selectedCreatedAt !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSearchQuery('')
                      setSelectedResourceType('all')
                      setSelectedLanguage('')
                      setSelectedTopic('')
                      setSelectedArea('')
                      setSelectedSecurityGrade('all')
                      setOriginFilter('all')
                      setSelectedActivity('ALL')
                      setSelectedCreatedAt('ALL')
                    }}
                    className="text-[11px] text-[#9b91f5] hover:underline"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Grid o Tabla de Repositorios */}
          {isLoading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <div key={n} className="h-[360px] animate-pulse rounded-xl border border-border bg-[#15171f]" />
              ))}
            </div>
          ) : filteredRepositories.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-[#14161e] py-16 text-center">
              <FolderGit2 className="size-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-foreground">
                No se encontraron repositorios con los filtros actuales
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-md">
                Probá limpiar los filtros, agregar un repositorio por URL o explorar proyectos en la pestaña &ldquo;Descubrir en GitHub&rdquo;.
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {paginatedRepositories.map(repo => {
                const key = repo.fullName.toLowerCase()
                const isSelected = selectedRepoKeys.has(key)
                const linkedPosts = getLinkedBookmarksForRepo(repo)
                const activity = getActivityBadge(repo.pushedAt || repo.updatedAt)

                return (
                  <div
                    key={repo.fullName}
                    onClick={() => {
                      setDetailRepo(repo)
                      setRepoChatHistory([])
                    }}
                    className={`group relative flex flex-col overflow-hidden rounded-xl border bg-[#15171f] transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-xl ${
                      isSelected
                        ? 'border-[#7c6cf0] ring-2 ring-[#7c6cf0]/30'
                        : 'border-border hover:border-[#4b4675]'
                    }`}
                  >
                    {/* Imagen de Previsualización (README o GitHub OpenGraph) */}
                    <div className="relative h-[168px] w-full overflow-hidden bg-[#0e1016] border-b border-border/60">
                      <img
                        src={repo.imageUrl || `https://opengraph.githubassets.com/1/${repo.owner}/${repo.name}`}
                        alt={repo.fullName}
                        loading="lazy"
                        onError={e => {
                          const target = e.currentTarget
                          const fallback = `https://opengraph.githubassets.com/1/${repo.owner}/${repo.name}`
                          if (target.src !== fallback) {
                            target.src = fallback
                          }
                        }}
                        className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#15171f] via-[#15171f]/25 to-transparent" />

                      {/* Checkbox de selección múltiple */}
                      <div
                        onClick={e => {
                          e.stopPropagation()
                          toggleSelectRepo(repo.fullName)
                        }}
                        className="absolute left-3 top-3 z-10"
                      >
                        <div
                          className={`grid size-6 place-items-center rounded-md border backdrop-blur-md transition-all ${
                            isSelected
                              ? 'border-[#7c6cf0] bg-[#7c6cf0] text-white'
                              : 'border-white/25 bg-black/50 text-transparent hover:border-white/60'
                          }`}
                        >
                          <Check className="size-3.5" />
                        </div>
                      </div>

                      {/* Badges superiores derechos */}
                      <div className="absolute right-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
                        {repo.imageSource === 'readme' && (
                          <span className="rounded-md border border-emerald-500/40 bg-black/70 px-2 py-0.5 text-[10px] font-medium text-emerald-300 backdrop-blur-md">
                            README Preview
                          </span>
                        )}
                        {linkedPosts.length > 0 && (
                          <span
                            className="flex items-center gap-1 rounded-md border border-[#7c6cf0]/50 bg-[#1a172b]/90 px-2 py-0.5 text-[10px] font-medium text-[#cfcaff] backdrop-blur-md"
                            title="Cantidad de publicaciones guardadas que recomiendan este repositorio"
                          >
                            <Bookmark className="size-2.5 fill-current" />
                            {linkedPosts.length} {linkedPosts.length === 1 ? 'guardado' : 'guardados'}
                          </span>
                        )}
                      </div>

                      {/* Barra inferior sobre el banner: Tipo de Recurso y Lenguaje */}
                      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${getResourceTypeStyle(
                            repo.resourceType
                          )}`}
                        >
                          {repo.resourceType || 'Repositorio'}
                        </span>

                        {repo.primaryLanguage && (
                          <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/70 px-2 py-0.5 text-[10px] font-medium text-zinc-200 backdrop-blur-md">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: getLanguageColor(repo.primaryLanguage) }}
                            />
                            {repo.primaryLanguage}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Cuerpo de la Tarjeta */}
                    <div className="flex flex-1 flex-col p-4">
                      {/* Owner + Nombre */}
                      <div className="flex items-start gap-2.5">
                        <img
                          src={repo.avatarUrl || `https://github.com/${repo.owner}.png?size=128`}
                          alt={repo.owner}
                          loading="lazy"
                          className="size-7 rounded-full border border-border bg-[#0e1016] object-cover shrink-0 mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] text-muted-foreground">{repo.owner} /</p>
                          <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-[#b4abff] transition-colors">
                            {repo.name}
                          </h3>
                        </div>
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-[#232634] hover:text-foreground"
                          title="Abrir en GitHub"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>

                      {/* Explicación en español (Para qué sirve) */}
                      <div className="mt-3 rounded-lg border border-[#2a2840] bg-[#1b192b]/60 p-2.5">
                        <p className="line-clamp-3 text-xs leading-relaxed text-[#e2def8]">
                          {repo.shortExplanationEs || repo.explanation || repo.description}
                        </p>
                      </div>

                      {/* Ficha rápida de Evaluación por Agente (Área, Empresa, Puntaje y Seguridad) */}
                      {repo.agentEvaluation && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span
                            className="rounded-md border border-emerald-500/40 bg-emerald-950/40 px-1.5 py-0.5 font-semibold text-emerald-300"
                            title={repo.agentEvaluation.atlasScoreLabel}
                          >
                            ★ Puntaje {repo.agentEvaluation.atlasScore.toFixed(1)}/10
                          </span>
                          <span
                            className="rounded-md border border-[#3d3960] bg-[#211f33] px-1.5 py-0.5 text-[#cfcaff] truncate max-w-[165px]"
                            title={`Área: ${repo.agentEvaluation.areaCategory}`}
                          >
                            {repo.agentEvaluation.areaCategory}
                          </span>
                          <span
                            className="rounded-md border border-border bg-[#11131a] px-1.5 py-0.5 text-zinc-300 truncate max-w-[155px]"
                            title={`Creador / Organización: ${repo.agentEvaluation.companyOrAuthor}`}
                          >
                            🏢 {repo.agentEvaluation.companyOrAuthor}
                          </span>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 font-medium ${
                              repo.agentEvaluation.securityGrade === 'Alto'
                                ? 'border-emerald-600/40 bg-emerald-950/30 text-emerald-300'
                                : repo.agentEvaluation.securityGrade === 'Medio'
                                ? 'border-cyan-600/40 bg-cyan-950/30 text-cyan-300'
                                : 'border-amber-600/40 bg-amber-950/30 text-amber-300'
                            }`}
                            title={repo.agentEvaluation.securitySummary}
                          >
                            🛡️ Seg: {repo.agentEvaluation.securityGrade}
                          </span>
                        </div>
                      )}

                      {/* Descripción original si difiere */}
                      {repo.description &&
                        repo.description !== 'Sin descripción provista.' &&
                        repo.description !== repo.shortExplanationEs && (
                          <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">
                            {repo.description}
                          </p>
                        )}

                      {/* Topics */}
                      {repo.topics && repo.topics.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {repo.topics.slice(0, 4).map(t => (
                            <button
                              key={t}
                              onClick={e => {
                                e.stopPropagation()
                                setSelectedTopic(selectedTopic === t ? '' : t)
                              }}
                              className="rounded-md border border-border/80 bg-[#101218] px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-[#7c6cf0] hover:text-[#bfb8ff]"
                            >
                              #{t}
                            </button>
                          ))}
                          {repo.topics.length > 4 && (
                            <span className="px-1 py-0.5 text-[10px] text-muted-foreground">
                              +{repo.topics.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Comando de Instalación 1-Clic (Setup Rápido) */}
                      {(() => {
                        const snippet = getRepoInstallSnippets(repo)
                        const cmdKey = `card:${repo.fullName}`
                        return (
                          <div
                            onClick={e => handleCopyCmd(snippet.primaryCommand, cmdKey, e)}
                            className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-[#0d0f15] px-2.5 py-1.5 font-mono text-[10px] text-zinc-300 hover:border-[#7c6cf0]/60 transition-colors"
                            title="Clic para copiar comando de instalación"
                          >
                            <span className="truncate flex items-center gap-1.5">
                              <Terminal className="size-3 text-[#9b91f5] shrink-0" />
                              <span className="truncate">{snippet.primaryCommand}</span>
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {copiedCmdKey === cmdKey ? (
                                <Check className="size-3 text-emerald-400" />
                              ) : (
                                <Copy className="size-3 hover:text-white" />
                              )}
                            </span>
                          </div>
                        )
                      })()}

                      {/* Footer con Estrellas, Forks y Estado de Actividad */}
                      <div className="mt-auto pt-3">
                        <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 font-medium text-foreground">
                              <Star className="size-3.5 text-amber-400 fill-amber-400" />
                              {repo.stars > 0 ? formatNum(repo.stars) : '—'}
                            </span>
                            {repo.forks > 0 && (
                              <span className="flex items-center gap-1">
                                <GitFork className="size-3 text-muted-foreground" />
                                {formatNum(repo.forks)}
                              </span>
                            )}
                          </div>

                          <span
                            className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] ${activity.cls}`}
                          >
                            <span className={`size-1.5 rounded-full ${activity.dot}`} />
                            {activity.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Vista Planilla Interactiva de 2 Pestañas (Repositorios + Skills dentro de los Repositorios) */
            <ReposSkillsExcelTable
              bookmarks={bookmarks}
              initialRepos={filteredRepositories}
              onSelectRepoDetail={fullName => {
                const found = repositories.find(r => r.fullName.toLowerCase() === fullName.toLowerCase())
                if (found) {
                  setDetailRepo(found)
                  setRepoChatHistory([])
                }
              }}
            />
          )}

          {/* Barra de Paginación Virtualizada (#3) */}
          {!isLoading && filteredRepositories.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-[#15171f] px-4 py-3 text-xs">
              <span className="text-muted-foreground">
                Mostrando <strong className="text-foreground">{paginatedRepositories.length}</strong> de{' '}
                <strong className="text-foreground">{filteredRepositories.length}</strong> repositorios filtrados
              </span>
              {visibleCount < filteredRepositories.length && (
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    onClick={() => setVisibleCount(prev => Math.min(filteredRepositories.length, prev + 36))}
                    className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8] gap-1"
                  >
                    + Cargar 36 más
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setVisibleCount(filteredRepositories.length)}
                    className="border-border bg-[#101218] text-zinc-200"
                  >
                    Mostrar todos ({filteredRepositories.length})
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-VISTA 2: DESCUBRIR EN GITHUB (LIVE SEARCH & CATEGORIES)          */}
      {/* ===================================================================== */}
      {activeSubTab === 'discover' && (
        <div className="space-y-5">
          {/* Chips de Categorías de Descubrimiento */}
          <div className="flex flex-wrap gap-2">
            {DISCOVER_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  setDiscoverCategory(cat.id)
                  setDiscoverQuery('')
                }}
                className={`rounded-xl border px-3.5 py-2 text-left text-xs transition-all ${
                  discoverCategory === cat.id && !discoverQuery
                    ? 'border-[#7c6cf0] bg-[#28263b] text-white shadow-sm'
                    : 'border-border bg-[#15171f] text-muted-foreground hover:border-[#4b4675] hover:text-foreground'
                }`}
              >
                <div className="font-medium">{cat.label}</div>
                <div className="text-[10px] opacity-75 line-clamp-1">{cat.desc}</div>
              </button>
            ))}
          </div>

          {/* Barra de búsqueda en vivo en GitHub */}
          <form
            onSubmit={e => {
              e.preventDefault()
              loadDiscoverRepos(1)
            }}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-[#15171f] p-3.5"
          >
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={discoverQuery}
                onChange={e => setDiscoverQuery(e.target.value)}
                placeholder="Buscar en todo GitHub en tiempo real (ej: mcp server, claude skill, browser agent, tts)..."
                className="w-full rounded-lg border border-border bg-[#101218] py-2 pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
              />
            </div>

            <select
              value={discoverLanguage}
              onChange={e => setDiscoverLanguage(e.target.value)}
              className="rounded-lg border border-border bg-[#101218] px-3 py-2 text-xs text-foreground"
            >
              <option value="">Cualquier lenguaje</option>
              <option value="TypeScript">TypeScript</option>
              <option value="Python">Python</option>
              <option value="Rust">Rust</option>
              <option value="Go">Go</option>
              <option value="JavaScript">JavaScript</option>
              <option value="Swift">Swift</option>
            </select>

            <select
              value={discoverCreated}
              onChange={e => setDiscoverCreated(e.target.value as CreatedAtFilterType)}
              className="rounded-lg border border-border bg-[#101218] px-3 py-2 text-xs text-foreground"
            >
              <option value="ALL">Cualquier fecha</option>
              <option value="week">Creados esta semana</option>
              <option value="month">Creados este mes</option>
              <option value="three_months">Últimos 3 meses</option>
              <option value="year">Último año</option>
            </select>

            <Button type="submit" size="sm" className="bg-[#7c6cf0] text-white hover:bg-[#6c5ce0] text-xs">
              Buscar en GitHub
            </Button>
          </form>

          {discoverError && (
            <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-950/30 p-3.5 text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-amber-400" />
                <span>{discoverError}</span>
              </div>
              <Button size="xs" variant="outline" onClick={() => setIsSettingsOpen(true)}>
                Configurar Token GitHub
              </Button>
            </div>
          )}

          {isDiscoverLoading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <div key={n} className="h-[320px] animate-pulse rounded-xl border border-border bg-[#15171f]" />
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Mostrando resultados de GitHub ({discoverTotal.toLocaleString()} encontrados)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={discoverPage <= 1 || isDiscoverLoading}
                    onClick={() => loadDiscoverRepos(discoverPage - 1)}
                  >
                    <ChevronLeft className="size-3.5" /> Anterior
                  </Button>
                  <span>Página {discoverPage}</span>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!discoverHasMore || isDiscoverLoading}
                    onClick={() => loadDiscoverRepos(discoverPage + 1)}
                  >
                    Siguiente <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {discoverItems.map(repo => {
                  const key = repo.fullName.toLowerCase()
                  const alreadySaved = existingFullNamesSet.has(key)
                  const isSaving = savingDiscoverKey === key

                  return (
                    <div
                      key={repo.fullName}
                      className="flex flex-col overflow-hidden rounded-xl border border-border bg-[#15171f] transition-all hover:border-[#4b4675]"
                    >
                      <div className="relative h-[150px] w-full overflow-hidden bg-[#0e1016] border-b border-border/60">
                        <img
                          src={repo.imageUrl}
                          alt={repo.fullName}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#15171f] via-transparent to-transparent" />
                        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${getResourceTypeStyle(
                              repo.resourceType
                            )}`}
                          >
                            {repo.resourceType || 'Repositorio'}
                          </span>
                          {repo.primaryLanguage && (
                            <span className="rounded-md bg-black/75 px-2 py-0.5 text-[10px] text-zinc-200">
                              {repo.primaryLanguage}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] text-muted-foreground">{repo.owner} /</p>
                            <h3 className="truncate text-sm font-semibold text-foreground">{repo.name}</h3>
                          </div>
                          <span className="flex items-center gap-1 text-xs font-medium text-amber-300 shrink-0">
                            <Star className="size-3.5 fill-amber-400 text-amber-400" />
                            {formatNum(repo.stars)}
                          </span>
                        </div>

                        <p className="mt-2.5 line-clamp-3 text-xs text-zinc-300">
                          {repo.shortExplanationEs || repo.description}
                        </p>

                        <div className="mt-auto pt-4 flex items-center justify-between gap-2">
                          <a
                            href={repo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            Ver en GitHub <ExternalLink className="size-3" />
                          </a>

                          {alreadySaved ? (
                            <Badge className="bg-emerald-950/60 text-emerald-300 border-emerald-700/40 gap-1">
                              <Check className="size-3" /> En tu Galería
                            </Badge>
                          ) : (
                            <Button
                              size="xs"
                              disabled={isSaving}
                              onClick={() => handleSaveDiscoverRepo(repo)}
                              className="bg-[#7c6cf0] text-white hover:bg-[#6b5bd6] gap-1"
                            >
                              {isSaving ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Plus className="size-3" />
                              )}
                              Guardar en Atlas
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-VISTA 3: ARMADOR DE PROYECTOS & GENERADOR DE PROMPT MAESTRO       */}
      {/* ===================================================================== */}
      {activeSubTab === 'blueprints' && (
        <div className="space-y-5">
          {/* Recomendador de Stack por Idea de Proyecto (#8) */}
          <div className="rounded-xl border border-[#4c4578] bg-[#18162b] p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Rocket className="size-4 text-[#a59cf5]" />
                <h3 className="text-sm font-semibold text-white">
                  Recomendador Automático de Stack por Idea de Proyecto (IA + Catálogo Local)
                </h3>
              </div>
              <Badge className="bg-[#2c274d] text-[#d6d1ff] border-[#4c4578] text-[10px]">
                Analiza tus {repositories.length} repositorios y arma el Blueprint + PROMPT_MAESTRO.md
              </Badge>
            </div>
            <form onSubmit={handleRecommendStackByIdea} className="flex flex-wrap gap-2">
              <input
                type="text"
                value={stackIdeaInput}
                onChange={e => setStackIdeaInput(e.target.value)}
                placeholder="Contame qué querés construir (ej: 'Un agente de WhatsApp con voz, automatización de navegador y servidores MCP')..."
                className="flex-1 min-w-[260px] rounded-lg border border-[#3e3866] bg-[#101218] px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
              />
              <Button
                type="submit"
                size="sm"
                disabled={isRecommendingStack || !stackIdeaInput.trim()}
                className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8] text-xs gap-1.5"
              >
                {isRecommendingStack ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {isRecommendingStack ? 'Seleccionando Stack Ideal...' : '🚀 Armar Stack Ideal y Prompt'}
              </Button>
            </form>

            {stackRecommendation && (
              <div className="rounded-xl border border-emerald-500/30 bg-[#121922] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-emerald-300">
                      ✨ {stackRecommendation.projectName}
                    </h4>
                    <p className="mt-0.5 text-xs text-zinc-200">
                      {stackRecommendation.architectureSummaryEs}
                    </p>
                  </div>
                  <Badge className="bg-emerald-950/60 text-emerald-300 border-emerald-600/40 text-[10px]">
                    {stackRecommendation.selectedRepos.length} piezas seleccionadas
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {stackRecommendation.selectedRepos.map(item => (
                    <div
                      key={item.fullName}
                      className="rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-white truncate">{item.fullName}</span>
                        <span className="text-[10px] font-medium text-emerald-300 shrink-0">
                          ★ {item.atlasScore.toFixed(1)}
                        </span>
                      </div>
                      <span className="inline-block rounded bg-[#282442] px-1.5 py-0.5 text-[10px] text-[#cfcaff]">
                        {item.roleInStack}
                      </span>
                      <p className="text-[11px] text-zinc-300 line-clamp-2">{item.whySelectedEs}</p>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-cyan-200/90">
                  🔗 <strong>Compatibilidad Técnica y Licencias:</strong> {stackRecommendation.compatibilityNotesEs}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Columna Izquierda: Lista de Proyectos / Stacks */}
          <div className="space-y-3 lg:col-span-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-[#15171f] p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Mis Proyectos & Stacks</h3>
                <p className="text-[11px] text-muted-foreground">
                  Agrupá repositorios para generar Prompts Maestros
                </p>
              </div>
              <Button
                size="xs"
                onClick={handleCreateNewBlueprint}
                className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8] gap-1"
              >
                <Plus className="size-3.5" /> Nuevo Proyecto
              </Button>
            </div>

            <div className="space-y-2">
              {blueprints.map(bp => {
                const isActive = activeBlueprint?.id === bp.id
                return (
                  <div
                    key={bp.id}
                    onClick={() => {
                      setActiveBlueprintId(bp.id)
                      setGeneratedMasterPrompt('')
                    }}
                    className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                      isActive
                        ? 'border-[#7c6cf0] bg-[#1e1b33] shadow-md'
                        : 'border-border bg-[#15171f] hover:border-[#4b4675]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="truncate text-xs font-semibold text-foreground">{bp.name}</h4>
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {bp.goal || bp.description || 'Sin objetivo definido'}
                        </p>
                      </div>
                      <Badge className="bg-[#28263b] text-[#cfcaff] text-[10px] shrink-0">
                        {(bp.repoFullNames || []).length} repos
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Columna Derecha: Editor del Blueprint Activo + Generador de PROMPT_MAESTRO.md */}
          <div className="space-y-5 lg:col-span-8">
            {activeBlueprint ? (
              <div className="rounded-xl border border-border bg-[#15171f] p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                  <div className="space-y-1 flex-1 min-w-[240px]">
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Nombre del Proyecto / Stack
                    </label>
                    <input
                      type="text"
                      value={activeBlueprint.name}
                      onChange={e => {
                        const val = e.target.value
                        setBlueprints(prev =>
                          prev.map(b => (b.id === activeBlueprint.id ? { ...b, name: val } : b))
                        )
                      }}
                      onBlur={e =>
                        handleSaveBlueprint({ ...activeBlueprint, name: e.target.value || 'Proyecto IA' })
                      }
                      className="w-full rounded-lg border border-border bg-[#101218] px-3 py-1.5 font-serif text-base font-medium text-foreground focus:border-[#7c6cf0] focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={isGeneratingPrompt}
                      onClick={() => handleGenerateMasterPrompt(activeBlueprint)}
                      className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8] text-xs gap-1.5"
                    >
                      {isGeneratingPrompt ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      Generar PROMPT_MAESTRO.md / CLAUDE.md
                    </Button>
                    {blueprints.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteBlueprint(activeBlueprint.id)}
                        className="text-red-400 hover:bg-red-950/30 text-xs"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Objetivo y Notas */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">
                      Objetivo Técnico (¿Qué querés construir con estos repositorios?)
                    </label>
                    <textarea
                      rows={3}
                      value={activeBlueprint.goal}
                      onChange={e => {
                        const val = e.target.value
                        setBlueprints(prev =>
                          prev.map(b => (b.id === activeBlueprint.id ? { ...b, goal: val } : b))
                        )
                      }}
                      onBlur={e => handleSaveBlueprint({ ...activeBlueprint, goal: e.target.value })}
                      placeholder="Ej: Construir un agente que edite videos con FFmpeg y tenga acceso a estos servidores MCP..."
                      className="w-full rounded-lg border border-border bg-[#101218] p-2.5 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-300">
                      Notas de Arquitectura / Reglas para el Agente
                    </label>
                    <textarea
                      rows={3}
                      value={activeBlueprint.notes}
                      onChange={e => {
                        const val = e.target.value
                        setBlueprints(prev =>
                          prev.map(b => (b.id === activeBlueprint.id ? { ...b, notes: val } : b))
                        )
                      }}
                      onBlur={e => handleSaveBlueprint({ ...activeBlueprint, notes: e.target.value })}
                      placeholder="Ej: Usar TypeScript estricto, integrar como subagentes modulares, priorizar ejecución local..."
                      className="w-full rounded-lg border border-border bg-[#101218] p-2.5 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Repositorios asignados al Proyecto */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Repositorios en este Proyecto ({(activeBlueprint.repoFullNames || []).length})
                    </h4>

                    {/* Buscador rápido para añadir repositorios de la galería */}
                    <div className="relative w-64">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={blueprintRepoSearch}
                        onChange={e => setBlueprintRepoSearch(e.target.value)}
                        placeholder="Añadir repo de tu galería..."
                        className="w-full rounded-lg border border-border bg-[#101218] py-1.5 pl-8 pr-3 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                      />
                    </div>
                  </div>

                  {blueprintRepoSearch.trim() && (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-[#4a4475] bg-[#101218] p-2 space-y-1">
                      {repositories
                        .filter(
                          r =>
                            !(activeBlueprint.repoFullNames || []).some(
                              n => n.toLowerCase() === r.fullName.toLowerCase()
                            ) &&
                            `${r.fullName} ${r.shortExplanationEs || ''} ${r.resourceType || ''}`
                              .toLowerCase()
                              .includes(blueprintRepoSearch.toLowerCase())
                        )
                        .slice(0, 8)
                        .map(r => (
                          <div
                            key={r.fullName}
                            onClick={() => {
                              handleSaveBlueprint({
                                ...activeBlueprint,
                                repoFullNames: [...(activeBlueprint.repoFullNames || []), r.fullName]
                              })
                              setBlueprintRepoSearch('')
                            }}
                            className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs cursor-pointer hover:bg-[#232038]"
                          >
                            <div className="min-w-0 truncate">
                              <span className="font-semibold text-white">{r.fullName}</span>
                              <span className="ml-2 text-muted-foreground">
                                — {r.shortExplanationEs || r.description}
                              </span>
                            </div>
                            <Badge className="bg-[#7c6cf0] text-white text-[10px] shrink-0">+ Añadir</Badge>
                          </div>
                        ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {(activeBlueprint.repoFullNames || []).map(fullName => {
                      const repo = repositories.find(
                        r => r.fullName.toLowerCase() === fullName.toLowerCase()
                      )
                      const snippet = repo ? getRepoInstallSnippets(repo) : null
                      return (
                        <div
                          key={fullName}
                          className="flex flex-col justify-between rounded-xl border border-border bg-[#101218] p-3 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  onClick={() => repo && setDetailRepo(repo)}
                                  className="cursor-pointer truncate text-xs font-semibold text-[#cfcaff] hover:underline"
                                >
                                  {fullName}
                                </span>
                                {repo?.resourceType && (
                                  <span
                                    className={`rounded border px-1.5 py-0.2 text-[9px] ${getResourceTypeStyle(
                                      repo.resourceType
                                    )}`}
                                  >
                                    {repo.resourceType}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                                {repo?.shortExplanationEs || repo?.description || 'Repositorio de GitHub'}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                handleSaveBlueprint({
                                  ...activeBlueprint,
                                  repoFullNames: (activeBlueprint.repoFullNames || []).filter(
                                    n => n.toLowerCase() !== fullName.toLowerCase()
                                  )
                                })
                              }}
                              className="text-muted-foreground hover:text-red-400"
                              title="Quitar del proyecto"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>

                          {snippet && (
                            <div
                              onClick={e => handleCopyCmd(snippet.primaryCommand, `bp:${fullName}`, e)}
                              className="flex items-center justify-between gap-2 rounded border border-border/60 bg-[#0b0d12] px-2 py-1 font-mono text-[10px] text-zinc-300 cursor-pointer hover:border-[#7c6cf0]"
                            >
                              <span className="truncate">$ {snippet.primaryCommand}</span>
                              {copiedCmdKey === `bp:${fullName}` ? (
                                <Check className="size-3 text-emerald-400 shrink-0" />
                              ) : (
                                <Copy className="size-3 text-muted-foreground shrink-0" />
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Vista previa del PROMPT_MAESTRO.md generado */}
                {generatedMasterPrompt && (
                  <div className="space-y-3 rounded-xl border border-[#4c4578] bg-[#101218] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-[#a59cf5]" />
                        <span className="text-xs font-semibold text-white">
                          Documento Generado: listo para Claude Code, Cursor, Antigravity o Codex
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={async () => {
                            await navigator.clipboard.writeText(generatedMasterPrompt)
                            setCopiedMasterPrompt(true)
                            setTimeout(() => setCopiedMasterPrompt(false), 2200)
                          }}
                          className="border-[#524b82] bg-[#242038] text-xs text-white gap-1"
                        >
                          {copiedMasterPrompt ? (
                            <Check className="size-3 text-emerald-400" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          {copiedMasterPrompt ? '¡Copiado!' : 'Copiar Markdown'}
                        </Button>
                        <Button
                          size="xs"
                          onClick={() => handleDownloadMasterPrompt('PROMPT_MAESTRO.md')}
                          className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8] text-xs gap-1"
                        >
                          <Download className="size-3" /> Descargar PROMPT_MAESTRO.md
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleDownloadMasterPrompt('CLAUDE.md')}
                          className="border-border bg-[#191b26] text-xs gap-1"
                        >
                          <Download className="size-3" /> CLAUDE.md
                        </Button>
                      </div>
                    </div>

                    <pre className="max-h-96 overflow-y-auto rounded-lg border border-border bg-[#0b0c10] p-4 font-mono text-[11px] leading-relaxed text-zinc-200 whitespace-pre-wrap">
                      {generatedMasterPrompt}
                    </pre>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-VISTA 4: RADAR DE RELEASES, ACTIVIDAD Y TOP PUNTAJE ATLAS (#10)  */}
      {/* ===================================================================== */}
      {activeSubTab === 'radar' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-[#15171f] p-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Radio className="size-4 text-emerald-400" />
                Radar de Releases, Actividad Reciente y Top Puntaje Atlas
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Monitorea cuáles de tus repositorios guardados tienen actividad reciente, nuevos lanzamientos o el mayor puntaje técnico del Agente.
              </p>
            </div>
            <Button
              size="xs"
              variant="outline"
              disabled={isRadarLoading}
              onClick={loadReleaseRadar}
              className="border-border bg-[#101218] text-xs gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${isRadarLoading ? 'animate-spin' : ''}`} />
              Actualizar Radar
            </Button>
          </div>

          {isRadarLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <div key={n} className="h-36 animate-pulse rounded-xl border border-border bg-[#15171f]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {radarItems.map(item => {
                const fullRepo = repositories.find(
                  r => r.fullName.toLowerCase() === item.fullName.toLowerCase()
                )
                return (
                  <div
                    key={item.fullName}
                    onClick={() => fullRepo && setDetailRepo(fullRepo)}
                    className="cursor-pointer rounded-xl border border-border bg-[#15171f] p-4 space-y-2.5 transition-all hover:border-[#7c6cf0]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-white truncate block">
                          {item.fullName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          🏢 {item.companyOrAuthor} · {item.areaCategory}
                        </span>
                      </div>
                      <Badge className="bg-emerald-950/60 text-emerald-300 border-emerald-600/40 text-[10px] shrink-0">
                        ★ {item.atlasScore.toFixed(1)}/10
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs text-zinc-200">{item.shortExplanationEs}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px]">
                      <span className="rounded-md border border-[#3d3863] bg-[#211e36] px-2 py-0.5 text-[#cfcaff]">
                        📡 {item.highlightReasonEs}
                      </span>
                      <span className="text-muted-foreground">
                        {item.stars > 0 ? `★ ${formatNum(item.stars)} · ` : ''}
                        {item.latestReleaseTag ? `Tag ${item.latestReleaseTag}` : `Hace ${item.daysSinceLastPush}d`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* BARRA FLOTANTE DE SELECCIÓN MÚLTIPLE                                 */}
      {/* ===================================================================== */}
      {selectedRepoKeys.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 flex flex-wrap items-center gap-2 rounded-2xl border border-[#4c4578] bg-[#171625]/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
          <Badge className="bg-[#7c6cf0] text-white">
            {selectedRepoKeys.size} seleccionado{selectedRepoKeys.size === 1 ? '' : 's'}
          </Badge>

          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              setSelectedRepoKeys(new Set(filteredRepositories.map(r => r.fullName.toLowerCase())))
            }
            className="text-xs text-zinc-300"
          >
            Seleccionar visibles ({filteredRepositories.length})
          </Button>

          {selectedRepoKeys.size >= 2 && (
            <Button
              size="xs"
              variant="outline"
              onClick={handleOpenCompareModal}
              className="border-cyan-600/50 bg-cyan-950/40 text-cyan-200 text-xs gap-1"
            >
              <Columns className="size-3 text-cyan-400" />
              Comparar ({Math.min(4, selectedRepoKeys.size)})
            </Button>
          )}

          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              const names = repositories
                .filter(r => selectedRepoKeys.has(r.fullName.toLowerCase()))
                .map(r => r.fullName)
              handleAddReposToActiveBlueprint(names)
            }}
            className="border-[#6b5de0]/60 bg-[#272342] text-[#dfdcfb] text-xs gap-1"
          >
            <Layers className="size-3 text-[#a59cf5]" />
            + Añadir a Proyecto / Prompt
          </Button>

          <Button
            size="xs"
            variant="outline"
            onClick={() => handleCopySelected('urls')}
            className="border-border bg-[#211f33] text-xs gap-1"
          >
            {copiedType === 'urls' ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
            Copiar URLs
          </Button>

          <Button
            size="xs"
            variant="outline"
            onClick={() => handleCopySelected('markdown')}
            className="border-border bg-[#211f33] text-xs gap-1"
          >
            {copiedType === 'markdown' ? (
              <Check className="size-3 text-emerald-400" />
            ) : (
              <FileText className="size-3" />
            )}
            Copiar Markdown
          </Button>

          <Button
            size="xs"
            variant="outline"
            disabled={isBatchEnriching}
            onClick={() => handleEnrichReposWithGitHubApi(Array.from(selectedRepoKeys))}
            className="border-emerald-700/50 bg-emerald-950/30 text-emerald-300 text-xs gap-1"
          >
            <RefreshCw className={`size-3 ${isBatchEnriching ? 'animate-spin' : ''}`} />
            Enriquecer de GitHub API
          </Button>

          <Button
            size="xs"
            variant="outline"
            onClick={() => handleExportGalleryJson(true)}
            className="border-border bg-[#211f33] text-xs gap-1"
          >
            <Download className="size-3" /> Exportar JSON
          </Button>

          <Button
            size="xs"
            variant="ghost"
            onClick={handleDeleteSelectedRepos}
            className="text-xs text-red-400 hover:bg-red-950/30"
          >
            <Trash2 className="size-3.5" />
          </Button>

          <button
            onClick={() => setSelectedRepoKeys(new Set())}
            className="ml-1 rounded-full p-1 text-muted-foreground hover:text-white"
            title="Deseleccionar todos"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL DE FICHA TÉCNICA + GUARDADOS VINCULADOS + ASISTENTE IA POR REPO*/}
      {/* ===================================================================== */}
      {detailRepo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto"
          onClick={() => setDetailRepo(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="relative my-8 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-[#14161f] shadow-2xl"
          >
            {/* Cabecera con Banner */}
            <div className="relative h-44 w-full shrink-0 overflow-hidden bg-[#0c0e14] border-b border-border">
              <img
                src={
                  detailRepo.imageUrl ||
                  `https://opengraph.githubassets.com/1/${detailRepo.owner}/${detailRepo.name}`
                }
                alt={detailRepo.fullName}
                className="h-full w-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#14161f] via-[#14161f]/50 to-transparent" />

              <button
                onClick={() => setDetailRepo(null)}
                className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-zinc-200 hover:bg-black hover:text-white"
              >
                <X className="size-4" />
              </button>

              <div className="absolute bottom-4 left-6 right-6 flex flex-wrap items-end justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src={detailRepo.avatarUrl || `https://github.com/${detailRepo.owner}.png?size=128`}
                    alt={detailRepo.owner}
                    className="size-12 rounded-xl border border-white/20 bg-[#0e1016] object-cover shadow-md"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-300">{detailRepo.owner} /</span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${getResourceTypeStyle(
                          detailRepo.resourceType
                        )}`}
                      >
                        {detailRepo.resourceType || 'Repositorio'}
                      </span>
                    </div>
                    <h2 className="font-serif text-2xl font-semibold text-white">{detailRepo.name}</h2>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => handleAddReposToActiveBlueprint([detailRepo.fullName])}
                    className="border-[#6b5de0]/60 bg-black/60 text-xs text-[#dfdcfb] hover:bg-black/80 gap-1.5"
                  >
                    <Layers className="size-3.5 text-[#a59cf5]" />
                    + Añadir a Proyecto
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={isRefreshingRepo}
                    onClick={handleRefreshDetailRepo}
                    className="border-white/20 bg-black/60 text-xs text-white hover:bg-black/80 gap-1.5"
                  >
                    <RefreshCw className={`size-3.5 ${isRefreshingRepo ? 'animate-spin' : ''}`} />
                    Actualizar de GitHub API
                  </Button>
                  {detailRepo.homepage && (
                    <a
                      href={detailRepo.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/60 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/80"
                    >
                      <Globe className="size-3.5" /> Web / Demo
                    </a>
                  )}
                  <a
                    href={detailRepo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#7c6cf0] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#6a5ad8]"
                  >
                    <Github className="size-3.5" /> Abrir en GitHub <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Contenido scrollable del modal */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Métricas rápidas */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border bg-[#191b26] p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Star className="size-3.5 text-amber-400" /> Estrellas
                  </div>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {detailRepo.stars > 0 ? detailRepo.stars.toLocaleString() : 'Pendiente API'}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-[#191b26] p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <GitFork className="size-3.5 text-cyan-400" /> Forks / Issues
                  </div>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {detailRepo.forks.toLocaleString()} · {detailRepo.openIssues} issues
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-[#191b26] p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Scale className="size-3.5 text-purple-400" /> Licencia / Versión
                  </div>
                  <p className="mt-1 text-sm font-semibold text-foreground truncate">
                    {detailRepo.license || 'Open Source'}{' '}
                    {detailRepo.latestRelease?.tag ? `· ${detailRepo.latestRelease.tag}` : ''}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-[#191b26] p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Calendar className="size-3.5 text-emerald-400" /> Lanzamiento / Push
                  </div>
                  <p className="mt-1 text-xs font-medium text-foreground">
                    {formatShortDate(detailRepo.createdAt)} · Act: {formatShortDate(detailRepo.pushedAt)}
                  </p>
                </div>
              </div>

              {/* Dictamen Estructurado del Agente Clasificador (Puntaje, Empresa, Área, Seguridad y Proyectos) */}
              {detailRepo.agentEvaluation && (
                <div className="rounded-xl border border-emerald-500/30 bg-[#141d24] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="size-4 text-emerald-400" />
                      Ficha de Evaluación del Agente (Incluida en Excel Maestro)
                    </h3>
                    <span className="rounded-md border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-200">
                      ★ Puntaje Atlas: {detailRepo.agentEvaluation.atlasScoreLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 text-xs">
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                      <span className="text-[10px] uppercase text-muted-foreground block">
                        Área / Categoría Técnica
                      </span>
                      <span className="font-medium text-white mt-0.5 block">
                        {detailRepo.agentEvaluation.areaCategory}
                      </span>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                      <span className="text-[10px] uppercase text-muted-foreground block">
                        Empresa / Organización / Autor
                      </span>
                      <span className="font-medium text-white mt-0.5 block">
                        {detailRepo.agentEvaluation.companyOrAuthor}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {detailRepo.agentEvaluation.creatorKind}
                      </span>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                      <span className="text-[10px] uppercase text-muted-foreground block">
                        Grado de Seguridad y Licencia
                      </span>
                      <span className="font-medium text-emerald-300 mt-0.5 block">
                        🛡️ {detailRepo.agentEvaluation.securitySummary}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#38335c] bg-[#1a182b]/80 p-3 text-xs space-y-1">
                    <div className="font-semibold text-[#cfcaff]">
                      🎯 ¿Para qué proyecto sirve este repositorio?
                    </div>
                    <p className="text-zinc-200 leading-relaxed">
                      {detailRepo.agentEvaluation.projectUseCases}
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">
                      <span>Madurez: <strong className="text-zinc-200">{detailRepo.agentEvaluation.maturityLevel}</strong></span>
                      <span>·</span>
                      <span>Integración: <strong className="text-zinc-200">{detailRepo.agentEvaluation.integrationComplexity}</strong></span>
                      <span>·</span>
                      <span>Licencia: <strong className="text-zinc-200">{detailRepo.agentEvaluation.licenseSummary}</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Barra de Lenguajes estilo GitHub */}
              {detailRepo.languages && detailRepo.languages.length > 0 && (
                <div className="space-y-2 rounded-xl border border-border bg-[#191b26] p-4">
                  <p className="text-xs font-medium text-foreground">Composición de Lenguajes</p>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#0f1117]">
                    {detailRepo.languages.map(lang => (
                      <div
                        key={lang.name}
                        style={{
                          width: `${Math.max(lang.percentage, 2)}%`,
                          backgroundColor: getLanguageColor(lang.name)
                        }}
                        title={`${lang.name}: ${lang.percentage}%`}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1">
                    {detailRepo.languages.map(lang => (
                      <span key={lang.name} className="flex items-center gap-1.5 text-[11px] text-zinc-300">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: getLanguageColor(lang.name) }}
                        />
                        <span>{lang.name}</span>
                        <span className="text-muted-foreground">{lang.percentage}%</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Explicación Técnica en Español + Clasificación editable */}
              <div className="rounded-xl border border-[#38335c] bg-[#1b192c] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-[#a59cf5]" />
                    <h3 className="text-sm font-semibold text-white">
                      Qué es y para qué sirve (Análisis en Español)
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={detailRepo.resourceType || 'Otro / pendiente de clasificar'}
                      onChange={e =>
                        handleUpdateRepoFields({ resourceType: e.target.value as ResourceType })
                      }
                      className="rounded-md border border-[#4a4475] bg-[#141221] px-2.5 py-1 text-xs text-[#dfdcfb]"
                    >
                      {RESOURCE_TYPE_OPTIONS.map(rt => (
                        <option key={rt} value={rt}>
                          {rt}
                        </option>
                      ))}
                    </select>

                    <Button
                      size="xs"
                      variant="outline"
                      disabled={isRegeneratingAi}
                      onClick={handleRegenerateRepoAi}
                      className="border-[#524b82] bg-[#26233d] text-xs text-[#dfdcfb] hover:bg-[#322e50] gap-1"
                    >
                      <Sparkles className={`size-3 ${isRegeneratingAi ? 'animate-spin' : ''}`} />
                      {isRegeneratingAi ? 'Analizando README...' : 'Regenerar con IA'}
                    </Button>
                  </div>
                </div>

                <p className="text-xs font-medium text-[#d6d1ff]">
                  {detailRepo.shortExplanationEs || detailRepo.explanation}
                </p>

                {detailRepo.longExplanationEs && (
                  <div className="space-y-2 border-t border-[#322e52] pt-3 text-xs leading-relaxed text-zinc-200 whitespace-pre-line">
                    {detailRepo.longExplanationEs}
                  </div>
                )}
              </div>

              {/* Instalación Rápida (1-Clic) & Configuración MCP / Agente */}
              {(() => {
                const snippet = getRepoInstallSnippets(detailRepo)
                return (
                  <div className="rounded-xl border border-border bg-[#191b26] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <Terminal className="size-3.5 text-emerald-400" />
                        Instalación Rápida (1-Clic) & Snippets de Agente
                      </h3>
                      <Badge variant="outline" className="text-[10px] border-emerald-700/40 text-emerald-300">
                        {snippet.category.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {snippet.commands.map((cmd, idx) => {
                        const cmdKey = `modal-cmd-${idx}`
                        return (
                          <div
                            key={idx}
                            onClick={e => handleCopyCmd(cmd, cmdKey, e)}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-[#0d0f15] px-3 py-2 font-mono text-xs text-zinc-200 cursor-pointer hover:border-[#7c6cf0]"
                          >
                            <span className="truncate">$ {cmd}</span>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="h-6 px-2 text-[11px] text-[#cfcaff]"
                            >
                              {copiedCmdKey === cmdKey ? (
                                <>
                                  <Check className="size-3 text-emerald-400 mr-1" /> Copiado
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3 mr-1" /> Copiar
                                </>
                              )}
                            </Button>
                          </div>
                        )
                      })}
                    </div>

                    {snippet.mcpConfigJson && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-cyan-300">
                            Configuración JSON para MCP (Claude Desktop / Cursor / Antigravity):
                          </span>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={e => handleCopyCmd(snippet.mcpConfigJson!, 'modal-mcp-json', e)}
                            className="h-6 border-cyan-700/50 bg-cyan-950/30 text-[10px] text-cyan-200 gap-1"
                          >
                            {copiedCmdKey === 'modal-mcp-json' ? (
                              <>
                                <Check className="size-3 text-emerald-400" /> JSON Copiado
                              </>
                            ) : (
                              <>
                                <Copy className="size-3" /> Copiar mcpServers JSON
                              </>
                            )}
                          </Button>
                        </div>
                        <pre className="overflow-x-auto rounded-lg border border-border bg-[#0b0d13] p-3 font-mono text-[11px] text-cyan-200">
                          {snippet.mcpConfigJson}
                        </pre>
                      </div>
                    )}

                    {/* #6 & #7: Instalador Local en 1-Clic + Inspector Profundo de Seguridad */}
                    {(() => {
                      const repoKey = detailRepo.fullName.toLowerCase()
                      const secAudit = securityAuditByRepo[repoKey]
                      const installRes = localInstallResultByRepo[repoKey]
                      return (
                        <div className="space-y-3 border-t border-border/60 pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-zinc-300 flex items-center gap-1.5">
                              <Cpu className="size-3.5 text-[#a59cf5]" />
                              Acciones Directas en tu PC Local (Instalador 1-Clic & Auditoría de Seguridad):
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={isAuditingSecurity}
                                onClick={() => handleAuditRepoSecurity(detailRepo)}
                                className="border-emerald-600/40 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-950/50 text-[11px] gap-1"
                              >
                                {isAuditingSecurity ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <ShieldCheck className="size-3.5 text-emerald-400" />
                                )}
                                🛡️ Auditar Seguridad y Permisos
                              </Button>

                              <Button
                                size="xs"
                                disabled={isInstallingLocal}
                                onClick={() => handleInstallRepoLocal(detailRepo, 'skill_clone')}
                                className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8] text-[11px] gap-1"
                              >
                                {isInstallingLocal ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Download className="size-3" />
                                )}
                                ⚡ Clonar Skill / Repo en PC
                              </Button>

                              <Button
                                size="xs"
                                variant="outline"
                                disabled={isInstallingLocal}
                                onClick={() => handleInstallRepoLocal(detailRepo, 'mcp_config')}
                                className="border-cyan-600/50 bg-cyan-950/30 text-cyan-200 hover:bg-cyan-950/50 text-[11px] gap-1"
                              >
                                <Terminal className="size-3 text-cyan-400" />
                                Registrar MCP en Atlas
                              </Button>
                            </div>
                          </div>

                          {installRes && (
                            <div
                              className={`rounded-lg border p-3 text-xs space-y-1 ${
                                installRes.success
                                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                                  : 'border-amber-500/40 bg-amber-950/30 text-amber-200'
                              }`}
                            >
                              <div className="font-semibold">{installRes.messageEs}</div>
                              <div className="font-mono text-[11px] text-zinc-300">
                                📁 Ruta local: {installRes.targetPath}
                              </div>
                            </div>
                          )}

                          {secAudit && (
                            <div className="rounded-lg border border-emerald-500/30 bg-[#111921] p-3.5 text-xs space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                                  {secAudit.riskLevel === 'Alto' ? (
                                    <ShieldAlert className="size-4 text-amber-400" />
                                  ) : (
                                    <ShieldCheck className="size-4 text-emerald-400" />
                                  )}
                                  Dictamen del Inspector de Seguridad: Puntaje {secAudit.securityScore.toFixed(1)}/10 (Riesgo {secAudit.riskLevel})
                                </span>
                                {secAudit.manifestFilesFound.length > 0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Manifiestos: {secAudit.manifestFilesFound.join(', ')}
                                  </span>
                                )}
                              </div>
                              <p className="text-zinc-200 leading-relaxed">{secAudit.summaryEs}</p>
                              <div className="flex flex-wrap gap-1.5 text-[10px]">
                                {secAudit.capabilitiesDetected.executesShellCommands && (
                                  <Badge variant="outline" className="border-amber-600/40 text-amber-300">
                                    ⚠️ Ejecuta Shell/Subprocesos
                                  </Badge>
                                )}
                                {secAudit.capabilitiesDetected.usesBrowserAutomation && (
                                  <Badge variant="outline" className="border-cyan-600/40 text-cyan-300">
                                    🌐 Automatización de Navegador
                                  </Badge>
                                )}
                                {secAudit.capabilitiesDetected.readsEnvSecrets && (
                                  <Badge variant="outline" className="border-purple-600/40 text-purple-300">
                                    🔑 Usa Variables de Entorno (.env)
                                  </Badge>
                                )}
                                {secAudit.hasAutomatedTests && (
                                  <Badge variant="outline" className="border-emerald-600/40 text-emerald-300">
                                    ✅ Incluye Tests Automatizados
                                  </Badge>
                                )}
                                {secAudit.hasSkillMd && (
                                  <Badge variant="outline" className="border-fuchsia-600/40 text-fuchsia-300">
                                    🧩 Incluye SKILL.md
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })()}

              {/* Publicaciones Guardadas Vinculadas (Conexión directa con tu Biblioteca X / IG / WA) */}
              {(() => {
                const linkedPosts = getLinkedBookmarksForRepo(detailRepo)
                return (
                  <div className="rounded-xl border border-border bg-[#191b26] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Bookmark className="size-3.5 text-[#a59cf5]" />
                        Publicaciones Guardadas que mencionan este repositorio ({linkedPosts.length})
                      </h3>
                    </div>

                    {linkedPosts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Este repositorio fue agregado directamente a la galería.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {linkedPosts.map(bm => (
                          <div
                            key={bm.id}
                            className="flex flex-col justify-between gap-2 rounded-lg border border-border bg-[#12141c] p-3 sm:flex-row sm:items-center"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] uppercase">
                                  {bm.platform}
                                </Badge>
                                <span className="text-xs font-medium text-foreground">
                                  {bm.authorName} ({bm.authorHandle})
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {formatShortDate(bm.savedAt || bm.publishedAt)}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-xs text-zinc-300">
                                {bm.caption || bm.purpose || bm.title}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => {
                                  setDetailRepo(null)
                                  onOpenBookmarkDetail(bm)
                                }}
                                className="text-xs border-[#453f6e] text-[#c5bfff]"
                              >
                                Abrir ficha del guardado
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Notas personales del repositorio */}
              <div className="rounded-xl border border-border bg-[#191b26] p-4 space-y-2">
                <label className="text-xs font-medium text-foreground">
                  Notas personales / En qué proyecto usarlo
                </label>
                <textarea
                  rows={2}
                  value={detailRepo.notes || ''}
                  onChange={e => setDetailRepo({ ...detailRepo, notes: e.target.value })}
                  onBlur={e => handleUpdateRepoFields({ notes: e.target.value })}
                  placeholder="Anotá para qué proyecto te sirve, comandos clave o ideas de integración..."
                  className="w-full rounded-lg border border-border bg-[#101218] p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
                />
              </div>

              {/* Asistente IA del Repositorio */}
              <div className="rounded-xl border border-border bg-[#191b26] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <MessageSquare className="size-3.5 text-[#a59cf5]" />
                    Preguntale al Asistente sobre {detailRepo.fullName}
                  </h3>
                </div>

                {/* Preguntas rápidas sugeridas */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '¿Qué hace exactamente y qué problema resuelve?',
                    '¿Cómo se instala o prueba rápidamente?',
                    '¿Cuáles son sus mejores casos de uso?',
                    '¿Qué requisitos técnicos o dependencias tiene?'
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => handleAskRepoChat(q)}
                      className="rounded-lg border border-border bg-[#11131b] px-2.5 py-1 text-[11px] text-zinc-300 hover:border-[#7c6cf0] hover:text-white"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {repoChatHistory.length > 0 && (
                  <div className="max-h-60 overflow-y-auto space-y-2.5 rounded-lg border border-border bg-[#101218] p-3">
                    {repoChatHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`rounded-lg p-2.5 text-xs leading-relaxed whitespace-pre-line ${
                          msg.role === 'user'
                            ? 'ml-8 bg-[#28263b] text-white'
                            : 'mr-4 border border-border bg-[#161822] text-zinc-200'
                        }`}
                      >
                        {msg.content}
                      </div>
                    ))}
                    {isRepoChatLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" /> Analizando repositorio...
                      </div>
                    )}
                  </div>
                )}

                <form
                  onSubmit={e => {
                    e.preventDefault()
                    handleAskRepoChat()
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={repoChatInput}
                    onChange={e => setRepoChatInput(e.target.value)}
                    placeholder={`Preguntá cualquier duda técnica sobre ${detailRepo.name}...`}
                    className="flex-1 rounded-lg border border-border bg-[#101218] px-3 py-2 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isRepoChatLoading || !repoChatInput.trim()}
                    className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8]"
                  >
                    <Send className="size-3.5" />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: AGREGAR REPOSITORIO POR URL                                    */}
      {/* ===================================================================== */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-border bg-[#15171f] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg font-medium text-foreground">
                Agregar Repositorio de GitHub
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-muted-foreground hover:text-white">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleAddSingleRepo} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  URL del repositorio o formato <code className="text-[#a59cf5]">owner/repo</code>
                </label>
                <input
                  type="text"
                  required
                  value={addUrlInput}
                  onChange={e => setAddUrlInput(e.target.value)}
                  placeholder="https://github.com/anthropics/skills o anthropics/skills"
                  className="w-full rounded-lg border border-border bg-[#101218] px-3 py-2 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Notas opcionales</label>
                <input
                  type="text"
                  value={addNotesInput}
                  onChange={e => setAddNotesInput(e.target.value)}
                  placeholder="Ej: Para usar en mi agente de edición de video..."
                  className="w-full rounded-lg border border-border bg-[#101218] px-3 py-2 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                />
              </div>

              {addError && (
                <p className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-xs text-red-200">
                  {addError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isAddingRepo}
                  className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8] gap-1.5"
                >
                  {isAddingRepo && <Loader2 className="size-3.5 animate-spin" />}
                  {isAddingRepo ? 'Analizando con GitHub & IA...' : 'Guardar en Galería y Biblioteca'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: SUPER-IMPORTADOR DE LISTAS DE REPOSITORIOS & AWESOME PAGES     */}
      {/* ===================================================================== */}
      {isBulkTextModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => !isBulkImporting && setIsBulkTextModalOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-border bg-[#15171f] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-lg font-medium text-foreground">
                  Super-Importador de Listas de Repositorios y Páginas Awesome
                </h3>
                <p className="text-xs text-muted-foreground">
                  Cargá tus listas de repositorios desde texto, formato <code className="text-[#a59cf5]">owner/repo</code>, archivos (<code className="text-[#a59cf5]">.txt, .md, .csv</code>) o la URL de una página/Awesome List. Los duplicados se omiten automáticamente.
                </p>
              </div>
              <button
                onClick={() => !isBulkImporting && setIsBulkTextModalOpen(false)}
                className="text-muted-foreground hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Opción A: Extraer desde una URL de Página o Awesome List */}
            <div className="rounded-xl border border-[#322e52] bg-[#1a1829] p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#dfdcfb] flex items-center gap-1.5">
                  <Globe className="size-3.5 text-[#a59cf5]" />
                  Extraer todos los repositorios de una Página Web o Awesome List de GitHub
                </label>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => listFileInputRef.current?.click()}
                  className="border-border bg-[#13151e] text-[11px] gap-1"
                >
                  <Upload className="size-3" /> Cargar archivo (.txt / .md / .csv)
                </Button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={bulkPageUrlInput}
                  onChange={e => setBulkPageUrlInput(e.target.value)}
                  placeholder="Ej: https://github.com/punkpeye/awesome-mcp-servers o cualquier artículo/lista con repos..."
                  className="flex-1 rounded-lg border border-border bg-[#101218] px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={isPreviewingPageUrl || !bulkPageUrlInput.trim()}
                  onClick={handleExtractFromPageUrl}
                  className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8] text-xs gap-1.5 shrink-0"
                >
                  {isPreviewingPageUrl ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                  {isPreviewingPageUrl ? 'Extrayendo...' : 'Extraer Lista de Página'}
                </Button>
              </div>
            </div>

            {/* Opción B: Pegar lista de URLs o líneas owner/repo */}
            <textarea
              rows={5}
              value={bulkTextInput}
              onChange={e => setBulkTextInput(e.target.value)}
              placeholder={`Pegá tus listas acá (soporta URLs completas o formato corto owner/repo):\nhttps://github.com/modelcontextprotocol/servers\nanthropics/skills - Skills oficiales de Claude\nbrowser-use/browser-use`}
              className="w-full rounded-lg border border-border bg-[#101218] p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c6cf0] focus:outline-none"
            />

            {detectedBulkRepos.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">
                    Detectados: {detectedBulkRepos.length} repositorios (
                    <span className="text-emerald-300">
                      {detectedBulkRepos.filter(d => !d.alreadyInGallery).length} nuevos
                    </span>{' '}
                    ·{' '}
                    <span className="text-amber-300">
                      {detectedBulkRepos.filter(d => d.alreadyInGallery).length} ya en tu catálogo
                    </span>
                    )
                  </span>
                  <span className="text-muted-foreground">
                    {bulkSelectedUrls.size} seleccionados para incorporar
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-border/50 rounded-lg border border-border bg-[#101218]">
                  {detectedBulkRepos.map(item => (
                    <label
                      key={item.cleanUrl}
                      className="flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-[#191c26]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={bulkSelectedUrls.has(item.cleanUrl)}
                          onChange={() => {
                            setBulkSelectedUrls(prev => {
                              const next = new Set(prev)
                              if (next.has(item.cleanUrl)) next.delete(item.cleanUrl)
                              else next.add(item.cleanUrl)
                              return next
                            })
                          }}
                          className="rounded border-border"
                        />
                        <span className="font-medium text-foreground truncate">{item.fullName}</span>
                        {item.contextHint && (
                          <span className="truncate text-[11px] text-muted-foreground max-w-[260px]">
                            — {item.contextHint}
                          </span>
                        )}
                      </div>
                      {item.alreadyInGallery ? (
                        <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-700/40 shrink-0">
                          Duplicado (se omite)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-700/40 shrink-0">
                          Nuevo
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {bulkProgress && (
              <div className="text-xs text-[#bfb8ff] flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Incorporando lista con deduplicación estricta y clasificación por agente...
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isBulkImporting}
                onClick={() => setIsBulkTextModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isBulkImporting || (bulkSelectedUrls.size === 0 && !bulkPageUrlInput.trim())}
                onClick={handleRunBulkTextImport}
                className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8]"
              >
                Incorporar {bulkSelectedUrls.size > 0 ? `${bulkSelectedUrls.size} nuevos` : 'lista'} sin duplicados
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: AJUSTES DE GITHUB TOKEN & PROVEEDOR DE IA                      */}
      {/* ===================================================================== */}
      {isSettingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-border bg-[#15171f] p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-[#a59cf5]" />
                <h3 className="font-serif text-lg font-medium text-foreground">
                  Ajustes de GitHub API & Motor de IA
                </h3>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="text-muted-foreground hover:text-white">
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                GitHub Personal Access Token (Opcional)
              </label>
              <p className="text-[11px] text-muted-foreground">
                Sin token tenés 60 consultas/hora. Con un token clásico o fine-grained de solo lectura pública subís a 5.000 consultas/hora.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={githubToken}
                  onChange={e => setGithubToken(e.target.value)}
                  placeholder="ghp_... o github_pat_..."
                  className="flex-1 rounded-lg border border-border bg-[#101218] px-3 py-2 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isCheckingRateLimit}
                  onClick={handleCheckRateLimit}
                >
                  {isCheckingRateLimit ? 'Verificando...' : 'Verificar límite'}
                </Button>
              </div>

              {rateLimit && (
                <div className="flex items-center justify-between rounded-lg border border-emerald-800/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-400" />
                    Cuota disponible: <strong>{rateLimit.remaining}</strong> / {rateLimit.limit} peticiones
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Proveedor de IA preferido para explicaciones y chat
              </label>
              <select
                value={selectedAiProvider}
                onChange={e => setSelectedAiProvider(e.target.value as AiProviderId)}
                className="w-full rounded-lg border border-border bg-[#101218] px-3 py-2 text-xs text-foreground"
              >
                {(aiProviders.length > 0
                  ? aiProviders
                  : [
                      { id: 'gemini', name: 'Google Gemini', model: 'gemini-2.5-flash', configured: true },
                      { id: 'openai', name: 'OpenAI / Compatible', model: 'gpt-4.1-mini', configured: false },
                      { id: 'anthropic', name: 'Anthropic Claude', model: 'claude-3-5-haiku', configured: false },
                      { id: 'ollama', name: 'Ollama Local', model: 'llama3', configured: false },
                      { id: 'deterministic', name: 'Analizador Local Determinista', model: 'atlas-rules-v2', configured: true }
                    ]
                ).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.model}) {p.configured ? '✓ Configurado' : '· Fallback local si no hay API key'}
                  </option>
                ))}
              </select>
            </div>

            {/* #5: Sincronización Cloud con GitHub Gist */}
            <div className="space-y-2 rounded-xl border border-border bg-[#101218] p-3.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Cloud className="size-3.5 text-cyan-400" />
                Sincronización Híbrida Local + Cloud (GitHub Gist)
              </label>
              <p className="text-[11px] text-muted-foreground">
                Respaldá o restaurá tu catálogo completo (Repositorios, Guardados y Blueprints) en un GitHub Gist privado para sincronizar entre tu PC y despliegues en Vercel/Netlify.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={gistIdInput}
                  onChange={e => setGistIdInput(e.target.value)}
                  placeholder="Gist ID opcional (se crea uno nuevo si lo dejás vacío al subir)"
                  className="flex-1 min-w-[200px] rounded-lg border border-border bg-[#15171f] px-3 py-1.5 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                />
                <Button
                  type="button"
                  size="xs"
                  disabled={isSyncingCloud}
                  onClick={() => handleCloudGistSync('push')}
                  className="bg-cyan-600 text-white hover:bg-cyan-500 text-xs gap-1"
                >
                  {isSyncingCloud ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                  Subir a Gist
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={isSyncingCloud || !gistIdInput.trim()}
                  onClick={() => handleCloudGistSync('pull')}
                  className="border-cyan-600/50 text-cyan-200 text-xs gap-1"
                >
                  <Download className="size-3" /> Restaurar de Gist
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsSettingsOpen(false)}>
                Cerrar
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSettings}
                className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8]"
              >
                Guardar preferencias
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: IMPORTAR GITHUB STARS DE CUALQUIER USUARIO                     */}
      {/* ===================================================================== */}
      {isStarsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => !isImportingStars && setIsStarsModalOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-border bg-[#15171f] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="size-4 fill-amber-400 text-amber-400" />
                <h3 className="font-serif text-lg font-medium text-foreground">
                  Sincronizar e Importar GitHub Stars
                </h3>
              </div>
              <button
                onClick={() => !isImportingStars && setIsStarsModalOpen(false)}
                className="text-muted-foreground hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Ingresá tu usuario de GitHub (o el de cualquier desarrollador referente) para importar automáticamente sus repositorios marcados con estrella (★) a tu Galería y Biblioteca de Atlas.
            </p>

            <form onSubmit={handleImportGitHubStars} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Usuario de GitHub</label>
                <input
                  type="text"
                  required
                  value={starsUsernameInput}
                  onChange={e => setStarsUsernameInput(e.target.value)}
                  placeholder="Ej: nicospum, karpathy, shadcn..."
                  className="w-full rounded-lg border border-border bg-[#101218] px-3 py-2 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Cantidad de Stars recientes a traer</label>
                <select
                  value={starsCountInput}
                  onChange={e => setStarsCountInput(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-[#101218] px-3 py-2 text-xs text-foreground"
                >
                  <option value={30}>Últimos 30 repositorios con estrella</option>
                  <option value={50}>Últimos 50 repositorios con estrella</option>
                  <option value={100}>Últimos 100 repositorios con estrella</option>
                </select>
              </div>

              {starsError && (
                <p className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-xs text-red-200">
                  {starsError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isImportingStars}
                  onClick={() => setIsStarsModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isImportingStars || !starsUsernameInput.trim()}
                  className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8] gap-1.5"
                >
                  {isImportingStars && <Loader2 className="size-3.5 animate-spin" />}
                  {isImportingStars ? 'Importando Stars de GitHub...' : 'Importar a Atlas'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: COMPARADOR LADO A LADO («VERSUS» DE REPOSITORIOS)              */}
      {/* ===================================================================== */}
      {isCompareModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto"
          onClick={() => setIsCompareModalOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="my-8 flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-[#14161f] shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-[#191b27] px-6 py-4">
              <div className="flex items-center gap-2.5">
                <Columns className="size-5 text-cyan-400" />
                <div>
                  <h3 className="font-serif text-lg font-medium text-white">
                    Comparador Lado a Lado ({comparedRepos.length} repositorios)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Compará tracción, actividad, licencia comercial, comandos de instalación y veredicto en español
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={isComparingAi}
                  onClick={() => handleRunCompareAi(comparedRepos)}
                  className="border-[#524b82] bg-[#242038] text-xs text-white gap-1"
                >
                  <Sparkles className={`size-3.5 ${isComparingAi ? 'animate-spin' : ''}`} />
                  Regenerar Veredicto IA
                </Button>
                <button
                  onClick={() => setIsCompareModalOpen(false)}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-black/40 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Matriz Comparativa */}
              <div className="overflow-x-auto rounded-xl border border-border bg-[#101218]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-[#171923]">
                      <th className="p-3.5 w-44 text-[11px] uppercase tracking-wider text-muted-foreground">
                        Criterio
                      </th>
                      {comparedRepos.map(r => (
                        <th key={r.fullName} className="p-3.5 min-w-[230px]">
                          <div className="flex items-center gap-2">
                            <img
                              src={r.avatarUrl || `https://github.com/${r.owner}.png?size=64`}
                              alt={r.owner}
                              className="size-6 rounded-full"
                            />
                            <div className="min-w-0">
                              <p className="text-[10px] text-muted-foreground font-normal">{r.owner} /</p>
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-sm text-[#cfcaff] hover:underline flex items-center gap-1"
                              >
                                {r.name} <ExternalLink className="size-3" />
                              </a>
                            </div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr>
                      <td className="p-3 font-medium text-muted-foreground">Tipo de Recurso</td>
                      {comparedRepos.map(r => (
                        <td key={r.fullName} className="p-3">
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${getResourceTypeStyle(
                              r.resourceType
                            )}`}
                          >
                            {r.resourceType || 'Repositorio'}
                          </span>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-muted-foreground">Para qué sirve</td>
                      {comparedRepos.map(r => (
                        <td key={r.fullName} className="p-3 text-zinc-200 leading-relaxed">
                          {r.shortExplanationEs || r.description}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-muted-foreground">Estrellas / Forks</td>
                      {comparedRepos.map(r => (
                        <td key={r.fullName} className="p-3">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-amber-300 flex items-center gap-1">
                              <Star className="size-3.5 fill-amber-400 text-amber-400" />
                              {r.stars > 0 ? r.stars.toLocaleString() : 'Pendiente API'}
                            </span>
                            <span className="text-muted-foreground">
                              {r.forks > 0 ? `${r.forks.toLocaleString()} forks` : ''}
                            </span>
                          </div>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-muted-foreground">Actividad y Salud</td>
                      {comparedRepos.map(r => {
                        const act = getActivityBadge(r.pushedAt || r.updatedAt)
                        return (
                          <td key={r.fullName} className="p-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] ${act.cls}`}
                            >
                              <span className={`size-1.5 rounded-full ${act.dot}`} />
                              {act.label} ({formatShortDate(r.pushedAt || r.updatedAt)})
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-muted-foreground">Licencia & Uso Comercial</td>
                      {comparedRepos.map(r => {
                        const lic = getLicenseAssessment(r.license)
                        return (
                          <td key={r.fullName} className="p-3">
                            <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] ${lic.cls}`}>
                              {lic.label}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-muted-foreground">Lenguaje Principal</td>
                      {comparedRepos.map(r => (
                        <td key={r.fullName} className="p-3">
                          {r.primaryLanguage ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: getLanguageColor(r.primaryLanguage) }}
                              />
                              {r.primaryLanguage}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-muted-foreground">Instalación 1-Clic</td>
                      {comparedRepos.map(r => {
                        const snip = getRepoInstallSnippets(r)
                        const k = `cmp:${r.fullName}`
                        return (
                          <td key={r.fullName} className="p-3">
                            <div
                              onClick={e => handleCopyCmd(snip.primaryCommand, k, e)}
                              className="flex items-center justify-between gap-2 rounded border border-border bg-[#0b0d13] px-2 py-1 font-mono text-[10px] text-zinc-200 cursor-pointer hover:border-[#7c6cf0]"
                            >
                              <span className="truncate">$ {snip.primaryCommand}</span>
                              {copiedCmdKey === k ? (
                                <Check className="size-3 text-emerald-400 shrink-0" />
                              ) : (
                                <Copy className="size-3 text-muted-foreground shrink-0" />
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                    <tr>
                      <td className="p-3 font-medium text-muted-foreground">Guardados Vinculados</td>
                      {comparedRepos.map(r => {
                        const posts = getLinkedBookmarksForRepo(r)
                        return (
                          <td key={r.fullName} className="p-3">
                            <Badge variant="outline" className="text-[10px]">
                              {posts.length} guardado{posts.length === 1 ? '' : 's'} en Biblioteca
                            </Badge>
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Veredicto Comparativo en Español */}
              <div className="rounded-xl border border-[#453e70] bg-[#1a182b] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-[#a59cf5]" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-white">
                      Veredicto Comparativo y Recomendación de Elección
                    </h4>
                  </div>
                  {compareVerdict && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={async () => {
                        await navigator.clipboard.writeText(compareVerdict)
                        setCopiedComparison(true)
                        setTimeout(() => setCopiedComparison(false), 2000)
                      }}
                      className="text-xs text-[#cfcaff] gap-1"
                    >
                      {copiedComparison ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                      {copiedComparison ? 'Copiado' : 'Copiar veredicto'}
                    </Button>
                  )}
                </div>

                {isComparingAi ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin text-[#a59cf5]" />
                    Generando análisis comparativo en español...
                  </div>
                ) : (
                  <div className="text-xs leading-relaxed text-zinc-200 whitespace-pre-line">
                    {compareVerdict || 'Seleccioná 2 o más repositorios para comparar sus fortalezas.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* ASISTENTE FLOTANTE GLOBAL DE GALERÍA                                  */}
      {/* ===================================================================== */}
      {isGalleryChatOpen && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[520px] w-[390px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[#4c4578] bg-[#14161f] shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-[#1c1a2e] px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-[#a59cf5]" />
              <div>
                <h4 className="text-xs font-semibold text-white">Asistente de Galería GitHub</h4>
                <p className="text-[10px] text-muted-foreground">
                  Conoce tus {repositories.length} repositorios guardados
                </p>
              </div>
            </div>
            <button onClick={() => setIsGalleryChatOpen(false)} className="text-muted-foreground hover:text-white">
              <X className="size-4" />
            </button>
          </div>

          {/* Sugerencias rápidas */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-border/60 bg-[#101218] px-3 py-2">
            {[
              '¿Qué Skills y MCP tengo?',
              '¿Qué repos me sirven para agentes?',
              '¿Qué herramientas tengo de video o voz?'
            ].map(prompt => (
              <button
                key={prompt}
                onClick={() => handleAskGalleryChat(prompt)}
                className="shrink-0 rounded-full border border-border bg-[#181a24] px-2.5 py-1 text-[10px] text-zinc-300 hover:border-[#7c6cf0] hover:text-white"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {galleryChatMessages.map((m, idx) => {
              const mentionedRepos =
                m.role === 'assistant' ? extractGitHubReposFromFreeText(m.content) : []
              return (
                <div
                  key={idx}
                  className={`rounded-xl p-3 text-xs leading-relaxed whitespace-pre-line ${
                    m.role === 'user'
                      ? 'ml-8 bg-[#7c6cf0] text-white'
                      : 'mr-2 border border-border bg-[#191b26] text-zinc-200'
                  }`}
                >
                  {m.content}
                  {mentionedRepos.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                      {mentionedRepos.slice(0, 4).map(mr => {
                        const full = `${mr.owner}/${mr.repo}`
                        const existing = repositories.find(
                          r => r.fullName.toLowerCase() === full.toLowerCase()
                        )
                        return existing ? (
                          <button
                            key={full}
                            onClick={() => setDetailRepo(existing)}
                            className="inline-flex items-center gap-1 rounded-md border border-[#4a4475] bg-[#24213a] px-2 py-0.5 text-[10px] text-[#d6d1ff] hover:bg-[#302c4d]"
                          >
                            <FolderGit2 className="size-2.5" /> Abrir {full}
                          </button>
                        ) : (
                          <button
                            key={full}
                            onClick={() => {
                              setAddUrlInput(mr.cleanUrl)
                              setIsAddModalOpen(true)
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 text-[10px] text-emerald-300"
                          >
                            <Plus className="size-2.5" /> Agregar {full}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {isGalleryChatLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Consultando tu catálogo...
              </div>
            )}
          </div>

          <form
            onSubmit={e => {
              e.preventDefault()
              handleAskGalleryChat()
            }}
            className="flex gap-2 border-t border-border bg-[#101218] p-3"
          >
            <input
              type="text"
              value={galleryChatInput}
              onChange={e => setGalleryChatInput(e.target.value)}
              placeholder="Preguntá qué repositorios usar para tu idea..."
              className="flex-1 rounded-lg border border-border bg-[#161822] px-3 py-2 text-xs text-foreground focus:border-[#7c6cf0] focus:outline-none"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isGalleryChatLoading || !galleryChatInput.trim()}
              className="bg-[#7c6cf0] text-white hover:bg-[#6a5ad8]"
            >
              <Send className="size-3.5" />
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
