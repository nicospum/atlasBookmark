import type {
  AiProviderId,
  BookmarkItem,
  GalleryRepository,
  ProjectBlueprint,
  ReleaseRadarItem,
  StackRecommendationItem,
  StackRecommendationResult
} from './types'
import {
  evaluateAndClassifyRepository,
  extractInstallAndSetupSnippets,
  generateProjectMasterPrompt
} from './github-gallery'

interface IntentCluster {
  id: string
  labelEs: string
  roleLabelEs: string
  targetAreas: string[]
  triggers: string[]
  synonyms: string[]
}

const INTENT_CLUSTERS: IntentCluster[] = [
  {
    id: 'agents',
    labelEs: 'Agentes Autónomos & Orquestación',
    roleLabelEs: 'Orquestador / Agente Autónomo',
    targetAreas: ['Agentes Autónomos, Skills & MCP'],
    triggers: [
      'agente',
      'agentes',
      'agent',
      'agents',
      'autonomo',
      'autonomous',
      'subagent',
      'subagentes',
      'multi-agent',
      'multiagente',
      'crew',
      'swarm',
      'workflow',
      'flujo',
      'orquestar',
      'orchestrate',
      'claude',
      'cursor',
      'antigravity',
      'codex',
      'aider',
      'openhands'
    ],
    synonyms: [
      'agent',
      'agents',
      'autonomous',
      'multi-agent',
      'subagent',
      'crewai',
      'langgraph',
      'autogen',
      'openhands',
      'claude-code',
      'cursor',
      'workflow',
      'orchestration',
      'swarm'
    ]
  },
  {
    id: 'mcp',
    labelEs: 'Conectores & Servidores MCP',
    roleLabelEs: 'Servidor MCP / Conector',
    targetAreas: ['Agentes Autónomos, Skills & MCP'],
    triggers: [
      'mcp',
      'conector',
      'conectores',
      'connector',
      'connectors',
      'protocolo',
      'herramientas',
      'tools',
      'tool-calling',
      'servidor mcp',
      'integrar'
    ],
    synonyms: [
      'mcp',
      'model-context-protocol',
      'mcp-server',
      'connector',
      'claude-mcp',
      'tool',
      'tools'
    ]
  },
  {
    id: 'skill',
    labelEs: 'Skills & Reglas de Agente',
    roleLabelEs: 'Skill de Agente',
    targetAreas: ['Agentes Autónomos, Skills & MCP'],
    triggers: [
      'skill',
      'skills',
      'habilidad',
      'habilidades',
      'reglas',
      'rules',
      'prompt',
      'prompts',
      'instrucciones',
      'comandos',
      'commands'
    ],
    synonyms: [
      'skill',
      'skills',
      'agent-skills',
      'claude-code',
      'cursor',
      'rules',
      'prompts',
      'commands'
    ]
  },
  {
    id: 'browser_scraping',
    labelEs: 'Navegación Web & Automatización',
    roleLabelEs: 'Automatización & Browser',
    targetAreas: ['Automatización, Browser & Bots', 'Datos, RAG, Memoria & Scraping'],
    triggers: [
      'navegar',
      'navegue',
      'navegador',
      'web',
      'browser',
      'scraping',
      'scraper',
      'extraer',
      'extraiga',
      'extraccion',
      'crawl',
      'crawler',
      'playwright',
      'puppeteer',
      'selenium',
      'automatizar',
      'automatizacion',
      'bot',
      'bots',
      'whatsapp',
      'telegram',
      'n8n'
    ],
    synonyms: [
      'browser',
      'browser-use',
      'playwright',
      'puppeteer',
      'scraping',
      'crawler',
      'firecrawl',
      'automation',
      'web',
      'extract',
      'bot',
      'n8n',
      'whatsapp',
      'telegram'
    ]
  },
  {
    id: 'rag_data',
    labelEs: 'Datos, RAG & Memoria',
    roleLabelEs: 'Datos, RAG & Extracción',
    targetAreas: ['Datos, RAG, Memoria & Scraping'],
    triggers: [
      'datos',
      'data',
      'rag',
      'memoria',
      'memory',
      'base de datos',
      'database',
      'vector',
      'embeddings',
      'embedding',
      'pdf',
      'ocr',
      'documentos',
      'busqueda',
      'search',
      'cerebro',
      'conocimiento',
      'knowledge',
      'postgres',
      'sql',
      'sqlite',
      'supabase',
      'redis',
      'dataset'
    ],
    synonyms: [
      'rag',
      'vector',
      'embeddings',
      'memory',
      'database',
      'postgres',
      'sqlite',
      'supabase',
      'redis',
      'pdf',
      'ocr',
      'knowledge-graph',
      'search',
      'data',
      'firecrawl'
    ]
  },
  {
    id: 'voice_audio',
    labelEs: 'Voz IA (TTS / STT) & Audio',
    roleLabelEs: 'Motor de Voz & Audio IA',
    targetAreas: ['Voz, Audio, Video & Multimodal'],
    triggers: [
      'voz',
      'voice',
      'tts',
      'stt',
      'audio',
      'hablar',
      'hable',
      'locucion',
      'transcribir',
      'transcripcion',
      'whisper',
      'sonido',
      'sound',
      'musica',
      'music',
      'conversacional',
      'podcast',
      'clonar voz'
    ],
    synonyms: [
      'tts',
      'stt',
      'voice',
      'voz',
      'speech',
      'audio',
      'whisper',
      'kokoro',
      'cosyvoice',
      'openvoice',
      'elevenlabs',
      'livekit',
      'pipecat',
      'sound',
      'music'
    ]
  },
  {
    id: 'video_media',
    labelEs: 'Video Programático & Multimodal',
    roleLabelEs: 'Motor de Video & Multimedia',
    targetAreas: ['Voz, Audio, Video & Multimodal'],
    triggers: [
      'video',
      'videos',
      'multimedia',
      'remotion',
      'ffmpeg',
      'render',
      'avatar',
      'avatares',
      'lipsync',
      'imagen',
      'imagenes',
      'image',
      'diffusion',
      'comfyui',
      'edicion',
      'reels',
      'shorts',
      'tiktok',
      'youtube'
    ],
    synonyms: [
      'video',
      'remotion',
      'ffmpeg',
      'comfyui',
      'diffusion',
      'avatar',
      'lipsync',
      'multimedia',
      'render',
      'image',
      'mp4'
    ]
  },
  {
    id: 'ui_frontend',
    labelEs: 'Interfaz UI/UX & Frontend',
    roleLabelEs: 'Automatización & UI',
    targetAreas: ['Frontend, UI, Shaders & Diseño'],
    triggers: [
      'ui',
      'ux',
      'frontend',
      'interfaz',
      'dashboard',
      'panel',
      'react',
      'nextjs',
      'tailwind',
      'shadcn',
      'diseno',
      'design',
      'componentes',
      'components',
      'shader',
      'shaders',
      '3d',
      'webgl',
      'threejs',
      'canvas',
      'animacion',
      'landing',
      'figma'
    ],
    synonyms: [
      'ui',
      'ux',
      'frontend',
      'react',
      'nextjs',
      'tailwind',
      'shadcn',
      'components',
      'design',
      'shader',
      'threejs',
      'webgl',
      'animation',
      'figma',
      'css'
    ]
  },
  {
    id: 'llm_inference',
    labelEs: 'Modelos LLM & Inferencia',
    roleLabelEs: 'Motor Principal / Librería',
    targetAreas: ['IA Generativa, LLMs & Inferencia'],
    triggers: [
      'llm',
      'llms',
      'modelo',
      'modelos',
      'model',
      'inferencia',
      'inference',
      'local',
      'ollama',
      'vllm',
      'gpt',
      'gemini',
      'deepseek',
      'qwen',
      'llama',
      'mistral',
      'fine-tuning',
      'entrenar',
      'pytorch',
      'transformer'
    ],
    synonyms: [
      'llm',
      'llms',
      'inference',
      'ollama',
      'vllm',
      'llama',
      'deepseek',
      'qwen',
      'gemini',
      'openai',
      'claude',
      'transformer',
      'pytorch',
      'ai'
    ]
  },
  {
    id: 'security_auth',
    labelEs: 'Seguridad, Auth & Auditoría',
    roleLabelEs: 'Seguridad, Auth & Auditoría',
    targetAreas: ['Seguridad, Auditoría & Ingeniería Inversa'],
    triggers: [
      'seguridad',
      'security',
      'auth',
      'autenticacion',
      'login',
      'auditoria',
      'audit',
      'pentest',
      'reverse',
      'inversa',
      'decompile',
      'vulnerabilidad',
      'permisos',
      'sandbox',
      'osint',
      'crypto'
    ],
    synonyms: [
      'security',
      'seguridad',
      'audit',
      'pentest',
      'reverse-engineering',
      'auth',
      'crypto',
      'vulnerability',
      'osint',
      'malware'
    ]
  },
  {
    id: 'cli_devtools',
    labelEs: 'CLI, SDKs & DevTools',
    roleLabelEs: 'Herramienta CLI & DevTools',
    targetAreas: ['DevTools, CLI & Productividad', 'Ingeniería de Software & Open Source'],
    triggers: [
      'cli',
      'terminal',
      'consola',
      'shell',
      'bash',
      'devtools',
      'sdk',
      'docker',
      'kubernetes',
      'deploy',
      'api',
      'backend',
      'servidor',
      'compiler',
      'git'
    ],
    synonyms: [
      'cli',
      'terminal',
      'devtools',
      'sdk',
      'docker',
      'kubernetes',
      'shell',
      'bash',
      'git',
      'api',
      'server'
    ]
  }
]

