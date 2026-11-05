import { createHash } from 'node:crypto'
import type {
  AnalysisState,
  BookmarkItem,
  LinkedResource,
  LinkedResourceKind,
  ResourceType,
  VerificationStatus
} from './types'

export const CANONICAL_RESOURCE_TYPES: ResourceType[] = [
  'Aplicación o herramienta',
  'Librería, framework o SDK',
  'Skill',
  'Servidor MCP o conector',
  'Agente o workflow',
  'Modelo o dataset',
  'Artículo, tutorial, investigación o material educativo',
  'Idea o proyecto',
  'Otro / pendiente de clasificar'
]

const NON_REPO_GITHUB_SEGMENTS = new Set([
  'search',
  'topics',
  'trending',
  'explore',
  'orgs',
  'organizations',
  'settings',
  'marketplace',
  'features',
  'pricing',
  'login',
  'join',
  'about',
  'collections',
  'events',
  'sponsors',
  'notifications',
  'pulls',
  'issues',
  'codespaces',
  'copilot',
  'security',
  ' enterprise',
  'readme',
  'customer-stories'
])

const CLICKBAIT_PREFIX_PATTERNS = [
  /^(?:🚨|🔥|⚡|🤯|👀|🧵|💡|⚠️|📌|\s)+/u,
  /^(?:this is (?:pure )?(?:f\*cking |fucking |free )?(?:treasure|gold|wild|insane|crazy)[.!,:\s-]*)/i,
  /^(?:this is completely (?:f\*cking |fucking )?(?:wild|insane|crazy)[.!,:\s-]*)/i,
  /^(?:esto es (?:una )?(?:mina de oro|oro puro|una locura)[.!,:\s-]*)/i,
  /^(?:esto deber[ií]a ser ilegal[.!,:\s-]*)/i,
  /^(?:breaking:\s*)/i,
  /^(?:卧槽[^，,。!！]*[，,。!！]+\s*)/u,
  /^(?:さすがにヤバすぎ[wW!！\s]*)/u
]

export function cleanUrlString(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''
  const trimmed = raw.trim().replace(/[),.;!?>\]'"]+$/, '')
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.href
  } catch {
    return ''
  }
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '127.0.0.1' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false
    }
    const m172 = host.match(/^172\.(\d+)\./)
    if (m172) {
      const second = Number(m172[1])
      if (second >= 16 && second <= 31) return false
    }
    return true
  } catch {
    return false
  }
}

export interface ParsedGitHubUrl {
  kind: 'github_repo' | 'github_other'
  canonicalUrl: string
  originalUrl: string
  owner?: string
  repo?: string
  fullName?: string
  subpath?: string
}

export function classifyGitHubUrl(rawUrl: string): ParsedGitHubUrl | null {
  const cleaned = cleanUrlString(rawUrl)
  if (!cleaned) return null
  try {
    const u = new URL(cleaned)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'gist.github.com') {
      return {
        kind: 'github_other',
        canonicalUrl: u.href,
        originalUrl: cleaned
      }
    }
    if (host !== 'github.com') return null

    const parts = u.pathname
      .split('/')
      .map(p => p.trim())
      .filter(Boolean)

    if (parts.length === 0) return null

    const first = parts[0].toLowerCase()
    if (NON_REPO_GITHUB_SEGMENTS.has(first)) {
      return {
        kind: 'github_other',
        canonicalUrl: u.href,
        originalUrl: cleaned
      }
    }

    if (parts.length === 1) {
      // Profile or org page: https://github.com/owner
      return {
        kind: 'github_other',
        canonicalUrl: `https://github.com/${parts[0]}`,
        originalUrl: cleaned,
        owner: parts[0]
      }
    }

    const owner = parts[0]
    const repo = parts[1].replace(/\.git$/i, '')
    if (!owner || !repo || repo === 'followers' || repo === 'following' || repo === 'repositories' || repo === 'stars') {
      return {
        kind: 'github_other',
        canonicalUrl: u.href,
        originalUrl: cleaned,
        owner
      }
    }

    const fullName = `${owner}/${repo}`
    const canonicalUrl = `https://github.com/${owner}/${repo}`
    const subpath = parts.length > 2 ? parts.slice(2).join('/') : undefined

    return {
      kind: 'github_repo',
      canonicalUrl,
      originalUrl: cleaned,
      owner,
      repo,
      fullName,
      subpath
    }
  } catch {
    return null
  }
}

