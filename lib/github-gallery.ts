import { inferResourceType, synthesizeBookmarkFields } from './resource-investigator'
import { analyzeContent } from './ai-analyzer'
import type {
  AiProviderId,
  AiProviderInfo,
  BookmarkItem,
  CreatedAtFilterType,
  DiscoverCategory,
  GalleryRepoLanguage,
  GalleryRepoRelease,
  GalleryRepository,
  RateLimitInfo,
  ResourceType
} from './types'

export interface ParseRepoResult {
  owner: string
  repo: string
}

export interface ExtractedRepoUrl {
  owner: string
  repo: string
  cleanUrl: string
  originalMatch: string
}

export const GITHUB_RESERVED_NAMES = new Set([
  'about',
  'pricing',
  'features',
  'explore',
  'topics',
  'trending',
  'collections',
  'events',
  'security',
  'enterprise',
  'customer-stories',
  'readme',
  'marketplace',
  'pulls',
  'issues',
  'notifications',
  'settings',
  'login',
  'signup',
  'orgs',
  'users',
  'stars',
  'site',
  'support',
  'contact',
  'git-guides',
  'solutions',
  'new',
  'organizations',
  'join',
  'codespaces',
  'sponsors',
  'sessions',
  'search',
  'discussions',
  'dashboard',
  'team',
  'apps',
  'account',
  'personal-access-tokens',
  'billing'
])

export const GITHUB_LANGUAGE_COLORS: Record<string, string> = {
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
  Solidity: '#AA6746',
  Zig: '#ec915c',
  Elixir: '#6e4a7e',
  Lua: '#000080',
  Jupyter: '#DA5B0B',
  MDX: '#fcb32c'
}

export const SEARCH_SYNONYMS: Record<string, string[]> = {
  voice: ['speech', 'audio', 'tts', 'stt', 'sound', 'whisper', 'voz'],
  voz: ['voice', 'speech', 'audio', 'tts', 'stt', 'whisper'],
  audio: ['speech', 'voice', 'sound', 'music', 'tts', 'voz'],
  ai: [
    'llm',
    'machine-learning',
    'artificial-intelligence',
    'deepseek',
    'gpt',
    'claude',
    'gemini',
    'model',
    'agent',
    'rag',
    'mcp',
    'ia'
  ],
  ia: ['ai', 'llm', 'agent', 'claude', 'gemini', 'mcp', 'skill', 'rag'],
  agents: ['agent', 'autonomous', 'crew', 'assistant', 'swarm', 'agentic', 'subagent', 'agentes'],
  agentes: ['agent', 'agents', 'autonomous', 'swarm', 'subagents', 'claude-code'],
  mcp: ['model-context-protocol', 'connector', 'server', 'claude-code', 'cursor'],
  skill: ['skills', 'claude-code', 'cursor', 'commands', 'prompts', 'agent-skills'],
  ui: ['components', 'design-system', 'tailwind', 'styling', 'frontend', 'css', 'shadcn'],
  frontend: ['react', 'vue', 'nextjs', 'ui', 'components', 'web', 'javascript', 'typescript'],
  backend: ['api', 'server', 'database', 'rest', 'go', 'python', 'node'],
  db: ['database', 'sql', 'postgres', 'mysql', 'sqlite', 'redis', 'orm', 'vector'],
  cli: ['terminal', 'command-line', 'shell', 'bash', 'consola'],
  video: ['ffmpeg', 'remotion', 'media', 'mp4', 'render', 'diffusion']
}

export function getLanguageColor(language: string | null | undefined): string {
  if (!language) return '#6b7280'
  return GITHUB_LANGUAGE_COLORS[language] || '#7c6cf0'
}

export function formatNumber(num: number | undefined | null): string {
  const n = Number(num) || 0
  if (n >= 1000000) {
    return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return n.toString()
}

export interface ActivityStatus {
  label: string
  colorClass: string
  dotColorClass: string
  daysAgo: number
}

export function getActivityStatus(dateString: string | null | undefined): ActivityStatus {
  if (!dateString) {
    return {
      label: 'En archivo local',
      colorClass: 'text-[#a59cf5] bg-[#28263b] border-[#3d3960]',
      dotColorClass: 'bg-[#9b91f5]',
      daysAgo: 30
    }
  }
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) {
    return {
      label: 'En archivo local',
      colorClass: 'text-[#a59cf5] bg-[#28263b] border-[#3d3960]',
      dotColorClass: 'bg-[#9b91f5]',
      daysAgo: 30
    }
  }
  const now = new Date()
  const diffTime = Math.max(0, now.getTime() - date.getTime())
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60))

  if (diffHours < 24) {
    return {
      label: 'Actualizado hoy',
      colorClass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
      dotColorClass: 'bg-emerald-400 animate-pulse',
      daysAgo: 0
    }
  }
  if (diffDays === 1) {
    return {
      label: 'Actualizado ayer',
      colorClass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
      dotColorClass: 'bg-emerald-400',
      daysAgo: 1
    }
  }
  if (diffDays < 7) {
    return {
      label: `Actualizado hace ${diffDays} días`,
      colorClass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
      dotColorClass: 'bg-emerald-400',
      daysAgo: diffDays
    }
  }
  if (diffDays <= 30) {
    return {
      label: 'Activo este mes',
      colorClass: 'text-teal-400 bg-teal-950/40 border-teal-800/40',
      dotColorClass: 'bg-teal-400',
      daysAgo: diffDays
    }
  }
  if (diffDays <= 90) {
    const months = Math.floor(diffDays / 30)
    return {
      label: `Activo hace ${months} ${months === 1 ? 'mes' : 'meses'}`,
      colorClass: 'text-amber-400 bg-amber-950/40 border-amber-800/40',
      dotColorClass: 'bg-amber-400',
      daysAgo: diffDays
    }
  }
  return {
    label: 'Sin actividad reciente',
    colorClass: 'text-neutral-400 bg-neutral-900 border-neutral-800',
    dotColorClass: 'bg-neutral-500',
    daysAgo: diffDays
  }
}

export function formatDateEs(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  try {
    const d = new Date(dateString)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return dateString
  }
}

