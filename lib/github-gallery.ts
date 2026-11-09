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
  InstallSnippetInfo,
  ProjectBlueprint,
  RateLimitInfo,
  RepoAgentEvaluation,
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
  contextHint?: string
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
  'open-source',
  'resources',
  'partners',
  'services',
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

const NON_REPO_SHORTHAND_OWNERS = new Set([
  'http',
  'https',
  'www',
  'src',
  'app',
  'lib',
  'components',
  'pages',
  'public',
  'data',
  'scripts',
  'tests',
  'node_modules',
  'dist',
  'build',
  'assets',
  'images',
  'text',
  'application',
  'image',
  'video',
  'audio',
  'multipart',
  'x',
  'twitter',
  'instagram',
  'whatsapp',
  't',
  'bit',
  'usr',
  'var',
  'etc',
  'bin',
  'home',
  'users',
  'ci',
  'cd',
  'ui',
  'ux',
  'ai',
  'ml',
  'io',
  'os',
  'db',
  'api',
  'v1',
  'v2',
  'v3'
])

export function extractGitHubUrlsFromText(text: string, allowShorthand = false): ExtractedRepoUrl[] {
  if (!text || typeof text !== 'string') return []
  const regex =
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)(?:[^\s<>"'`)\]]*)?/gi

  const seen = new Set<string>()
  const results: ExtractedRepoUrl[] = []
  let match: RegExpExecArray | null

  // Map line context for richer descriptions when importing Awesome lists or notes
  const lines = text.split(/\r?\n/)

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
      // Find matching line to extract surrounding description if available
      const matchingLine = lines.find(l => l.includes(`${owner}/${repo}`)) || ''
      const cleanHint = matchingLine
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(new RegExp(`${owner}\\/${repo}`, 'gi'), '')
        .replace(/^[\s*\-•#|\d.:\]()—–]+/, '')
        .replace(/[\s|—–-]+$/, '')
        .trim()

      results.push({
        owner,
        repo,
        cleanUrl: `https://github.com/${owner}/${repo}`,
        originalMatch: fullMatch,
        contextHint: cleanHint.length >= 10 ? cleanHint.slice(0, 260) : undefined
      })
    }
  }

  if (allowShorthand) {
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      // Skip lines that already have full http:// or github.com URLs
      if (/github\.com\//i.test(line)) continue

      // Match standalone `owner/repo` or bullet `- owner/repo: description` or `owner/repo - description`
      const shortMatch = line.match(
        /^(?:[-*•\d.)\s`[\]]*)?([a-zA-Z][a-zA-Z0-9_-]{1,38})\/([a-zA-Z0-9_.-]{2,80})(?:\s*[-:–—|]\s*(.*))?$/
      )
      if (!shortMatch) continue
      const owner = shortMatch[1].trim()
      let repo = shortMatch[2].trim().replace(/[.,;:!?)\],'`">]+$/, '')
      const descHint = (shortMatch[3] || '').trim()

      if (repo.endsWith('.git')) repo = repo.slice(0, -4)
      if (
        !owner ||
        !repo ||
        GITHUB_RESERVED_NAMES.has(owner.toLowerCase()) ||
        GITHUB_RESERVED_NAMES.has(repo.toLowerCase()) ||
        NON_REPO_SHORTHAND_OWNERS.has(owner.toLowerCase()) ||
        /\.(?:ts|tsx|js|jsx|json|md|py|css|html|yml|yaml|sh|txt|csv|png|jpg|svg)$/i.test(repo)
      ) {
        continue
      }

      const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        results.push({
          owner,
          repo,
          cleanUrl: `https://github.com/${owner}/${repo}`,
          originalMatch: `${owner}/${repo}`,
          contextHint: descHint.length >= 8 ? descHint.slice(0, 260) : undefined
        })
      }
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

export function isGenericRepoDescription(text?: string | null): boolean {
  if (!text) return true
  const t = text.trim()
  if (t.length < 12) return true
  return /Sin descripci|referenciado en tus guardados|detectado en tus guardados|importado a la galer|^Repositorio en GitHub|^Repositorio de GitHub sin descripci|^Explorá el código fuente|enfocado en\s+[a-z0-9_-]+\.$/i.test(
    t
  )
}

export function generateExplanationFromReadme(description: string, readmeText: string): string {
  const cleanDesc = !isGenericRepoDescription(description) ? (description || '').trim() : ''
  if (!readmeText) {
    return cleanDesc || 'Repositorio de GitHub sin descripción detallada disponible.'
  }

  let cleaned = readmeText
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/^#+\s+.*$/gm, '')
    .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map(p =>
      p
        .replace(/^[>*\-\s]+/gm, '')
        .trim()
        .replace(/\s+/g, ' ')
    )
    .filter(p => {
      if (p.length < 28) return false
      if (/[\u4e00-\u9fff]/.test(p) && !/[a-zA-Z]{15,}/.test(p)) return false
      if (
        p.startsWith('|') ||
        p.includes('Table of Contents') ||
        p.includes('License:') ||
        p.startsWith('npm install') ||
        p.startsWith('pip install') ||
        p.startsWith('git clone') ||
        /^https?:\/\/\S+$/i.test(p) ||
        /^(?:English|中文|日本語|한국어|Français|Español|Deutsch|Русский)[\s|·•/]+/i.test(p)
      ) {
        return false
      }
      return true
    })

  if (paragraphs.length > 0) {
    const firstPara = paragraphs[0]
    if (firstPara.length <= 250) return firstPara
    const sentenceEnd = firstPara.indexOf('. ')
    if (sentenceEnd > 35 && sentenceEnd < 260) {
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
  effectiveDescription: string
} {
  const fullName = `${repo.owner}/${repo.name}`
  const rawDesc = (repo.description || '').trim()
  const hasCjk = /[\u4e00-\u9fff]/.test(rawDesc)
  const cleanRawDesc = !hasCjk && !isGenericRepoDescription(rawDesc) ? rawDesc : ''
  const readmeExtractRaw = generateExplanationFromReadme(cleanRawDesc, repo.readme || '')
  const readmeExtract =
    !isGenericRepoDescription(readmeExtractRaw) && !/[\u4e00-\u9fff]/.test(readmeExtractRaw)
      ? readmeExtractRaw
      : ''

  const desc = cleanRawDesc || readmeExtract
  const langList =
    Array.isArray(repo.languages) && repo.languages.length > 0
      ? repo.languages.map(l => `${l.name}${l.percentage ? ` (${l.percentage}%)` : ''}`).join(', ')
      : repo.primaryLanguage || 'código abierto'
  const topics = Array.isArray(repo.topics) ? repo.topics : []

  const resourceType = inferResourceType(
    `${fullName} ${desc} ${readmeExtract} ${topics.join(' ')} ${(repo.readme || '').slice(0, 1200)}`,
    [`https://github.com/${fullName}`],
    topics
  )

  const readableSlug = repo.name.replace(/[-_]+/g, ' ')
  const cleanProvidedShort =
    repo.shortExplanationEs &&
    !/[\u4e00-\u9fff]/.test(repo.shortExplanationEs) &&
    !isGenericRepoDescription(repo.shortExplanationEs)
      ? repo.shortExplanationEs
      : ''

  const shortExplanationEs =
    cleanProvidedShort ||
    (desc
      ? desc.startsWith(resourceType)
        ? desc
        : `${resourceType}: ${desc}`
      : `${resourceType} open-source (${fullName})${
          repo.primaryLanguage ? ` en ${repo.primaryLanguage}` : ''
        } para ${readableSlug}${
          topics.length > 0 ? ` (${topics.slice(0, 4).join(', ')})` : ''
        }.`)

  const effectiveDescription =
    desc ||
    `${resourceType} open-source (${fullName})${
      repo.primaryLanguage ? ` desarrollado en ${repo.primaryLanguage}` : ''
    }${topics.length > 0 ? ` — ${topics.slice(0, 4).join(', ')}` : ''}.`

  const longParts: string[] = []
  longParts.push(
    `${fullName} es un proyecto catalogado como "${resourceType}" en GitHub${
      repo.primaryLanguage ? `, desarrollado principalmente en ${repo.primaryLanguage}` : ''
    }.`
  )
  if (desc) {
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
    resourceType,
    effectiveDescription: effectiveDescription.slice(0, 280)
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

async function fetchGitHubRepositoryViaPublicHtmlFallback(
  owner: string,
  repo: string
): Promise<GalleryRepository> {
  const pageUrl = `https://github.com/${owner}/${repo}`
  const res = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml'
    },
    signal: AbortSignal.timeout(10000)
  })
  if (res.status === 404) {
    throw new Error(`No se encontró el repositorio "${owner}/${repo}" en GitHub o es privado.`)
  }
  if (!res.ok) {
    throw new Error(`Error al consultar GitHub HTML (HTTP ${res.status}).`)
  }
  const html = await res.text()

  const parseCount = (raw?: string): number => {
    if (!raw) return 0
    const cleaned = raw.trim().replace(/,/g, '')
    if (/^\d+$/.test(cleaned)) return Number(cleaned)
    const m = cleaned.match(/^([\d.]+)\s*([kKmM])$/)
    if (m) {
      const mult = m[2].toLowerCase() === 'm' ? 1_000_000 : 1_000
      return Math.round( parseFloat(m[1]) * mult )
    }
    return 0
  }

  const starTitleMatch =
    html.match(/id="repo-stars-counter-star"[^>]*title="([\d,]+)"/i) ||
    html.match(/aria-label="([\d,]+)\s+users?\s+starred\s+this\s+repository"/i) ||
    html.match(/id="repo-stars-counter-star"[^>]*>([^<]+)</i) ||
    html.match(/>Star\s*<span[^>]*>(?:<span[^>]*>)?([\d.,]+\s*[kKmM]?)</i)
  const stars = parseCount(starTitleMatch?.[1])

  const forkTitleMatch =
    html.match(/id="repo-network-counter"[^>]*title="([\d,]+)"/i) ||
    html.match(/id="repo-network-counter"[^>]*>([^<]+)</i) ||
    html.match(/>Fork\s*<span[^>]*>(?:<span[^>]*>)?([\d.,]+\s*[kKmM]?)</i)
  const forks = parseCount(forkTitleMatch?.[1])

  const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)
  let description = ogDescMatch ? ogDescMatch[1].trim() : ''
  description = description
    .replace(new RegExp(`\\s*-\\s*${owner}/${repo}\\s*$`, 'i'), '')
    .replace(new RegExp(`^Contribute to ${owner}/${repo} development by creating an account on GitHub\\.?$`, 'i'), '')
    .trim()

  const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
  const imageUrl = ogImageMatch?.[1] || `https://opengraph.githubassets.com/1/${owner}/${repo}`

  const langMatches = Array.from(
    html.matchAll(/itemprop="programmingLanguage"[^>]*>([^<]+)</gi)
  ).map(m => m[1].trim())
  const primaryLanguage = langMatches[0] || null

  const topicMatches = Array.from(
    html.matchAll(/href="\/topics\/([a-z0-9-]+)"/gi)
  ).map(m => m[1].toLowerCase())
  const topics = Array.from(new Set(topicMatches)).slice(0, 12)

  let readmeText = ''
  try {
    const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`, {
      signal: AbortSignal.timeout(7000)
    })
    if (rawRes.ok) {
      readmeText = (await rawRes.text()).slice(0, 25000)
    }
  } catch {}

  const fullName = `${owner}/${repo}`
  const now = new Date().toISOString()
  const partialRepo: GalleryRepository = {
    id: numericIdFromFullName(fullName),
    owner,
    name: repo,
    fullName,
    url: `https://github.com/${fullName}`,
    avatarUrl: `https://github.com/${owner}.png?size=128`,
    description: description || 'Sin descripción proporcionada en GitHub.',
    explanation: description || 'Sin descripción proporcionada en GitHub.',
    imageUrl,
    imageSource: imageUrl.includes('opengraph.githubassets.com') ? 'opengraph' : 'readme',
    stars,
    forks,
    openIssues: 0,
    primaryLanguage,
    languages: primaryLanguage ? [{ name: primaryLanguage, bytes: 100, percentage: 100 }] : [],
    topics,
    license: null,
    createdAt: now,
    updatedAt: now,
    pushedAt: now,
    latestRelease: null,
    addedAt: now,
    homepage: null,
    defaultBranch: 'main',
    readme: readmeText
  }

  const synth = buildDeterministicSpanishExplanations(partialRepo)
  partialRepo.shortExplanationEs = synth.shortExplanationEs
  partialRepo.longExplanationEs = synth.longExplanationEs
  partialRepo.explanation = synth.shortExplanationEs
  partialRepo.resourceType = synth.resourceType
  return partialRepo
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
      return await fetchGitHubRepositoryViaPublicHtmlFallback(owner, repo)
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

    const resourceType = inferResourceType(
      `${fullName} ${description} ${topics.join(' ')}`,
      [`https://github.com/${fullName}`],
      topics
    )

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

/**
 * Extracts CLI installation commands (npx, claude mcp add, uvx, pip, npm, docker, git clone)
 * and ready-to-paste MCP server JSON config from a repository's metadata and README.
 */
export function extractInstallAndSetupSnippets(
  repo: Partial<GalleryRepository> & { owner: string; name: string }
): InstallSnippetInfo {
  const fullName = `${repo.owner}/${repo.name}`
  const repoUrl = repo.url || `https://github.com/${fullName}`
  const combinedText = [
    repo.description || '',
    repo.shortExplanationEs || '',
    repo.longExplanationEs || '',
    repo.readme || ''
  ].join('\n')

  const foundCommands: string[] = []
  const cmdRegexes: Array<{ rx: RegExp; kind: InstallSnippetInfo['installKind'] }> = [
    { rx: /\b((?:npx|bunx)\s+(?:-y\s+)?[@a-zA-Z0-9_./-]+(?:\s+[a-zA-Z0-9_./-]+)*)/g, kind: 'npx' },
    { rx: /\b(claude\s+mcp\s+add\s+[^\r\n`"]+)/g, kind: 'mcp' },
    { rx: /\b(uvx\s+[@a-zA-Z0-9_./-]+(?:\s+[a-zA-Z0-9_./-]+)*)/g, kind: 'uv' },
    { rx: /\b(pip3?\s+install\s+(?:-U\s+)?[a-zA-Z0-9_.\-[\]]+(?:\s+[a-zA-Z0-9_.\-[\]]+)*)/g, kind: 'pip' },
    { rx: /\b((?:npm|pnpm|yarn|bun)\s+(?:install|i|add)\s+(?:-[gD]\s+)?[@a-zA-Z0-9_./-]+)/g, kind: 'npm' },
    { rx: /\b(cargo\s+install\s+[a-zA-Z0-9_-]+)/g, kind: 'cargo' },
    { rx: /\b(docker\s+(?:run|pull)\s+[^\r\n`"]+)/g, kind: 'docker' },
    { rx: /\b(git\s+clone\s+https?:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/g, kind: 'git' }
  ]

  let detectedKind: InstallSnippetInfo['installKind'] | null = null

  for (const { rx, kind } of cmdRegexes) {
    let m: RegExpExecArray | null
    while ((m = rx.exec(combinedText)) !== null) {
      const cmd = m[1].trim().replace(/[.,;]+$/, '')
      if (cmd.length >= 8 && cmd.length <= 140 && !foundCommands.includes(cmd)) {
        foundCommands.push(cmd)
        if (!detectedKind) detectedKind = kind
      }
    }
  }

  const isMcp =
    repo.resourceType === 'Servidor MCP o conector' ||
    /\bmcp\b/i.test(fullName) ||
    (repo.topics || []).some(t => /mcp/i.test(t))
  const isSkill =
    repo.resourceType === 'Skill' ||
    /\bskills?\b/i.test(fullName) ||
    (repo.topics || []).some(t => /skill/i.test(t))

  const gitCloneCmd = `git clone ${repoUrl}.git`
  if (!foundCommands.includes(gitCloneCmd)) {
    foundCommands.push(gitCloneCmd)
  }

  let primaryCommand = foundCommands[0] || gitCloneCmd
  let installKind: InstallSnippetInfo['installKind'] =
    detectedKind || (isMcp ? 'mcp' : isSkill ? 'skill' : 'git')

  let mcpConfigJson: string | undefined
  if (isMcp) {
    const serverKey = repo.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const npxMatch = foundCommands.find(c => c.startsWith('npx ') || c.startsWith('uvx '))
    if (npxMatch) {
      const parts = npxMatch.split(/\s+/)
      const cmdBin = parts[0]
      const args = parts.slice(1)
      mcpConfigJson = JSON.stringify(
        {
          mcpServers: {
            [serverKey]: {
              command: cmdBin,
              args: args.includes('-y') || cmdBin === 'uvx' ? args : ['-y', ...args]
            }
          }
        },
        null,
        2
      )
    } else {
      mcpConfigJson = JSON.stringify(
        {
          mcpServers: {
            [serverKey]: {
              command: 'npx',
              args: ['-y', `github:${fullName}`]
            }
          }
        },
        null,
        2
      )
    }
  }

  const category: NonNullable<InstallSnippetInfo['category']> = isMcp
    ? 'mcp'
    : isSkill
    ? 'skill'
    : detectedKind === 'npx' || detectedKind === 'npm'
    ? 'npm'
    : detectedKind === 'pip' || detectedKind === 'uv'
    ? 'pip'
    : detectedKind === 'docker'
    ? 'docker'
    : 'git'

  return {
    primaryCommand,
    commands: foundCommands.slice(0, 5),
    allCommands: foundCommands.slice(0, 5),
    mcpConfigJson,
    category,
    installKind
  }
}

/**
 * Fetch starred repositories for a GitHub username (`GET /users/{username}/starred`).
 */
export async function fetchUserStarredRepos(
  username: string,
  options: { page?: number; perPage?: number; token?: string | null } = {}
): Promise<GalleryRepository[]> {
  const cleanUser = (username || '').trim().replace(/^@/, '')
  if (!cleanUser) {
    throw new Error('Ingresá un nombre de usuario de GitHub válido.')
  }
  const page = Math.max(1, options.page || 1)
  const perPage = Math.min(100, Math.max(10, options.perPage || 40))
  const headers = getGitHubHeaders(options.token)

  const url = `https://api.github.com/users/${encodeURIComponent(
    cleanUser
  )}/starred?per_page=${perPage}&page=${page}&sort=created&direction=desc`

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(12000)
  })

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`No se encontró el usuario de GitHub "@${cleanUser}".`)
    }
    if (res.status === 403 || res.status === 429) {
      throw new Error(
        'Se alcanzó el límite de peticiones de GitHub API. Configurá tu Personal Access Token en Ajustes (Token & IA).'
      )
    }
    throw new Error(`Error al consultar GitHub Stars de @${cleanUser} (HTTP ${res.status}).`)
  }

  const items = await res.json()
  if (!Array.isArray(items)) return []

  return items.map((item: any) => {
    const owner = item.owner?.login || cleanUser
    const name = item.name || 'repo'
    const fullName = item.full_name || `${owner}/${name}`
    const topics = Array.isArray(item.topics) ? item.topics : []
    const partial: GalleryRepository = {
      id: Number(item.id) || numericIdFromFullName(fullName),
      owner,
      name,
      fullName,
      url: item.html_url || `https://github.com/${fullName}`,
      avatarUrl: item.owner?.avatar_url || `https://github.com/${owner}.png?size=128`,
      description: item.description || 'Sin descripción provista.',
      explanation: item.description || 'Sin descripción provista.',
      imageUrl: `https://opengraph.githubassets.com/1/${owner}/${name}`,
      imageSource: 'opengraph',
      stars: item.stargazers_count ?? 0,
      forks: item.forks_count ?? 0,
      openIssues: item.open_issues_count ?? 0,
      primaryLanguage: item.language || null,
      languages: item.language ? [{ name: item.language, bytes: 100, percentage: 100 }] : [],
      topics,
      license: item.license?.spdx_id || item.license?.name || null,
      createdAt: item.created_at || new Date().toISOString(),
      updatedAt: item.updated_at || new Date().toISOString(),
      pushedAt: item.pushed_at || item.updated_at || new Date().toISOString(),
      latestRelease: null,
      addedAt: new Date().toISOString(),
      homepage: item.homepage || null,
      defaultBranch: item.default_branch || 'main'
    }
    const synth = buildDeterministicSpanishExplanations(partial)
    partial.shortExplanationEs = synth.shortExplanationEs
    partial.longExplanationEs = synth.longExplanationEs
    partial.explanation = synth.shortExplanationEs
    partial.resourceType = synth.resourceType
    return partial
  })
}

/**
 * Generates a side-by-side comparative analysis in Spanish across 2 to 4 repositories.
 */
export async function compareRepositoriesServer(
  repos: GalleryRepository[],
  providerId?: AiProviderId,
  model?: string
): Promise<string> {
  if (!Array.isArray(repos) || repos.length < 2) {
    return 'Seleccioná al menos 2 repositorios para compararlos.'
  }

  const promptItems = repos
    .map((r, i) => {
      const install = extractInstallAndSetupSnippets(r)
      return [
        `${i + 1}. ${r.fullName} (${r.url})`,
        `   - Tipo: ${r.resourceType || 'Repositorio'}`,
        `   - Lenguaje: ${r.primaryLanguage || 'Multi-lenguaje'}`,
        `   - Estrellas: ${r.stars} | Forks: ${r.forks} | Issues: ${r.openIssues}`,
        `   - Licencia: ${r.license || 'No especificada'}`,
        `   - Última actividad: ${r.pushedAt || r.updatedAt}`,
        `   - Comando principal: ${install.primaryCommand}`,
        `   - Propósito: ${r.shortExplanationEs || r.description}`
      ].join('\n')
    })
    .join('\n\n')

  if (providerId !== 'local_rules' && providerId !== 'deterministic') {
    const llmText = await generateTextWithConfiguredProvider({
      system:
        'Eres un arquitecto de software e IA experto. Compara los repositorios de GitHub dados en español claro, estructurado y práctico para ayudar al usuario a elegir cuál usar en su proyecto.',
      messages: [
        {
          role: 'user',
          content: `Compara estos ${repos.length} repositorios de GitHub:\n\n${promptItems}\n\nIncluye:\n1. Diferencia clave de enfoque entre ellos.\n2. Madurez, actividad y licencia.\n3. Recomendación directa ("Cuándo elegir cada uno").`
        }
      ],
      providerId,
      model
    })
    if (llmText) return llmText
  }

  // Deterministic structured comparison in Spanish
  const sortedByStars = [...repos].sort((a, b) => (b.stars || 0) - (a.stars || 0))
  const sortedByRecent = [...repos].sort(
    (a, b) =>
      new Date(b.pushedAt || b.updatedAt || 0).getTime() -
      new Date(a.pushedAt || a.updatedAt || 0).getTime()
  )

  const lines: string[] = []
  lines.push(`### Dictamen Comparativo (${repos.map(r => r.fullName).join(' vs ')})`)
  lines.push('')
  lines.push(
    `- **Mayor adopción y comunidad:** **${sortedByStars[0].fullName}** (${
      sortedByStars[0].stars > 0
        ? `★ ${sortedByStars[0].stars.toLocaleString()} estrellas`
        : 'referenciado en tus guardados'
    }).`
  )
  lines.push(
    `- **Mantenimiento más reciente:** **${sortedByRecent[0].fullName}** (última actualización registrada: ${formatDateEs(
      sortedByRecent[0].pushedAt || sortedByRecent[0].updatedAt
    )}).`
  )
  lines.push('')
  lines.push('#### Cuándo elegir cada repositorio:')
  for (const r of repos) {
    const snippet = extractInstallAndSetupSnippets(r)
    const permissive =
      r.license && /mit|apache|bsd|isc/i.test(r.license)
        ? `Licencia permisiva (${r.license}) apta para productos comerciales.`
        : r.license
        ? `Licencia ${r.license}.`
        : 'Verificar archivo LICENSE en el repo.'
    lines.push(
      `- **${r.fullName}** (*${r.resourceType || 'Repositorio'}*${
        r.primaryLanguage ? ` · ${r.primaryLanguage}` : ''
      }): Ideal si buscás **${
        r.shortExplanationEs || r.description
      }**. ${permissive} Instalación rápida: \`${snippet.primaryCommand}\`.`
    )
  }

  return lines.join('\n')
}

/**
 * Builds a complete, structured Master Prompt (PROMPT_MAESTRO.md / CLAUDE.md / AGENTS.md)
 * from a ProjectBlueprint, its selected GitHub repositories, and any linked saved bookmarks.
 */
export function generateProjectMasterPrompt(params: {
  blueprint: ProjectBlueprint
  repos: GalleryRepository[]
  bookmarks?: BookmarkItem[]
}): string {
  const { blueprint, repos, bookmarks = [] } = params
  const selectedSet = new Set((blueprint.repoFullNames || []).map(n => n.toLowerCase()))
  const chosenRepos = repos.filter(r => selectedSet.has(r.fullName.toLowerCase()))

  const bmById = new Map<string, BookmarkItem>()
  for (const b of bookmarks) bmById.set(b.id, b)

  const out: string[] = []
  out.push(`# PROMPT MAESTRO DE CONSTRUCCIÓN — ${blueprint.name}`)
  out.push(
    `> **Instrucción directa para el Agente Programador (Claude Code / Cursor / Antigravity / Codex)**`
  )
  out.push(
    `> Utilizá este documento de arquitectura y los repositorios seleccionados de mi catálogo como base técnica obligatoria para construir o integrar este proyecto.`
  )
  out.push('')
  out.push(`## 1. Visión y Objetivo del Proyecto`)
  out.push(`- **Nombre del proyecto:** ${blueprint.name}`)
  if (blueprint.description) {
    out.push(`- **Descripción:** ${blueprint.description}`)
  }
  if (blueprint.goal) {
    out.push(`- **Objetivo técnico principal:** ${blueprint.goal}`)
  }
  if (blueprint.notes) {
    out.push(`- **Notas y restricciones de diseño:** ${blueprint.notes}`)
  }
  out.push('')
  out.push(`## 2. Stack de Repositorios, Skills y Servidores MCP Seleccionados (${chosenRepos.length})`)
  out.push('')

  if (chosenRepos.length === 0) {
    out.push(`*(Aún no se seleccionaron repositorios para este proyecto).*`)
  } else {
    out.push(`| Repositorio | Tipo | Lenguaje | Estrellas | Propósito en el proyecto |`)
    out.push(`| :--- | :--- | :--- | :--- | :--- |`)
    for (const r of chosenRepos) {
      out.push(
        `| [**${r.fullName}**](${r.url}) | ${r.resourceType || 'Repositorio'} | ${
          r.primaryLanguage || 'Multi'
        } | ${r.stars > 0 ? `★ ${r.stars.toLocaleString()}` : '—'} | ${(
          r.shortExplanationEs || r.description
        ).replace(/\|/g, '·')} |`
      )
    }
    out.push('')
    out.push(`## 3. Ficha de Integración e Instalación por Repositorio`)
    out.push('')

    chosenRepos.forEach((r, idx) => {
      const setup = extractInstallAndSetupSnippets(r)
      out.push(`### 3.${idx + 1}. ${r.fullName} — [${r.resourceType || 'Repositorio'}]`)
      out.push(`- **URL oficial:** ${r.url}`)
      if (r.homepage) out.push(`- **Sitio / Documentación:** ${r.homepage}`)
      if (r.primaryLanguage) out.push(`- **Lenguaje principal:** ${r.primaryLanguage}`)
      if (r.license) out.push(`- **Licencia:** ${r.license}`)
      out.push(`- **Qué es y para qué sirve:** ${r.shortExplanationEs || r.description}`)
      if (r.longExplanationEs && r.longExplanationEs !== r.shortExplanationEs) {
        out.push(`- **Detalle técnico:** ${r.longExplanationEs.replace(/\n+/g, ' ')}`)
      }
      if (r.notes) {
        out.push(`- **Notas de uso:** ${r.notes}`)
      }
      out.push(`- **Comando de instalación / clonado:**`)
      out.push('```bash')
      out.push(setup.primaryCommand)
      out.push('```')
      if (setup.mcpConfigJson) {
        out.push(`- **Configuración MCP sugerida (\`mcp.json\`):**`)
        out.push('```json')
        out.push(setup.mcpConfigJson)
        out.push('```')
      }

      // Include context from linked saved posts if present
      const linkedBms = (r.linkedBookmarkIds || [])
        .map(id => bmById.get(id))
        .filter((b): b is BookmarkItem => Boolean(b && b.platform !== 'github'))

      if (linkedBms.length > 0) {
        out.push(`- **Contexto capturado de mis guardados (${linkedBms.length}):**`)
        for (const bm of linkedBms.slice(0, 2)) {
          out.push(
            `  - *${bm.authorName} (${bm.authorHandle}) en ${bm.platform.toUpperCase()}*: "${bm.caption
              .replace(/\s+/g, ' ')
              .slice(0, 280)}..."`
          )
        }
      }
      out.push('')
    })
  }

  out.push(`## 4. Plan de Ejecución para el Agente`)
  out.push(
    `1. **Inspeccionar y preparar dependencias:** Revisar los repositorios listados arriba, verificar compatibilidad de licencias y lenguajes, e instalar las Skills o Servidores MCP necesarios.`
  )
  out.push(
    `2. **Diseñar la arquitectura:** Integrar los componentes reutilizando los módulos existentes sin duplicar lógica.`
  )
  out.push(
    `3. **Implementar y verificar:** Construir el flujo de punta a punta y validar con pruebas automatizadas.`
  )

  return out.join('\n')
}

export const KNOWN_GITHUB_ORGANIZATIONS: Record<
  string,
  { name: string; kind: RepoAgentEvaluation['creatorKind'] }
> = {
  anthropics: { name: 'Anthropic (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  modelcontextprotocol: {
    name: 'Model Context Protocol (Anthropic / Estándar Abierto)',
    kind: 'Organización Open Source'
  },
  openai: { name: 'OpenAI (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  google: { name: 'Google (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  'google-gemini': { name: 'Google Gemini (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  'google-deepmind': { name: 'Google DeepMind (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  googleapis: { name: 'Google Cloud / APIs (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  firebase: { name: 'Firebase / Google (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  microsoft: { name: 'Microsoft (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  facebook: { name: 'Meta (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  facebookresearch: { name: 'Meta AI Research (FAIR)', kind: 'Empresa / Laboratorio Oficial' },
  'meta-llama': { name: 'Meta Llama (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  vercel: { name: 'Vercel (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  'vercel-labs': { name: 'Vercel Labs (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  cloudflare: { name: 'Cloudflare (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  huggingface: { name: 'Hugging Face (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  'langchain-ai': { name: 'LangChain (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  'run-llama': { name: 'LlamaIndex (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  'browser-use': { name: 'Browser Use (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  qwenlm: { name: 'Alibaba Cloud / Qwen (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  'deepseek-ai': { name: 'DeepSeek AI (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  mistralai: { name: 'Mistral AI (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  ollama: { name: 'Ollama (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  'vllm-project': { name: 'vLLM Project', kind: 'Organización Open Source' },
  ggerganov: { name: 'Georgi Gerganov (llama.cpp / GGML)', kind: 'Organización Open Source' },
  'ggml-org': { name: 'GGML Organization (llama.cpp)', kind: 'Organización Open Source' },
  pydantic: { name: 'Pydantic (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  crewaiinc: { name: 'CrewAI (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  'n8n-io': { name: 'n8n (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  langgenius: { name: 'Dify / LangGenius (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  'open-webui': { name: 'Open WebUI', kind: 'Organización Open Source' },
  'all-hands-ai': { name: 'All Hands AI (OpenHands)', kind: 'Empresa / Laboratorio Oficial' },
  'remotion-dev': { name: 'Remotion (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  'shadcn-ui': { name: 'shadcn / Vercel', kind: 'Organización Open Source' },
  tailwindlabs: { name: 'Tailwind Labs (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  supabase: { name: 'Supabase (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  neondatabase: { name: 'Neon Serverless Postgres', kind: 'Empresa / Laboratorio Oficial' },
  stripe: { name: 'Stripe (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  apify: { name: 'Apify (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  firecrawl: { name: 'Firecrawl / Mendable', kind: 'Empresa / Laboratorio Oficial' },
  mendableai: { name: 'Firecrawl / Mendable AI', kind: 'Empresa / Laboratorio Oficial' },
  exa: { name: 'Exa AI', kind: 'Empresa / Laboratorio Oficial' },
  'exa-labs': { name: 'Exa Labs (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  elevenlabs: { name: 'ElevenLabs (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  livekit: { name: 'LiveKit (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  pipecat: { name: 'Pipecat / Daily.co', kind: 'Organización Open Source' },
  'pipecat-ai': { name: 'Pipecat AI / Daily', kind: 'Empresa / Laboratorio Oficial' },
  comfyanonymous: { name: 'ComfyUI (Comfyanonymous)', kind: 'Organización Open Source' },
  'comfy-org': { name: 'Comfy Org (Oficial)', kind: 'Organización Open Source' },
  ultralytics: { name: 'Ultralytics (YOLO)', kind: 'Empresa / Laboratorio Oficial' },
  apple: { name: 'Apple (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  nvidia: { name: 'NVIDIA (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  aws: { name: 'Amazon Web Services (AWS)', kind: 'Empresa / Laboratorio Oficial' },
  awslabs: { name: 'AWS Labs (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  cohere: { name: 'Cohere (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  groq: { name: 'Groq (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  togethercomputer: { name: 'Together AI (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  replicate: { name: 'Replicate (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  modal: { name: 'Modal Labs', kind: 'Empresa / Laboratorio Oficial' },
  'modal-labs': { name: 'Modal Labs (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  cursor: { name: 'Cursor / Anysphere', kind: 'Empresa / Laboratorio Oficial' },
  getcursor: { name: 'Cursor / Anysphere', kind: 'Empresa / Laboratorio Oficial' },
  'continue-dev': { name: 'Continue.dev', kind: 'Organización Open Source' },
  'cline-bot': { name: 'Cline (Oficial)', kind: 'Organización Open Source' },
  cline: { name: 'Cline (Oficial)', kind: 'Organización Open Source' },
  'roo-cline': { name: 'Roo Code', kind: 'Organización Open Source' },
  roocodeinc: { name: 'Roo Code (Oficial)', kind: 'Empresa / Laboratorio Oficial' },
  aider: { name: 'Aider AI Pair Programmer', kind: 'Organización Open Source' },
  'paul-gauthier': { name: 'Paul Gauthier (Aider)', kind: 'Autor / Comunidad Independiente' },
  karpathy: { name: 'Andrej Karpathy', kind: 'Autor / Comunidad Independiente' },
  rasbt: { name: 'Sebastian Raschka (LLMs from Scratch)', kind: 'Autor / Comunidad Independiente' },
  pbakaus: { name: 'Paul Bakaus (AI & Skills Engineering)', kind: 'Autor / Comunidad Independiente' },
  ebookfoundation: { name: 'Free Ebook Foundation', kind: 'Organización Open Source' },
  kamranahmedse: { name: 'roadmap.sh (Kamran Ahmed)', kind: 'Organización Open Source' },
  'codecrafters-io': { name: 'CodeCrafters', kind: 'Organización Open Source' },
  donnemartin: { name: 'Donne Martin (System Design)', kind: 'Autor / Comunidad Independiente' },
  jwasham: { name: 'John Washam (Coding Interview University)', kind: 'Autor / Comunidad Independiente' },
  public_apis: { name: 'Public APIs Collective', kind: 'Organización Open Source' },
  'public-apis': { name: 'Public APIs Collective', kind: 'Organización Open Source' },
  punkpeye: { name: 'Frank Fiegel (Glama / MCP Ecosystem)', kind: 'Organización Open Source' }
}

/**
 * Agent Classifier & Rich Evaluation Engine for GitHub Repositories and Tools.
 * Produces structured, domain-specific metadata in Spanish for every repository
 * so both the in-app views and the Master Excel Export have complete intelligence.
 */
export function evaluateAndClassifyRepository(
  repo: GalleryRepository,
  linkedBookmarks: BookmarkItem[] = []
): RepoAgentEvaluation {
  const ownerLower = (repo.owner || '').toLowerCase()
  const nameLower = (repo.name || '').toLowerCase()
  const fullName = repo.fullName || `${repo.owner}/${repo.name}`

  const linkedForRepo = linkedBookmarks.filter(bm => {
    if ((repo.linkedBookmarkIds || []).includes(bm.id)) return true
    if (bm.id === `github:${fullName.toLowerCase()}`) return true
    return (bm.resources || []).some(
      r => (r.fullName || '').toLowerCase() === fullName.toLowerCase()
    )
  })

  const nonSyntheticBms = linkedForRepo.filter(bm => bm.platform !== 'github')
  const singleRepoBms = nonSyntheticBms.filter(
    bm => (bm.resources || []).filter(r => r.kind === 'github_repo').length <= 2
  )

  // 1. Qué es y para qué sirve (whatIsItEs)
  const synth = buildDeterministicSpanishExplanations(repo)
  const rType = repo.resourceType || synth.resourceType
  let whatIsItEs = (
    !isGenericRepoDescription(repo.shortExplanationEs)
      ? repo.shortExplanationEs
      : !isGenericRepoDescription(repo.explanation)
      ? repo.explanation
      : synth.shortExplanationEs
  )?.trim() || ''

  if (isGenericRepoDescription(whatIsItEs) && singleRepoBms.length > 0) {
    const bestBm = singleRepoBms.find(b => b.purpose && b.purpose.length > 25) || singleRepoBms[0]
    if (bestBm?.purpose) {
      whatIsItEs = bestBm.purpose
    } else if (bestBm?.caption) {
      whatIsItEs = bestBm.caption.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 240)
    }
  }
  if (!whatIsItEs) {
    whatIsItEs = synth.shortExplanationEs
  }

  // 2. De qué área es (areaCategory)
  const combinedSignal = [
    fullName,
    whatIsItEs,
    !isGenericRepoDescription(repo.description) ? repo.description || '' : '',
    ...(repo.topics || []),
    ...singleRepoBms.flatMap(b => b.topics || []),
    ...singleRepoBms.map(b => b.caption || '')
  ]
    .join(' ')
    .toLowerCase()

  let areaCategory = 'Ingeniería de Software & Open Source'
  if (
    rType === 'Skill' ||
    rType === 'Servidor MCP o conector' ||
    rType === 'Agente o workflow' ||
    /\b(mcp|model-context-protocol|skill|skills|claude-code|cursor|agent|agents|agente|agentes|subagent|multi-agent|crewai|autogen|langgraph|swarm|openhands|cline|aider|codex|antigravity)\b/i.test(
      combinedSignal
    )
  ) {
    areaCategory = 'Agentes Autónomos, Skills & MCP'
  } else if (
    /\b(tts|stt|voice|voz|speech|audio|whisper|kokoro|cosyvoice|openvoice|video|remotion|ffmpeg|comfyui|diffusion|imagen|avatar|lipsync|multimedia|sound|music)\b/i.test(
      combinedSignal
    )
  ) {
    areaCategory = 'Voz, Audio, Video & Multimodal'
  } else if (
    /\b(rag|vector|embedding|embeddings|database|postgres|sqlite|supabase|redis|memory|memoria|knowledge-graph|scraping|crawler|firecrawl|pdf|ocr|dataset|datos)\b/i.test(
      combinedSignal
    )
  ) {
    areaCategory = 'Datos, RAG, Memoria & Scraping'
  } else if (
    /\b(browser|playwright|puppeteer|selenium|automation|automatizaci[oó]n|n8n|workflow|cron|bot|whatsapp|telegram)\b/i.test(
      combinedSignal
    )
  ) {
    areaCategory = 'Automatización, Browser & Bots'
  } else if (
    /\b(ui|ux|frontend|react|nextjs|tailwind|shadcn|css|design|dise[ñn]o|shader|shaders|webgl|threejs|canvas|animation|figma|component)\b/i.test(
      combinedSignal
    )
  ) {
    areaCategory = 'Frontend, UI, Shaders & Diseño'
  } else if (
    /\b(security|seguridad|pentest|audit|reverse-engineering|reverse|decompile|malware|vulnerability|osint|auth|crypto)\b/i.test(
      combinedSignal
    )
  ) {
    areaCategory = 'Seguridad, Auditoría & Ingeniería Inversa'
  } else if (
    rType === 'Artículo, tutorial, investigación o material educativo' ||
    /\b(roadmap|book|books|interview|course|curso|tutorial|awesome|cookbook|from-scratch|beginners|handbook|gu[ií]a)\b/i.test(
      combinedSignal
    )
  ) {
    areaCategory = 'Educación, Roadmaps & Guías Técnicas'
  } else if (
    rType === 'Modelo o dataset' ||
    /\b(llm|llms|gpt|claude|gemini|deepseek|qwen|llama|mistral|ollama|vllm|inference|fine-tuning|transformer|pytorch|ai|inteligencia artificial)\b/i.test(
      combinedSignal
    )
  ) {
    areaCategory = 'IA Generativa, LLMs & Inferencia'
  } else if (/\b(cli|terminal|devtools|ide|sdk|compiler|linter|docker|kubernetes|git|shell)\b/i.test(combinedSignal)) {
    areaCategory = 'DevTools, CLI & Productividad'
  }

  // 3. Qué empresa u organización lo hace (companyOrAuthor & creatorKind)
  const knownOrg = KNOWN_GITHUB_ORGANIZATIONS[ownerLower]
  let companyOrAuthor = `@${repo.owner}`
  let creatorKind: RepoAgentEvaluation['creatorKind'] = 'Autor / Comunidad Independiente'

  if (knownOrg) {
    companyOrAuthor = knownOrg.name
    creatorKind = knownOrg.kind
  } else if (
    /(?:-ai|-labs|-dev|-org|-inc|-team|-hq|-io|labs|official|foundation|project|research|studio)$/i.test(
      ownerLower
    )
  ) {
    const cleanOrgTitle = repo.owner
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
    companyOrAuthor = `${cleanOrgTitle} (Organización)`
    creatorKind = 'Organización Open Source'
  } else {
    companyOrAuthor = `@${repo.owner} (Comunidad Open Source)`
    creatorKind = 'Autor / Comunidad Independiente'
  }

  // 4. Licencia y Seguridad (securityGrade, securitySummary, licenseSummary)
  const lic = (repo.license || '').trim()
  const isPermissiveLicense = Boolean(lic && /mit|apache|bsd|isc|0bsd|unlicense|cc0/i.test(lic))
  const isCopyleftLicense = Boolean(lic && /gpl|agpl|lgpl|mpl/i.test(lic))

  let licenseSummary = 'Sin licencia declarada (revisar repositorio antes de uso comercial)'
  if (isPermissiveLicense) {
    licenseSummary = `${lic} (Permisiva — Apta para uso comercial y privado)`
  } else if (isCopyleftLicense) {
    licenseSummary = `${lic} (Copyleft — Revisar obligaciones de distribución)`
  } else if (lic && lic !== 'NOASSERTION') {
    licenseSummary = `${lic} (Verificar términos específicos)`
  }

  const executesCommandsOrHooks =
    rType === 'Servidor MCP o conector' ||
    rType === 'Skill' ||
    rType === 'Agente o workflow' ||
    /\b(shell|bash|exec|terminal|browser|playwright|automation|proxy|scraper)\b/i.test(combinedSignal)

  let securityGrade: RepoAgentEvaluation['securityGrade'] = 'Medio'
  const securityNotes: string[] = []

  if (
    (creatorKind === 'Empresa / Laboratorio Oficial' || (repo.stars || 0) >= 2500) &&
    isPermissiveLicense
  ) {
    securityGrade = 'Alto'
    securityNotes.push(
      `Respaldado por ${
        creatorKind === 'Empresa / Laboratorio Oficial' ? companyOrAuthor : `alta tracción (★ ${(repo.stars || 0).toLocaleString()})`
      }`
    )
    securityNotes.push(`licencia permisiva ${lic}`)
    if (executesCommandsOrHooks) {
      securityNotes.push('revisar alcances de red/archivos al conectar como MCP/Skill')
    }
  } else if ((repo.stars || 0) === 0 && !knownOrg && !lic) {
    securityGrade = 'Precaución'
    securityNotes.push('Aún no enriquecido con métricas de API o sin licencia explícita')
    if (executesCommandsOrHooks) {
      securityNotes.push('ejecuta herramientas de agente/CLI: auditar código antes de dar acceso al sistema')
    }
  } else {
    securityGrade = 'Medio'
    if (knownOrg) securityNotes.push(`Creador reconocido (${companyOrAuthor})`)
    else if ((repo.stars || 0) > 0) securityNotes.push(`Comunidad activa (★ ${(repo.stars || 0).toLocaleString()})`)
    if (isPermissiveLicense) securityNotes.push(`licencia ${lic}`)
    else if (!lic) securityNotes.push('sin licencia SPDX explícita')
    if (executesCommandsOrHooks) {
      securityNotes.push('requiere permisos de agente/CLI (usar en entorno controlado)')
    }
  }

  const securitySummary = `${securityGrade}: ${securityNotes.join(' · ')}.`

  // 5. Puntaje Atlas (1.0 - 10.0)
  let score = 6.2
  const stars = Number(repo.stars) || 0
  if (stars >= 50000) score += 2.6
  else if (stars >= 15000) score += 2.3
  else if (stars >= 5000) score += 2.0
  else if (stars >= 1000) score += 1.6
  else if (stars >= 250) score += 1.2
  else if (stars >= 50) score += 0.8
  else if (stars > 0) score += 0.4

  if (creatorKind === 'Empresa / Laboratorio Oficial') score += 0.6
  else if (creatorKind === 'Organización Open Source') score += 0.3

  if (isPermissiveLicense) score += 0.4
  if (repo.readme && repo.readme.length > 400) score += 0.3
  if (nonSyntheticBms.length > 0) score += Math.min(0.6, nonSyntheticBms.length * 0.25)
  if (
    rType === 'Skill' ||
    rType === 'Servidor MCP o conector' ||
    rType === 'Agente o workflow'
  ) {
    score += 0.3
  }

  // Freshness check
  const activity = getActivityStatus(repo.pushedAt || repo.updatedAt)
  if (activity.daysAgo <= 30) score += 0.2
  else if (activity.daysAgo > 365 && stars < 1000) score -= 0.4

  const atlasScore = Math.round(Math.min(9.9, Math.max(5.0, score)) * 10) / 10
  const scoreTier =
    atlasScore >= 9.0
      ? 'Imprescindible / Top Tier'
      : atlasScore >= 8.0
      ? 'Muy Recomendado'
      : atlasScore >= 7.0
      ? 'Sólido / Útil'
      : 'En observación / Nicho'
  const atlasScoreLabel = `${atlasScore.toFixed(1)} / 10 (${scoreTier})`

  // 6. Nivel de Madurez & Complejidad de Integración
  let maturityLevel: RepoAgentEvaluation['maturityLevel'] = 'Referencia en guardados'
  if (stars >= 3000 || (creatorKind === 'Empresa / Laboratorio Oficial' && stars >= 300)) {
    maturityLevel = 'Producción / Consolidado'
  } else if (stars >= 100) {
    maturityLevel = 'En crecimiento activo'
  } else if (stars > 0) {
    maturityLevel = 'Experimental / Reciente'
  }

  const installInfo = extractInstallAndSetupSnippets(repo)
  let integrationComplexity: RepoAgentEvaluation['integrationComplexity'] = 'Media (Configuración estándar)'
  if (
    rType === 'Skill' ||
    rType === 'Servidor MCP o conector' ||
    rType === 'Artículo, tutorial, investigación o material educativo' ||
    installInfo.primaryCommand.startsWith('npx ') ||
    installInfo.primaryCommand.startsWith('uvx ')
  ) {
    integrationComplexity = 'Baja (Plug & Play / 1-Clic)'
  } else if (
    /\b(docker|kubernetes|cuda|gpu|self-hosted|cluster|postgres)\b/i.test(combinedSignal) &&
    rType !== 'Librería, framework o SDK'
  ) {
    integrationComplexity = 'Alta (Infraestructura / Custom)'
  }

  // 7. Para qué Proyecto Sirve (projectUseCases)
  const useCases: string[] = []
  if (rType === 'Skill') {
    useCases.push('Potenciar tus agentes de programación (Claude Code, Cursor, Antigravity, Codex) con instrucciones especializadas')
  } else if (rType === 'Servidor MCP o conector') {
    useCases.push('Conectar herramientas externas, datos en vivo o automatización a tu agente mediante Model Context Protocol (MCP)')
  } else if (rType === 'Agente o workflow') {
    useCases.push('Construir sistemas multi-agente autónomos, pipelines de investigación o automatización de tareas complejas')
  } else if (areaCategory === 'Voz, Audio, Video & Multimodal') {
    useCases.push('Proyectos de generación de voz/TTS, transcripción en tiempo real, edición programática de video o avatares IA')
  } else if (areaCategory === 'Datos, RAG, Memoria & Scraping') {
    useCases.push('Sistemas RAG (“Segundo Cerebro”), extracción estructurada de sitios web para LLMs o memoria persistente de agentes')
  } else if (areaCategory === 'Frontend, UI, Shaders & Diseño') {
    useCases.push('Interfaces web modernas en Next.js/React, dashboards interactivos, efectos visuales o sistemas de diseño')
  } else if (areaCategory === 'Automatización, Browser & Bots') {
    useCases.push('Agentes que navegan la web automáticamente, bots de WhatsApp/Telegram o flujos de trabajo sin intervención humana')
  } else if (areaCategory === 'Educación, Roadmaps & Guías Técnicas') {
    useCases.push('Base de conocimiento, referencia de arquitectura de sistemas y capacitación en ingeniería de IA')
  } else {
    useCases.push(`Integrar como ${rType.toLowerCase()} en proyectos de ${areaCategory.toLowerCase()}`)
  }

  if (nameLower.includes('awesome')) {
    useCases.unshift('Explorar y descubrir decenas de herramientas curadas del ecosistema para elegir tu stack')
  }

  const projectUseCases = useCases.join('; ')

  // 8. Estado de Verificación y Fuentes
  const platforms = new Set<string>()
  for (const b of nonSyntheticBms) {
    if (b.platform === 'x') platforms.add('X/Twitter')
    else if (b.platform === 'whatsapp') platforms.add('WhatsApp')
    else if (b.platform === 'instagram') platforms.add('Instagram')
  }
  if (platforms.size === 0) {
    platforms.add('Catálogo / Lista GitHub')
  }
  if ((repo.notes || '').toLowerCase().includes('cazador') || (repo.notes || '').toLowerCase().includes('hunter')) {
    platforms.add('Cazador Profundo')
  }

  const verificationStatusLabel =
    stars > 0 || (repo.readme && repo.readme.length > 50)
      ? 'Verificado con GitHub API (Métricas en vivo)'
      : nonSyntheticBms.length > 0
      ? 'Confirmado en tus Guardados (Listo para enriquecer)'
      : 'Registrado en Catálogo Local'

  return {
    whatIsItEs,
    areaCategory,
    companyOrAuthor,
    creatorKind,
    atlasScore,
    atlasScoreLabel,
    securityGrade,
    securitySummary,
    projectUseCases,
    maturityLevel,
    integrationComplexity,
    licenseSummary,
    verificationStatusLabel,
    sourcesSummary: Array.from(platforms).join(' + ')
  }
}

/**
 * Super-Extractor of GitHub Repositories from:
 * - Any raw text / Markdown / CSV / JSON / shorthand `owner/repo` list
 * - A GitHub Awesome List repository URL (`https://github.com/owner/awesome-...`) by fetching its README
 * - Any external web page / blog / documentation URL that lists GitHub repositories
 */
export async function extractRepositoriesFromAnyListOrPage(params: {
  text?: string
  pageUrl?: string
  token?: string | null
}): Promise<{
  extracted: ExtractedRepoUrl[]
  sourceLabel: string
}> {
  const combinedMap = new Map<string, ExtractedRepoUrl>()
  let sourceLabel = 'Lista de texto'

  const addExtracted = (list: ExtractedRepoUrl[]) => {
    for (const item of list) {
      const key = `${item.owner.toLowerCase()}/${item.repo.toLowerCase()}`
      const existing = combinedMap.get(key)
      if (!existing || (!existing.contextHint && item.contextHint)) {
        combinedMap.set(key, item)
      }
    }
  }

  if (params.text && params.text.trim()) {
    addExtracted(extractGitHubUrlsFromText(params.text, true))
  }

  const rawPageUrl = (params.pageUrl || '').trim()
  if (rawPageUrl) {
    sourceLabel = rawPageUrl
    const parsedGh = parseGitHubUrl(rawPageUrl)
    if (parsedGh) {
      // It's a GitHub repo URL (e.g. an Awesome list like punkpeye/awesome-mcp-servers!)
      // Fetch its README and extract all repositories referenced inside it!
      const readme = await fetchRepositoryReadme(parsedGh.owner, parsedGh.repo, params.token)
      if (readme) {
        sourceLabel = `Awesome List / README (${parsedGh.owner}/${parsedGh.repo})`
        addExtracted(extractGitHubUrlsFromText(readme, false))
      }
      // Also include the repo itself if it wasn't just a container, or keep it at the top
      addExtracted([
        {
          owner: parsedGh.owner,
          repo: parsedGh.repo,
          cleanUrl: `https://github.com/${parsedGh.owner}/${parsedGh.repo}`,
          originalMatch: rawPageUrl,
          contextHint: `Repositorio contenedor / Lista principal (${parsedGh.owner}/${parsedGh.repo})`
        }
      ])
    } else if (/^https?:\/\//i.test(rawPageUrl)) {
      try {
        const res = await fetch(rawPageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'text/html,text/plain,text/markdown,*/*'
          },
          signal: AbortSignal.timeout(10000)
        })
        if (res.ok) {
          const bodyText = (await res.text()).slice(0, 250000)
          addExtracted(extractGitHubUrlsFromText(bodyText, false))
        }
      } catch {
        // Fallback to extracting from the URL string itself
      }
    }
  }

  return {
    extracted: Array.from(combinedMap.values()),
    sourceLabel
  }
}


