import { KNOWN_GITHUB_ORGANIZATIONS } from './github-gallery'
import type { GalleryRepository, RepoSecurityAuditResult } from './types'

const SAFE_REPO_SEGMENT = /^[a-zA-Z0-9_.-]+$/

const KNOWN_DEPENDENCIES_CATALOG: Array<{ name: string; pattern: RegExp }> = [
  { name: '@modelcontextprotocol/sdk', pattern: /@modelcontextprotocol\/sdk|\bmcp[ -]?sdk\b/i },
  { name: 'fastmcp', pattern: /\bfastmcp\b/i },
  { name: 'openai', pattern: /\bopenai\b/i },
  { name: '@anthropic-ai/sdk', pattern: /@anthropic-ai\/sdk|\banthropic\b/i },
  { name: '@google/genai', pattern: /@google\/genai|@google\/generative-ai|\bgemini\b/i },
  { name: 'langchain', pattern: /\blangchain\b|\blanggraph\b/i },
  { name: 'llamaindex', pattern: /\bllamaindex\b|\bllama-index\b/i },
  { name: 'playwright', pattern: /\bplaywright\b/i },
  { name: 'puppeteer', pattern: /\bpuppeteer\b/i },
  { name: 'selenium', pattern: /\bselenium\b/i },
  { name: 'browser-use', pattern: /\bbrowser-use\b/i },
  { name: 'pydantic', pattern: /\bpydantic\b/i },
  { name: 'fastapi', pattern: /\bfastapi\b/i },
  { name: 'zod', pattern: /\bzod\b/i },
  { name: 'next', pattern: /\bnext(?:\.js|js)?\b/i },
  { name: 'react', pattern: /\breact\b/i },
  { name: 'tailwindcss', pattern: /\btailwind(?:css)?\b/i },
  { name: 'remotion', pattern: /\bremotion\b/i },
  { name: 'ffmpeg', pattern: /\bffmpeg\b/i },
  { name: 'pytorch / torch', pattern: /\b(?:pytorch|torch)\b/i },
  { name: 'transformers', pattern: /\btransformers\b|\bhuggingface\b/i },
  { name: 'ollama', pattern: /\bollama\b/i },
  { name: 'vllm', pattern: /\bvllm\b/i },
  { name: 'supabase', pattern: /\bsupabase\b/i },
  { name: 'sqlite / better-sqlite3', pattern: /\bsqlite3?\b|\bbetter-sqlite3\b/i },
  { name: 'docker', pattern: /\bdocker\b|\bdockerfile\b/i },
  { name: 'dotenv', pattern: /\bdotenv\b|\bpython-dotenv\b/i },
  { name: 'axios / fetch', pattern: /\baxios\b|\bnode-fetch\b|\bundici\b/i }
]

function buildGitHubHeaders(token?: string | null): Record<string, string> {
  const cleanToken = (token || process.env.GITHUB_TOKEN || '').trim()
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Atlas-de-Guardados-Security-Inspector/1.0'
  }
  if (cleanToken) {
    headers.Authorization = `Bearer ${cleanToken}`
  }
  return headers
}

/**
 * Deep Repo Security & Health Inspector (Improvement #6).
 * Inspects a GitHub repository's README, metadata, license, topics, and optionally
 * queries the root directory tree via GitHub Contents API (with a 5000ms timeout
 * and graceful offline/rate-limit fallback).
 */