export function isWithinCreatedRange(
  createdAtString: string | null | undefined,
  filter: CreatedAtFilterType
): boolean {
  if (filter === 'ALL' || !createdAtString) return true
  const createdTime = new Date(createdAtString).getTime()
  if (Number.isNaN(createdTime)) return true
  const diffDays = Math.max(0, (Date.now() - createdTime) / (1000 * 60 * 60 * 24))
  switch (filter) {
    case 'week':
      return diffDays <= 7
    case 'month':
      return diffDays <= 30
    case 'three_months':
      return diffDays <= 90
    case 'six_months':
      return diffDays <= 180
    case 'year':
      return diffDays <= 365
    default:
      return true
  }
}

export function parseGitHubUrl(input: string): ParseRepoResult | null {
  if (!input || typeof input !== 'string') return null
  let cleaned = input.trim().replace(/^[<"']+|[>"']+$/g, '')
  cleaned = cleaned.split('#')[0].split('?')[0].trim()

  const githubRegex =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)(?:\/.*)?$/i
  const shortRegex = /^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/

  const match = cleaned.match(githubRegex) || cleaned.match(shortRegex)
  if (!match) return null

  const owner = match[1]
  if (GITHUB_RESERVED_NAMES.has(owner.toLowerCase())) return null

  let repo = match[2]
  if (repo.endsWith('.git')) repo = repo.slice(0, -4)
  repo = repo.replace(/\/+$/, '')
  if (!repo || GITHUB_RESERVED_NAMES.has(repo.toLowerCase())) return null
  return { owner, repo }
}

export function extractGitHubUrlsFromText(text: string): ExtractedRepoUrl[] {
  if (!text || typeof text !== 'string') return []
  const regex =
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)(?:[^\s<>"'`)\]]*)?/gi

  const seen = new Set<string>()
  const results: ExtractedRepoUrl[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0]
    const owner = match[1].trim()
    let repo = match[2].trim()

    if (GITHUB_RESERVED_NAMES.has(owner.toLowerCase())) continue

    repo = repo.replace(/[.,;:!?)\],'">]+$/, '')
    if (repo.endsWith('.git')) repo = repo.slice(0, -4)
    repo = repo.replace(/\/+$/, '')

    if (!repo || GITHUB_RESERVED_NAMES.has(repo.toLowerCase())) continue
    if (!/^[a-zA-Z0-9_-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)) continue

    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      results.push({
        owner,
        repo,
        cleanUrl: `https://github.com/${owner}/${repo}`,
        originalMatch: fullMatch
      })
    }
  }
  return results
}

export function numericIdFromFullName(fullName: string): number {
  const s = (fullName || '').toLowerCase()
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) || 1
}

export function isUsefulImage(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  const badPatterns = [
    'shields.io',
    'badge.svg',
    'badge',
    'travis-ci',
    'circleci',
    'github.com/workflows',
    '/actions/workflows',
    'codecov.io',
    'coveralls.io',
    'pepy.tech',
    'npm/v',
    'pypi/v',
    'crates.io/v',
    'discord.gg',
    'slack.com',
    'status.svg',
    'hits.seeyoufarm.com',
    'visitor-badge',
    'img.shields',
    'opencollective.com',
    'patreon.com',
    'buymeacoffee',
    'sonarcloud',
    'codacy.com',
    'lgtm.com',
    'deepscan.io',
    'badgen.net'
  ]
  for (const pattern of badPatterns) {
    if (lower.includes(pattern)) return false
  }
  if (lower.endsWith('.svg')) {
    const looksLikeBanner =
      lower.includes('banner') ||
      lower.includes('hero') ||
      lower.includes('preview') ||
      lower.includes('overview') ||
      lower.includes('architecture') ||
      lower.includes('cover') ||
      lower.includes('screenshot') ||
      lower.includes('header') ||
      lower.includes('logo-large') ||
      lower.includes('/raw/')
    const looksLikeIcon = lower.includes('icon') || lower.includes('favicon')
    if (looksLikeIcon) return false
    if (!looksLikeBanner) return false
  }
  return true
}

function resolveReadmeImageUrl(
  rawUrl: string,
  owner: string,
  repo: string,
  defaultBranch: string
): string {
  const url = rawUrl.trim()
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (url.includes(`github.com/${owner}/${repo}/blob/`)) {
      return url.replace(
        `github.com/${owner}/${repo}/blob/`,
        `raw.githubusercontent.com/${owner}/${repo}/`
      )
    }
    return url
  }
  const cleanPath = url.replace(/^\.?\//, '')
  return `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${cleanPath}`
}

export function extractReadmeImage(
  readmeContent: string,
  owner: string,
  repo: string,
  defaultBranch: string
): string | null {
  if (!readmeContent) return null
  const mdRegex = /!\[.*?\]\((https?:\/\/[^\s)]+|\.?\/?[^\s)]+)\)/gi
  let match: RegExpExecArray | null
  while ((match = mdRegex.exec(readmeContent)) !== null) {
    const candidate = match[1]
    if (isUsefulImage(candidate)) {
      return resolveReadmeImageUrl(candidate, owner, repo, defaultBranch)
    }
  }
  const htmlRegex = /<img[^>]+src=["'](https?:\/\/[^"'>]+|\.?\/?[^"'>]+)["']/gi
  while ((match = htmlRegex.exec(readmeContent)) !== null) {
    const candidate = match[1]
    if (isUsefulImage(candidate)) {
      return resolveReadmeImageUrl(candidate, owner, repo, defaultBranch)
    }
  }
  return null
}

export function generateExplanationFromReadme(description: string, readmeText: string): string {
  const cleanDesc = (description || '').trim()
  if (!readmeText) {
    return cleanDesc || 'Repositorio de GitHub sin descripción detallada disponible.'
  }

  let cleaned = readmeText
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/^#+\s+.*$/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map(p => p.trim().replace(/\s+/g, ' '))
    .filter(p => {
      if (p.length < 30) return false
      if (
        p.startsWith('|') ||
        p.includes('Table of Contents') ||
        p.includes('License:') ||
        p.startsWith('npm install') ||
        p.startsWith('pip install')
      ) {
        return false
      }
      return true
    })

  if (paragraphs.length > 0) {
    const firstPara = paragraphs[0]
    if (firstPara.length <= 250) return firstPara
    const sentenceEnd = firstPara.indexOf('. ')
    if (sentenceEnd > 40 && sentenceEnd < 260) {
      return firstPara.slice(0, sentenceEnd + 1)
    }
    return `${firstPara.slice(0, 240)}...`
  }

  return cleanDesc || 'Explorá el código fuente y la documentación para conocer todos los detalles.'
}

