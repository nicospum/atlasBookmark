import { createHash } from 'node:crypto'
import type {
  BookmarkItem,
  FallbackReferenceLink,
  LinkedResource,
  ResourceType
} from './types'
import {
  cleanUrlString,
  classifyGitHubUrl,
  isSafeExternalUrl,
  isShortenerUrl,
  resolveShortenedUrl,
  stripClickbait
} from './resource-investigator'

export interface OffTopicClassificationResult {
  isOffTopic: boolean
  scope: 'radar_tecnico' | 'archivo_separado_otro_tema'
  categoryLabel:
    | 'Radar Técnico (IA, Código & Herramientas)'
    | 'Fotos y Multimedia Personal'
    | 'Juegos Casuales y Entretenimiento'
    | 'Deportes y Fitness'
    | 'Gastronomía y Recetas'
    | 'Viajes y Turismo'
    | 'Compras, Finanzas y Trámites'
    | 'Actualidad, Cultura o Notas Personales'
  reasonEs: string
  suggestedResourceType?: ResourceType
  suggestedTopics: string[]
}

const STRONG_TECH_SIGNALS =
  /\b(github|github\.com|gitlab|repo|repositorio|open[\s-]?source|c[oó]digo abierto|llm|llms|gpt|claude|opus|sonnet|anthropic|openai|gemini|deepseek|qwen|kimi|llama|mistral|ollama|vllm|gguf|huggingface|hugging face|mcp|model context protocol|skill|skills|skill\.md|claude\.md|agents\.md|agent|agents|agente|agentes|multi-agent|langgraph|crewai|autogen|n8n|rag|embedding|embeddings|vector|fine-tun|lora|whisper|kokoro|voicebox|elevenlabs|wispr|personaplex|tts|stt|ocr|comfyui|cursor|windsurf|vscode|copilot|playwright|puppeteer|selenium|sdk|cli|api|rest api|graphql|webhook|framework|librer[ií]a|library|npm|npx|pip|uvx|cargo|docker|kubernetes|linux|terminal|bash|powershell|python|typescript|javascript|rust|golang|react|next\.js|nextjs|tailwind|shadcn|figma|ui\/ux|css|html|shader|webgl|three\.js|remotion|sqlite|postgres|supabase|neon|prisma|vercel|netlify|cloudflare|railway|firebase|saas|crm|b2b|startup|ingenier[ií]a inversa|reverse engineer|binary|decompile|hack|exploit|prompt|prompts|notebooklm|obsidian|arxiv|paper|benchmark|vram|gpu|cuda)\b/i

const CASUAL_GAME_OR_TOY_DOMAINS = [
  'canyonoverdrive.ai-created.com',
  'sortie.ashutoshai.com'
]

