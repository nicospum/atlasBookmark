import { BookmarkItem, GalleryRepository } from './types'
import {
  evaluateAndClassifyRepository,
  extractInstallAndSetupSnippets,
  isGenericRepoDescription
} from './github-gallery'

export type SkillRecommendationVerdict =
  | 'Sí — Altamente recomendado'
  | 'Sí — Recomendado'
  | 'Con reservas — Revisar'
  | 'No recomendado'

export type ExtractedSkillKind =
  | 'Skill (SKILL.md)'
  | 'Comando Slash (/cmd)'
  | 'Subagente Especializado'
  | 'Servidor / Conector MCP'
  | 'Aplicación / Herramienta'
  | 'Librería / Framework / SDK'
  | 'Modelo / Dataset IA'
  | 'Herramienta / Workflow IA'

export interface ExtractedRepoSkill {
  id: string
  skillName: string
  skillSlug: string
  skillKind: ExtractedSkillKind
  whatItDoesEs: string
  capabilitiesEs: string
  repoFullName: string
  repoUrl: string
  skillUrl: string
  stars: number
  forks: number
  companyOrAuthor: string
  creatorKind: string
  areaCategory: string
  projectUseCases: string
  recommended: SkillRecommendationVerdict
  recommendationReason: string
  atlasScore: number
  securityGrade: 'Alto' | 'Medio' | 'Precaución'
  installCommand: string
  comments: string
  isSubSkillFromReadme: boolean
  isOpenSource: boolean
  openSourceLabel: string
  licenseName: string
  requiresLogin: 'No (100% Local)' | 'Opcional (API / Cloud)' | 'Sí (Cuenta / API Key)'
  pricingModel:
    | '100% Gratis (Open Source)'
    | 'Gratis + BYOK (Tu API Key)'
    | 'Freemium (Local Gratis + Cloud)'
    | 'Servicio Pago'
}

export interface SkillNoteOverride {
  skillId: string
  comments?: string
  recommended?: SkillRecommendationVerdict
  updatedAt?: string
}