export function buildDeterministicSpanishExplanations(repo: Partial<GalleryRepository> & { owner: string; name: string }): {
  shortExplanationEs: string
  longExplanationEs: string
  resourceType: ResourceType
} {
  const fullName = `${repo.owner}/${repo.name}`
  const rawDesc = (repo.description || '').trim()
  const hasCjk = /[\u4e00-\u9fff]/.test(rawDesc)
  const desc = hasCjk ? '' : rawDesc
  const readmeExtract = generateExplanationFromReadme(desc, repo.readme || '')
  const langList =
    Array.isArray(repo.languages) && repo.languages.length > 0
      ? repo.languages.map(l => `${l.name}${l.percentage ? ` (${l.percentage}%)` : ''}`).join(', ')
      : repo.primaryLanguage || 'código abierto'
  const topics = Array.isArray(repo.topics) ? repo.topics : []

  const resourceType = inferResourceType(
    `${fullName} ${rawDesc} ${readmeExtract} ${topics.join(' ')}`,
    [`https://github.com/${fullName}`],
    topics
  )

  const readableSlug = repo.name.replace(/[-_]+/g, ' ')
  const cleanProvidedShort =
    repo.shortExplanationEs && !/[\u4e00-\u9fff]/.test(repo.shortExplanationEs)
      ? repo.shortExplanationEs
      : ''

  const shortExplanationEs =
    cleanProvidedShort ||
    (desc && desc !== 'Sin descripción provista.'
      ? desc.startsWith(resourceType)
        ? desc
        : `${resourceType}: ${desc}`
      : `${resourceType} en GitHub (${fullName}) enfocado en ${readableSlug}${
          topics.length > 0 ? ` (${topics.slice(0, 3).join(', ')})` : ''
        }.`)

  const longParts: string[] = []
  longParts.push(
    `${fullName} es un proyecto catalogado como "${resourceType}" en GitHub${
      repo.primaryLanguage ? `, desarrollado principalmente en ${repo.primaryLanguage}` : ''
    }.`
  )
  if (desc && desc !== 'Sin descripción provista.') {
    longParts.push(`Propósito oficial: ${desc}`)
  }
  if (readmeExtract && readmeExtract !== desc) {
    longParts.push(`Resumen técnico del README: ${readmeExtract}`)
  }
  const metaFacts: string[] = []
  if (typeof repo.stars === 'number' && repo.stars > 0) {
    metaFacts.push(`${repo.stars.toLocaleString()} estrellas`)
  }
  if (typeof repo.forks === 'number' && repo.forks > 0) {
    metaFacts.push(`${repo.forks.toLocaleString()} forks`)
  }
  if (repo.license) {
    metaFacts.push(`licencia ${repo.license}`)
  }
  if (repo.latestRelease?.tag) {
    metaFacts.push(`última versión ${repo.latestRelease.tag}`)
  }
  if (metaFacts.length > 0) {
    longParts.push(`Métricas y distribución: ${metaFacts.join(' · ')}. Lenguajes detectados: ${langList}.`)
  }
  if (topics.length > 0) {
    longParts.push(`Etiquetas clave: ${topics.join(', ')}.`)
  }

  return {
    shortExplanationEs: shortExplanationEs.slice(0, 280),
    longExplanationEs: longParts.join('\n\n'),
    resourceType
  }
}

function getGitHubHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Atlas-Bookmark-GitHub-Gallery/2.0'
  }
  const effectiveToken = token?.trim() || process.env.GITHUB_TOKEN?.trim()
  if (effectiveToken) {
    headers.Authorization = `Bearer ${effectiveToken}`
  }
  return headers
}

export async function fetchGitHubRateLimit(token?: string | null): Promise<RateLimitInfo | null> {
  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers: getGitHubHeaders(token),
      signal: AbortSignal.timeout(6000)
    })
    if (!res.ok) return null
    const data = await res.json()
    const core = data?.resources?.core
    if (!core) return null
    const resetDate = new Date(Number(core.reset) * 1000)
    return {
      limit: Number(core.limit) || 60,
      remaining: Number(core.remaining) || 0,
      resetTime: resetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  } catch {
    return null
  }
}

export async function fetchRepositoryReadme(
  owner: string,
  repo: string,
  token?: string | null
): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: {
        ...getGitHubHeaders(token),
        Accept: 'application/vnd.github.v3.raw'
      },
      signal: AbortSignal.timeout(8000)
    })
    if (res.ok) {
      const text = await res.text()
      return text.slice(0, 25000)
    }
  } catch {
    // Non-critical
  }
  return ''
}