export function inferResourceType(
  text: string,
  urls: string[] = [],
  topics: string[] = [],
  entities: string[] = []
): ResourceType {
  const combined = [text, ...urls, ...topics, ...entities].join(' ').toLowerCase()

  // 1. MCP Server or Connector
  if (
    /\b(mcp|model context protocol|mcp-server|mcp_server|fastmcp)\b/i.test(combined) ||
    urls.some(u => /mcp/i.test(u))
  ) {
    return 'Servidor MCP o conector'
  }

  // 2. Skill
  if (
    /\b(skill|skills|skill\.md|agent-skills|claude-skills|founder-skills|ui-ux-pro-max-skill)\b/i.test(combined) ||
    urls.some(u => /[-_/]skills?\b/i.test(u))
  ) {
    return 'Skill'
  }

  // 3. Agent or Workflow
  if (
    /\b(agent|agents|agente|agentes|multi-agent|crewai|autogen|langgraph|n8n|workflow|workflows|harness|autoharness|bmad|openclaw|agency-agents|openhands)\b/i.test(
      combined
    )
  ) {
    return 'Agente o workflow'
  }

  // 4. Model or Dataset
  if (
    /\b(qwen|kimi|deepseek|llama-3|llama\.cpp|whisper|whisperx|kokoro|cosyvoice|openvoice|ultravox|fish-speech|vllm|open weight|open-weight|dataset|fine-tun|gguf|3t-class model)\b/i.test(
      combined
    )
  ) {
    return 'Modelo o dataset'
  }

  // 5. Article, Tutorial, Research, Educational
  if (
    urls.some(u => /x\.com\/i\/article\/|arxiv\.org|substack\.com|medium\.com/i.test(u)) ||
    /\b(free-programming-books|developer-roadmap|coding-interview-university|tech-interview-handbook|build-your-own-x|llms-from-scratch|ai-for-beginners|ml-for-beginners|openai-cookbook|system-design-primer|workshop|gu[ií]a completa|manual para|tutorial|paper|research|curso|libro|book|explained|explainer)\b/i.test(
      combined
    )
  ) {
    return 'Artículo, tutorial, investigación o material educativo'
  }

  // 6. Library, Framework or SDK
  const hasGitHubRepo = urls.some(u => classifyGitHubUrl(u)?.kind === 'github_repo')
  if (
    hasGitHubRepo ||
    /\b(sdk|framework|librer[ií]a|library|package|npm|pip|cli|open-source|open source|repositorio|repo|github\.com)\b/i.test(
      combined
    )
  ) {
    if (/\b(app|aplicaci[oó]n|studio|desktop|web app|plataforma|saas|dashboard|browser|terminal)\b/i.test(combined) && !/\b(sdk|framework|library|librer[ií]a)\b/i.test(combined)) {
      return 'Aplicación o herramienta'
    }
    return 'Librería, framework o SDK'
  }

  // 7. Application or Tool
  if (
    /\b(app|aplicaci[oó]n|herramienta|tool|api|claude code|cursor|figma|remotion|comfyui|notebooklm|premiere|crm|vercel|supabase|neon|browser|extension|plugin|shader|shaders)\b/i.test(
      combined
    ) ||
    urls.some(u => !/x\.com|twitter\.com|instagram\.com|t\.co/i.test(u))
  ) {
    return 'Aplicación o herramienta'
  }

  // 8. Idea or Project
  if (text && text.trim().length > 15) {
    return 'Idea o proyecto'
  }

  return 'Otro / pendiente de clasificar'
}

export function stripClickbait(rawText: string): string {
  let cleaned = (rawText || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\r\n/g, '\n')
    .trim()

  for (const rx of CLICKBAIT_PREFIX_PATTERNS) {
    cleaned = cleaned.replace(rx, '').trim()
  }
  // Run a second pass in case two prefixes were stacked (e.g. emoji + clickbait phrase)
  for (const rx of CLICKBAIT_PREFIX_PATTERNS) {
    cleaned = cleaned.replace(rx, '').trim()
  }
  return cleaned
}