const OFF_TOPIC_RULES: Array<{
  categoryLabel: OffTopicClassificationResult['categoryLabel']
  topicTag: string
  pattern: RegExp
  reasonEs: string
}> = [
  {
    categoryLabel: 'Fotos y Multimedia Personal',
    topicTag: 'Fotos y Multimedia Personal',
    pattern:
      /(?:^|\b)(?:img[-_]\d{6,}|vid[-_]\d{6,}|ptt[-_]\d{6,}|aud[-_]\d{6,}|wa\d{4,}|<multimedia omitido>|multimedia omitido|image omitted|video omitted|audio omitted|sticker omitted|gif omitted|foto familiar|fotos de las vacaciones|selfie|cumplea[ñn]os|casamiento|boda|mascota|perrito|gatito)(?:\b|$)/i,
    reasonEs:
      'Archivo multimedia personal (foto, video, audio o sticker de WhatsApp/Instagram) sin relación con proyectos técnicos ni repositorios.'
  },
  {
    categoryLabel: 'Deportes y Fitness',
    topicTag: 'Deportes y Ocio',
    pattern:
      /\b(f[uú]tbol|futbol|messi|scaloni|maradona|boca juniors|river plate|libertadores|champions league|mundial de|eliminatorias|golazo|partido de hoy|tabla de posiciones|nba|f[oó]rmula 1|tenis|roland garros|wimbledon|rutina de gimnasio|hipertrofia|abdominales|calistenia|marat[oó]n|running)\b/i,
    reasonEs:
      'Contenido de deportes, fútbol o entrenamiento físico ajeno al catálogo de IA y programación.'
  },
  {
    categoryLabel: 'Gastronomía y Recetas',
    topicTag: 'Gastronomía y Vida Cotidiana',
    pattern:
      /\b(receta de|ingredientes:|c[oó]mo cocinar|al horno|masa madre|asado|parrilla|postre|torta de|helado casero|restaurante en|bodeg[oó]n|degustaci[oó]n|vino tinto|cerveza artesanal|men[uú] del d[ií]a)\b/i,
    reasonEs:
      'Publicación gastronómica, receta de cocina o recomendación de restaurante fuera del radar técnico.'
  },
  {
    categoryLabel: 'Viajes y Turismo',
    topicTag: 'Viajes',
    pattern:
      /\b(vacaciones en|hotel en|vuelos baratos|pasajes a|itinerario de viaje|playas de|excursi[oó]n|all inclusive|hospedaje|airbnb en|turismo en|visitar en)\b/i,
    reasonEs:
      'Contenido de viajes, turismo u hospedaje sin vínculo con herramientas de software.'
  },
  {
    categoryLabel: 'Compras, Finanzas y Trámites',
    topicTag: 'Compras y Trámites',
    pattern:
      /\b(mercadolibre\.com|env[ií]o gratis|cuotas sin inter[eé]s|zapatillas|indumentaria|alquiler de departamento|inmobiliaria|expensas|comprobante de pago|transferencia bancaria|cbu:|alias:|turno m[eé]dico|obra social|receta m[eé]dica|farmacia)\b/i,
    reasonEs:
      'Archivo administrativo, compra personal, trámite o comprobante privado separado del catálogo de código.'
  },
  {
    categoryLabel: 'Juegos Casuales y Entretenimiento',
    topicTag: 'Ocio y Entretenimiento',
    pattern:
      /\b(you can play here|did you try mine yet|vibe-coded game i['’]ve played|spent so many hours playing it|chiste|hor[oó]scopo|farándula|gran hermano|tráiler oficial|estreno en cines|recital de|entradas agotadas)\b/i,
    reasonEs:
      'Juego casual web, entretenimiento o conversación social sin repositorio de código ni utilidad como herramienta de desarrollo.'
  }
]

/**
 * Evalúa con criterios estrictos si un guardado pertenece al Radar Técnico (IA, programación,
 * repositorios, agentes, diseño/producto digital) o si debe separarse como "Archivo separado / Otro tema (No técnico)".
 */
export function evaluateBookmarkScopeAndOffTopic(input: {
  caption?: string
  title?: string
  authorName?: string
  authorHandle?: string
  platform?: string
  outgoingLinks?: string[]
  mediaType?: string
  mediaUrls?: string[]
  topics?: string[]
}): OffTopicClassificationResult {
  const caption = (input.caption || '').trim()
  const title = (input.title || '').trim()
  const links = input.outgoingLinks || []
  const combinedText = `${title} ${caption} ${links.join(' ')}`.trim()
  const cleanBody = stripClickbait(caption)

  // 1. Si es de plataforma GitHub o contiene un link directo a github.com o huggingface.co, es 100% Radar Técnico
  if (
    input.platform === 'github' ||
    links.some(u => /github\.com\/|huggingface\.co\/|arxiv\.org\//i.test(u)) ||
    /github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i.test(combinedText)
  ) {
    return {
      isOffTopic: false,
      scope: 'radar_tecnico',
      categoryLabel: 'Radar Técnico (IA, Código & Herramientas)',
      reasonEs: 'Contiene referencia directa a repositorio o plataforma técnica.',
      suggestedTopics: input.topics || ['Programación']
    }
  }

  // 2. Verificar dominios de juegos casuales / demos recreativas sin repo
  if (
    links.some(u =>
      CASUAL_GAME_OR_TOY_DOMAINS.some(d => u.toLowerCase().includes(d))
    )
  ) {
    return {
      isOffTopic: true,
      scope: 'archivo_separado_otro_tema',
      categoryLabel: 'Juegos Casuales y Entretenimiento',
      reasonEs:
        'Enlace a minijuego web recreativo sin repositorio de código abierto ni documentación técnica.',
      suggestedResourceType: 'Archivo separado / Otro tema (No técnico)',
      suggestedTopics: ['Archivos Separados / Otros Temas', 'Ocio y Entretenimiento']
    }
  }

  const hasStrongTech = STRONG_TECH_SIGNALS.test(combinedText)

  // 3. Evaluar reglas explícitas de temas no técnicos (Fotos personales, Deportes, Gastronomía, Viajes, Compras, Juegos/Ocio)
  for (const rule of OFF_TOPIC_RULES) {
    if (rule.pattern.test(combinedText)) {
      // Si tiene una señal muy fuerte de herramienta/código (salvo el caso de vibe-coded game casual que ya filtramos), priorizar técnico
      const isCasualGameMatch = rule.categoryLabel === 'Juegos Casuales y Entretenimiento'
      if (!hasStrongTech || isCasualGameMatch) {
        return {
          isOffTopic: true,
          scope: 'archivo_separado_otro_tema',
          categoryLabel: rule.categoryLabel,
          reasonEs: rule.reasonEs,
          suggestedResourceType: 'Archivo separado / Otro tema (No técnico)',
          suggestedTopics: ['Archivos Separados / Otros Temas', rule.topicTag]
        }
      }
    }
  }

  // 4. Fotos, videos o audios sueltos sin contexto técnico (ej. foto de Instagram/WhatsApp/X sin texto técnico ni links técnicos)
  const nonSocialLinks = links.filter(
    u => !/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com|instagram\.com|t\.co)\//i.test(u)
  )
  const hasMedia =
    (input.mediaType && input.mediaType !== 'none') ||
    (Array.isArray(input.mediaUrls) && input.mediaUrls.length > 0)

  if (!hasStrongTech && nonSocialLinks.length === 0) {
    // Si es solo una foto/video con texto vacío o muy corto (< 25 chars) sin ninguna palabra técnica
    if (hasMedia && cleanBody.length < 30) {
      return {
        isOffTopic: true,
        scope: 'archivo_separado_otro_tema',
        categoryLabel: 'Fotos y Multimedia Personal',
        reasonEs:
          'Archivo multimedia (foto o video) sin descripción técnica ni enlaces a herramientas de software.',
        suggestedResourceType: 'Archivo separado / Otro tema (No técnico)',
        suggestedTopics: ['Archivos Separados / Otros Temas', 'Fotos y Multimedia Personal']
      }
    }

    // Si los temas detectados son únicamente Viajes o Cultura sin ninguna señal técnica
    const currentTopics = (input.topics || []).filter(t => t !== 'Sin clasificar')
    const onlyNonTechTopics =
      currentTopics.length > 0 &&
      currentTopics.every(t => ['Viajes', 'Cultura'].includes(t))
    if (onlyNonTechTopics) {
      return {
        isOffTopic: true,
        scope: 'archivo_separado_otro_tema',
        categoryLabel: currentTopics.includes('Viajes')
          ? 'Viajes y Turismo'
          : 'Actualidad, Cultura o Notas Personales',
        reasonEs: `Contenido clasificado en ${currentTopics.join(', ')} sin relación con IA, programación ni herramientas digitales.`,
        suggestedResourceType: 'Archivo separado / Otro tema (No técnico)',
        suggestedTopics: ['Archivos Separados / Otros Temas', ...currentTopics]
      }
    }
  }

  return {
    isOffTopic: false,
    scope: 'radar_tecnico',
    categoryLabel: 'Radar Técnico (IA, Código & Herramientas)',
    reasonEs: 'Pertenece al catálogo técnico de IA, código, diseño o producto.',
    suggestedTopics: input.topics || []
  }
}

/**
 * Mapa de conocimiento experto del Agente para herramientas/repositorios virales mencionados
 * en posts de X/WhatsApp/Instagram sin link directo (en español, inglés, japonés, árabe, francés o chino).
 */
const KNOWN_INDIRECT_TOOL_REPOS: Array<{
  pattern: RegExp
  fullName: string
  descriptionEs: string
}> = [
  {
    pattern: /\bcli-anything\b/i,
    fullName: 'HKUDS/CLI-Anything',
    descriptionEs:
      'CLI-Anything (HKUDS): Convierte aplicaciones de escritorio y software estándar en herramientas CLI controlables por agentes de IA y Claude Code.'
  },
  {
    pattern: /\b(?:rea\s*\+\s*opus|rea\s+is\s+most\s+dangerous|mcp\s+open\s+source\s+que\s+de.*ingenier[ií]a\s+inversa|\brea\b.*reverse\s+engineer)/i,
    fullName: 'morluto/rea',
    descriptionEs:
      'REA (Reverse Engineer Anything): Servidor MCP y suite de ingeniería inversa asistida por IA para analizar binarios, apps nativas, Electron y bundles web.'
  },
  {
    pattern: /\bpersonaplex(?:-7b)?\b/i,
    fullName: 'NVIDIA/personaplex',
    descriptionEs:
      'NVIDIA PersonaPlex-7B: Modelo de conversación de voz full-duplex en tiempo real capaz de escuchar y hablar simultáneamente con baja latencia.'
  },
  {
    pattern: /\bvoicebox\.sh\b|\belevenlabs\b.*\bwisprflow\b.*55,000/i,
    fullName: 'jamiepine/voicebox',
    descriptionEs:
      'Voicebox (voicebox.sh): Estudio local open-source de clonación de voz, síntesis TTS y dictado inteligente estilo ElevenLabs + WisprFlow.'
  },
  {
    pattern: /『video-use』|\bvideo-use\b.*claude\s+code/i,
    fullName: 'browser-use/video-use',
    descriptionEs:
      'video-use: Agente y skill de edición automática de video para Claude Code que corta, ensambla y produce videos profesionales desde una carpeta de clips.'
  },
  {
    pattern: /\bdeepseek\s+harness\b|\bdeepseek\.com\/harness\b/i,
    fullName: 'deepseek-ai/DeepSeek-V3',
    descriptionEs:
      'Ecosistema oficial de DeepSeek AI y herramientas open-source de agentes y modelos de razonamiento.'
  },
  {
    pattern: /\bprompt-audit\b.*\/claude-api|\/claude-api\s+prompt-audit/i,
    fullName: 'anthropics/claude-code',
    descriptionEs:
      'Claude Code CLI oficial de Anthropic: incluye comandos de auditoría de prompts, revisión de CLAUDE.md, AGENTS.md y gestión de Skills.'
  },
  {
    pattern: /\bnotebooklm\b.*\bskill\.md\b|\bnotebooklm\s+para\s+crear\s+skills\s+para\s+claude/i,
    fullName: 'anthropics/skills',
    descriptionEs:
      'Formato oficial SKILL.md de Anthropic para empaquetar conocimiento estructurado (como cuadernos de NotebookLM) en Skills reutilizables para Claude.'
  },
  {
    pattern: /\bkimi\b.*\bopen\s+weight\b.*\bk3|\bmoonshotai\b/i,
    fullName: 'MoonshotAI/Kimi-K2',
    descriptionEs:
      'Repositorio oficial de Moonshot AI (serie Kimi open-weight para programación, agentes y benchmarks de terminal).'
  }
]

export interface NavigatorDiscoveredRepo {
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
}

export interface WebNavigatorAgentOutput {
  bookmarkId: string
  isOffTopic: boolean
  offTopicInfo?: OffTopicClassificationResult
  hydratedText?: string
  hydratedAuthorName?: string
  hydratedAuthorHandle?: string
  expandedLinks: string[]
  discoveredRepos: NavigatorDiscoveredRepo[]
  fallbackReference?: FallbackReferenceLink
  skillsExecuted: string[]
}

/**
 * SKILL 1: Navega hilos, respuestas/comentarios de X, artículos de X y tweets citados/videos originales
 * utilizando FxTwitter (incluyendo bio/website del autor y video embebido de otro autor) + Jina Reader (`r.jina.ai`).
 */
export async function skillInspectSocialThreadAndComments(
  urlsToInspect: string[],
  existingCaption: string
): Promise<{
  recoveredTextChunks: string[]
  authorName?: string
  authorHandle?: string
  expandedUrls: string[]
  discoveredRepos: NavigatorDiscoveredRepo[]
}> {
  const recoveredTextChunks: string[] = []
  const expandedUrls = new Set<string>()
  const discoveredRepos: NavigatorDiscoveredRepo[] = []
  let authorName: string | undefined
  let authorHandle: string | undefined

  const addRepo = (
    rawUrlOrFullName: string,
    method: NavigatorDiscoveredRepo['discoveryMethod'],
    desc: string
  ) => {
    const candidate = rawUrlOrFullName.startsWith('http')
      ? rawUrlOrFullName
      : `https://github.com/${rawUrlOrFullName}`
    const parsed = classifyGitHubUrl(candidate)
    if (parsed && parsed.kind === 'github_repo' && parsed.fullName) {
      if (!discoveredRepos.some(r => r.fullName.toLowerCase() === parsed.fullName!.toLowerCase())) {
        discoveredRepos.push({
          fullName: parsed.fullName,
          url: parsed.canonicalUrl,
          description: desc,
          discoveryMethod: method,
          confidence: 'confirmado'
        })
      }
    }
  }

  // Also check if any URL in urlsToInspect is an embedded video from ANOTHER tweet (e.g. https://x.com/oliviscusAI/status/2105289754225078715/video/1)
  const allTweetStatusUrls = new Set<string>()
  for (const u of urlsToInspect) {
    const m = u.match(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/status\/(\d+)/i)
    if (m) {
      allTweetStatusUrls.add(`https://x.com/${m[1]}/status/${m[2]}`)
    }
  }

  for (const statusUrl of Array.from(allTweetStatusUrls).slice(0, 3)) {
    const m = statusUrl.match(/x\.com\/([A-Za-z0-9_]+)\/status\/(\d+)/i)
    if (!m) continue
    const user = m[1]
    const statusId = m[2]

    // 1A. Consultar api.fxtwitter.com incluyendo autor, bio, website y tweet citado
    try {
      const fxRes = await fetch(`https://api.fxtwitter.com/${user}/status/${statusId}`, {
        headers: { 'User-Agent': 'AtlasWebNavigatorAgent/3.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(5500)
      })
      if (fxRes.ok) {
        const data = await fxRes.json()
        const tw = data?.tweet
        if (tw) {
          const twText = String(tw.text || '').trim()
          if (twText) recoveredTextChunks.push(twText)
          if (!authorName && tw.author?.name) authorName = String(tw.author.name)
          if (!authorHandle && tw.author?.screen_name) {
            authorHandle = `@${String(tw.author.screen_name).replace(/^@/, '')}`
          }

          // Revisar bio y website del autor (muy común cuando dicen "link en mi bio")
          const authorBio = String(tw.author?.description || '')
          const authorWebsite = cleanUrlString(String(tw.author?.website?.url || tw.author?.website || ''))
          if (authorWebsite) {
            expandedUrls.add(authorWebsite)
            addRepo(authorWebsite, 'author_bio_or_quote', `Enlace en el perfil de @${user}`)
          }
          const bioGhMatches = authorBio.matchAll(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/gi)
          for (const bm of bioGhMatches) {
            addRepo(bm[1], 'author_bio_or_quote', `Hallado en la biografía de @${user}`)
          }

          // Facets del tweet y de su quote
          const facets = [
            ...(Array.isArray(tw.raw_text?.facets) ? tw.raw_text.facets : []),
            ...(Array.isArray(tw.quote?.raw_text?.facets) ? tw.quote.raw_text.facets : [])
          ]
          for (const f of facets) {
            const rUrl = cleanUrlString(f?.replacement || f?.original || '')
            if (rUrl) {
              expandedUrls.add(rUrl)
              addRepo(rUrl, 'tweet_hydration', `Enlace expandido del post de @${user}`)
            }
          }

          if (tw.quote?.text) {
            const qText = String(tw.quote.text).trim()
            recoveredTextChunks.push(`[Cita @${tw.quote.author?.screen_name || ''}]: ${qText}`)
          }
        }
      }
    } catch {}

    // 1B. Si aún no tenemos un repo de GitHub y el post sugiere hilo/comentario, usar Jina Reader para leer respuestas del hilo
    const hintsThreadOrReply =
      /\b(thread|hilo|below|reply|replies|comment|comentarios|bio|abajo|debajo)\b|[🧵👇⬇️]/i.test(
        existingCaption
      )
    if (discoveredRepos.length === 0 && hintsThreadOrReply) {
      try {
        const jinaUrl = `https://r.jina.ai/${statusUrl}`
        const jinaRes = await fetch(jinaUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AtlasNavigatorAgent/3.0)',
            Accept: 'text/plain'
          },
          signal: AbortSignal.timeout(4000)
        })
        if (jinaRes.ok) {
          const markdown = (await jinaRes.text()).slice(0, 45000)
          const ghMatches = markdown.matchAll(
            /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/gi
          )
          for (const gm of ghMatches) {
            addRepo(
              gm[0],
              'jina_reader_thread',
              `Descubierto navegando el hilo y comentarios de ${statusUrl}`
            )
          }
          // También extraer links externos útiles que aparezcan en los comentarios del autor
          const extMatches = markdown.matchAll(/https?:\/\/[^\s)"'<>[\]]+/gi)
          for (const em of extMatches) {
            const cu = cleanUrlString(em[0])
            if (
              cu &&
              !/x\.com|twitter\.com|t\.co|jina\.ai|twimg\.com/i.test(cu) &&
              expandedUrls.size < 12
            ) {
              expandedUrls.add(cu)
            }
          }
        }
      } catch {}
    }
  }

  return {
    recoveredTextChunks,
    authorName,
    authorHandle,
    expandedUrls: Array.from(expandedUrls),
    discoveredRepos
  }
}

/**
 * SKILL 2: Navega páginas intermedias (Substack, blogs, landing pages, HuggingFace, YouTube)
 * usando HTML directo + fallback de Jina Reader Markdown para SPAs renderizadas por JS.
 */
export async function skillNavigateIntermediatePages(
  externalUrls: string[]
): Promise<{
  resolvedUrls: string[]
  discoveredRepos: NavigatorDiscoveredRepo[]
  pageTitles: string[]
}> {
  const resolvedUrls: string[] = []
  const discoveredRepos: NavigatorDiscoveredRepo[] = []
  const pageTitles: string[] = []

  const addRepo = (rawUrl: string, sourceDomain: string) => {
    const parsed = classifyGitHubUrl(rawUrl)
    if (parsed && parsed.kind === 'github_repo' && parsed.fullName) {
      if (!discoveredRepos.some(r => r.fullName.toLowerCase() === parsed.fullName!.toLowerCase())) {
        discoveredRepos.push({
          fullName: parsed.fullName,
          url: parsed.canonicalUrl,
          description: `Hallado navegando dentro de ${sourceDomain}`,
          discoveryMethod: 'external_page_scrape',
          confidence: 'confirmado'
        })
      }
    }
  }

  for (const rawUrl of externalUrls.slice(0, 4)) {
    let targetUrl = cleanUrlString(rawUrl)
    if (!targetUrl || !isSafeExternalUrl(targetUrl)) continue

    if (isShortenerUrl(targetUrl)) {
      const expanded = await resolveShortenedUrl(targetUrl)
      if (expanded && isSafeExternalUrl(expanded)) {
        targetUrl = expanded
      }
    }

    if (!resolvedUrls.includes(targetUrl)) {
      resolvedUrls.push(targetUrl)
    }

    // Si ya es un repo de GitHub directo
    const directGh = classifyGitHubUrl(targetUrl)
    if (directGh && directGh.kind === 'github_repo' && directGh.fullName) {
      addRepo(directGh.canonicalUrl, 'enlace expandido')
      continue
    }

    // Ignorar links internos de X/Instagram salvo que sean artículos o páginas externas
    const isXArticle = /x\.com\/i\/article\/\d+/i.test(targetUrl)
    if (!isXArticle && /(?:x\.com|twitter\.com|instagram\.com)\//i.test(targetUrl)) {
      continue
    }

    let domain = ''
    try {
      domain = new URL(targetUrl).hostname.replace(/^www\./, '')
    } catch {
      continue
    }

    let foundInHtml = false
    if (!isXArticle) {
      try {
        const res = await fetch(targetUrl, {
          redirect: 'follow',
          signal: AbortSignal.timeout(5500),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'text/html,application/xhtml+xml'
          }
        })
        if (res.ok) {
          const html = (await res.text()).slice(0, 95000)
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
          if (titleMatch && titleMatch[1]) {
            pageTitles.push(titleMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 120))
          }
          const ghMatches = html.matchAll(
            /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/gi
          )
          for (const gm of ghMatches) {
            addRepo(gm[0], domain)
            foundInHtml = true
          }
        }
      } catch {}
    }

    // Si el HTML estático no tenía el link (ej. SPA en Next/React, Artículo de X o Substack), usar Jina Reader
    if (!foundInHtml) {
      try {
        const jinaRes = await fetch(`https://r.jina.ai/${targetUrl}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AtlasNavigatorAgent/3.0)',
            Accept: 'text/plain'
          },
          signal: AbortSignal.timeout(6500)
        })
        if (jinaRes.ok) {
          const md = (await jinaRes.text()).slice(0, 50000)
          const ghMatches = md.matchAll(
            /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/gi
          )
          for (const gm of ghMatches) {
            addRepo(gm[0], `${domain} (lectura profunda)`)
          }
        }
      } catch {}
    }
  }

  return {
    resolvedUrls,
    discoveredRepos,
    pageTitles
  }
}

/**
 * SKILL 3: Agente IA con Grounding Web (Gemini con Google Search tool / OpenAI / Anthropic / Ollama)
 * + Motor de deducción multilingüe para razonar qué repositorio o herramienta se menciona.
 */
export async function skillAiModelWebGrounding(params: {
  caption: string
  title?: string
  authorHandle?: string
  externalUrls: string[]
}): Promise<{
  discoveredRepos: NavigatorDiscoveredRepo[]
  candidateQueries: string[]
}> {
  const discoveredRepos: NavigatorDiscoveredRepo[] = []
  const candidateQueries: string[] = []
  const combined = `${params.title || ''} ${params.caption || ''} ${params.externalUrls.join(' ')}`.trim()

  // 3A. Verificar primero nuestro mapa de herramientas/repositorios conocidos mencionados indirectamente
  for (const known of KNOWN_INDIRECT_TOOL_REPOS) {
    if (known.pattern.test(combined)) {
      discoveredRepos.push({
        fullName: known.fullName,
        url: `https://github.com/${known.fullName}`,
        description: known.descriptionEs,
        discoveryMethod: 'ai_web_grounding',
        confidence: 'confirmado'
      })
    }
  }

  // 3B. Extraer queries inteligentes desde dominios externos (ej. http://voicebox.sh -> voicebox, https://lexis.hridya.tech -> lexis)
  for (const u of params.externalUrls) {
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/^www\./, '')
      if (
        ![
          'x.com',
          'twitter.com',
          't.co',
          'instagram.com',
          'youtube.com',
          'youtu.be',
          'substack.com',
          'medium.com',
          'huggingface.co'
        ].some(d => host === d || host.endsWith(`.${d}`))
      ) {
        const baseName = host.split('.')[0]
        if (baseName && baseName.length >= 3 && !candidateQueries.includes(baseName)) {
          candidateQueries.push(baseName)
        }
      }
      // Si es un modelo en HuggingFace (ej. https://huggingface.co/ttindall/Qwen3.8-27B-Defiance-Uncensored-MTP-GGUF)
      if (host === 'huggingface.co') {
        const parts = new URL(u).pathname.split('/').filter(Boolean)
        if (parts.length >= 2) {
          candidateQueries.push(`${parts[0]} ${parts[1].split('-')[0]}`)
        }
      }
    } catch {}
  }

  // 3C. Extraer nombres de proyectos entre comillas o corchetes japoneses/chinos/ingleses o patrones "Se llama X"
  const nameMatches = [
    ...combined.matchAll(/『([^』]{3,40})』/g),
    ...combined.matchAll(/【([^】]{3,40})】/g),
    ...combined.matchAll(/(?:se llama|it['’]s called|called|named|presenta|liberado|released|open-source[dó]?)\s+["'`*]?([A-Za-z0-9_.-]{3,35})["'`*]?/gi),
    ...combined.matchAll(/\b([A-Za-z0-9]+-(?:MCP|Skill|Skills|Agent|Agents|CLI|UI|AI|LLM|Use|Voice|TTS|Box|Harness|Plex)(?:-[A-Za-z0-9]+)*)\b/gi)
  ]
  for (const m of nameMatches) {
    const token = (m[1] || '').trim().replace(/[.,;:!?)]+$/, '')
    if (
      token.length >= 3 &&
      !/^(?:una|uno|los|las|the|this|that|for|with|free|open|source|保存版)$/i.test(token) &&
      !candidateQueries.includes(token)
    ) {
      candidateQueries.push(token)
    }
  }

  // 3D. Si GEMINI_API_KEY está configurada y aún no hallamos repo, invocar Gemini con Google Search Grounding
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  if (geminiKey && discoveredRepos.length === 0 && combined.length >= 20) {
    try {
      const prompt = `Eres un agente investigador experto en encontrar repositorios de GitHub ocultos a partir de publicaciones de redes sociales donde el autor no puso el link directo o lo dejó en comentarios.
Analiza la siguiente publicación y usa búsqueda web si es necesario para identificar el repositorio exacto de GitHub (formato owner/repo) o una consulta de búsqueda precisa en GitHub.
Devuelve SOLO JSON válido con este esquema:
{
  "githubFullName": "owner/repo o vacío si no existe",
  "searchQuery": "términos clave en inglés para buscar el repositorio en GitHub",
  "explanationEs": "breve explicación en español de qué proyecto es"
}

Autor: ${params.authorHandle || ''}
Enlaces: ${params.externalUrls.join(', ')}
Texto:
"""
${combined.slice(0, 2500)}
"""`

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(9000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }]
          })
        }
      )

      if (res.ok) {
        const data = await res.json()
        const rawText = data?.candidates?.[0]?.content?.parts
          ?.map((p: any) => p?.text || '')
          .join('\n') || ''
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.githubFullName && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(parsed.githubFullName.trim())) {
            const fn = parsed.githubFullName.trim()
            discoveredRepos.push({
              fullName: fn,
              url: `https://github.com/${fn}`,
              description: parsed.explanationEs || `Identificado por Agente Gemini con navegación web (${fn}).`,
              discoveryMethod: 'ai_web_grounding',
              confidence: 'probable'
            })
          }
          if (parsed.searchQuery && typeof parsed.searchQuery === 'string') {
            candidateQueries.unshift(parsed.searchQuery.trim())
          }
        }
      }
    } catch {}
  }

  return {
    discoveredRepos,
    candidateQueries: candidateQueries.slice(0, 4)
  }
}