export async function fetchGitHubRepositoryData(
  owner: string,
  repo: string,
  token?: string | null
): Promise<GalleryRepository> {
  const headers = getGitHubHeaders(token)
  const repoUrl = `https://api.github.com/repos/${owner}/${repo}`

  const repoRes = await fetch(repoUrl, {
    headers,
    signal: AbortSignal.timeout(10000)
  })

  if (!repoRes.ok) {
    if (repoRes.status === 403 || repoRes.status === 429) {
      throw new Error(
        'Se alcanzó temporalmente el límite de consultas anónimas de GitHub (60/hora). Agregá un Personal Access Token opcional en Ajustes de Galería para ampliar a 5.000 consultas/hora.'
      )
    }
    if (repoRes.status === 404) {
      throw new Error(`No se encontró el repositorio "${owner}/${repo}" en GitHub o es privado.`)
    }
    throw new Error(`Error al consultar GitHub (HTTP ${repoRes.status}).`)
  }

  const data = await repoRes.json()
  const defaultBranch = data.default_branch || 'main'

  // Fetch languages & latest release & README in parallel
  const [languages, latestRelease, readmeText] = await Promise.all([
    (async (): Promise<GalleryRepoLanguage[]> => {
      try {
        const langRes = await fetch(data.languages_url, {
          headers,
          signal: AbortSignal.timeout(6000)
        })
        if (!langRes.ok) return []
        const langData: Record<string, number> = await langRes.json()
        const totalBytes = Object.values(langData).reduce(
          (acc, cur) => acc + (typeof cur === 'number' ? cur : 0),
          0
        )
        return Object.entries(langData).map(([name, bytes]) => ({
          name,
          bytes: Number(bytes) || 0,
          percentage: totalBytes > 0 ? Math.round(((Number(bytes) || 0) / totalBytes) * 100) : 0
        }))
      } catch {
        return []
      }
    })(),
    (async (): Promise<GalleryRepoRelease | null> => {
      try {
        const releaseRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
          { headers, signal: AbortSignal.timeout(6000) }
        )
        if (!releaseRes.ok) return null
        const releaseData = await releaseRes.json()
        return {
          tag: releaseData.tag_name,
          name: releaseData.name || releaseData.tag_name,
          publishedAt: releaseData.published_at
        }
      } catch {
        return null
      }
    })(),
    fetchRepositoryReadme(owner, repo, token)
  ])

  const readmeImage = extractReadmeImage(readmeText, owner, repo, defaultBranch)
  const finalImageUrl = readmeImage || `https://opengraph.githubassets.com/1/${owner}/${repo}`
  const finalImageSource: 'readme' | 'opengraph' | 'fallback' = readmeImage ? 'readme' : 'opengraph'

  const explanation = generateExplanationFromReadme(data.description || '', readmeText)
  const rawTopics = Array.isArray(data.topics) ? data.topics : []

  const partialRepo: GalleryRepository = {
    id: Number(data.id) || numericIdFromFullName(`${owner}/${repo}`),
    owner: data.owner?.login || owner,
    name: data.name || repo,
    fullName: data.full_name || `${owner}/${repo}`,
    url: data.html_url || `https://github.com/${owner}/${repo}`,
    avatarUrl: data.owner?.avatar_url || `https://github.com/${owner}.png?size=128`,
    description: data.description || 'Sin descripción provista.',
    explanation,
    imageUrl: finalImageUrl,
    imageSource: finalImageSource,
    stars: data.stargazers_count ?? 0,
    forks: data.forks_count ?? 0,
    openIssues: data.open_issues_count ?? 0,
    primaryLanguage: data.language || null,
    languages,
    topics: rawTopics,
    license: data.license?.spdx_id || data.license?.name || null,
    createdAt: data.created_at || new Date().toISOString(),
    updatedAt: data.updated_at || new Date().toISOString(),
    pushedAt: data.pushed_at || data.updated_at || new Date().toISOString(),
    latestRelease,
    addedAt: new Date().toISOString(),
    homepage: data.homepage || null,
    defaultBranch,
    readme: readmeText
  }

  const synth = buildDeterministicSpanishExplanations(partialRepo)
  partialRepo.shortExplanationEs = synth.shortExplanationEs
  partialRepo.longExplanationEs = synth.longExplanationEs
  partialRepo.resourceType = synth.resourceType

  return partialRepo
}

export interface DiscoverSearchParams {
  query?: string
  category?: DiscoverCategory
  language?: string
  topic?: string
  createdFilter?: CreatedAtFilterType
  userTopics?: string[]
  userLanguages?: string[]
  page?: number
  perPage?: number
}

export interface DiscoverSearchResponse {
  items: GalleryRepository[]
  totalCount: number
  hasMore: boolean
  page: number
}