const KNOWN_SKILL_TRANSLATIONS_ES: Record<string, { whatItDoesEs: string; capabilitiesEs: string; projectUseCases?: string }> = {
  'grill-me': {
    whatItDoesEs: 'Entrevista interactiva donde el agente te hace preguntas incisivas para alinear requerimientos y decisiones de diseño antes de programar.',
    capabilitiesEs: 'Cuestionar supuestos, detectar huecos en el diseño, alinear alcance de producto y evitar código mal encarado.',
    projectUseCases: 'Cualquier proyecto nuevo, definición de MVP, refactors complejos o diseño de arquitectura antes de escribir código.'
  },
  'grill-with-docs': {
    whatItDoesEs: 'Sesión de alineación profunda que además genera y actualiza documentos de arquitectura, glosario y decisiones técnicas en el repositorio.',
    capabilitiesEs: 'Entrevistar al desarrollador, documentar decisiones (ADR/PRD), crear lenguaje ubicuo y alinear agentes.',
    projectUseCases: 'Proyectos medianos/grandes con múltiples agentes (Claude Code, Cursor, Codex) que necesitan contexto persistente.'
  },
  'triage': {
    whatItDoesEs: 'Analiza y clasifica issues, bugs o tickets automáticamente aplicando etiquetas y prioridades en GitHub/GitLab o archivos locales.',
    capabilitiesEs: 'Triaje de bugs, etiquetado automático, diagnóstico preliminar de causas raíz y priorización de backlog.',
    projectUseCases: 'Repositorios con alto volumen de issues, mantenimiento open-source o equipos de producto.'
  },
  'setup-matt-pocock-skills': {
    whatItDoesEs: 'Configura el entorno de skills de ingeniería en el repositorio (gestor de issues, etiquetas de triaje y carpeta de documentación).',
    capabilitiesEs: 'Inicialización de flujo de trabajo agéntico, configuración de tracker y rutas de documentación.',
    projectUseCases: 'Onboarding inicial de cualquier repositorio asistido por Claude Code, Cursor o Codex.'
  },
  'agents-md': {
    whatItDoesEs: 'Crea y mantiene archivos AGENTS.md y CLAUDE.md concisos y respaldados por referencias reales del código.',
    capabilitiesEs: 'Generar instrucciones para agentes, documentar convenciones del repo y mantener reglas sincronizadas.',
    projectUseCases: 'Estandarizar el contexto de IA en monorepos y proyectos full-stack.'
  },
  'code-review': {
    whatItDoesEs: 'Ejecuta revisiones de código profundas aplicando buenas prácticas de ingeniería, seguridad y mantenibilidad.',
    capabilitiesEs: 'Detectar bugs, evaluar legibilidad, revisar tipado, sugerir mejoras concretas en PRs y commits.',
    projectUseCases: 'Auditoría previa a merge, CI/CD asistido por agentes y control de calidad.'
  },
  'code-simplifier': {
    whatItDoesEs: 'Simplifica y refina código complejo para mejorar su claridad, consistencia y mantenibilidad conservando el comportamiento exacto.',
    capabilitiesEs: 'Reducir deuda técnica, eliminar código redundante, mejorar nombres y simplificar lógica.',
    projectUseCases: 'Refactorización de módulos legacy, limpieza post-MVP y optimización de legibilidad.'
  },
  'claude-settings-audit': {
    whatItDoesEs: 'Audita un repositorio para generar permisos recomendados y seguros en el archivo settings.json de Claude Code.',
    capabilitiesEs: 'Escaneo de comandos frecuentes, configuración de allowlists/denylists y endurecimiento de permisos de agente.',
    projectUseCases: 'Equipos que usan Claude Code y necesitan seguridad en la ejecución local de herramientas.'
  },
  'browse-local-sentry': {
    whatItDoesEs: 'Conecta el navegador del agente a un servidor de desarrollo local autenticado para hacer QA visual y capturas de pantalla.',
    capabilitiesEs: 'Automatización de navegador local, pruebas visuales de UI, captura de pantallas y verificación end-to-end.',
    projectUseCases: 'Testing automatizado de frontends y verificación visual de flujos locales.'
  },
  'blog-writing-guide': {
    whatItDoesEs: 'Redacta, revisa y mejora artículos técnicos de ingeniería siguiendo estándares profesionales de claridad y tono.',
    capabilitiesEs: 'Redacción técnica, edición de posts de ingeniería, estructuración de tutoriales y revisión de estilo.',
    projectUseCases: 'Blogs técnicos, changelogs de producto, documentación para desarrolladores y lanzamientos.'
  },
  'brand-guidelines': {
    whatItDoesEs: 'Verifica y redacta textos de interfaz y comunicación respetando las guías de marca y tono del producto.',
    capabilitiesEs: 'Revisión de copy UX, consistencia de marca, adaptación de tono y validación de estilo.',
    projectUseCases: 'Landing pages, aplicaciones SaaS, diseño de producto y marketing técnico.'
  },
  'docx': {
    whatItDoesEs: 'Skill oficial de Anthropic para crear, leer, editar y formatear documentos Word (.docx) complejos con tablas y estilos.',
    capabilitiesEs: 'Generación de documentos Word profesionales, extracción de texto estructurado y edición programática.',
    projectUseCases: 'Automatización de reportes ejecutivos, contratos, propuestas comerciales y documentación.'
  },
  'pdf': {
    whatItDoesEs: 'Skill oficial de Anthropic para inspeccionar, extraer tablas/texto, combinar, rellenar formularios y generar archivos PDF.',
    capabilitiesEs: 'Lectura avanzada de PDFs, OCR, extracción de formularios, generación de reportes PDF y partición de páginas.',
    projectUseCases: 'Pipelines de análisis documental, legaltech, fintech y procesamiento de facturas o papers.'
  },
  'pptx': {
    whatItDoesEs: 'Skill oficial de Anthropic para diseñar, generar y modificar presentaciones PowerPoint (.pptx) con layouts limpios.',
    capabilitiesEs: 'Creación de diapositivas, estructuración de pitch decks, inserción de gráficos y diseño visual en PowerPoint.',
    projectUseCases: 'Generadores de presentaciones ejecutivas, reportes comerciales y educación.'
  },
  'xlsx': {
    whatItDoesEs: 'Skill oficial de Anthropic para construir, auditar y manipular hojas de cálculo Excel (.xlsx) con fórmulas, estilos y múltiples pestañas.',
    capabilitiesEs: 'Modelado financiero en Excel, fórmulas sin errores, tablas dinámicas, limpieza de datos y exportación multi-hoja.',
    projectUseCases: 'Dashboards de datos, reportes contables/financieros, catálogos auditables y BI.'
  },
  'emil-design-eng': {
    whatItDoesEs: 'Guía experta de diseño e ingeniería de interfaces (creada por Emil Kowalski, ex-Vercel/Linear) para pulir micro-interacciones y estética UI.',
    capabilitiesEs: 'Mejorar buen gusto visual en UI, corregir sombras/bordes, aplicar curvas de animación naturales y elevar calidad frontend.',
    projectUseCases: 'Aplicaciones web modernas en React/Next.js que buscan calidad visual nivel Linear o Vercel.'
  },
  'animate': {
    whatItDoesEs: 'Construye animaciones de interfaz desde cero eligiendo la curva de easing, duración, spring y propiedades CSS/Framer Motion óptimas.',
    capabilitiesEs: 'Diseño de transiciones fluidas, elección de ease-out vs spring, optimización a 60fps y micro-interacciones.',
    projectUseCases: 'Componentes interactivos, modales, menús desplegables y experiencias web pulidas.'
  },
  'code-security': {
    whatItDoesEs: 'Reglas de seguridad de código de Semgrep cubriendo OWASP Top 10, prevención de inyecciones, XSS, manejo de secretos e infraestructura.',
    capabilitiesEs: 'Auditoría SAST para agentes, prevención de SQLi/XSS/SSRF, validación de JWT y seguridad en Terraform/Docker.',
    projectUseCases: 'Auditoría de seguridad continua al escribir código con IA en más de 15 lenguajes.'
  },
  'qdrant-advisor': {
    whatItDoesEs: 'Asesor arquitectónico en vivo para búsqueda vectorial con Qdrant (cuantización, sharding, aislamiento multi-tenant y búsqueda híbrida).',
    capabilitiesEs: 'Diseño de bases vectoriales RAG, optimización de memoria, búsqueda semántica + filtros y migración de embeddings.',
    projectUseCases: 'Sistemas RAG en producción, motores de búsqueda semántica y memoria de largo plazo para agentes.'
  },
  'prisma-cli': {
    whatItDoesEs: 'Referencia operativa para ejecutar comandos de Prisma ORM 7 (init, generate, migrate, db push/pull y Prisma Studio/MCP).',
    capabilitiesEs: 'Gestión de esquemas SQL, migraciones seguras, generación de cliente tipado y conexión a base de datos.',
    projectUseCases: 'Backends en TypeScript/Node.js y Next.js con PostgreSQL, SQLite o MySQL.'
  },
  'prisma-upgrade-v7': {
    whatItDoesEs: 'Guía paso a paso para migrar proyectos de Prisma v6 a v7 resolviendo cambios de ESM, driver adapters y prisma.config.ts.',
    capabilitiesEs: 'Migración asistida de versión, resolución de breaking changes y actualización de cliente Prisma.',
    projectUseCases: 'Modernización de aplicaciones Node.js/Next.js que actualizan su capa de base de datos.'
  },
  'neon-postgres': {
    whatItDoesEs: 'Buenas prácticas oficiales para Postgres serverless en Neon, incluyendo branching de base de datos y optimización de tráfico.',
    capabilitiesEs: 'Configuración de ramas de BD por PR, pooling de conexiones serverless y optimización de consultas SQL.',
    projectUseCases: 'Apps full-stack desplegadas en Vercel/Netlify con base de datos PostgreSQL serverless.'
  },
  'neon-auth': {
    whatItDoesEs: 'Integración de autenticación gestionada (Managed Better Auth) conectada directamente a tu base de datos Neon Postgres.',
    capabilitiesEs: 'Configuración de login, sesiones, usuarios y permisos sincronizados en PostgreSQL.',
    projectUseCases: 'SaaS y aplicaciones web que requieren autenticación rápida sin gestionar servidores propios.'
  }
}

function cleanMarkdownInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function translateOrEnhanceSkillDescriptionEs(
  skillName: string,
  rawDesc: string,
  repo: GalleryRepository,
  areaCategory: string
): { whatItDoesEs: string; capabilitiesEs: string } {
  const cleanKey = skillName.toLowerCase().replace(/^\/+/, '').trim()
  if (KNOWN_SKILL_TRANSLATIONS_ES[cleanKey]) {
    return {
      whatItDoesEs: KNOWN_SKILL_TRANSLATIONS_ES[cleanKey].whatItDoesEs,
      capabilitiesEs: KNOWN_SKILL_TRANSLATIONS_ES[cleanKey].capabilitiesEs
    }
  }

  const cleaned = cleanMarkdownInline(rawDesc)
  if (!cleaned || cleaned.length < 8 || isGenericRepoDescription(cleaned)) {
    const fallbackRepoText = !isGenericRepoDescription(repo.shortExplanationEs)
      ? repo.shortExplanationEs
      : !isGenericRepoDescription(repo.explanation)
      ? repo.explanation
      : !isGenericRepoDescription(repo.description)
      ? repo.description
      : ''
    return {
      whatItDoesEs:
        fallbackRepoText ||
        `Skill especializado (${skillName}) incluido en ${repo.fullName} para potenciar flujos de ${areaCategory}.`,
      capabilitiesEs: inferCapabilitiesByArea(skillName, cleaned, areaCategory, repo)
    }
  }

  // If already in Spanish, keep and polish; if in English, provide a clear Spanish explanation + original detail
  const looksSpanish = /\b(para|con|que|los|las|del|una|permite|crea|analiza|automatiza|código|proyecto|datos|diseño)\b/i.test(
    cleaned
  )
  let whatItDoesEs = cleaned
  if (!looksSpanish) {
    whatItDoesEs = translateEnglishSkillPhraseToSpanish(skillName, cleaned, repo.fullName)
  }

  const capabilitiesEs = inferCapabilitiesByArea(skillName, cleaned, areaCategory, repo)
  return { whatItDoesEs, capabilitiesEs }
}