const STOPWORDS = new Set([
  'quiero',
  'armar',
  'hacer',
  'crear',
  'construir',
  'desarrollar',
  'necesito',
  'busco',
  'para',
  'con',
  'que',
  'como',
  'una',
  'uno',
  'unos',
  'unas',
  'los',
  'las',
  'del',
  'por',
  'sobre',
  'entre',
  'este',
  'esta',
  'estos',
  'estas',
  'todo',
  'toda',
  'todos',
  'todas',
  'desde',
  'hasta',
  'sin',
  'mas',
  'muy',
  'usar',
  'usando',
  'tener',
  'tenga',
  'pueda',
  'permita',
  'proyecto',
  'sistema',
  'aplicacion',
  'app',
  'herramienta',
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'build',
  'make',
  'create',
  'want',
  'need',
  'using',
  'into'
])

function normalizeText(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

type RoleBucket = 'mcp' | 'skill' | 'agent' | 'data_rag' | 'multimedia_ui' | 'security' | 'core_lib'

function classifyRepoRole(
  repo: GalleryRepository,
  areaCategory: string,
  matchedClusters: IntentCluster[]
): { bucket: RoleBucket; roleInProject: string } {
  const fullNameLower = repo.fullName.toLowerCase()
  const rType = repo.resourceType || 'Otro / pendiente de clasificar'
  const topicsLower = (repo.topics || []).map(t => t.toLowerCase())

  if (
    rType === 'Servidor MCP o conector' ||
    /\bmcp\b/i.test(fullNameLower) ||
    topicsLower.some(t => t.includes('mcp'))
  ) {
    return { bucket: 'mcp', roleInProject: 'Servidor MCP / Conector' }
  }

  if (
    rType === 'Skill' ||
    /\bskills?\b/i.test(fullNameLower) ||
    topicsLower.some(t => t.includes('skill'))
  ) {
    return { bucket: 'skill', roleInProject: 'Skill de Agente' }
  }

  if (areaCategory === 'Seguridad, Auditoría & Ingeniería Inversa') {
    return { bucket: 'security', roleInProject: 'Seguridad, Auth & Auditoría' }
  }

  if (areaCategory === 'Voz, Audio, Video & Multimodal') {
    return { bucket: 'multimedia_ui', roleInProject: 'Motor Multimodal (Voz / Video)' }
  }

  if (areaCategory === 'Automatización, Browser & Bots') {
    return { bucket: 'multimedia_ui', roleInProject: 'Automatización & UI' }
  }

  if (areaCategory === 'Frontend, UI, Shaders & Diseño') {
    return { bucket: 'multimedia_ui', roleInProject: 'Automatización & UI' }
  }

  if (areaCategory === 'Datos, RAG, Memoria & Scraping') {
    return { bucket: 'data_rag', roleInProject: 'Datos, RAG & Extracción' }
  }

  if (rType === 'Agente o workflow' || areaCategory === 'Agentes Autónomos, Skills & MCP') {
    return { bucket: 'agent', roleInProject: 'Orquestador / Agente Autónomo' }
  }

  if (matchedClusters.length > 0) {
    return { bucket: 'core_lib', roleInProject: matchedClusters[0].roleLabelEs }
  }

  return { bucket: 'core_lib', roleInProject: 'Motor Principal / Librería' }
}

/**
 * Improvement #8: AI & Deterministic Stack Recommender from a Project Idea.
 * Analyzes a natural-language project idea, scores all repositories by keyword/synonym match,
 * area category, Atlas score, and role diversity, checks language/license compatibility,
 * and produces a ready-to-save ProjectBlueprint + Master Prompt Markdown.
 */
export function recommendStackForProjectIdea(params: {
  idea: string
  repos: GalleryRepository[]
  bookmarks?: BookmarkItem[]
  maxRepos?: number
  provider?: AiProviderId
}): StackRecommendationResult {
  const rawIdea = (params.idea || '').trim()
  const effectiveIdea =
    rawIdea || 'Construir un sistema de agentes autónomos con servidores MCP, skills e interfaz moderna'
  const repos = Array.isArray(params.repos) ? params.repos : []
  const bookmarks = Array.isArray(params.bookmarks) ? params.bookmarks : []
  const maxRepos = Math.min(10, Math.max(2, params.maxRepos ?? 6))

  const normalizedIdea = normalizeText(effectiveIdea)
  const rawTokens = normalizedIdea
    .replace(/[^a-z0-9_.-]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t))

  const directTokens = Array.from(new Set(rawTokens))

  // Detect active intent clusters
  const activeClusters: IntentCluster[] = []
  for (const cluster of INTENT_CLUSTERS) {
    const matched = cluster.triggers.some(trigger => {
      const normTrigger = normalizeText(trigger)
      if (normTrigger.includes(' ')) {
        return normalizedIdea.includes(normTrigger)
      }
      return directTokens.includes(normTrigger) || normalizedIdea.includes(normTrigger)
    })
    if (matched) {
      activeClusters.push(cluster)
    }
  }

  // Fallback to core agentic stack clusters if prompt is very generic
  if (activeClusters.length === 0) {
    activeClusters.push(
      INTENT_CLUSTERS[0], // agents
      INTENT_CLUSTERS[1], // mcp
      INTENT_CLUSTERS[2] // skill
    )
  }

  const synonymSet = new Set<string>()
  const targetAreaWeights = new Map<string, number>()
  for (const cluster of activeClusters) {
    for (const syn of cluster.synonyms) {
      synonymSet.add(normalizeText(syn))
    }
    for (const area of cluster.targetAreas) {
      targetAreaWeights.set(area, (targetAreaWeights.get(area) || 0) + 1)
    }
  }

  const wantsEducational = /\b(roadmap|curso|cursos|libro|libros|guia|tutorial|aprender|awesome|lista)\b/i.test(
    normalizedIdea
  )

  interface ScoredCandidate {
    repo: GalleryRepository
    score: number
    atlasScore: number
    securityGrade: 'Alto' | 'Medio' | 'Precaución'
    areaCategory: string
    whatIsItEs: string
    roleBucket: RoleBucket
    roleInProject: string
    matchedKeywords: string[]
    matchedClusters: IntentCluster[]
  }

  const candidates: ScoredCandidate[] = repos.map(repo => {
    const ev = repo.agentEvaluation || evaluateAndClassifyRepository(repo, bookmarks)
    const nameNorm = normalizeText(`${repo.owner} ${repo.name} ${(repo.topics || []).join(' ')}`)
    const bodyNorm = normalizeText(
      [
        repo.description || '',
        repo.shortExplanationEs || '',
        repo.longExplanationEs || '',
        ev.whatIsItEs || '',
        ev.areaCategory || '',
        ev.projectUseCases || '',
        repo.primaryLanguage || '',
        repo.notes || ''
      ].join(' ')
    )
    const fullHaystack = `${nameNorm} ${bodyNorm}`

    let score = 0
    const matchedKeywords: string[] = []

    // Exact repo or owner mention in idea
    if (
      normalizedIdea.includes(normalizeText(repo.name)) &&
      repo.name.length >= 3
    ) {
      score += 24
      matchedKeywords.push(repo.name)
    }

    // Direct token matches
    for (const token of directTokens) {
      if (nameNorm.includes(token)) {
        score += 6.5
        if (!matchedKeywords.includes(token)) matchedKeywords.push(token)
      } else if (bodyNorm.includes(token)) {
        score += 3.5
        if (!matchedKeywords.includes(token)) matchedKeywords.push(token)
      }
    }

    // Synonym matches
    for (const syn of synonymSet) {
      if (directTokens.includes(syn)) continue
      if (nameNorm.includes(syn)) {
        score += 3.2
        if (!matchedKeywords.includes(syn)) matchedKeywords.push(syn)
      } else if (bodyNorm.includes(syn)) {
        score += 1.8
        if (!matchedKeywords.includes(syn)) matchedKeywords.push(syn)
      }
    }

    // Cluster & Area category alignment
    const repoClusters = activeClusters.filter(
      c =>
        c.targetAreas.includes(ev.areaCategory) ||
        c.synonyms.some(s => fullHaystack.includes(normalizeText(s)))
    )
    const areaWeight = targetAreaWeights.get(ev.areaCategory) || 0
    if (areaWeight > 0) {
      score += 6.0 + Math.min(6.0, (areaWeight - 1) * 2.5)
    }

    // Atlas score & traction
    score += ev.atlasScore * 1.25
    const linkedBmCount = (repo.linkedBookmarkIds || []).length
    if (linkedBmCount > 0) {
      score += Math.min(3.0, linkedBmCount * 0.75)
    }

    // Security grade adjustment
    if (ev.securityGrade === 'Alto') score += 1.5
    else if (ev.securityGrade === 'Medio') score += 0.5
    else score -= 1.0

    // Prefer actionable code/tools over static reading lists unless requested
    const isAwesomeOrGuide =
      ev.areaCategory === 'Educación, Roadmaps & Guías Técnicas' ||
      repo.resourceType === 'Artículo, tutorial, investigación o material educativo' ||
      /\bawesome-/i.test(repo.fullName)
    if (isAwesomeOrGuide && !wantsEducational) {
      score -= 4.0
    }

    const { bucket, roleInProject } = classifyRepoRole(repo, ev.areaCategory, repoClusters)

    return {
      repo,
      score,
      atlasScore: ev.atlasScore,
      securityGrade: ev.securityGrade,
      areaCategory: ev.areaCategory,
      whatIsItEs: ev.whatIsItEs,
      roleBucket: bucket,
      roleInProject,
      matchedKeywords: matchedKeywords.slice(0, 5),
      matchedClusters: repoClusters
    }
  })

  candidates.sort((a, b) => b.score - a.score || b.atlasScore - a.atlasScore)

  // Diversity-aware selection up to maxRepos
  const selected: ScoredCandidate[] = []
  const selectedNames = new Set<string>()
  const bucketCounts = new Map<RoleBucket, number>()

  const addCandidate = (c: ScoredCandidate) => {
    selected.push(c)
    selectedNames.add(c.repo.fullName.toLowerCase())
    bucketCounts.set(c.roleBucket, (bucketCounts.get(c.roleBucket) || 0) + 1)
  }

  // Pass 1: Ensure each active intent cluster is represented by its top candidate
  for (const cluster of activeClusters) {
    if (selected.length >= maxRepos) break
    const bestForCluster = candidates.find(
      c =>
        !selectedNames.has(c.repo.fullName.toLowerCase()) &&
        (c.matchedClusters.some(mc => mc.id === cluster.id) ||
          cluster.targetAreas.includes(c.areaCategory))
    )
    if (bestForCluster) {
      addCandidate(bestForCluster)
    }
  }

  // Pass 2: Ensure role diversity across core buckets (Skill, MCP, Engine/Library, Tool/UI)
  const desiredBuckets: RoleBucket[] = ['mcp', 'skill', 'agent', 'data_rag', 'multimedia_ui', 'core_lib']
  for (const desiredBucket of desiredBuckets) {
    if (selected.length >= maxRepos) break
    if ((bucketCounts.get(desiredBucket) || 0) > 0) continue
    const bestInBucket = candidates.find(
      c =>
        !selectedNames.has(c.repo.fullName.toLowerCase()) &&
        c.roleBucket === desiredBucket &&
        c.score >= (candidates[0]?.score || 10) * 0.45
    )
    if (bestInBucket) {
      addCandidate(bestInBucket)
    }
  }

  // Pass 3: Fill remaining slots up to maxRepos with highest-scoring candidates while capping bucket concentration
  for (const c of candidates) {
    if (selected.length >= maxRepos) break
    if (selectedNames.has(c.repo.fullName.toLowerCase())) continue
    const currentBucketCount = bucketCounts.get(c.roleBucket) || 0
    if (currentBucketCount >= 2 && candidates.length > maxRepos * 2) continue
    addCandidate(c)
  }

  // Final fallback if cap left slots open
  for (const c of candidates) {
    if (selected.length >= maxRepos) break
    if (!selectedNames.has(c.repo.fullName.toLowerCase())) {
      addCandidate(c)
    }
  }

  // Build StackRecommendationItem[]
  const recommendedRepos: StackRecommendationItem[] = selected.map(item => {
    const install = extractInstallAndSetupSnippets(item.repo)
    const matchContext =
      item.matchedKeywords.length > 0
        ? `Coincide con los requerimientos clave (${item.matchedKeywords.slice(0, 4).join(', ')})`
        : `Seleccionado por su alto desempeño en ${item.areaCategory}`
    const cleanPurpose = (item.whatIsItEs || item.repo.description || '').replace(/\.$/, '')

    const whySelectedEs = `${matchContext}. Cumple el rol de ${item.roleInProject.toLowerCase()}: ${cleanPurpose} (Puntaje Atlas ${item.atlasScore.toFixed(1)}/10).`

    return {
      fullName: item.repo.fullName,
      url: item.repo.url,
      roleInProject: item.roleInProject,
      roleInStack: item.roleInProject,
      resourceType: item.repo.resourceType || 'Repositorio',
      areaCategory: item.areaCategory,
      companyOrAuthor: item.repo.agentEvaluation?.companyOrAuthor || `@${item.repo.owner}`,
      whySelectedEs,
      atlasScore: item.atlasScore,
      securityGrade: item.securityGrade,
      primaryLanguage: item.repo.primaryLanguage,
      installCommand: install.primaryCommand
    }
  })

  // Check language & license compatibility across selected repos
  const compatibilityNotesEs: string[] = []
  const languages = Array.from(
    new Set(selected.map(s => s.repo.primaryLanguage).filter((l): l is string => Boolean(l)))
  )

  if (languages.length === 1) {
    compatibilityNotesEs.push(
      `Stack homogéneo en ${languages[0]}: todos los componentes principales comparten el mismo lenguaje base, facilitando unificar dependencias y tipos en un solo repositorio.`
    )
  } else if (languages.length > 1) {
    compatibilityNotesEs.push(
      `Interoperabilidad multi-lenguaje (${languages.join(' + ')}): los servidores MCP, Skills y servicios CLI se comunican mediante protocolos estándar (stdio / HTTP / JSON-RPC), permitiendo combinar ${languages.slice(0, 3).join(' y ')} sin fricción.`
    )
  } else {
    compatibilityNotesEs.push(
      'Componentes agnósticos de lenguaje (Skills Markdown y conectores estándar) listos para integrarse en cualquier stack.'
    )
  }

  const permissiveRepos: string[] = []
  const copyleftRepos: string[] = []
  const missingLicenseRepos: string[] = []

  for (const s of selected) {
    const lic = (s.repo.license || '').trim()
    if (!lic || lic === 'NOASSERTION') {
      missingLicenseRepos.push(s.repo.fullName)
    } else if (/mit|apache|bsd|isc|0bsd|unlicense|cc0/i.test(lic)) {
      permissiveRepos.push(`${s.repo.fullName} (${lic})`)
    } else if (/gpl|agpl|lgpl|mpl/i.test(lic)) {
      copyleftRepos.push(`${s.repo.fullName} (${lic})`)
    } else {
      permissiveRepos.push(`${s.repo.fullName} (${lic})`)
    }
  }

  if (copyleftRepos.length === 0 && permissiveRepos.length > 0) {
    compatibilityNotesEs.push(
      `Licenciamiento comercial limpio: ${permissiveRepos.length} de ${selected.length} repositorios declaran licencias permisivas compatibles con distribución comercial y código privado.`
    )
  } else if (copyleftRepos.length > 0) {
    compatibilityNotesEs.push(
      `Aviso de licencias Copyleft: ${copyleftRepos.join(', ')} requiere revisar obligaciones de distribución si se empaqueta en software propietario (preferir consumo como servicio o CLI aislado).`
    )
  }

  if (missingLicenseRepos.length > 0) {
    compatibilityNotesEs.push(
      `Verificación de licencia sugerida para: ${missingLicenseRepos.join(', ')} (sin identificador SPDX explícito en la API de GitHub).`
    )
  }

  const mcpOrSkillCount = selected.filter(
    s => s.roleBucket === 'mcp' || s.roleBucket === 'skill'
  ).length
  if (mcpOrSkillCount > 0) {
    compatibilityNotesEs.push(
      `Integración directa con agentes: incluye ${mcpOrSkillCount} componente(s) listos para conectarse vía mcp.json o carpeta de Skills en Claude Code, Cursor y Antigravity.`
    )
  }

  // Build suggestedName & architectureSummaryEs
  const clusterLabels = activeClusters.slice(0, 3).map(c => c.labelEs)
  const suggestedName =
    clusterLabels.length > 0
      ? `Stack IA: ${clusterLabels.join(' + ')}`
      : 'Blueprint de Arquitectura Agéntica'

  const roleSummaryParts = recommendedRepos.map(
    r => `${r.fullName} (${r.roleInProject})`
  )
  const architectureSummaryEs = `Arquitectura recomendada de ${recommendedRepos.length} componentes diseñada para "${effectiveIdea}". Combina ${roleSummaryParts.join(', ')} logrando un balance entre conectores MCP, skills especializadas, motores de ejecución e interfaz.`

  const linkedBookmarkIds = Array.from(
    new Set(selected.flatMap(s => s.repo.linkedBookmarkIds || []))
  )

  const now = new Date().toISOString()
  const generatedBlueprint: ProjectBlueprint = {
    id: `bp-stack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: suggestedName.slice(0, 110),
    description: architectureSummaryEs,
    goal: effectiveIdea,
    repoFullNames: recommendedRepos.map(r => r.fullName),
    bookmarkIds: linkedBookmarkIds,
    notes: compatibilityNotesEs.join(' | '),
    createdAt: now,
    updatedAt: now
  }

  const chosenGalleryRepos = selected.map(s => s.repo)
  const masterPromptMarkdown = generateProjectMasterPrompt({
    blueprint: generatedBlueprint,
    repos: chosenGalleryRepos,
    bookmarks
  })

  return {
    projectIdea: effectiveIdea,
    idea: effectiveIdea,
    suggestedName: generatedBlueprint.name,
    projectName: generatedBlueprint.name,
    architectureSummaryEs,
    recommendedRepos,
    selectedRepos: recommendedRepos,
    compatibilityNotesEs: compatibilityNotesEs.join(' | '),
    generatedBlueprint,
    masterPromptMarkdown
  } as any
}

/**
 * Improvement #10: Release & Trending Radar.
 * Evaluates all repositories and returns the top 24 items sorted by recent activity
 * (pushedAt / latestRelease), high atlasScore, and bookmark traction, with a Spanish highlightReasonEs.
 */
export function buildReleaseAndTrendingRadar(
  repos: GalleryRepository[],
  bookmarks: BookmarkItem[] = []
): ReleaseRadarItem[] {
  if (!Array.isArray(repos) || repos.length === 0) return []

  const nowMs = Date.now()
  const msPerDay = 1000 * 60 * 60 * 24

  // Map bookmark counts per repo fullName
  const bmCountByRepo = new Map<string, number>()
  for (const bm of bookmarks) {
    if (bm.platform === 'github') continue
    for (const res of bm.resources || []) {
      if (res.fullName) {
        const key = res.fullName.toLowerCase()
        bmCountByRepo.set(key, (bmCountByRepo.get(key) || 0) + 1)
      }
    }
  }

  interface ScoredRadarEntry {
    item: ReleaseRadarItem
    radarScore: number
  }

  const scored: ScoredRadarEntry[] = repos.map(repo => {
    const ev = repo.agentEvaluation || evaluateAndClassifyRepository(repo, bookmarks)
    const pushedStr = repo.pushedAt || repo.updatedAt || repo.addedAt || new Date().toISOString()
    const pushedTime = new Date(pushedStr).getTime()
    const daysSincePush = Number.isNaN(pushedTime)
      ? 30
      : Math.max(0, Math.floor((nowMs - pushedTime) / msPerDay))

    const releaseTime = repo.latestRelease?.publishedAt
      ? new Date(repo.latestRelease.publishedAt).getTime()
      : NaN
    const daysSinceRelease = Number.isNaN(releaseTime)
      ? null
      : Math.max(0, Math.floor((nowMs - releaseTime) / msPerDay))

    const linkedIdsCount = (repo.linkedBookmarkIds || []).filter(
      id => !id.startsWith('github:')
    ).length
    const mappedBmCount = bmCountByRepo.get(repo.fullName.toLowerCase()) || 0
    const bookmarkTraction = Math.max(linkedIdsCount, mappedBmCount)

    // Determine highlightReasonEs
    let highlightReasonEs = `Top Puntaje Atlas (${ev.atlasScore.toFixed(1)}/10)`
    if (repo.latestRelease?.tag && (daysSinceRelease !== null && daysSinceRelease <= 45)) {
      highlightReasonEs = `Nuevo release publicado (${repo.latestRelease.tag})`
    } else if (repo.latestRelease?.tag && daysSincePush <= 14) {
      highlightReasonEs = 'Nuevo release publicado'
    } else if (daysSincePush <= 1) {
      highlightReasonEs = 'Actualizado hoy'
    } else if (daysSincePush <= 7) {
      highlightReasonEs = 'Actualizado esta semana'
    } else if (bookmarkTraction >= 2) {
      highlightReasonEs = 'Múltiples guardados vinculados'
    } else if (ev.atlasScore >= 9.0) {
      highlightReasonEs = `Top Puntaje Atlas (${ev.atlasScore.toFixed(1)}/10)`
    } else if (repo.latestRelease?.tag) {
      highlightReasonEs = `Nuevo release publicado (${repo.latestRelease.tag})`
    } else if (daysSincePush <= 30) {
      highlightReasonEs = 'Activo este mes'
    } else if (bookmarkTraction === 1) {
      highlightReasonEs = 'Destacado en tus guardados'
    }

    // Calculate composite radar score
    let radarScore = ev.atlasScore * 3.5

    if (daysSincePush <= 1) radarScore += 32
    else if (daysSincePush <= 7) radarScore += 26
    else if (daysSincePush <= 14) radarScore += 18
    else if (daysSincePush <= 30) radarScore += 12
    else if (daysSincePush <= 90) radarScore += 5

    if (repo.latestRelease?.tag) {
      radarScore += 15
      if (daysSinceRelease !== null && daysSinceRelease <= 30) {
        radarScore += 10
      }
    }

    if (bookmarkTraction > 0) {
      radarScore += Math.min(16, bookmarkTraction * 5)
    }

    if ((repo.stars || 0) > 0) {
      radarScore += Math.min(10, Math.log10(repo.stars + 1) * 2)
    }

    return {
      radarScore,
      item: {
        fullName: repo.fullName,
        url: repo.url,
        avatarUrl: repo.avatarUrl,
        resourceType: repo.resourceType || 'Repositorio',
        areaCategory: ev.areaCategory,
        companyOrAuthor: ev.companyOrAuthor,
        stars: repo.stars || 0,
        atlasScore: ev.atlasScore,
        latestRelease: repo.latestRelease || null,
        latestReleaseTag: repo.latestRelease?.tag || null,
        latestReleaseDate: repo.latestRelease?.publishedAt || null,
        pushedAt: pushedStr,
        daysSincePush,
        daysSinceLastPush: daysSincePush,
        highlightReasonEs,
        shortExplanationEs: repo.shortExplanationEs || repo.explanation || repo.description
      } as any
    }
  })

  scored.sort(
    (a, b) =>
      b.radarScore - a.radarScore ||
      a.item.daysSincePush - b.item.daysSincePush ||
      b.item.atlasScore - a.item.atlasScore
  )

  return scored.slice(0, 24).map(s => s.item)
}
