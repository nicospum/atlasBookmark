import type { BookmarkItem, TopicRulesMeta } from './types'

export interface AnalysisResult {
  topics: string[]
  entities: string[]
  aiSummary: string
  language: string
  outgoingLinks: string[]
  classificationMatches: Record<string, string[]>
  confidence: number
}

export const DEFAULT_TOPIC_RULES: Record<string, string[]> = {
  'IA': [
    'ia', 'ai', 'artificial intelligence', 'inteligencia artificial', 'machine learning',
    'llm', 'llms', 'agent', 'agents', 'agente', 'agentes', 'openrouter', 'claude', 'gpt',
    'opus', 'openai', 'gemini', 'deepseek', 'ollama', 'rag', 'prompt', 'prompts',
    'reasoning', 'neural', 'vector', 'embedding', 'embeddings', 'transformer', 'mcp'
  ],
  'Diseño': [
    'design', 'diseño', 'figma', 'ux', 'ui', 'interface', 'interfaz', 'interfaces',
    'frontend', 'css', 'tailwind', 'tipografía', 'typography', 'layout', 'visual',
    'estética', 'shadcn', 'animation', 'animations', 'remotion', 'bauhaus'
  ],
  'Programación': [
    'code', 'coding', 'código', 'programming', 'programación', 'developer', 'dev',
    'software', 'typescript', 'javascript', 'python', 'github', 'github.com', 'api',
    'react', 'next.js', 'nextjs', 'sqlite', 'postgres', 'neon', 'prisma', 'fastify',
    'backend', 'database', 'playwright', 'semgrep', 'sentry', 'repo', 'open source',
    'tsx', 'html', 'node', 'npm', 'cli', 'sdk', 'docker'
  ],
  'Producto': [
    'product', 'producto', 'startup', 'saas', 'launch', 'customer', 'usuario',
    'user research', 'analytics', 'growth', 'mrr', 'feature', 'retención',
    'onboarding', 'spec', 'specs', 'roadmap', 'mvp', 'build-to-launch'
  ],
  'Lecturas': [
    'book', 'libro', 'article', 'artículo', 'paper', 'read', 'leer', 'lectura',
    'essay', 'ensayo', 'guide', 'guía', 'tutorial', 'filosofía', 'reflexión', 'thread'
  ],
  'Negocios': [
    'business', 'negocio', 'negocios', 'market', 'mercado', 'sales', 'ventas',
    'funding', 'revenue', 'finance', 'finanzas', 'marketing', 'agency', 'empresa'
  ],
  'Cultura': [
    'music', 'música', 'film', 'cine', 'culture', 'cultura', 'history', 'historia',
    'art', 'arte', 'literature', 'literatura', 'museo', 'fotografía', 'video', 'explainer'
  ],
  'Viajes': [
    'travel', 'trip', 'hotel', 'flight', 'viaje', 'viajes', 'turismo', 'ciudad',
    'tokio', 'japón', 'montaña', 'paisaje', 'aeropuerto'
  ],
  'Ideas': [
    'idea', 'ideas', 'estrategia', 'strategy', 'hábito', 'atención', 'foco',
    'futuro', 'mente', 'consejo', 'vida', 'second brain', 'workflow', 'bottleneck'
  ]
}

const KNOWN_ENTITIES = [
  'OpenAI', 'Claude', 'Opus', 'Gemini', 'DeepSeek', 'Ollama', 'OpenRouter',
  'Figma', 'Next.js', 'React', 'TypeScript', 'Python', 'SQLite', 'Postgres',
  'Neon', 'Prisma', 'Fastify', 'Tailwind', 'Shadcn', 'Playwright', 'Remotion',
  'Semgrep', 'Sentry', 'Clerk', 'Mastra', 'GitHub', 'Bauhaus', 'Paul Klee',
  'SaaS', 'RAG', 'MCP', '3Blue1Brown', 'BMAD'
]