export async function auditRepositorySecurityAndHealth(
  repo: GalleryRepository,
  options?: { token?: string | null }
): Promise<RepoSecurityAuditResult> {
  const owner = (repo.owner || '').trim()
  const name = (repo.name || '').trim()
  const fullName = repo.fullName || `${owner}/${name}`

  const manifestSet = new Set<string>()
  const dependenciesSet = new Set<string>()
  let rootEntryNames: string[] = []
  let extraManifestText = ''

  // 1. Optional live inspection of root directory tree via GitHub Contents API (5000ms timeout)
  if (SAFE_REPO_SEGMENT.test(owner) && SAFE_REPO_SEGMENT.test(name)) {
    try {
      const contentsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents`
      const res = await fetch(contentsUrl, {
        headers: buildGitHubHeaders(options?.token),
        signal: AbortSignal.timeout(5000)
      })

      if (res.ok) {
        const items = await res.json()
        if (Array.isArray(items)) {
          rootEntryNames = items
            .map((item: any) => String(item?.name || '').trim())
            .filter(Boolean)

          const interestingFiles = new Set([
            'package.json',
            'pyproject.toml',
            'requirements.txt',
            'Cargo.toml',
            'go.mod',
            'Dockerfile',
            'docker-compose.yml',
            'docker-compose.yaml',
            'SKILL.md',
            'CLAUDE.md',
            'AGENTS.md',
            'mcp.json',
            '.mcp.json',
            'smithery.yaml',
            '.github'
          ])

          for (const entryName of rootEntryNames) {
            if (interestingFiles.has(entryName)) {
              manifestSet.add(entryName === '.github' ? '.github/workflows' : entryName)
            } else if (/^(?:dockerfile|makefile|vitest\.config\..+|jest\.config\..+|pytest\.ini)$/i.test(entryName)) {
              manifestSet.add(entryName)
            }
          }

          // Opportunistically inspect package.json or requirements.txt if download_url is present
          const pkgEntry = items.find(
            (item: any) =>
              (item?.name === 'package.json' || item?.name === 'requirements.txt') &&
              typeof item?.download_url === 'string' &&
              Number(item?.size || 0) < 120000
          )
          if (pkgEntry?.download_url) {
            try {
              const pkgRes = await fetch(pkgEntry.download_url, {
                signal: AbortSignal.timeout(2500)
              })
              if (pkgRes.ok) {
                const rawPkg = await pkgRes.text()
                extraManifestText = rawPkg.slice(0, 20000)
                if (pkgEntry.name === 'package.json') {
                  try {
                    const parsedPkg = JSON.parse(rawPkg)
                    const depKeys = [
                      ...Object.keys(parsedPkg?.dependencies || {}),
                      ...Object.keys(parsedPkg?.devDependencies || {}).slice(0, 6)
                    ]
                    for (const d of depKeys.slice(0, 12)) {
                      dependenciesSet.add(d)
                    }
                  } catch {
                    // Ignore malformed package.json
                  }
                } else if (pkgEntry.name === 'requirements.txt') {
                  const reqLines = rawPkg
                    .split(/\r?\n/)
                    .map(l => l.trim())
                    .filter(l => l && !l.startsWith('#'))
                  for (const line of reqLines.slice(0, 12)) {
                    const pkgName = line.split(/[=<>~!;\s[]/)[0]?.trim()
                    if (pkgName) dependenciesSet.add(pkgName)
                  }
                }
              }
            } catch {
              // Ignore optional manifest download timeout
            }
          }
        }
      }
    } catch {
      // Gracefully fall back to static analysis of readme + description + metadata
    }
  }

  // 2. Build combined text signal from README, description, explanations, topics, and manifests
  const readmeText = repo.readme || ''
  const descriptionText = [
    repo.description || '',
    repo.explanation || '',
    repo.shortExplanationEs || '',
    repo.longExplanationEs || '',
    repo.notes || ''
  ].join('\n')
  const topicsText = (repo.topics || []).join(' ')
  const langName = (repo.primaryLanguage || '').toLowerCase()

  const combinedCorpus = [
    fullName,
    descriptionText,
    readmeText,
    topicsText,
    extraManifestText,
    rootEntryNames.join(' ')
  ].join('\n')

  // 3. Fallback / supplementary manifest detection from README and language metadata
  if (/\bskill\.md\b/i.test(combinedCorpus) || repo.resourceType === 'Skill') {
    manifestSet.add('SKILL.md')
  }
  if (
    /\bmcp\.json\b|\bmcpservers\b/i.test(combinedCorpus) ||
    repo.resourceType === 'Servidor MCP o conector'
  ) {
    manifestSet.add('mcp.json')
  }
  if (
    /\bpackage\.json\b|\b(?:npm|pnpm|yarn|bun|npx)\s+(?:install|i|add|-y)\b/i.test(combinedCorpus) ||
    langName === 'typescript' ||
    langName === 'javascript'
  ) {
    manifestSet.add('package.json')
  }
  if (/\bpyproject\.toml\b|\buvx?\s+/i.test(combinedCorpus) || langName === 'python') {
    manifestSet.add('pyproject.toml')
  }
  if (/\brequirements\.txt\b|\bpip3?\s+install\b/i.test(combinedCorpus)) {
    manifestSet.add('requirements.txt')
  }
  if (/\bcargo\.toml\b|\bcargo\s+install\b/i.test(combinedCorpus) || langName === 'rust') {
    manifestSet.add('Cargo.toml')
  }
  if (/\bgo\.mod\b|\bgo\s+install\b/i.test(combinedCorpus) || langName === 'go') {
    manifestSet.add('go.mod')
  }
  if (/\bdockerfile\b|\bdocker\s+(?:run|compose|build|pull)\b/i.test(combinedCorpus)) {
    manifestSet.add('Dockerfile')
  }
  if (/\bgithub\.com\/[^/\s]+\/[^/\s]+\/actions\b|\.github\/workflows/i.test(combinedCorpus)) {
    manifestSet.add('.github/workflows')
  }

  const manifestFilesFound = Array.from(manifestSet)

  // 4. Detect capabilities
  const isMcpStdio =
    repo.resourceType === 'Servidor MCP o conector' ||
    /\b(?:stdio|stdioservertransport|claude\s+mcp\s+add|mcpservers)\b/i.test(combinedCorpus)

  const executesShellCommands =
    isMcpStdio ||
    /\b(?:child_process|subprocess|exec\(|execsync|execfile|spawn\(|spawnsync|bash|shell|sh\s+-c|cli|terminal|command-line)\b/i.test(
      combinedCorpus
    )

  const networkAccess =
    /\b(?:fetch|axios|http|https:\/\/|requests|httpx|aiohttp|websocket|playwright|puppeteer|scraper|firecrawl|crawl|webhook)\b/i.test(
      combinedCorpus
    )

  const fileSystemWrite =
    /\b(?:fs\.write|writefilesync|writefile|open\(|workspace|mkdirsync|fs-extra|readfile|filesystem)\b/i.test(
      combinedCorpus
    )

  const readsEnvSecrets =
    /\b(?:process\.env|os\.environ|os\.getenv|api_key|openai_api_key|anthropic_api_key|gemini_api_key|github_token|\.env|dotenv|token|secret_key)\b/i.test(
      combinedCorpus
    )

  const usesBrowserAutomation =
    /\b(?:playwright|puppeteer|selenium|browser-use|cdp|chromium|webdriver|headless\s+browser|stagehand)\b/i.test(
      combinedCorpus
    )

  const capabilitiesDetected = {
    executesShellCommands,
    networkAccess,
    fileSystemWrite,
    readsEnvSecrets,
    usesBrowserAutomation
  }

  // 5. Detect tests, SKILL.md, and MCP config
  const hasAutomatedTests =
    rootEntryNames.some(n => /^(?:test|tests|__tests__|spec|vitest\.config\..+|jest\.config\..+|pytest\.ini)$/i.test(n)) ||
    manifestSet.has('.github/workflows') ||
    /\b(?:pytest|vitest|jest|cargo\s+test|go\s+test|npm\s+test|pnpm\s+test|unit\s+tests?|github\s+actions)\b/i.test(
      combinedCorpus
    )

  const hasSkillMd =
    manifestSet.has('SKILL.md') ||
    rootEntryNames.some(n => /^(?:skill\.md|skills|\.claude|agents\.md|claude\.md)$/i.test(n)) ||
    repo.resourceType === 'Skill' ||
    /\bskill\.md\b|\bagent-skills\b/i.test(combinedCorpus)

  const hasMcpServerConfig =
    manifestSet.has('mcp.json') ||
    manifestSet.has('.mcp.json') ||
    manifestSet.has('smithery.yaml') ||
    repo.resourceType === 'Servidor MCP o conector' ||
    /\b(?:mcpservers|model-context-protocol|@modelcontextprotocol\/sdk|fastmcp|claude\s+mcp\s+add)\b/i.test(
      combinedCorpus
    )

  // 6. Populate dependenciesPreview
  for (const dep of KNOWN_DEPENDENCIES_CATALOG) {
    if (dep.pattern.test(combinedCorpus)) {
      dependenciesSet.add(dep.name)
    }
  }
  if (dependenciesSet.size === 0) {
    if (repo.primaryLanguage) dependenciesSet.add(`Runtime: ${repo.primaryLanguage}`)
    for (const topic of (repo.topics || []).slice(0, 5)) {
      dependenciesSet.add(topic)
    }
  }
  const dependenciesPreview = Array.from(dependenciesSet).slice(0, 12)

  // 7. Compute securityScore (1.0 to 10.0) and riskLevel ('Bajo' | 'Medio' | 'Alto')
  const knownOrg = KNOWN_GITHUB_ORGANIZATIONS[owner.toLowerCase()]
  const lic = (repo.license || '').trim()
  const isPermissiveLicense = Boolean(lic && /mit|apache|bsd|isc|0bsd|unlicense|cc0/i.test(lic))
  const isCopyleftLicense = Boolean(lic && /gpl|agpl|lgpl|mpl/i.test(lic))
  const stars = Number(repo.stars) || 0

  let score = 7.4

  if (knownOrg) {
    score += knownOrg.kind === 'Empresa / Laboratorio Oficial' ? 1.3 : 0.8
  }
  if (isPermissiveLicense) {
    score += 0.8
  } else if (isCopyleftLicense) {
    score += 0.3
  } else if (!lic || lic === 'NOASSERTION') {
    score -= 0.9
  }

  if (stars >= 5000) score += 0.8
  else if (stars >= 1000) score += 0.6
  else if (stars >= 250) score += 0.4
  else if (stars >= 50) score += 0.2
  else if (stars < 10 && !knownOrg) score -= 0.5

  if (hasAutomatedTests) score += 0.4
  if (readmeText.length > 400) score += 0.2

  if (executesShellCommands) score -= 0.5
  if (fileSystemWrite) score -= 0.3
  if (readsEnvSecrets) score -= 0.3
  if (usesBrowserAutomation) score -= 0.3

  if (!knownOrg && stars < 25 && executesShellCommands && (fileSystemWrite || readsEnvSecrets)) {
    score -= 0.9
  }

  const securityScore = Math.round(Math.min(10.0, Math.max(1.0, score)) * 10) / 10

  let riskLevel: RepoSecurityAuditResult['riskLevel'] = 'Medio'
  if (
    securityScore >= 7.8 &&
    !(executesShellCommands && fileSystemWrite && !knownOrg && stars < 40)
  ) {
    riskLevel = 'Bajo'
  } else if (
    securityScore < 5.8 ||
    (executesShellCommands && (fileSystemWrite || readsEnvSecrets) && !knownOrg && stars < 25)
  ) {
    riskLevel = 'Alto'
  } else {
    riskLevel = 'Medio'
  }

  // 8. Build Spanish summary and actionable recommendations
  const activeCapLabels: string[] = []
  if (executesShellCommands) activeCapLabels.push('ejecución de comandos/CLI')
  if (networkAccess) activeCapLabels.push('acceso de red/HTTP')
  if (fileSystemWrite) activeCapLabels.push('escritura en disco')
  if (readsEnvSecrets) activeCapLabels.push('lectura de variables/API keys')
  if (usesBrowserAutomation) activeCapLabels.push('automatización de navegador')

  const creatorBadge = knownOrg
    ? `respaldado por ${knownOrg.name}`
    : stars >= 200
    ? `con tracción validada por la comunidad (★ ${stars.toLocaleString()})`
    : `de autor independiente (@${owner})`

  const licensePhrase = isPermissiveLicense
    ? `licencia permisiva ${lic}`
    : lic && lic !== 'NOASSERTION'
    ? `licencia ${lic}`
    : 'sin licencia SPDX explícita'

  const capPhrase =
    activeCapLabels.length > 0
      ? `Capacidades detectadas: ${activeCapLabels.join(', ')}.`
      : 'No se detectaron patrones de ejecución invasiva en el análisis estático.'

  const summaryEs = `Nivel de riesgo ${riskLevel.toLowerCase()} (${securityScore.toFixed(
    1
  )}/10): Repositorio ${creatorBadge}, ${licensePhrase}. ${capPhrase}`

  const recommendationsEs: string[] = []

  if (readsEnvSecrets) {
    recommendationsEs.push(
      'Configurar API keys con permisos mínimos (scoped tokens) en un archivo .env aislado y nunca exponer credenciales de producción.'
    )
  }
  if (executesShellCommands) {
    recommendationsEs.push(
      'Este recurso ejecuta procesos locales o servidores MCP por stdio: revisá los argumentos de línea de comandos antes de habilitar auto-aprobación en tu agente.'
    )
  }
  if (fileSystemWrite) {
    recommendationsEs.push(
      'Restringir los permisos de escritura únicamente a la carpeta del proyecto activo o un directorio de trabajo dedicado.'
    )
  }
  if (usesBrowserAutomation) {
    recommendationsEs.push(
      'Ejecutar la automatización de navegador (Playwright/Puppeteer/CDP) en un perfil limpio sin sesiones bancarias o personales activas.'
    )
  }
  if (!lic || lic === 'NOASSERTION') {
    recommendationsEs.push(
      'El repositorio no declara una licencia SPDX estándar: verificá los términos de uso con el autor antes de integrarlo en software comercial.'
    )
  }
  if (hasSkillMd) {
    recommendationsEs.push(
      'Inspeccionar las instrucciones de SKILL.md tras clonar para confirmar que no incluyan reglas de prompt injection o descargas externas no verificadas.'
    )
  }
  if (recommendationsEs.length === 0) {
    recommendationsEs.push(
      'Repositorio seguro para integrar directamente: fijá una versión o commit específico (pinning) para mantener builds reproducibles.'
    )
  }

  return {
    fullName,
    auditedAt: new Date().toISOString(),
    riskLevel,
    securityScore,
    summaryEs,
    manifestFilesFound,
    capabilitiesDetected,
    hasAutomatedTests,
    hasSkillMd,
    hasMcpServerConfig,
    dependenciesPreview,
    recommendationsEs
  }
}