/**
 * SKILL 4: Búsqueda verificada en GitHub Search API (comparando nombre, descripción y homepage)
 * + Fallback de búsqueda web en DuckDuckGo HTML (`site:github.com`).
 */
export async function skillSearchGitHubAndDuckDuckGo(params: {
  queries: string[]
  externalUrls: string[]
  authorHandle?: string
  token?: string | null
}): Promise<NavigatorDiscoveredRepo | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'AtlasWebNavigatorAgent/3.0'
  }
  const effectiveToken = params.token?.trim() || process.env.GITHUB_TOKEN?.trim()
  if (effectiveToken) {
    headers.Authorization = `Bearer ${effectiveToken}`
  }

  const externalDomains = params.externalUrls
    .map(u => {
      try {
        return new URL(u).hostname.toLowerCase().replace(/^www\./, '')
      } catch {
        return ''
      }
    })
    .filter(d => d && !['x.com', 'twitter.com', 't.co', 'instagram.com'].includes(d))

  const cleanHandle = (params.authorHandle || '').replace(/^@/, '').toLowerCase()

  for (const q of params.queries.slice(0, 3)) {
    if (!q || q.length < 3) continue
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
        q
      )}&sort=stars&order=desc&per_page=6`
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) })
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data?.items) ? data.items : []
        const qNorm = q.toLowerCase().replace(/[-_\s]+/g, '')

        for (const item of items) {
          const repoName = String(item.name || '').toLowerCase()
          const repoNorm = repoName.replace(/[-_\s]+/g, '')
          const fullName = String(item.full_name || '')
          const ownerLogin = String(item.owner?.login || '').toLowerCase()
          const homepage = String(item.homepage || '').toLowerCase()
          const stars = Number(item.stargazers_count) || 0

          const homepageMatch =
            externalDomains.length > 0 &&
            externalDomains.some(d => homepage.includes(d))

          const exactNameMatch =
            repoNorm === qNorm ||
            fullName.toLowerCase() === q.toLowerCase()

          const handleMatch = Boolean(cleanHandle) && ownerLogin === cleanHandle

          if (homepageMatch || (exactNameMatch && (stars >= 25 || handleMatch))) {
            return {
              fullName,
              url: `https://github.com/${fullName}`,
              description:
                String(item.description || '').trim() ||
                `Repositorio hallado por el Agente Navegador (${fullName}).`,
              stars,
              discoveryMethod: 'github_search_inference',
              confidence: homepageMatch || handleMatch ? 'confirmado' : 'probable'
            }
          }
        }
      }
    } catch {}
  }

  // Fallback DuckDuckGo HTML search si no hubo match directo en GitHub API pero tenemos un dominio propio de herramienta
  if (externalDomains.length > 0) {
    const dom = externalDomains[0]
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:github.com "${dom}"`)}`
      const ddgRes = await fetch(ddgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(5500)
      })
      if (ddgRes.ok) {
        const html = (await ddgRes.text()).slice(0, 40000)
        const ghMatch = html.match(/https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i)
        if (ghMatch) {
          const parsed = classifyGitHubUrl(ghMatch[0])
          if (parsed && parsed.kind === 'github_repo' && parsed.fullName) {
            return {
              fullName: parsed.fullName,
              url: parsed.canonicalUrl,
              description: `Hallado mediante búsqueda web cruzada del dominio ${dom}.`,
              discoveryMethod: 'ai_web_grounding',
              confidence: 'probable'
            }
          }
        }
      }
    } catch {}
  }

  return null
}