export async function searchGitHubDiscover(
  params: DiscoverSearchParams,
  token?: string | null
): Promise<DiscoverSearchResponse> {
  const headers = getGitHubHeaders(token)
  const qParts: string[] = []

  if (params.query?.trim()) {
    qParts.push(params.query.trim())
  } else if (params.category === 'ai') {
    qParts.push('topic:llm topic:ai stars:>200')
  } else if (params.category === 'mcp_agents') {
    qParts.push('(topic:mcp OR topic:ai-agents OR topic:claude-code OR "mcp server") stars:>50')
  } else if (params.category === 'devtools') {
    qParts.push('topic:developer-tools stars:>300')
  } else if (params.category === 'cli') {
    qParts.push('topic:cli stars:>200')
  } else if (params.category === 'design') {
    qParts.push('topic:ui OR topic:design-system stars:>200')
  } else if (params.category === 'automation') {
    qParts.push('topic:automation OR topic:workflow stars:>200')
  } else if (params.category === 'recommended') {
    if (params.userTopics && params.userTopics.length > 0) {
      const topTopics = params.userTopics
        .slice(0, 3)
        .map(t => `topic:${t.toLowerCase().replace(/\s+/g, '-')}`)
        .join(' ')
      qParts.push(`${topTopics} stars:>100`)
    } else {
      qParts.push('topic:ai-agents OR topic:llm stars:>300')
    }
  } else if (params.category === 'new') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    qParts.push(`created:>${thirtyDaysAgo} stars:>30`)
  } else {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    qParts.push(`pushed:>${thirtyDaysAgo} stars:>500`)
  }

  if (params.language && params.language !== 'ALL') {
    qParts.push(`language:${params.language}`)
  }

  if (params.topic && params.topic !== 'ALL') {
    qParts.push(`topic:${params.topic}`)
  }

  if (params.createdFilter && params.createdFilter !== 'ALL') {
    let days = 30
    if (params.createdFilter === 'week') days = 7
    if (params.createdFilter === 'month') days = 30
    if (params.createdFilter === 'three_months') days = 90
    if (params.createdFilter === 'six_months') days = 180
    if (params.createdFilter === 'year') days = 365
    const dateStr = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    qParts.push(`created:>${dateStr}`)
  }

  const page = Math.max(1, params.page || 1)
  const perPage = Math.min(60, Math.max(10, params.perPage || 24))
  const queryStr = encodeURIComponent(qParts.join(' '))
  const sort = params.category === 'new' ? 'updated' : 'stars'
  const url = `https://api.github.com/search/repositories?q=${queryStr}&sort=${sort}&order=desc&page=${page}&per_page=${perPage}`

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000)
  })

  if (!response.ok) {
    throw new Error(
      response.status === 403 || response.status === 429
        ? 'Se alcanzó temporalmente el límite de consultas a GitHub. Configurá un Personal Access Token opcional en Ajustes de Galería.'
        : `Error al buscar repositorios en GitHub (HTTP ${response.status}).`
    )
  }

  const data = await response.json()
  const rawItems: any[] = Array.isArray(data.items) ? data.items : []
  const totalCount: number = typeof data.total_count === 'number' ? data.total_count : 0
  const maxAvailable = Math.min(totalCount, 1000)
  const hasMore = page * perPage < maxAvailable && rawItems.length > 0

  const items: GalleryRepository[] = rawItems.map(item => {
    const ownerName = item.owner?.login || ''
    const repoName = item.name || ''
    const fullName = item.full_name || `${ownerName}/${repoName}`
    const description = item.description || 'Sin descripción provista en GitHub.'
    const lang = item.language || null
    const topics = Array.isArray(item.topics) ? item.topics : []
    const stars = item.stargazers_count ?? 0
    const license = item.license?.spdx_id || item.license?.name || null
    const pushedAt = item.pushed_at || item.updated_at || new Date().toISOString()

    const resourceType = inferResourceType({
      caption: `${fullName} ${description} ${topics.join(' ')}`,
      urls: [`https://github.com/${fullName}`],
      topics
    })

    const shortExplanationEs = `${resourceType}: ${description}`

    return {
      id: Number(item.id) || numericIdFromFullName(fullName),
      owner: ownerName,
      name: repoName,
      fullName,
      url: item.html_url || `https://github.com/${fullName}`,
      avatarUrl: item.owner?.avatar_url || `https://github.com/${ownerName}.png?size=128`,
      description,
      explanation: shortExplanationEs,
      shortExplanationEs,
      imageUrl: `https://opengraph.githubassets.com/1/${ownerName}/${repoName}`,
      imageSource: 'opengraph',
      stars,
      forks: item.forks_count ?? 0,
      openIssues: item.open_issues_count ?? 0,
      primaryLanguage: lang,
      languages: lang ? [{ name: lang, bytes: 100, percentage: 100 }] : [],
      topics,
      license,
      createdAt: item.created_at || new Date().toISOString(),
      updatedAt: item.updated_at || new Date().toISOString(),
      pushedAt,
      latestRelease: null,
      addedAt: new Date().toISOString(),
      homepage: item.homepage || null,
      defaultBranch: item.default_branch || 'main',
      resourceType
    }
  })

  return {
    items,
    totalCount,
    hasMore,
    page
  }
}

// ============================================================================
// MULTI-PROVIDER AI & DETERMINISTIC FALLBACK FOR REPOSITORIES
// ============================================================================

export function listConfiguredAiProviders(): {
  providers: AiProviderInfo[]
  activeProvider: AiProviderId
} {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY)
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY)
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY)
  const ollamaConfigured = Boolean(process.env.OLLAMA_HOST || process.env.OLLAMA_MODEL)

  const providers: AiProviderInfo[] = [
    {
      id: 'gemini',
      displayName: 'Google Gemini',
      description: 'API oficial de Google (gemini-2.5-flash).',
      configured: geminiConfigured,
      defaultModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      requiresApiKey: true
    },
    {
      id: 'openai',
      displayName: 'OpenAI-compatible',
      description: 'OpenAI, OpenRouter, DeepSeek, Groq, Together, Mistral.',
      configured: openaiConfigured,
      defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      defaultBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      requiresApiKey: true
    },
    {
      id: 'anthropic',
      displayName: 'Anthropic Claude',
      description: 'Claude 3.5 / 3.7 vía API oficial de Anthropic.',
      configured: anthropicConfigured,
      defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
      requiresApiKey: true
    },
    {
      id: 'ollama',
      displayName: 'Ollama (Local)',
      description: 'Modelos locales servidos por Ollama en localhost:11434.',
      configured: ollamaConfigured,
      defaultModel: process.env.OLLAMA_MODEL || 'llama3.2',
      defaultBaseUrl: process.env.OLLAMA_HOST || 'http://localhost:11434',
      requiresApiKey: false
    },
    {
      id: 'local_rules',
      displayName: 'Analizador Local Determinista (Siempre activo)',
      description: 'Sintetizador técnico en español basado en el README, lenguajes y reglas locales sin consumir API keys.',
      configured: true,
      defaultModel: 'atlas-readme-synthesizer-v2',
      requiresApiKey: false
    }
  ]

  const firstCloud = providers.find(p => p.id !== 'local_rules' && p.configured)
  return {
    providers,
    activeProvider: firstCloud ? firstCloud.id : 'local_rules'
  }
}