// Conceptual synonym clusters for local semantic search (bilingual ES/EN)
const CONCEPT_CLUSTERS: string[][] = [
  ['ia', 'ai', 'inteligencia artificial', 'llm', 'llms', 'agente', 'agentes', 'agents', 'agent', 'claude', 'gpt', 'gemini', 'openai', 'prompt', 'prompts', 'rag', 'mcp', 'modelo', 'modelos', 'openrouter'],
  ['diseño', 'design', 'ui', 'ux', 'interfaz', 'interfaces', 'figma', 'visual', 'estetica', 'bauhaus', 'tipografia', 'layout', 'frontend', 'css', 'tailwind', 'shadcn', 'animacion', 'remotion'],
  ['programacion', 'codigo', 'code', 'coding', 'software', 'dev', 'developer', 'desarrollo', 'typescript', 'javascript', 'python', 'react', 'nextjs', 'github', 'repo', 'open source', 'api', 'backend', 'arquitectura'],
  ['base de datos', 'database', 'sql', 'sqlite', 'postgres', 'neon', 'prisma', 'almacenamiento', 'storage', 'persistencia'],
  ['producto', 'product', 'startup', 'saas', 'mvp', 'lanzamiento', 'launch', 'usuario', 'usuarios', 'crecimiento', 'growth', 'retencion', 'onboarding', 'roadmap', 'spec'],
  ['lectura', 'lecturas', 'libro', 'libros', 'book', 'articulo', 'article', 'paper', 'ensayo', 'essay', 'guia', 'guide', 'tutorial', 'hilo', 'thread', 'explicacion', 'explainer'],
  ['negocio', 'negocios', 'business', 'ventas', 'sales', 'marketing', 'mercado', 'market', 'finanzas', 'ingresos', 'revenue', 'empresa', 'agencia'],
  ['seguridad', 'security', 'vulnerabilidad', 'auditoria', 'semgrep', 'sentry', 'bug', 'errores', 'testing', 'pruebas', 'playwright']
]

export function foldText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function termMatches(haystack: string, rawTerm: string): boolean {
  const needle = foldText(rawTerm.trim())
  if (!needle) return false
  if (needle.startsWith('#')) {
    return new RegExp(`(?<![\\w])${escapeRegex(needle)}(?![\\w-])`, 'i').test(haystack)
  }
  if (needle.includes('.') || needle.includes('/')) {
    return haystack.includes(needle)
  }
  return new RegExp(`(?<![\\w@#])${escapeRegex(needle)}(?![\\w-])`, 'i').test(haystack)
}

function getNodeModules(): { fs: any; path: any; crypto: any } | null {
  if (typeof window !== 'undefined') return null
  try {
    const req = eval('require')
    return {
      fs: req('node:fs'),
      path: req('node:path'),
      crypto: req('node:crypto')
    }
  } catch {
    return null
  }
}

function getRulesPaths() {
  const mods = getNodeModules()
  if (!mods) return null
  const { path } = mods
  const dataDir = process.env.ATLAS_DATA_DIR || path.join(process.cwd(), 'data')
  const rulesPath = path.join(dataDir, 'topic_rules.json')
  const defaultRulesPath = path.join(process.cwd(), 'data', 'topic_rules.json')
  const backupDir = path.join(dataDir, 'normalized', 'backups')
  const snapshotPath = path.join(backupDir, 'topic_rules.snapshot.json')
  return { dataDir, rulesPath, defaultRulesPath, backupDir, snapshotPath }
}

export function loadTopicRules(): Record<string, string[]> {
  const mods = getNodeModules()
  const paths = getRulesPaths()
  if (!mods || !paths) return DEFAULT_TOPIC_RULES

  const { fs } = mods
  try {
    const targetPath = fs.existsSync(paths.rulesPath)
      ? paths.rulesPath
      : fs.existsSync(paths.defaultRulesPath)
      ? paths.defaultRulesPath
      : null

    if (targetPath) {
      const raw = fs.readFileSync(targetPath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const sanitized: Record<string, string[]> = {}
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof k === 'string' && k.trim() && Array.isArray(v)) {
            sanitized[k.trim()] = v
              .filter((t): t is string => typeof t === 'string')
              .map(t => t.trim())
              .filter(Boolean)
          }
        }
        if (Object.keys(sanitized).length > 0) {
          return sanitized
        }
      }
    }
  } catch {
    // Fallback to DEFAULT_TOPIC_RULES
  }
  return DEFAULT_TOPIC_RULES
}