function translateEnglishSkillPhraseToSpanish(skillName: string, englishDesc: string, repoFullName: string): string {
  const d = englishDesc
    .trim()
    .replace(
      /^(?:Skill|Agente o workflow|Servidor MCP o conector|Librería, framework o SDK|Aplicación o herramienta|Modelo o dataset|Artículo, tutorial, investigación o material educativo):\s*/i,
      ''
    )
    .trim()
  const lower = d.toLowerCase()

  const prefixMap: Array<[RegExp, string]> = [
    [/^create and maintain\s+/i, 'Crea y mantiene '],
    [/^write, review, and improve\s+/i, 'Redacta, revisa y mejora '],
    [/^write copy following\s+/i, 'Redacta textos siguiendo '],
    [/^connect an agent'?s browser to\s+/i, 'Conecta el navegador del agente a '],
    [/^analyze a repository to\s+/i, 'Analiza un repositorio para '],
    [/^perform code reviews\s+/i, 'Ejecuta revisiones de código '],
    [/^simplifies and refines code\s+/i, 'Simplifica y refina el código '],
    [/^builds an animation\s+/i, 'Construye animaciones de UI '],
    [/^the main skill that\s+/i, 'Skill principal que '],
    [/^step-by-step migration guide\s+/i, 'Guía de migración paso a paso '],
    [/^reference for\s+/i, 'Referencia interactiva para '],
    [/^comprehensive\s+/i, 'Guía completa de '],
    [/^an overview of\s+/i, 'Guía general y configuración de '],
    [/^define what to build/i, 'Define qué construir (especificación y PRD antes de programar)'],
    [/^plan how to build it/i, 'Planifica cómo construirlo dividiendo el proyecto en tareas atómicas'],
    [/^build incrementally/i, 'Construye de forma incremental paso a paso con validación continua'],
    [/^prove it works/i, 'Verifica que el código funcione mediante pruebas automatizadas y debugging'],
    [/^set the quality bar/i, 'Define y aplica restricciones de calidad y arquitectura en todo el proyecto'],
    [/^review before merge/i, 'Revisa la salud y seguridad del código antes de hacer merge'],
    [/^audit web performance/i, 'Audita el rendimiento web y Core Web Vitals antes de optimizar'],
    [/^simplify the code/i, 'Simplifica el código priorizando claridad y mantenibilidad'],
    [/^ship to production/i, 'Prepara y valida el despliegue seguro a producción']
  ]

  for (const [regex, replacement] of prefixMap) {
    if (regex.test(d)) {
      const rest = d.replace(regex, '').trim()
      if (!rest || replacement.length > 35) return replacement
      return `${replacement}${rest}`
    }
  }

  if (/\b(react|frontend|ui|ux|tailwind|css|vue|angular|interface)\b/i.test(lower)) {
    return `Especialista en UI/Frontend (${skillName}): ${d}`
  }
  if (/\b(security|vulnerability|audit|owasp|pentest|sast)\b/i.test(lower)) {
    return `Auditoría y seguridad (${skillName}): ${d}`
  }
  if (/\b(database|postgres|sql|prisma|schema|query|lakehouse|etl)\b/i.test(lower)) {
    return `Datos, esquemas y consultas (${skillName}): ${d}`
  }
  if (/\b(test|qa|debug|performance|optimization)\b/i.test(lower)) {
    return `Testing, rendimiento y optimización (${skillName}): ${d}`
  }

  return `Capacidad de ${repoFullName.split('/')[1] || repoFullName}: ${d}`
}

function inferCapabilitiesByArea(
  skillName: string,
  desc: string,
  areaCategory: string,
  repo: GalleryRepository
): string {
  const hay = `${skillName} ${desc} ${areaCategory} ${repo.resourceType || ''}`.toLowerCase()
  const caps: string[] = []

  if (/\b(spec|plan|prd|architecture|grill|design|roadmap)\b/.test(hay)) {
    caps.push('Planificación de arquitectura y PRDs')
  }
  if (/\b(review|audit|security|semgrep|vulnerability|owasp|lint)\b/.test(hay)) {
    caps.push('Auditoría de código y seguridad')
  }
  if (/\b(test|qa|debug|playwright|browser|scrape|crawl)\b/.test(hay)) {
    caps.push('Automatización de navegador, scraping y QA')
  }
  if (/\b(ui|ux|css|animation|animate|tailwind|react|frontend|slide|design)\b/.test(hay)) {
    caps.push('Diseño de interfaces, animaciones y componentes UI')
  }
  if (/\b(db|database|sql|postgres|neon|prisma|supabase|qdrant|vector|rag|memory)\b/.test(hay)) {
    caps.push('Consultas a bases de datos, esquemas SQL y memoria RAG')
  }
  if (/\b(doc|docx|pdf|pptx|xlsx|excel|markdown|blog|write|copy)\b/.test(hay)) {
    caps.push('Generación y edición de documentos (Docs, PDF, Excel, Markdown)')
  }
  if (/\b(git|commit|pr|pull request|deploy|ci|terraform|docker|ship)\b/.test(hay)) {
    caps.push('Flujos Git, PRs, infraestructura y despliegue')
  }
  if (/\b(video|audio|ffmpeg|remotion|image|3d|blender|tts)\b/.test(hay)) {
    caps.push('Edición y generación multimedia (video, audio, 3D)')
  }
  if (/\b(mcp|tool|agent|subagent|swarm|workflow|orchestr)\b/.test(hay)) {
    caps.push('Orquestación de subagentes y ejecución de herramientas MCP')
  }

  if (caps.length === 0) {
    caps.push(`Automatización de tareas de ${areaCategory} en agentes de código`)
  }

  return caps.slice(0, 3).join(' · ')
}

function resolveSkillUrl(repo: GalleryRepository, rawHref?: string): string {
  const baseRepoUrl = (repo.url || `https://github.com/${repo.owner}/${repo.name}`).replace(/\/+$/, '')
  if (!rawHref) return baseRepoUrl
  const trimmed = rawHref.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const cleanRel = trimmed.replace(/^\.\//, '').replace(/^\/+/, '')
  const branch = repo.defaultBranch || 'main'
  return `${baseRepoUrl}/blob/${branch}/${cleanRel}`
}

function computeRecommendation(
  score: number,
  securityGrade: 'Alto' | 'Medio' | 'Precaución',
  stars: number,
  companyOrAuthor: string,
  creatorKind: string
): { recommended: SkillRecommendationVerdict; reason: string } {
  if (securityGrade === 'Precaución' && score < 6.5) {
    return {
      recommended: 'Con reservas — Revisar',
      reason: `Revisar permisos o madurez antes de usar en producción (${stars.toLocaleString()} ★, seguridad: ${securityGrade}).`
    }
  }
  if (score >= 8.4 || (stars >= 5000 && securityGrade === 'Alto')) {
    return {
      recommended: 'Sí — Altamente recomendado',
      reason: `Excelente respaldo de ${companyOrAuthor} (${creatorKind}), ${stars.toLocaleString()} ★ y puntaje Atlas ${score}/10.`
    }
  }
  if (score >= 6.8) {
    return {
      recommended: 'Sí — Recomendado',
      reason: `Buen nivel técnico (${score}/10) desarrollado por ${companyOrAuthor}; útil para integrar en tu flujo.`
    }
  }
  return {
    recommended: 'Con reservas — Revisar',
    reason: `Puntaje moderado (${score}/10, ${stars.toLocaleString()} ★). Conviene probarlo en un entorno aislado primero.`
  }
}

export function extractSkillsFromRepository(
  repo: GalleryRepository,
  bookmarks: BookmarkItem[] = [],
  overridesMap: Map<string, SkillNoteOverride> = new Map()
): ExtractedRepoSkill[] {
  const ev = repo.agentEvaluation || evaluateAndClassifyRepository(repo, bookmarks)
  const install = extractInstallAndSetupSnippets(repo)
  const readme = repo.readme || ''

  // Find context notes from bookmarks (X / WhatsApp / IG)
  const linkedBms = bookmarks.filter(bm => {
    if ((repo.linkedBookmarkIds || []).includes(bm.id)) return true
    return (bm.resources || []).some(
      r => (r.fullName || '').toLowerCase() === (repo.fullName || '').toLowerCase()
    )
  })
  const nonGithubBms = linkedBms.filter(b => b.platform !== 'github')
  const contextSnippet = nonGithubBms
    .map(
      b =>
        `${b.authorHandle || b.authorName} (${b.platform.toUpperCase()}): ${(b.caption || '')
          .replace(/\s+/g, ' ')
          .slice(0, 120)}`
    )
    .slice(0, 2)
    .join(' | ')
  const defaultComment = [repo.notes, contextSnippet].filter(Boolean).join(' — ')

  const extracted: Array<{
    name: string
    slug: string
    rawDesc: string
    href?: string
    kind: ExtractedSkillKind
    customInstall?: string
  }> = []
  const seenSlugs = new Set<string>()

  const pushCandidate = (
    name: string,
    rawDesc: string,
    href?: string,
    kind: ExtractedSkillKind = 'Skill (SKILL.md)',
    customInstall?: string
  ) => {
    const cleanName = cleanMarkdownInline(name)
      .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/gu, '')
      .trim()
    if (!cleanName || cleanName.length < 2 || cleanName.length > 65) return
    if (/^(skill|skills|name|agent|command|description|category|impact|tool|status|license|author|link|url|---|\|)$/i.test(cleanName)) {
      return
    }
    const slug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9/_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
    if (!slug || seenSlugs.has(slug)) return
    seenSlugs.add(slug)
    extracted.push({ name: cleanName, slug, rawDesc: rawDesc.trim(), href, kind, customInstall })
  }

  if (readme.length > 0) {
    // Pass 1: Markdown table rows linking to skills/, agents/, SKILL.md, or slash commands
    const lines = readme.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue
      if (/^\|[\s:-]+\|/.test(trimmed)) continue

      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map(c => c.trim())
      if (cells.length < 2) continue

      // Case 1A: First cell has [skill-name](path/to/SKILL.md or skills/... or engineering/... or division/...)
      const linkMatch = cells[0].match(/\[([^\]]+)\]\(([^)]+)\)/)
      if (linkMatch) {
        const [, linkLabel, linkHref] = linkMatch
        if (
          (/skill|agent|command|mcp|tool|app|plugin|engineering|design|marketing|product|testing|security|support|\.md|prompts?\//i.test(
            linkHref
          ) ||
            !/^https?:\/\//i.test(linkHref)) &&
          !/^https?:\/\/(?:img\.shields\.io|badge|discord|twitter|x\.com|linkedin)/i.test(linkHref)
        ) {
          const descCell = cells.slice(1).join(' — ')
          const kind: ExtractedSkillKind = /mcp/i.test(`${linkHref} ${linkLabel} ${repo.fullName}`)
            ? 'Servidor / Conector MCP'
            : /agent|engineering\/|design\/|marketing\/|testing\/|product\//i.test(
                `${linkHref} ${repo.fullName}`
              )
            ? 'Subagente Especializado'
            : linkLabel.startsWith('/')
            ? 'Comando Slash (/cmd)'
            : 'Skill (SKILL.md)'
          pushCandidate(linkLabel, descCell, linkHref, kind)
          continue
        }
      }

      // Case 1B: Second cell has `/command` (like addyosmani/agent-skills: | Define what to build | `/spec` | Spec before code |)
      const cmdMatch = cells[1]?.match(/^`(\/[a-z0-9:_-]+)`$/i)
      if (cmdMatch) {
        const cmdName = cmdMatch[1]
        const desc = [cells[0], cells[2]].filter(Boolean).join(' — ')
        pushCandidate(cmdName, desc, undefined, 'Comando Slash (/cmd)')
        continue
      }

      // Case 1C: Inline multi-command table cell (like pbakaus/impeccable: | **Steer** | `bolder` amplifies safe designs · `quieter` tones down... |)
      if (cells.length === 2 && cells[1].includes('`') && cells[1].includes('·')) {
        const parts = cells[1].split('·').map(p => p.trim())
        for (const p of parts) {
          const inlineCmd = p.match(/^`([a-z0-9:_-]+)`\s+(.+)$/i)
          if (inlineCmd) {
            pushCandidate(
              `/${inlineCmd[1]}`,
              `${cleanMarkdownInline(cells[0])}: ${inlineCmd[2]}`,
              undefined,
              'Comando Slash (/cmd)'
            )
          }
        }
      }
    }

    // Pass 1D: HTML gallery cards with <a href="agent_skills/..."><img ... alt="Name: description"></a> (like Shubhamsaboo/awesome-llm-apps)
    const htmlCardRegex =
      /<a\s+href="([^"]*(?:agent_skills|single_agent_apps|multi_agent_apps|mcp_ai_agents|rag_tutorials|voice_ai_agents|starter_ai_agents)[^"]*)"[^>]*>\s*<img[^>]*alt="([^"]+)"/gi
    let hm: RegExpExecArray | null
    while ((hm = htmlCardRegex.exec(readme)) !== null) {
      const [, href, altText] = hm
      const [cardTitle, ...restDesc] = altText.split(':')
      const kind: ExtractedSkillKind = /agent_skills/i.test(href)
        ? 'Skill (SKILL.md)'
        : /mcp/i.test(href)
        ? 'Servidor / Conector MCP'
        : 'Aplicación / Herramienta'
      pushCandidate(
        cardTitle.trim(),
        restDesc.join(':').trim() || altText,
        href,
        kind
      )
    }

    // Pass 2: Bullet items linking to SKILL.md, ./skills/..., ./agents/..., ./mcp/..., or repo subpaths
    const bulletSkillRegex =
      /^[*-]\s+(?:\*\*)?\[`?([^\]`]+)`?\]\(([^)]*(?:SKILL\.md|skills\/[a-z0-9_-]+|agents?\/[a-z0-9_-]+|mcp[a-z0-9/_-]*)[^)]*)\)(?:\*\*)?\s*(?:[-—:]+\s*(.+))?$/gim
    let m: RegExpExecArray | null
    while ((m = bulletSkillRegex.exec(readme)) !== null) {
      const [, label, href, desc] = m
      const kind: ExtractedSkillKind = label.trim().startsWith('/')
        ? 'Comando Slash (/cmd)'
        : /mcp/i.test(href)
        ? 'Servidor / Conector MCP'
        : /agent/i.test(href)
        ? 'Subagente Especializado'
        : 'Skill (SKILL.md)'
      pushCandidate(label, desc || '', href, kind)
    }

    // Pass 3: Inline folder references like [`skills/docx`](./skills/docx)
    const inlineSkillFolderRegex = /\[`?skills\/([a-z0-9_-]+)`?\]\(([^)]+)\)/gi
    while ((m = inlineSkillFolderRegex.exec(readme)) !== null) {
      const [, folderName, href] = m
      pushCandidate(folderName, '', href, 'Skill (SKILL.md)')
    }

    // Pass 4: ### <skill-name> subsections under "## Available Skills" or "## Skills" or "## MCP Servers"
    const skillsSectionMatch = readme.match(
      /##\s+(?:Available\s+Skills|Skills|Included\s+Skills|Agent\s+Skills|MCP\s+Servers|Available\s+Tools)\s*\r?\n([\s\S]{1,14000}?)(?=\r?\n##\s+[^#]|$)/i
    )
    if (skillsSectionMatch) {
      const sectionBody = skillsSectionMatch[1]
      const subHeadingRegex = /###\s+([^\r\n]+)\r?\n+([\s\S]*?)(?=\r?\n###\s+|\r?\n##\s+|$)/g
      let sm: RegExpExecArray | null
      while ((sm = subHeadingRegex.exec(sectionBody)) !== null) {
        const rawHeading = sm[1].trim()
        if (/^(install|installation|usage|core|overview|requirements|setup|quick start|options)/i.test(rawHeading)) {
          continue
        }
        const bodyLines = sm[2]
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(
            l =>
              l.length > 0 &&
              !l.startsWith('[![') &&
              !l.startsWith('![') &&
              !l.startsWith('```') &&
              !l.startsWith('|') &&
              !l.startsWith('>')
          )
        const firstParagraph = bodyLines.find(l => l.length > 15 && !l.startsWith('**Use when')) || bodyLines[0] || ''
        const skillShMatch = sm[2].match(/https:\/\/skills\.sh\/[^\s)]+/i)
        pushCandidate(
          rawHeading,
          firstParagraph,
          skillShMatch ? skillShMatch[0] : undefined,
          /mcp/i.test(rawHeading) ? 'Servidor / Conector MCP' : 'Skill (SKILL.md)'
        )
      }
    }
  }

  // Determine default install command for skills in this repo
  const defaultSkillInstall =
    readme.match(/npx\s+skills(?:@latest)?\s+add\s+[^\r\n`]+/i)?.[0]?.trim() ||
    readme.match(/claude\s+plugin\s+install\s+[^\r\n`]+/i)?.[0]?.trim() ||
    install.primaryCommand

  // Universal guarantee: Every single one of the 298 repositories ALSO contributes its primary Skill / MCP / Application / Framework / Model if not already present
  const primaryKind: ExtractedSkillKind =
    repo.resourceType === 'Servidor MCP o conector' || /\bmcp\b/i.test(`${repo.fullName} ${repo.description}`)
      ? 'Servidor / Conector MCP'
      : repo.resourceType === 'Skill' || /\bskills?\b/i.test(repo.fullName)
      ? 'Skill (SKILL.md)'
      : repo.resourceType === 'Agente o workflow' || /\bagents?\b/i.test(repo.fullName)
      ? 'Subagente Especializado'
      : repo.resourceType === 'Aplicación o herramienta'
      ? 'Aplicación / Herramienta'
      : repo.resourceType === 'Modelo o dataset'
      ? 'Modelo / Dataset IA'
      : repo.resourceType === 'Librería, framework o SDK'
      ? 'Librería / Framework / SDK'
      : 'Herramienta / Workflow IA'

  if (extracted.length === 0) {
    pushCandidate(
      repo.name,
      ev.whatIsItEs || repo.shortExplanationEs || repo.description,
      repo.url,
      primaryKind,
      defaultSkillInstall
    )
  }

  const baseRec = computeRecommendation(
    ev.atlasScore,
    ev.securityGrade,
    repo.stars || 0,
    ev.companyOrAuthor,
    ev.creatorKind
  )

  return extracted.slice(0, 65).map(item => {
    const id = `skill:${repo.fullName.toLowerCase()}:${item.slug}`
    const override = overridesMap.get(id)
    const { whatItDoesEs, capabilitiesEs } = translateOrEnhanceSkillDescriptionEs(
      item.name,
      item.rawDesc,
      repo,
      ev.areaCategory
    )
    const knownKey = item.name.toLowerCase().replace(/^\/+/, '').trim()
    const useCases = KNOWN_SKILL_TRANSLATIONS_ES[knownKey]?.projectUseCases || ev.projectUseCases

    // Determine Open Source, License, Login Requirement & Pricing Model
    const rawLic = (repo.license || '').trim()
    const readmeLicMatch = readme.match(/\b(MIT|Apache-2\.0|Apache\s+2\.0|GPL-3\.0|AGPL-3\.0|BSD-3-Clause|MPL-2\.0)\b/i)
    const licenseName =
      rawLic && rawLic !== 'NOASSERTION'
        ? rawLic
        : readmeLicMatch
        ? readmeLicMatch[1].toUpperCase().replace(/\s+/g, '-')
        : 'Open Source (GitHub)'
    const isOpenSource = true
    const openSourceLabel = `Sí · ${licenseName}`

    const hayAll = `${item.name} ${item.rawDesc} ${repo.fullName} ${repo.description} ${item.kind}`.toLowerCase()
    const isCloudBacked =
      /\b(sentry|supabase|neon|cloudflare|firecrawl|stripe|slack|notion|linear|vercel|auth0|clerk|datadog|posthog|qdrant\s+cloud|openai|anthropic|gemini)\b/.test(
        hayAll
      )
    const isHybridSaaS =
      /\b(n8n|dify|firecrawl|supabase|neon|qdrant|sentry|posthog|langfuse|composio|browserbase)\b/.test(
        repo.fullName.toLowerCase()
      )

    let requiresLogin: ExtractedRepoSkill['requiresLogin'] = 'No (100% Local)'
    if (
      item.kind === 'Skill (SKILL.md)' ||
      item.kind === 'Comando Slash (/cmd)' ||
      item.kind === 'Librería / Framework / SDK' ||
      item.kind === 'Modelo / Dataset IA'
    ) {
      requiresLogin = isCloudBacked ? 'Opcional (API / Cloud)' : 'No (100% Local)'
    } else if (isHybridSaaS || item.kind === 'Servidor / Conector MCP') {
      requiresLogin = isCloudBacked ? 'Sí (Cuenta / API Key)' : 'Opcional (API / Cloud)'
    } else {
      requiresLogin = isCloudBacked ? 'Opcional (API / Cloud)' : 'No (100% Local)'
    }

    let pricingModel: ExtractedRepoSkill['pricingModel'] = '100% Gratis (Open Source)'
    if (isHybridSaaS) {
      pricingModel = 'Freemium (Local Gratis + Cloud)'
    } else if (
      item.kind === 'Subagente Especializado' ||
      (item.kind === 'Aplicación / Herramienta' && /\b(llm|gpt|claude|gemini|openai|agent)\b/.test(hayAll))
    ) {
      pricingModel = 'Gratis + BYOK (Tu API Key)'
    } else {
      pricingModel = '100% Gratis (Open Source)'
    }

    return {
      id,
      skillName: item.name,
      skillSlug: item.slug,
      skillKind: item.kind,
      whatItDoesEs,
      capabilitiesEs,
      repoFullName: repo.fullName,
      repoUrl: repo.url || `https://github.com/${repo.owner}/${repo.name}`,
      skillUrl: resolveSkillUrl(repo, item.href),
      stars: Number(repo.stars) || 0,
      forks: Number(repo.forks) || 0,
      companyOrAuthor: ev.companyOrAuthor,
      creatorKind: ev.creatorKind,
      areaCategory: ev.areaCategory,
      projectUseCases: useCases,
      recommended: override?.recommended || baseRec.recommended,
      recommendationReason: baseRec.reason,
      atlasScore: ev.atlasScore,
      securityGrade: ev.securityGrade,
      installCommand: item.customInstall || defaultSkillInstall,
      comments: override?.comments !== undefined ? override.comments : defaultComment,
      isSubSkillFromReadme: extracted.length > 1 || Boolean(item.href && item.href !== repo.url),
      isOpenSource,
      openSourceLabel,
      licenseName,
      requiresLogin,
      pricingModel
    }
  })
}

export function extractAllSkillsFromRepositories(
  repos: GalleryRepository[],
  bookmarks: BookmarkItem[] = [],
  overridesMap: Map<string, SkillNoteOverride> = new Map()
): ExtractedRepoSkill[] {
  const all: ExtractedRepoSkill[] = []
  for (const repo of repos) {
    const repoSkills = extractSkillsFromRepository(repo, bookmarks, overridesMap)
    all.push(...repoSkills)
  }
  return all.sort((a, b) => {
    if (b.atlasScore !== a.atlasScore) return b.atlasScore - a.atlasScore
    if (b.stars !== a.stars) return b.stars - a.stars
    return a.skillName.localeCompare(b.skillName)
  })
}