async function generateTextWithConfiguredProvider(opts: {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  providerId?: AiProviderId
  model?: string
  jsonMode?: boolean
}): Promise<string | null> {
  const { activeProvider } = listConfiguredAiProviders()
  const chosen = opts.providerId || activeProvider
  if (chosen === 'local_rules') return null

  try {
    if (chosen === 'gemini' && process.env.GEMINI_API_KEY) {
      const model = opts.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash'
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`
      const contents = opts.messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))
      const body: any = {
        systemInstruction: { parts: [{ text: opts.system }] },
        contents,
        generationConfig: {
          temperature: 0.25,
          ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {})
        }
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      })
      if (res.ok) {
        const data = await res.json()
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || null
      }
    }

    if (chosen === 'openai' && process.env.OPENAI_API_KEY) {
      const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
      const model = opts.model || process.env.OPENAI_MODEL || 'gpt-4o-mini'
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: opts.system }, ...opts.messages],
          temperature: 0.3,
          ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {})
        }),
        signal: AbortSignal.timeout(15000)
      })
      if (res.ok) {
        const data = await res.json()
        return data?.choices?.[0]?.message?.content || null
      }
    }

    if (chosen === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '')
      const model = opts.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest'
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          system: opts.system,
          messages: opts.messages,
          max_tokens: 1500,
          temperature: 0.3
        }),
        signal: AbortSignal.timeout(15000)
      })
      if (res.ok) {
        const data = await res.json()
        return data?.content?.[0]?.text || null
      }
    }

    if (chosen === 'ollama') {
      const baseUrl = (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/+$/, '')
      const model = opts.model || process.env.OLLAMA_MODEL || 'llama3.2'
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: opts.system }, ...opts.messages],
          temperature: 0.3
        }),
        signal: AbortSignal.timeout(12000)
      })
      if (res.ok) {
        const data = await res.json()
        return data?.choices?.[0]?.message?.content || null
      }
    }
  } catch {
    // Fall back to deterministic synthesizer
  }

  return null
}

export async function explainRepoWithAiServer(
  repo: Partial<GalleryRepository> & { owner: string; name: string },
  providerId?: AiProviderId,
  model?: string
): Promise<{
  shortExplanationEs: string
  longExplanationEs: string
  resourceType: ResourceType
  providerUsed: string
}> {
  const deterministic = buildDeterministicSpanishExplanations(repo)

  const langList = Array.isArray(repo.languages)
    ? repo.languages.map(l => (typeof l === 'string' ? l : l.name)).join(', ')
    : repo.primaryLanguage || 'No especificado'
  const topicList = Array.isArray(repo.topics) ? repo.topics.join(', ') : 'Ninguno'
  const cleanReadme = typeof repo.readme === 'string' ? repo.readme.slice(0, 12000) : ''

  const systemInstruction = `Eres un analista técnico de software experto. Redacta dos explicaciones en español basadas exclusivamente en los datos reales suministrados del repositorio ${repo.owner}/${repo.name}.
Devuelve únicamente un objeto JSON con:
- "shortExplanationEs": Descripción corta de 1 a 2 oraciones (máx 40 palabras) en español explicando qué es y para qué sirve.
- "longExplanationEs": Explicación técnica en español de 100 a 220 palabras detallando qué problema resuelve, su arquitectura/lenguajes y casos de uso.`

  const contextText = `Repositorio: ${repo.owner}/${repo.name}
Descripción: ${repo.description || 'Sin descripción'}
Homepage: ${repo.homepage || 'No especificada'}
Lenguajes: ${langList}
Topics: ${topicList}
Licencia: ${repo.license || 'No especificada'}
README:
${cleanReadme || 'No disponible'}`

  const llmText = await generateTextWithConfiguredProvider({
    system: systemInstruction,
    messages: [{ role: 'user', content: contextText }],
    providerId,
    model,
    jsonMode: true
  })

  if (llmText) {
    try {
      const match = llmText.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(match ? match[0] : llmText)
      if (parsed?.shortExplanationEs && parsed?.longExplanationEs) {
        return {
          shortExplanationEs: String(parsed.shortExplanationEs).trim(),
          longExplanationEs: String(parsed.longExplanationEs).trim(),
          resourceType: deterministic.resourceType,
          providerUsed: providerId || 'llm'
        }
      }
    } catch {
      // Fallback to deterministic
    }
  }

  return {
    ...deterministic,
    providerUsed: 'local_rules'
  }
}

export async function askRepoAssistantServer(
  repoOrParams:
    | GalleryRepository
    | {
        repo: GalleryRepository
        question: string
        history?: Array<{ role: 'user' | 'assistant'; content: string }>
        provider?: AiProviderId
        model?: string
      },
  messagesArg?: Array<{ role: 'user' | 'assistant'; content: string }>,
  providerIdArg?: AiProviderId,
  modelArg?: string
): Promise<string> {
  const isObjCall =
    repoOrParams &&
    typeof repoOrParams === 'object' &&
    'repo' in repoOrParams &&
    'question' in repoOrParams

  const repo: GalleryRepository = isObjCall ? repoOrParams.repo : (repoOrParams as GalleryRepository)
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = isObjCall
    ? [...(repoOrParams.history || []), { role: 'user', content: repoOrParams.question }]
    : Array.isArray(messagesArg)
    ? messagesArg
    : []
  const providerId: AiProviderId | undefined = isObjCall ? repoOrParams.provider : providerIdArg
  const model: string | undefined = isObjCall ? repoOrParams.model : modelArg
  const langList = Array.isArray(repo.languages)
    ? repo.languages.map(l => `${l.name}${l.percentage ? ` (${l.percentage}%)` : ''}`).join(', ')
    : repo.primaryLanguage || 'No especificado'
  const cleanReadme = typeof repo.readme === 'string' ? repo.readme.slice(0, 14000) : ''

  const systemInstruction = `Estás ayudando al usuario a comprender el repositorio de GitHub ${repo.owner}/${repo.name} (${repo.url}).
Tipo de recurso: ${repo.resourceType || 'Repositorio'}
Descripción: ${repo.shortExplanationEs || repo.description}
Explicación: ${repo.longExplanationEs || repo.explanation}
Lenguajes: ${langList}
Topics: ${(repo.topics || []).join(', ')}
Licencia: ${repo.license || 'No especificada'}
README:
${cleanReadme || 'No hay README descargado todavía.'}

Responde SIEMPRE en español claro, técnico y basado únicamente en la evidencia del repositorio.`

  const llmReply = await generateTextWithConfiguredProvider({
    system: systemInstruction,
    messages: messages.slice(-12),
    providerId,
    model
  })

  if (llmReply) return llmReply

  // Deterministic grounded answer when no external LLM key is configured
  const lastQuestion = (messages[messages.length - 1]?.content || '').toLowerCase()
  const synth = buildDeterministicSpanishExplanations(repo)

  if (lastQuestion.includes('instala') || lastQuestion.includes('prueba') || lastQuestion.includes('ejecuta')) {
    const codeBlocks = (repo.readme || '').match(/```(?:bash|sh|zsh|shell|console|powershell)?\s*([\s\S]*?)```/gi)
    if (codeBlocks && codeBlocks.length > 0) {
      const snippet = codeBlocks.slice(0, 2).join('\n\n')
      return `Según el README oficial de **${repo.fullName}**, estos son los comandos principales de instalación o uso:\n\n${snippet}\n\nPodés revisar todos los detalles en ${repo.url}.`
    }
    return `Para probar o instalar **${repo.fullName}** (${repo.primaryLanguage || 'código abierto'}):\n\n1. Cloná el repositorio: \`git clone ${repo.url}.git\`\n2. Consultá las instrucciones específicas en ${repo.url}${repo.homepage ? ` o en su sitio oficial ${repo.homepage}` : ''}.`
  }

  if (lastQuestion.includes('requisito') || lastQuestion.includes('dependencia') || lastQuestion.includes('licencia')) {
    return `**Requisitos y ficha técnica de ${repo.fullName}:**\n- **Lenguaje principal:** ${repo.primaryLanguage || 'No especificado'} (${langList})\n- **Licencia:** ${repo.license || 'Consultar en el repositorio'}\n- **Último release:** ${repo.latestRelease?.tag || 'Uso desde rama principal (' + (repo.defaultBranch || 'main') + ')'}`
  }

  return `**${repo.fullName}** (${synth.resourceType})\n\n${synth.longExplanationEs}`
}

export async function askGalleryAssistantServer(
  messagesOrParams:
    | Array<{ role: 'user' | 'assistant'; content: string }>
    | {
        repos: GalleryRepository[]
        question: string
        history?: Array<{ role: 'user' | 'assistant'; content: string }>
        provider?: AiProviderId
        model?: string
      },
  reposArg?: GalleryRepository[],
  providerIdArg?: AiProviderId,
  modelArg?: string
): Promise<string> {
  const isObjCall =
    messagesOrParams &&
    !Array.isArray(messagesOrParams) &&
    typeof messagesOrParams === 'object' &&
    'repos' in messagesOrParams

  const repos: GalleryRepository[] = isObjCall
    ? messagesOrParams.repos || []
    : Array.isArray(reposArg)
    ? reposArg
    : []
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = isObjCall
    ? [...(messagesOrParams.history || []), { role: 'user', content: messagesOrParams.question }]
    : Array.isArray(messagesOrParams)
    ? messagesOrParams
    : []
  const providerId: AiProviderId | undefined = isObjCall ? messagesOrParams.provider : providerIdArg
  const model: string | undefined = isObjCall ? messagesOrParams.model : modelArg
  const summaryLines = repos.slice(0, 40).map((r, i) => {
    return `${i + 1}. ${r.fullName} [${r.resourceType || 'Repo'}] (${r.primaryLanguage || 'Multi'}) ★${r.stars}: ${r.shortExplanationEs || r.description}`
  })

  const systemInstruction = `Eres el asistente técnico de Atlas de Guardados y GitHub Visual Gallery.
El usuario tiene ${repos.length} repositorios guardados en su galería unificada:
${summaryLines.join('\n')}

Responde siempre en español claro. Cuando menciones un repositorio, incluye su URL completa https://github.com/owner/repo.`

  const llmReply = await generateTextWithConfiguredProvider({
    system: systemInstruction,
    messages: messages.slice(-12),
    providerId,
    model
  })

  if (llmReply) return llmReply

  // Deterministic search & answer over the user's saved repositories
  const q = (messages[messages.length - 1]?.content || '').toLowerCase()
  if (q.includes('estrella') || q.includes('popular')) {
    const top = [...repos].sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 6)
    return (
      `Estos son los repositorios con más estrellas en tu colección (${repos.length} en total):\n\n` +
      top
        .map(
          r =>
            `- **${r.fullName}** (⭐ ${r.stars.toLocaleString()} · ${r.resourceType || 'Repo'}): ${
              r.shortExplanationEs || r.description
            } — https://github.com/${r.fullName}`
        )
        .join('\n')
    )
  }

  const tokens = q
    .split(/\s+/)
    .map(t => t.replace(/[^a-záéíóúñ0-9_-]/gi, ''))
    .filter(t => t.length >= 2)

  const scored = repos
    .map(r => {
      const hay = `${r.fullName} ${r.description} ${r.shortExplanationEs || ''} ${r.resourceType || ''} ${r.primaryLanguage || ''} ${(r.topics || []).join(' ')}`.toLowerCase()
      let score = 0
      for (const tok of tokens) {
        if (hay.includes(tok)) score += 3
        for (const syn of SEARCH_SYNONYMS[tok] || []) {
          if (hay.includes(syn)) score += 2
        }
      }
      return { repo: r, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.repo.stars || 0) - (a.repo.stars || 0))
    .slice(0, 6)

  if (scored.length > 0) {
    return (
      `Encontré **${scored.length} repositorios relevantes** en tu galería de ${repos.length} proyectos:\n\n` +
      scored
        .map(
          ({ repo: r }) =>
            `- **${r.fullName}** [${r.resourceType || 'Repo'}]${
              r.primaryLanguage ? ` (${r.primaryLanguage})` : ''
            }: ${r.shortExplanationEs || r.description} — https://github.com/${r.fullName}`
        )
        .join('\n')
    )
  }

  const sample = repos.slice(0, 6)
  return (
    `Tenés **${repos.length} repositorios de GitHub** catalogados en tu galería (incluyendo Skills, Servidores MCP, Agentes y Librerías). Algunos destacados:\n\n` +
    sample
      .map(
        r =>
          `- **${r.fullName}** [${r.resourceType || 'Repo'}]: ${
            r.shortExplanationEs || r.description
          } — https://github.com/${r.fullName}`
      )
      .join('\n')
  )
}

/**
 * Converts a GalleryRepository into a first-class BookmarkItem so that
 * repositories added directly in the GitHub Visual Gallery also live in
 * the main 8-column Table (Biblioteca) and all Exports (CSV, Excel, JSON v2).
 */
export function galleryRepoToBookmarkItem(repo: GalleryRepository): BookmarkItem {
  const fullName = `${repo.owner}/${repo.name}`
  const repoUrl = `https://github.com/${fullName}`
  const caption =
    repo.shortExplanationEs ||
    repo.explanation ||
    repo.description ||
    `Repositorio de GitHub ${fullName}`

  const outgoingLinks = [repoUrl]
  if (repo.homepage && repo.homepage.startsWith('http')) {
    outgoingLinks.push(repo.homepage)
  }

  const analysis = analyzeContent(
    `${fullName} ${caption} ${(repo.topics || []).join(' ')} ${repo.primaryLanguage || ''}`,
    [],
    {
      domain: 'github.com',
      author: repo.owner,
      handle: `@${repo.owner}`,
      externalUrls: outgoingLinks
    }
  )

  const combinedTopics = Array.from(
    new Set([
      ...analysis.topics.filter(t => t !== 'Sin clasificar'),
      ...(repo.topics || []).slice(0, 4)
    ])
  )
  if (combinedTopics.length === 0) combinedTopics.push('Programación')

  const synth = synthesizeBookmarkFields({
    caption,
    authorName: repo.owner,
    authorHandle: `@${repo.owner}`,
    platform: 'github',
    outgoingLinks,
    topics: combinedTopics,
    entities: [fullName, ...(repo.primaryLanguage ? [repo.primaryLanguage] : [])]
  })

  const evaluationParts: string[] = []
  evaluationParts.push(`Utilidad: ${repo.resourceType || synth.resourceType}`)
  if (repo.stars > 0) evaluationParts.push(`★ ${repo.stars.toLocaleString()} en GitHub`)
  if (repo.primaryLanguage) evaluationParts.push(`Lenguaje: ${repo.primaryLanguage}`)
  if (repo.license) evaluationParts.push(`Licencia: ${repo.license}`)

  return {
    id: `github:${fullName.toLowerCase()}`,
    platform: 'github',
    sourceUrl: repoUrl,
    authorName: repo.owner,
    authorHandle: `@${repo.owner}`,
    authorAvatar: repo.avatarUrl || `https://github.com/${repo.owner}.png?size=128`,
    domain: 'github.com',
    publishedAt: repo.createdAt || repo.addedAt || new Date().toISOString(),
    savedAt: repo.addedAt || new Date().toISOString(),
    importedAt: new Date().toISOString(),
    caption,
    title: `${fullName}${repo.description && repo.description !== 'Sin descripción provista.' ? ` — ${repo.description.slice(0, 70)}` : ''}`,
    purpose: repo.shortExplanationEs || synth.purpose,
    resourceType: repo.resourceType || synth.resourceType,
    evaluation: evaluationParts.join(' · '),
    analysisState: 'completed',
    notes: repo.notes || '',
    resources: synth.resources.map(r =>
      r.kind === 'github_repo'
        ? {
            ...r,
            stars: repo.stars || r.stars,
            license: repo.license || r.license,
            verificationStatus: 'confirmed',
            evidenceBasis: 'github_api'
          }
        : r
    ),
    manualFields: [],
    contentType: 'repository',
    collections: ['GitHub Gallery'],
    topics: combinedTopics,
    entities: [fullName, ...(repo.primaryLanguage ? [repo.primaryLanguage] : [])],
    aiSummary: repo.longExplanationEs || repo.shortExplanationEs || synth.purpose,
    language: 'Español',
    outgoingLinks,
    mediaType: repo.imageUrl ? 'image' : 'none',
    mediaUrls: repo.imageUrl ? [repo.imageUrl] : [],
    mediaStatus: repo.imageUrl ? 'referenced' : 'not_requested',
    reviewed: false,
    analysisMethod: 'investigator',
    classificationStatus: 'deterministic',
    confidence: 0.92,
    contentStatus: 'text',
    captureSource: 'github_visual_gallery',
    provenance: 'github_visual_gallery'
  }
}

export function parseGalleryImportJson(jsonText: string): {
  repositories: GalleryRepository[]
  customOrder?: number[]
} {
  const parsed: any = JSON.parse(jsonText)
  let rawRepos: any[] = []
  let customOrder: number[] | undefined

  if (Array.isArray(parsed)) {
    rawRepos = parsed
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.repositories)) {
    rawRepos = parsed.repositories
    if (Array.isArray(parsed.customOrder)) {
      customOrder = parsed.customOrder
    }
  } else {
    throw new Error('El archivo JSON no contiene una lista válida de repositorios.')
  }

  const validRepos: GalleryRepository[] = []
  for (const item of rawRepos) {
    if (!item || typeof item !== 'object') continue
    const parsedUrl = item.url ? parseGitHubUrl(String(item.url)) : null
    const owner = String(item.owner || parsedUrl?.owner || '').trim()
    const name = String(item.name || parsedUrl?.repo || '').trim()
    if (!owner || !name) continue
    const fullName = `${owner}/${name}`
    const synth = buildDeterministicSpanishExplanations({
      ...item,
      owner,
      name
    })

    validRepos.push({
      id: Number(item.id) || numericIdFromFullName(fullName),
      owner,
      name,
      fullName,
      url: item.url || `https://github.com/${fullName}`,
      avatarUrl: item.avatarUrl || `https://github.com/${owner}.png?size=128`,
      description: item.description || 'Sin descripción provista.',
      explanation: item.explanation || synth.shortExplanationEs,
      shortExplanationEs: item.shortExplanationEs || synth.shortExplanationEs,
      longExplanationEs: item.longExplanationEs || synth.longExplanationEs,
      explanationGeneratedAt: item.explanationGeneratedAt,
      readme: item.readme || '',
      imageUrl: item.imageUrl || `https://opengraph.githubassets.com/1/${owner}/${name}`,
      imageSource: item.imageSource || 'opengraph',
      stars: Number(item.stars) || 0,
      forks: Number(item.forks) || 0,
      openIssues: Number(item.openIssues) || 0,
      primaryLanguage: item.primaryLanguage || null,
      languages: Array.isArray(item.languages) ? item.languages : [],
      topics: Array.isArray(item.topics) ? item.topics : [],
      license: item.license || null,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
      pushedAt: item.pushedAt || item.updatedAt || new Date().toISOString(),
      latestRelease: item.latestRelease || null,
      addedAt: item.addedAt || new Date().toISOString(),
      homepage: item.homepage || null,
      defaultBranch: item.defaultBranch || 'main',
      resourceType: item.resourceType || synth.resourceType,
      linkedBookmarkIds: Array.isArray(item.linkedBookmarkIds) ? item.linkedBookmarkIds : [],
      notes: item.notes || ''
    })
  }

  return { repositories: validRepos, customOrder }
}