/**
 * SKILL 5: Construye el "Link de ese Link" (Fallback Inteligente Obligatorio + Búsqueda Asistida en 1 Clic)
 * cuando una publicación técnica no incluye un link directo de GitHub accesible sin sesión o apunta a una web/hilo intermedio.
 */
export function skillBuildFallbackReferenceLink(params: {
  sourceUrl: string
  platform: string
  authorHandle?: string
  authorName?: string
  title?: string
  caption: string
  expandedUrls: string[]
  candidateQueries: string[]
}): FallbackReferenceLink {
  const nonShortExternal = params.expandedUrls.filter(
    u =>
      !/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com|instagram\.com|t\.co)\//i.test(u) ||
      /x\.com\/i\/article\/\d+/i.test(u)
  )

  const primaryUrl = nonShortExternal[0] || params.expandedUrls[0] || params.sourceUrl
  let primaryLabel = 'Abrir publicación original y comentarios'
  let reasonEs =
    'El autor no incluyó un enlace directo a GitHub en el texto principal (suele estar en las respuestas del hilo o requiere navegación manual).'

  if (nonShortExternal.length > 0) {
    try {
      const host = new URL(nonShortExternal[0]).hostname.replace(/^www\./, '')
      if (/x\.com\/i\/article\//i.test(nonShortExternal[0])) {
        primaryLabel = `Abrir Artículo extenso de X (${params.authorHandle || 'autor'})`
        reasonEs =
          'El recurso principal es un Artículo extenso de X; usá este enlace directo para leer el artículo o buscar el repositorio.'
      } else {
        primaryLabel = `Abrir link intermedio (${host})`
        reasonEs = `La publicación apunta al sitio intermedio ${host} ("el link de ese link"). Queda guardado aquí listo para abrir o buscar su código.`
      }
    } catch {
      primaryLabel = 'Abrir enlace externo de referencia'
    }
  } else if (params.platform === 'x' && params.sourceUrl.includes('x.com/')) {
    primaryLabel = `Ver hilo y comentarios en X (${params.authorHandle || params.authorName || 'autor'})`
    reasonEs =
      'Sin enlace externo en el primer post; abrí directamente el hilo en X para ver el comentario del autor o usá la búsqueda inteligente.'
  }

  // Construir query inteligente para buscar en 1 clic en Google y en GitHub
  const cleanCaption = stripClickbait(params.caption)
  const fallbackWords = (params.title || cleanCaption)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\p{L}\p{N}\s._-]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !/^(?:para|con|por|los|las|una|uno|que|del|esto|esta|este|como|todo|toda|pero|mas|the|and|for|with|this|that|from|your|you|can|now|just|here|how)$/i.test(w))
    .slice(0, 5)
    .join(' ')

  const extractedQuery =
    params.candidateQueries[0] ||
    fallbackWords ||
    `${(params.authorHandle || '').replace(/^@/, '')} github`

  const webSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `site:github.com ${extractedQuery}`
  )}`
  const githubSearchUrl = `https://github.com/search?q=${encodeURIComponent(
    extractedQuery
  )}&type=repositories`

  return {
    primaryUrl,
    primaryLabel,
    webSearchUrl,
    githubSearchUrl,
    extractedQuery,
    reasonEs
  }
}

/**
 * Convierte un `FallbackReferenceLink` en un `LinkedResource` persistente dentro del Bookmark
 * para que aparezca siempre en la tabla de Biblioteca, en la hoja de detalle y en los Excel exportados.
 */
export function fallbackReferenceToLinkedResource(
  fb: FallbackReferenceLink,
  topics: string[] = []
): LinkedResource {
  let domain = 'x.com'
  try {
    domain = new URL(fb.primaryUrl).hostname.toLowerCase().replace(/^www\./, '')
  } catch {}

  const id = `res:ref:${createHash('sha1').update(fb.primaryUrl.toLowerCase()).digest('hex').slice(0, 10)}`
  return {
    id,
    url: fb.primaryUrl,
    resolvedUrl: fb.primaryUrl,
    domain,
    kind: /x\.com\/i\/article\//i.test(fb.primaryUrl)
      ? 'article'
      : domain === 'x.com' || domain === 'twitter.com'
      ? 'other'
      : 'webapp',
    name: fb.primaryLabel,
    description: `${fb.reasonEs} | Búsqueda sugerida: "${fb.extractedQuery}"`,
    purpose: `Enlace de referencia ("el link de ese link") + búsqueda asistida: ${fb.githubSearchUrl}`,
    resourceType: 'Aplicación o herramienta',
    topics: topics.filter(t => t !== 'Sin clasificar'),
    howToUse: `Abrir ${fb.primaryLabel} o buscar "${fb.extractedQuery}" en GitHub`,
    evaluation: `${fb.reasonEs} Incluye link directo y búsqueda en 1 clic.`,
    verificationStatus: 'candidate',
    verifiedAt: new Date().toISOString(),
    provenanceChain: [fb.primaryUrl, fb.githubSearchUrl],
    evidenceBasis: 'http_metadata'
  }
}

/**
 * Orquestador Principal del Agente Navegador Web y Clasificador de Alcance para un Guardado.
 */
export async function runWebNavigatorAgentForBookmark(
  bm: BookmarkItem,
  options: { token?: string | null } = {}
): Promise<WebNavigatorAgentOutput> {
  const skillsExecuted: string[] = []

  // Paso 0: Evaluar si es un archivo fuera del radar técnico (Fotos personales, deportes, comida, juegos casuales, etc.)
  skillsExecuted.push('skillClassifyScopeAndOffTopic')
  const offTopicInfo = evaluateBookmarkScopeAndOffTopic({
    caption: bm.caption,
    title: bm.title,
    authorName: bm.authorName,
    authorHandle: bm.authorHandle,
    platform: bm.platform,
    outgoingLinks: bm.outgoingLinks,
    mediaType: bm.mediaType,
    mediaUrls: bm.mediaUrls,
    topics: bm.topics
  })

  if (offTopicInfo.isOffTopic) {
    return {
      bookmarkId: bm.id,
      isOffTopic: true,
      offTopicInfo,
      expandedLinks: bm.outgoingLinks || [],
      discoveredRepos: [],
      skillsExecuted
    }
  }

  let currentCaption = bm.caption || ''
  let hydratedAuthorName = bm.authorName
  let hydratedAuthorHandle = bm.authorHandle
  const allLinks = new Set<string>(bm.outgoingLinks || [])
  const discoveredRepos: NavigatorDiscoveredRepo[] = []

  const addDiscovered = (repo: NavigatorDiscoveredRepo) => {
    if (!discoveredRepos.some(d => d.fullName.toLowerCase() === repo.fullName.toLowerCase())) {
      discoveredRepos.push(repo)
      allLinks.add(repo.url)
    }
  }

  // Paso 1: Skill 3 (Fast Pass) — Agente IA con Grounding Web & Razonamiento Multilingüe sobre el texto ya disponible
  skillsExecuted.push('skillAiModelWebGrounding')
  const fastAiRes = await skillAiModelWebGrounding({
    caption: currentCaption,
    title: bm.title,
    authorHandle: hydratedAuthorHandle,
    externalUrls: Array.from(allLinks)
  })
  for (const r of fastAiRes.discoveredRepos) addDiscovered(r)

  // Paso 2: Skill 1 — Inspeccionar Hilo, Comentarios/Respuestas de X, Citas y Bio del Autor (si aún no hay repo o el texto es corto/WhatsApp)
  const inlineXUrls =
    currentCaption.match(
      /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+(?:\/video\/\d+)?/gi
    ) || []
  const xUrls = Array.from(
    new Set([
      ...(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+/i.test(
        bm.sourceUrl
      )
        ? [bm.sourceUrl]
        : []),
      ...Array.from(allLinks).filter(u =>
        /^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+/i.test(u)
      ),
      ...inlineXUrls
    ])
  )

  const needsSocialHydration =
    discoveredRepos.length === 0 ||
    currentCaption.trim().length < 75 ||
    bm.platform === 'whatsapp' ||
    inlineXUrls.some(u => u.includes('/video/'))

  if (xUrls.length > 0 && needsSocialHydration) {
    skillsExecuted.push('skillInspectSocialThreadAndComments')
    const socialRes = await skillInspectSocialThreadAndComments(xUrls, currentCaption)
    for (const chunk of socialRes.recoveredTextChunks) {
      if (chunk && !currentCaption.includes(chunk.slice(0, 35))) {
        currentCaption = currentCaption
          ? `${currentCaption}\n\n${chunk}`
          : chunk
      }
    }
    if (socialRes.authorName && (hydratedAuthorName === 'WhatsApp' || !hydratedAuthorName)) {
      hydratedAuthorName = `${socialRes.authorName} (vía WhatsApp)`
    }
    if (socialRes.authorHandle && (hydratedAuthorHandle === 'WhatsApp' || !hydratedAuthorHandle)) {
      hydratedAuthorHandle = socialRes.authorHandle
    }
    for (const u of socialRes.expandedUrls) allLinks.add(u)
    for (const r of socialRes.discoveredRepos) addDiscovered(r)
  }

  // Paso 3: Skill 2 — Navegar páginas intermedias (Substack, blogs, landing pages, artículos)
  const nonSocialLinks = Array.from(allLinks).filter(
    u =>
      !/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com|instagram\.com)\//i.test(u) ||
      /x\.com\/i\/article\/\d+/i.test(u)
  )
  if (nonSocialLinks.length > 0 && discoveredRepos.length === 0) {
    skillsExecuted.push('skillNavigateIntermediatePages')
    const navRes = await skillNavigateIntermediatePages(nonSocialLinks)
    for (const u of navRes.resolvedUrls) allLinks.add(u)
    for (const r of navRes.discoveredRepos) addDiscovered(r)
  }

  // Paso 3B: Si el hilo o las páginas intermedias agregaron nuevo texto/links y aún no hay repo, re-evaluar Grounding
  const aiRes =
    currentCaption !== bm.caption || allLinks.size !== (bm.outgoingLinks || []).length
      ? await skillAiModelWebGrounding({
          caption: currentCaption,
          title: bm.title,
          authorHandle: hydratedAuthorHandle,
          externalUrls: Array.from(allLinks)
        })
      : fastAiRes
  for (const r of aiRes.discoveredRepos) addDiscovered(r)

  // Paso 4: Skill 4 — Búsqueda en GitHub API (con match de homepage y nombre) + DuckDuckGo Web Search
  if (discoveredRepos.length === 0 && (aiRes.candidateQueries.length > 0 || nonSocialLinks.length > 0)) {
    skillsExecuted.push('skillSearchGitHubAndDuckDuckGo')
    const searchHit = await skillSearchGitHubAndDuckDuckGo({
      queries: aiRes.candidateQueries,
      externalUrls: Array.from(allLinks),
      authorHandle: hydratedAuthorHandle,
      token: options.token
    })
    if (searchHit) {
      addDiscovered(searchHit)
    }
  }

  // Paso 5: Skill 5 — Si aún no hay repositorio confirmado en GitHub, generar SIEMPRE el "Link de ese Link" + Búsqueda Asistida
  let fallbackReference: FallbackReferenceLink | undefined
  if (discoveredRepos.length === 0) {
    skillsExecuted.push('skillBuildFallbackReferenceLink')
    fallbackReference = skillBuildFallbackReferenceLink({
      sourceUrl: bm.sourceUrl,
      platform: bm.platform,
      authorHandle: hydratedAuthorHandle,
      authorName: hydratedAuthorName,
      title: bm.title,
      caption: currentCaption,
      expandedUrls: Array.from(allLinks),
      candidateQueries: aiRes.candidateQueries
    })
  }

  return {
    bookmarkId: bm.id,
    isOffTopic: false,
    offTopicInfo,
    hydratedText: currentCaption !== bm.caption ? currentCaption : undefined,
    hydratedAuthorName,
    hydratedAuthorHandle,
    expandedLinks: Array.from(allLinks),
    discoveredRepos,
    fallbackReference,
    skillsExecuted
  }
}