export function buildLinkedResourcesFromUrls(
  urls: string[],
  contextText: string,
  topics: string[] = [],
  cardMeta?: { title?: string; description?: string; domain?: string; url?: string }
): LinkedResource[] {
  const byKey = new Map<string, LinkedResource>()

  // Also detect GitHub owner/repo patterns in cardMeta or text
  const candidateUrls = [...urls]
  const combinedCardAndText = `${cardMeta?.title || ''} ${cardMeta?.description || ''} ${contextText || ''}`
  const ghCardMatches = combinedCardAndText.matchAll(/GitHub\s*-\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/gi)
  for (const m of ghCardMatches) {
    if (m[1]) {
      candidateUrls.unshift(`https://github.com/${m[1].replace(/[.:,;]+$/, '')}`)
    }
  }

  const inlineGhMatches = (contextText || '').matchAll(/https?:\/\/github\.com\/[^\s"'<>)\]]+/gi)
  for (const m of inlineGhMatches) {
    candidateUrls.push(m[0])
  }

  for (const raw of candidateUrls) {
    const cleaned = cleanUrlString(raw)
    if (!cleaned) continue

    // Ignore internal X/Instagram status media/photo links as external resources unless it's an X Article
    const isXArticle = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/i\/article\/\d+/i.test(cleaned)
    if (!isXArticle && /https?:\/\/(?:www\.)?(?:x|twitter|instagram)\.com\//i.test(cleaned)) {
      continue
    }

    const gh = classifyGitHubUrl(cleaned)
    if (gh) {
      const key = gh.canonicalUrl.toLowerCase()
      if (byKey.has(key)) continue

      const isCardMatch =
        cardMeta?.title && gh.fullName && cardMeta.title.toLowerCase().includes(gh.fullName.toLowerCase())
      const desc = isCardMatch && cardMeta?.description
        ? cardMeta.description.replace(new RegExp(`\\s*-\\s*${gh.fullName}$`, 'i'), '').trim()
        : ''

      const rType = inferResourceType(`${gh.fullName || gh.canonicalUrl} ${desc} ${contextText}`, [gh.canonicalUrl], topics)
      const resourceId = `res:${createHash('sha1').update(key).digest('hex').slice(0, 12)}`

      byKey.set(key, {
        id: resourceId,
        url: cleaned,
        resolvedUrl: gh.canonicalUrl,
        domain: 'github.com',
        kind: gh.kind,
        name: gh.fullName || gh.owner || 'GitHub',
        fullName: gh.fullName,
        description: desc || (gh.kind === 'github_repo' ? `Repositorio en GitHub (${gh.fullName})` : `Enlace de GitHub (${gh.canonicalUrl})`),
        purpose: desc || `Recurso de código abierto alojado en ${gh.fullName || 'GitHub'}.`,
        resourceType: rType,
        topics: topics.filter(t => t !== 'Sin clasificar'),
        howToUse: gh.kind === 'github_repo' ? 'Repositorio Git / código fuente' : 'Referencia web en GitHub',
        hasDocs: gh.kind === 'github_repo',
        maintenanceStatus: 'desconocido',
        verificationStatus: isCardMatch ? 'confirmed' : 'candidate',
        provenanceChain: cleaned !== gh.canonicalUrl ? [cleaned, gh.canonicalUrl] : [cleaned],
        evidenceBasis: isCardMatch ? 'har_metadata' : 'post_text'
      })
      continue
    }

    // Non-GitHub external URL
    let domain = ''
    try {
      domain = new URL(cleaned).hostname.toLowerCase().replace(/^www\./, '')
    } catch {
      continue
    }

    const key = cleaned.toLowerCase()
    if (byKey.has(key)) continue

    let kind: LinkedResourceKind = 'other'
    if (isXArticle) {
      kind = 'article'
    } else if (/docs\.|readme|documentation|wiki|guide/i.test(cleaned)) {
      kind = 'docs'
    } else if (/youtube\.com|youtu\.be|vimeo\.com|loom\.com/i.test(cleaned)) {
      kind = 'video'
    } else if (domain !== 't.co') {
      kind = 'webapp'
    }

    const isCardUrl = cardMeta && (cardMeta.url === cleaned || cardMeta.domain === domain)
    const name = isCardUrl && cardMeta?.title
      ? cardMeta.title
      : isXArticle
      ? 'Artículo extenso en X'
      : domain

    const desc = isCardUrl && cardMeta?.description ? cardMeta.description : ''
    const rType = inferResourceType(`${name} ${desc} ${contextText}`, [cleaned], topics)
    const resourceId = `res:${createHash('sha1').update(key).digest('hex').slice(0, 12)}`

    byKey.set(key, {
      id: resourceId,
      url: cleaned,
      resolvedUrl: cleaned,
      domain,
      kind,
      name,
      description: desc || (isXArticle ? 'Artículo publicado en X con desarrollo detallado del tema.' : `Enlace externo en ${domain}`),
      purpose: desc || `Recurso externo vinculado desde la publicación (${domain}).`,
      resourceType: rType,
      topics: topics.filter(t => t !== 'Sin clasificar'),
      howToUse: kind === 'webapp' ? 'Aplicación / sitio web' : kind === 'docs' ? 'Documentación' : 'Lectura / enlace',
      verificationStatus: domain === 't.co' ? 'uninvestigated' : isCardUrl ? 'confirmed' : 'candidate',
      provenanceChain: [cleaned],
      evidenceBasis: isCardUrl ? 'har_metadata' : 'post_text'
    })

    if (byKey.size >= 20) break
  }

  const allList = Array.from(byKey.values())
  const hasRealLinks = allList.some(r => r.domain !== 't.co')
  const filteredList = hasRealLinks ? allList.filter(r => r.domain !== 't.co') : allList

  const kindPriority: Record<LinkedResourceKind, number> = {
    github_repo: 1,
    docs: 2,
    webapp: 3,
    article: 4,
    github_other: 5,
    video: 6,
    other: 7
  }

  return filteredList.sort((a, b) => (kindPriority[a.kind] || 9) - (kindPriority[b.kind] || 9))
}

export interface BookmarkSynthesis {
  title: string
  purpose: string
  resourceType: ResourceType
  evaluation: string
  analysisState: AnalysisState
  resources: LinkedResource[]
}

export function synthesizeBookmarkFields(input: {
  caption: string
  authorName: string
  authorHandle: string
  platform: string
  outgoingLinks: string[]
  topics: string[]
  entities: string[]
  existingResources?: LinkedResource[]
  cardMeta?: { title?: string; description?: string; domain?: string; url?: string }
  articleMeta?: { title?: string; previewText?: string }
}): BookmarkSynthesis {
  const {
    caption,
    authorName,
    authorHandle,
    outgoingLinks,
    topics,
    entities,
    existingResources,
    cardMeta,
    articleMeta
  } = input

  const builtResources = buildLinkedResourcesFromUrls(outgoingLinks, caption, topics, cardMeta)
  // Merge existingResources (preserving any 'confirmed' or 'github_api' / 'http_metadata' entries)
  const mergedMap = new Map<string, LinkedResource>()
  for (const r of builtResources) {
    mergedMap.set((r.resolvedUrl || r.url).toLowerCase(), r)
  }
  if (Array.isArray(existingResources)) {
    for (const ex of existingResources) {
      const k = (ex.resolvedUrl || ex.url).toLowerCase()
      const curr = mergedMap.get(k)
      if (!curr || ex.verificationStatus === 'confirmed' || ex.evidenceBasis === 'github_api' || ex.evidenceBasis === 'http_metadata') {
        mergedMap.set(k, ex)
      }
    }
  }

  const rawMerged = Array.from(mergedMap.values())
  const hasNonShortlink = rawMerged.some(r => r.domain !== 't.co')
  const resources = (hasNonShortlink ? rawMerged.filter(r => r.domain !== 't.co') : rawMerged).sort((a, b) => {
    const prio = (k: LinkedResourceKind) =>
      k === 'github_repo' ? 1 : k === 'docs' ? 2 : k === 'webapp' ? 3 : k === 'article' ? 4 : 5
    return prio(a.kind) - prio(b.kind)
  })
  const githubRepos = resources.filter(r => r.kind === 'github_repo')
  const externalSites = resources.filter(r => r.kind !== 'github_repo' && r.domain !== 't.co')
  const shortlinksOnly = resources.length > 0 && resources.every(r => r.domain === 't.co' && r.verificationStatus === 'uninvestigated')

  const cleanBody = stripClickbait(caption)
  const lines = cleanBody
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const resourceType = inferResourceType(
    `${articleMeta?.title || ''} ${cardMeta?.title || ''} ${cardMeta?.description || ''} ${cleanBody}`,
    resources.map(r => r.resolvedUrl || r.url),
    topics,
    entities
  )

  // 1. Build comprehensible Title ("Nombre / recurso")
  let title = ''
  if (githubRepos.length === 1 && githubRepos[0].fullName) {
    const repoName = githubRepos[0].fullName
    const headline = lines[0] && lines[0].length <= 75 && !lines[0].toLowerCase().includes(repoName.toLowerCase())
      ? `${repoName} — ${lines[0]}`
      : repoName
    title = headline.slice(0, 95)
  } else if (githubRepos.length > 1) {
    const firstLead = lines[0] ? lines[0].slice(0, 65) : `Colección de ${githubRepos.length} repositorios`
    title = `${firstLead} (${githubRepos.length} repos GitHub)`
  } else if (articleMeta?.title) {
    title = articleMeta.title.slice(0, 95)
  } else if (cardMeta?.title) {
    title = cardMeta.title.replace(/^GitHub\s*-\s*/i, '').slice(0, 95)
  } else if (lines.length > 0) {
    const firstLine = lines[0].replace(/^[-•*]\s*/, '')
    if (firstLine.length <= 90) {
      title = firstLine
    } else {
      const cut = firstLine.search(/[:.!?—–]\s/)
      title = cut >= 18 && cut <= 85 ? firstLine.slice(0, cut) : `${firstLine.slice(0, 82).trim()}…`
    }
  } else {
    title = `Publicación de ${authorHandle || authorName || 'origen'}`
  }

  // 2. Build concrete Purpose ("Para qué sirve")
  let purpose = ''
  if (githubRepos.length === 1 && githubRepos[0].description && !githubRepos[0].description.startsWith('Repositorio en GitHub')) {
    purpose = githubRepos[0].description
  } else if (cardMeta?.description) {
    purpose = cardMeta.description
  } else if (articleMeta?.previewText) {
    purpose = articleMeta.previewText.replace(/\s+/g, ' ').trim()
  } else if (githubRepos.length > 1) {
    const sampleNames = githubRepos
      .slice(0, 4)
      .map(r => r.fullName || r.name)
      .join(', ')
    const bodyRest = lines.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim()
    purpose = `${bodyRest ? bodyRest.slice(0, 150) + '. ' : ''}Reúne ${githubRepos.length} repositorios de GitHub (incluyendo ${sampleNames}).`
  } else if (lines.length > 0) {
    const meaningful = lines.join(' ').replace(/\s+/g, ' ').trim()
    purpose = meaningful.length <= 210 ? meaningful : `${meaningful.slice(0, 205).trim()}…`
  } else {
    purpose = 'Guardado multimedia o enlace directo pendiente de descripción adicional.'
  }

  if (purpose.length > 240) {
    purpose = `${purpose.slice(0, 235).trim()}…`
  }

  // 3. Build Brief Evaluation ("Evaluación breve": utilidad + limitación/evidencia)
  let evaluation = ''
  const confirmedRepos = githubRepos.filter(r => r.verificationStatus === 'confirmed')
  if (confirmedRepos.length > 0) {
    const repoInfo = confirmedRepos[0]
    const extraMeta = [
      repoInfo.stars !== undefined ? `★ ${repoInfo.stars}` : '',
      repoInfo.license ? `Licencia ${repoInfo.license}` : '',
      repoInfo.archived ? 'Archivado' : ''
    ]
      .filter(Boolean)
      .join(' · ')
    evaluation = `Repositorio GitHub corroborado (${repoInfo.fullName}${extraMeta ? ` · ${extraMeta}` : ''}). Limitación: no se ejecutó prueba funcional en entorno local.`
  } else if (githubRepos.length === 1) {
    evaluation = `Incluye repositorio GitHub directo (${githubRepos[0].fullName}). Limitación: descripto a partir de la captura; pendiente consultar API de GitHub en vivo.`
  } else if (githubRepos.length > 1) {
    evaluation = `Lista curada con ${githubRepos.length} repositorios de GitHub detectados en la publicación. Limitación: requiere evaluar madurez y licencia de cada proyecto por separado.`
  } else if (externalSites.length > 0) {
    const siteList = Array.from(new Set(externalSites.map(s => s.domain))).slice(0, 2).join(', ')
    const hasXArt = externalSites.some(s => s.kind === 'article')
    evaluation = hasXArt
      ? `Basado en artículo extenso de X (${articleMeta?.title ? 'con título y extracto capturados' : 'enlace de artículo'}). Limitación: sin repositorio de GitHub directo en el post.`
      : `Contiene enlace externo (${siteList}). Limitación: sin repositorio de código abierto confirmado en la publicación.`
  } else if (shortlinksOnly) {
    evaluation = `Contiene enlace acortado (t.co) sin expandir en la captura original. Usá "Investigar recursos" para resolver la redirección.`
  } else if (cleanBody.length > 0) {
    evaluation = `Basado únicamente en el texto de la publicación de ${authorHandle || authorName}; no incluye enlaces a repositorios ni documentación externa.`
  } else {
    evaluation = `Contenido multimedia o enlace sin texto descriptivo suficiente.`
  }

  // 4. Determine Analysis State ("Estado del análisis")
  let analysisState: AnalysisState = 'completed'
  if (!caption.trim() && resources.length === 0) {
    analysisState = 'pending'
  } else if (shortlinksOnly || resources.some(r => r.verificationStatus === 'candidate' || r.verificationStatus === 'uninvestigated')) {
    analysisState = confirmedRepos.length > 0 ? 'completed' : 'partial'
  }

  return {
    title,
    purpose,
    resourceType,
    evaluation,
    analysisState,
    resources
  }
}

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SHORTENER_HOSTS = new Set([
  't.co',
  'bit.ly',
  'tinyurl.com',
  'buff.ly',
  'ow.ly',
  'is.gd',
  'rb.gy',
  'lnkd.in',
  'trib.al',
  'dlvr.it',
  'ift.tt'
])

export function isShortenerUrl(rawUrl: string): boolean {
  try {
    const cleaned = cleanUrlString(rawUrl)
    if (!cleaned) return false
    const host = new URL(cleaned).hostname.toLowerCase().replace(/^www\./, '')
    return SHORTENER_HOSTS.has(host)
  } catch {
    return false
  }
}

/**
 * Resolves shortened URLs (t.co, bit.ly, tinyurl.com, etc.) via HTTP redirects
 * and HTML meta-refresh / title fallbacks (used by t.co).
 */
export async function resolveShortenedUrl(rawUrl: string): Promise<string | null> {
  const cleaned = cleanUrlString(rawUrl)
  if (!cleaned || !isSafeExternalUrl(cleaned)) return null

  try {
    const initialHost = new URL(cleaned).hostname.toLowerCase().replace(/^www\./, '')
    const res = await fetch(cleaned, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(4500),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AtlasBookmarkInvestigator/2.0)'
      }
    })

    if (res.url && res.url !== cleaned) {
      const destHost = new URL(res.url).hostname.toLowerCase().replace(/^www\./, '')
      if (destHost !== initialHost && isSafeExternalUrl(res.url)) {
        return cleanUrlString(res.url)
      }
    }

    // t.co often returns HTTP 200 with <META http-equiv="refresh" content="0;URL=..."> or <title>https://...</title>
    const html = (await res.text()).slice(0, 6000)
    const metaMatch =
      html.match(/content=["']\d+\s*;\s*URL=([^"'>\s]+)["']/i) ||
      html.match(/location\.replace\(\s*["']([^"']+)["']\s*\)/i) ||
      html.match(/<title[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/title>/i)

    if (metaMatch && metaMatch[1]) {
      const candidate = cleanUrlString(metaMatch[1].replace(/&amp;/g, '&'))
      if (candidate && isSafeExternalUrl(candidate)) {
        return candidate
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Live network investigation of a single resource URL with SSRF protection,
 * redirect resolution, GitHub REST API / HTML fallback, and GitHub link discovery on web pages.
 */
export async function investigateResourceUrlLive(
  rawUrl: string,
  contextText = '',
  topics: string[] = []
): Promise<{ resource: LinkedResource; discoveredGitHubUrls: string[] }> {
  const cleaned = cleanUrlString(rawUrl)
  const baseResources = buildLinkedResourcesFromUrls([cleaned || rawUrl], contextText, topics)
  const fallbackResource: LinkedResource = baseResources[0] || {
    id: `res:${createHash('sha1').update(rawUrl).digest('hex').slice(0, 12)}`,
    url: rawUrl,
    resolvedUrl: rawUrl,
    domain: '',
    kind: 'other',
    name: rawUrl,
    description: '',
    purpose: '',
    resourceType: 'Otro / pendiente de clasificar',
    topics,
    verificationStatus: 'error',
    provenanceChain: [rawUrl],
    evidenceBasis: 'post_text',
    error: 'URL inválida'
  }

  if (!cleaned || !isSafeExternalUrl(cleaned)) {
    return {
      resource: {
        ...fallbackResource,
        verificationStatus: 'error',
        error: 'URL bloqueada por política de seguridad SSRF o protocolo no permitido.'
      },
      discoveredGitHubUrls: []
    }
  }

  const now = new Date().toISOString()
  const discoveredGitHubUrls: string[] = []

  try {
    // Step 1: If it's already a GitHub repo URL, query GitHub API or HTML
    let targetUrl = cleaned
    const provenanceChain = [cleaned]

    // Resolve t.co or shortlinks first via HTTP redirect or t.co meta-refresh
    if (isShortenerUrl(cleaned)) {
      const resolved = await resolveShortenedUrl(cleaned)
      if (resolved && isSafeExternalUrl(resolved)) {
        targetUrl = resolved
        if (!provenanceChain.includes(targetUrl)) {
          provenanceChain.push(targetUrl)
        }
      }
    }

    const gh = classifyGitHubUrl(targetUrl)
    if (gh && gh.kind === 'github_repo' && gh.owner && gh.repo) {
      // Query GitHub REST API first
      const apiHeaders: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AtlasBookmarkLegacy/2.0'
      }
      if (process.env.GITHUB_TOKEN) {
        apiHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
      }

      const apiRes = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}`, {
        headers: apiHeaders,
        signal: AbortSignal.timeout(5500)
      })

      if (apiRes.status === 404) {
        return {
          resource: {
            ...fallbackResource,
            url: cleaned,
            resolvedUrl: gh.canonicalUrl,
            domain: 'github.com',
            kind: 'github_repo',
            name: gh.fullName || gh.repo,
            fullName: gh.fullName,
            verificationStatus: 'not_found',
            verifiedAt: now,
            provenanceChain,
            evidenceBasis: 'github_api',
            error: 'Repositorio no encontrado en GitHub (HTTP 404).'
          },
          discoveredGitHubUrls: []
        }
      }

      if (apiRes.ok) {
        const repoData = await apiRes.json()
        const desc = String(repoData.description || '').trim()
        const ghTopics = Array.isArray(repoData.topics) ? repoData.topics : []
        const stars = typeof repoData.stargazers_count === 'number' ? repoData.stargazers_count : undefined
        const license = repoData.license?.spdx_id && repoData.license.spdx_id !== 'NOASSERTION'
          ? String(repoData.license.spdx_id)
          : undefined
        const archived = Boolean(repoData.archived)
        const rType = inferResourceType(
          `${gh.fullName} ${desc} ${ghTopics.join(' ')} ${contextText}`,
          [gh.canonicalUrl],
          [...topics, ...ghTopics]
        )

        return {
          resource: {
            id: `res:${createHash('sha1').update(gh.canonicalUrl.toLowerCase()).digest('hex').slice(0, 12)}`,
            url: cleaned,
            resolvedUrl: gh.canonicalUrl,
            domain: 'github.com',
            kind: 'github_repo',
            name: gh.fullName || repoData.full_name || gh.repo,
            fullName: repoData.full_name || gh.fullName,
            description: desc || `Repositorio verificado en GitHub (${gh.fullName}).`,
            purpose: desc || `Proyecto open-source en GitHub (${gh.fullName}).`,
            resourceType: rType,
            topics: Array.from(new Set([...topics.filter(t => t !== 'Sin clasificar'), ...ghTopics.slice(0, 5)])),
            howToUse: repoData.language ? `Código fuente (${repoData.language})` : 'Repositorio Git',
            hasDocs: true,
            maintenanceStatus: archived ? 'archivado' : 'activo',
            license,
            stars,
            archived,
            evaluation: `Repositorio verificado en GitHub (${stars !== undefined ? `★ ${stars}` : 'activo'}${license ? `, licencia ${license}` : ''}${archived ? ', archivado' : ''}).`,
            verificationStatus: 'confirmed',
            verifiedAt: now,
            provenanceChain,
            evidenceBasis: 'github_api'
          },
          discoveredGitHubUrls: []
        }
      }

      // Fallback to fetching GitHub HTML page if API rate-limited (403/429)
      const htmlRes = await fetch(gh.canonicalUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html'
        },
        signal: AbortSignal.timeout(5500)
      })

      if (htmlRes.status === 404) {
        return {
          resource: {
            ...fallbackResource,
            resolvedUrl: gh.canonicalUrl,
            kind: 'github_repo',
            name: gh.fullName || gh.repo,
            fullName: gh.fullName,
            verificationStatus: 'not_found',
            verifiedAt: now,
            provenanceChain,
            evidenceBasis: 'http_metadata',
            error: 'Repositorio no encontrado (HTTP 404).'
          },
          discoveredGitHubUrls: []
        }
      }

      if (htmlRes.ok) {
        const html = (await htmlRes.text()).slice(0, 80000)
        const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        const rawDesc = ogDescMatch ? decodeHtml(ogDescMatch[1]) : titleMatch ? decodeHtml(titleMatch[1]) : ''
        const cleanDesc = rawDesc
          .replace(/^GitHub\s*-\s*[^:]+:\s*/i, '')
          .replace(new RegExp(`\\s*-\\s*${gh.fullName}.*$`, 'i'), '')
          .trim()

        return {
          resource: {
            ...fallbackResource,
            id: `res:${createHash('sha1').update(gh.canonicalUrl.toLowerCase()).digest('hex').slice(0, 12)}`,
            url: cleaned,
            resolvedUrl: gh.canonicalUrl,
            domain: 'github.com',
            kind: 'github_repo',
            name: gh.fullName || gh.repo,
            fullName: gh.fullName,
            description: cleanDesc || fallbackResource.description,
            purpose: cleanDesc || fallbackResource.purpose,
            verificationStatus: 'confirmed',
            verifiedAt: now,
            provenanceChain,
            evidenceBasis: 'http_metadata'
          },
          discoveredGitHubUrls: []
        }
      }
    }

    // Step 2: Non-GitHub external website / documentation page
    const webRes = await fetch(targetUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(5500),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml'
      }
    })

    if (webRes.url && isSafeExternalUrl(webRes.url) && !provenanceChain.includes(webRes.url)) {
      targetUrl = webRes.url
      provenanceChain.push(targetUrl)
    }

    if (!webRes.ok) {
      return {
        resource: {
          ...fallbackResource,
          resolvedUrl: targetUrl,
          verificationStatus: webRes.status === 404 ? 'not_found' : 'inaccessible',
          verifiedAt: now,
          provenanceChain,
          evidenceBasis: 'http_metadata',
          error: `HTTP ${webRes.status}`
        },
        discoveredGitHubUrls: []
      }
    }

    const html = (await webRes.text()).slice(0, 90000)
    const titleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const descMatch =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)

    const pageTitle = titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]+>/g, '')) : ''
    const pageDesc = descMatch ? decodeHtml(descMatch[1].replace(/<[^>]+>/g, '')) : ''

    // Scan webpage HTML for GitHub repository links!
    const ghMatches = html.matchAll(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/gi)
    for (const m of ghMatches) {
      const parsedGh = classifyGitHubUrl(m[0])
      if (parsedGh && parsedGh.kind === 'github_repo' && !discoveredGitHubUrls.includes(parsedGh.canonicalUrl)) {
        discoveredGitHubUrls.push(parsedGh.canonicalUrl)
        if (discoveredGitHubUrls.length >= 5) break
      }
    }

    const finalDomain = new URL(targetUrl).hostname.toLowerCase().replace(/^www\./, '')
    const rType = inferResourceType(`${pageTitle} ${pageDesc} ${contextText}`, [targetUrl, ...discoveredGitHubUrls], topics)

    return {
      resource: {
        ...fallbackResource,
        url: cleaned,
        resolvedUrl: targetUrl,
        domain: finalDomain,
        name: pageTitle ? pageTitle.slice(0, 80) : finalDomain,
        description: pageDesc || pageTitle || fallbackResource.description,
        purpose: pageDesc || pageTitle || fallbackResource.purpose,
        resourceType: rType,
        verificationStatus: 'confirmed',
        verifiedAt: now,
        provenanceChain,
        evidenceBasis: 'http_metadata'
      },
      discoveredGitHubUrls
    }
  } catch (err: any) {
    return {
      resource: {
        ...fallbackResource,
        verificationStatus: 'inaccessible',
        verifiedAt: now,
         
        evidenceBasis: fallbackResource.evidenceBasis,
        error: err?.message || 'No accesible o tiempo de espera agotado'
      },
      discoveredGitHubUrls: []
    }
  }
}