export function getTopicRulesMeta(): TopicRulesMeta {
  const rules = loadTopicRules()
  const mods = getNodeModules()
  const paths = getRulesPaths()
  const canonicalJson = JSON.stringify(rules, null, 2)

  if (!mods || !paths) {
    return {
      rules,
      sha256: 'client-default',
      revision: 1,
      updatedAt: new Date().toISOString(),
      hasBackup: false
    }
  }

  const { fs, crypto } = mods
  const sha256 = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex')
  let updatedAt = new Date().toISOString()
  let revision = 1
  let hasBackup = false
  let backupSha256: string | undefined
  let backupUpdatedAt: string | undefined

  try {
    const targetPath = fs.existsSync(paths.rulesPath) ? paths.rulesPath : paths.defaultRulesPath
    if (fs.existsSync(targetPath)) {
      updatedAt = fs.statSync(targetPath).mtime.toISOString()
    }
    if (fs.existsSync(paths.snapshotPath)) {
      const snap = JSON.parse(fs.readFileSync(paths.snapshotPath, 'utf8'))
      if (snap && snap.rules && typeof snap. rules === 'object') {
        hasBackup = true
        backupSha256 = snap.sha256
        backupUpdatedAt = snap.updatedAt
        revision = Number(snap.revision || 1) + 1
      }
    }
  } catch {
    // Ignore stat errors
  }

  return {
    rules,
    sha256,
    revision,
    updatedAt,
    hasBackup,
    backupSha256,
    backupUpdatedAt
  }
}

export function saveTopicRulesWithSnapshot(newRules: Record<string, string[]>): TopicRulesMeta {
  const mods = getNodeModules()
  const paths = getRulesPaths()
  if (!mods || !paths) {
    throw new Error('La escritura de reglas solo está disponible en el servidor Node.js.')
  }

  const { fs, crypto } = mods
  const currentMeta = getTopicRulesMeta()

  // Sanitize incoming rules
  const sanitized: Record<string, string[]> = {}
  for (const [topic, terms] of Object.entries(newRules)) {
    const cleanTopic = String(topic || '').trim()
    if (!cleanTopic) continue
    const cleanTerms = Array.from(
      new Set(
        (Array.isArray(terms) ? terms : [])
          .map(t => String(t || '').trim())
          .filter(Boolean)
      )
    )
    if (cleanTerms.length > 0) {
      sanitized[cleanTopic] = cleanTerms
    }
  }

  if (Object.keys(sanitized).length === 0) {
    throw new Error('El conjunto de reglas no puede estar vacío.')
  }

  fs.mkdirSync(paths.dataDir, { recursive: true })
  fs.mkdirSync(paths.backupDir, { recursive: true })

  // 1. Write SHA-256 snapshot of previous rules before modifying
  const snapshotPayload = {
    sha256: currentMeta.sha256,
    revision: currentMeta.revision,
    updatedAt: currentMeta.updatedAt,
    rules: currentMeta.rules
  }
  fs.writeFileSync(paths.snapshotPath, JSON.stringify(snapshotPayload, null, 2) + '\n', 'utf8')

  // 2. Write new rules atomically
  const nextJson = JSON.stringify(sanitized, null, 2) + '\n'
  const tmpPath = `${paths.rulesPath}.tmp`
  fs.writeFileSync(tmpPath, nextJson, 'utf8')
  fs.renameSync(tmpPath, paths.rulesPath)

  const newSha256 = crypto.createHash('sha256').update(JSON.stringify(sanitized, null, 2), 'utf8').digest('hex')

  return {
    rules: sanitized,
    sha256: newSha256,
    revision: currentMeta.revision + 1,
    updatedAt: new Date().toISOString(),
    hasBackup: true,
    backupSha256: currentMeta.sha256,
    backupUpdatedAt: currentMeta.updatedAt
  }
}

export function revertTopicRulesFromSnapshot(): TopicRulesMeta {
  const mods = getNodeModules()
  const paths = getRulesPaths()
  if (!mods || !paths) {
    throw new Error('La reversión de reglas solo está disponible en el servidor Node.js.')
  }

  const { fs } = mods
  if (!fs.existsSync(paths.snapshotPath)) {
    throw new Error('No existe un snapshot previo de reglas para revertir.')
  }

  const snap = JSON.parse(fs.readFileSync(paths.snapshotPath, 'utf8'))
  if (!snap || !snap.rules || typeof snap.rules !== 'object') {
    throw new Error('El snapshot de reglas es inválido.')
  }

  const restoredJson = JSON.stringify(snap.rules, null, 2) + '\n'
  const tmpPath = `${paths.rulesPath}.tmp`
  fs.writeFileSync(tmpPath, restoredJson, 'utf8')
  fs.renameSync(tmpPath, paths.rulesPath)
  fs.rmSync(paths.snapshotPath, { force: true })

  return getTopicRulesMeta()
}

export function analyzeContent(
  text: string,
  existingTopics: string[] = [],
  extraContext: {
    domain?: string
    author?: string
    handle?: string
    collections?: string[]
    externalUrls?: string[]
    customRules?: Record<string, string[]>
  } = {}
): AnalysisResult {
  const combinedSource = [
    text || '',
    extraContext.domain || '',
    extraContext.author || '',
    extraContext.handle || '',
    ...(extraContext.collections || []),
    ...(extraContext.externalUrls || [])
  ].join(' ')

  const activeRules = extraContext.customRules || loadTopicRules()
  const haystack = ` ${foldText(combinedSource)} `
  const detectedTopics = new Set<string>(
    existingTopics.filter(t => t && t !== 'Sin clasificar' && t !== 'Pendiente')
  )
  const classificationMatches: Record<string, string[]> = {}

  for (const [topic, terms] of Object.entries(activeRules)) {
    const matched = terms.filter(term => termMatches(haystack, term))
    if (matched.length > 0) {
      detectedTopics.add(topic)
      classificationMatches[topic] = matched
    }
  }

  const totalMatches = Object.values(classificationMatches).reduce((acc, arr) => acc + arr.length, 0)
  const confidence = detectedTopics.size > 0
    ? Number(Math.min(0.95, 0.45 + 0.12 * totalMatches).toFixed(2))
    : 0

  // Extract entities
  const lower = (text || '').toLowerCase()
  const entitiesSet = new Set<string>()
  for (const ent of KNOWN_ENTITIES) {
    const re = new RegExp(`(?<![\\w])${escapeRegex(ent.toLowerCase())}(?![\\w])`, 'i')
    if (re.test(lower)) {
      entitiesSet.add(ent)
    }
  }

  // Extract hashtags and @mentions from text
  const hashtags = (text || '').match(/#[\p{L}\p{N}_]+/gu) || []
  hashtags.forEach(tag => entitiesSet.add(tag))
  const mentions = (text || '').match(/@[\w.]+/g) || []
  mentions.forEach(m => entitiesSet.add(m))

  // Extract outgoing links
  const linkRegex = /https?:\/\/[^\s<>"')\]]+/g
  const rawLinks = (text || '').match(linkRegex) || []
  const allLinks = Array.from(new Set([...(extraContext.externalUrls || []), ...rawLinks]))

  // Detect language
  const esMatches = (haystack.match(/\b(el|la|los|las|de|que|en|un|una|para|con|por|como|pero|mas|este|esta)\b/g) || []).length
  const enMatches = (haystack.match(/\b(the|and|of|to|in|that|is|was|for|with|this|from|your|you|are|can)\b/g) || []).length
  const language = !text?.trim()
    ? 'No determinado'
    : esMatches > enMatches
    ? 'Español'
    : enMatches > esMatches
    ? 'Inglés'
    : 'Español'

  // Generate clean extractive summary
  const cleanText = (text || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  let aiSummary = 'Sin texto disponible para resumir (solo enlace o multimedia).'
  if (cleanText) {
    if (cleanText.length <= 200) {
      aiSummary = cleanText
    } else {
      const firstSentenceEnd = cleanText.search(/[.!?]\s/)
      if (firstSentenceEnd >= 40 && firstSentenceEnd <= 210) {
        aiSummary = cleanText.slice(0, firstSentenceEnd + 1)
      } else {
        aiSummary = cleanText.slice(0, 200).trim() + '…'
      }
    }
  }

  const finalTopics = detectedTopics.size > 0
    ? Array.from(detectedTopics).slice(0, 6)
    : ['Sin clasificar']

  return {
    topics: finalTopics,
    entities: Array.from(entitiesSet).slice(0, 12),
    aiSummary,
    language,
    outgoingLinks: allLinks,
    classificationMatches,
    confidence
  }
}

function extractTrigrams(str: string): Set<string> {
  const clean = foldText(str).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const trigrams = new Set<string>()
  const padded = `  ${clean}  `
  for (let i = 0; i <= padded.length - 3; i++) {
    trigrams.add(padded.slice(i, i + 3))
  }
  return trigrams
}

/**
 * Local Conceptual & Semantic Search across bookmarks using bilingual concept clusters,
 * topic/entity expansion, token overlap, and character 3-gram cosine similarity.
 */
export function semanticSearchBookmarks<T extends BookmarkItem>(
  items: T[],
  rawQuery: string
): Array<T & { semanticScore: number; matchedConcepts: string[] }> {
  const query = foldText(rawQuery).trim()
  if (!query) {
    return items.map(item => ({ ...item, semanticScore: 1, matchedConcepts: [] }))
  }

  const stopWords = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'en', 'un', 'una', 'sobre', 'para', 'con', 'por', 'que', 'the', 'and', 'for', 'with', 'about', 'from', 'aquel', 'ese', 'post', 'hilo', 'guardado'])
  const queryTokens = query
    .split(/[^a-z0-9@#._-]+/)
    .filter(t => t.length >= 2 && !stopWords.has(t))

  // Expand query tokens via conceptual synonym clusters
  const expandedTerms = new Set<string>(queryTokens)
  for (const token of queryTokens) {
    for (const cluster of CONCEPT_CLUSTERS) {
      if (cluster.some(c => c.includes(token) || token.includes(c))) {
        cluster.forEach(c => expandedTerms.add(c))
      }
    }
  }

  const queryTrigrams = extractTrigrams(query)
  const results: Array<T & { semanticScore: number; matchedConcepts: string[] }> = []

  for (const item of items) {
    const docText = foldText(
      [
        item.caption,
        item.aiSummary,
        item.authorName,
        item.authorHandle,
        item.domain || '',
        ...item.topics,
        ...item.entities,
        ...(item.collections || [])
      ].join(' ')
    )

    let score = 0
    const matchedConcepts = new Set<string>()

    // 1. Exact phrase match bonus
    if (docText.includes(query)) {
      score += 0.55
      matchedConcepts.add(rawQuery.trim())
    }

    // 2. Direct token match
    let directHits = 0
    for (const qt of queryTokens) {
      if (docText.includes(qt)) {
        directHits++
        matchedConcepts.add(qt)
      }
    }
    if (queryTokens.length > 0) {
      score += 0.35 * (directHits / queryTokens.length)
    }

    // 3. Conceptual / Synonym expansion hits
    let conceptHits = 0
    for (const exp of expandedTerms) {
      if (!queryTokens.includes(exp) && termMatches(` ${docText} `, exp)) {
        conceptHits++
        matchedConcepts.add(exp)
      }
    }
    if (conceptHits > 0) {
      score += Math.min(0.32, conceptHits * 0.08)
    }

    // 4. Trigram similarity for typo tolerance and morphological variations
    const docTrigrams = extractTrigrams(docText.slice(0, 600))
    let intersection = 0
    for (const tri of queryTrigrams) {
      if (docTrigrams.has(tri)) intersection++
    }
    const trigramSim =
      queryTrigrams.size > 0 && docTrigrams.size > 0
        ? intersection / Math.sqrt(queryTrigrams.size * docTrigrams.size)
        : 0
    score += trigramSim * 0.25

    const normalizedScore = Number(Math.min(0.99, score).toFixed(2))
    if (normalizedScore >= 0.12) {
      results.push({
        ...item,
        semanticScore: normalizedScore,
        matchedConcepts: Array.from(matchedConcepts).slice(0, 5)
      })
    }
  }

  return results.sort((a, b) => b.semanticScore - a.semanticScore)
}
