import {
  buildDeterministicSpanishExplanations,
  evaluateAndClassifyRepository,
  extractReadmeImage,
  fetchGitHubRepositoryData,
  generateExplanationFromReadme,
  isGenericRepoDescription,
  numericIdFromFullName
} from './github-gallery'
import type { GalleryRepoLanguage, GalleryRepository } from './types'

const BROWSER_HTML_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,es;q=0.8'
}

function decodeHtmlEntities(input: string): string {
  if (!input) return ''
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16)
      return Number.isNaN(code) ? _ : String.fromCodePoint(code)
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10)
      return Number.isNaN(code) ? _ : String.fromCodePoint(code)
    })
    .trim()
}

function parseFormattedCount(raw: string | undefined | null): number | null {
  if (!raw) return null
  const cleaned = raw.trim().replace(/,/g, '')
  if (/^\d+$/.test(cleaned)) {
    return parseInt(cleaned, 10)
  }
  const suffixMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kKmM])$/)
  if (suffixMatch) {
    const base = parseFloat(suffixMatch[1])
    const mult = suffixMatch[2].toLowerCase() === 'm' ? 1_000_000 : 1_000
    return Math.round(base * mult)
  }
  return null
}

function extractStarsFromHtml(html: string): number | null {
  // 1. id="repo-stars-counter-star" with title="12,345" or aria-label="12345 users starred..."
  const counterTagMatch = html.match(/<[^>]*id=["']repo-stars-counter-star["'][^>]*>/i)
  if (counterTagMatch) {
    const tag = counterTagMatch[0]
    const titleMatch = tag.match(/title=["']([\d,]+)["']/i)
    if (titleMatch) {
      const parsed = parseFormattedCount(titleMatch[1])
      if (parsed !== null) return parsed
    }
    const ariaMatch = tag.match(/aria-label=["']([\d,]+)\s+users?\s+starred/i)
    if (ariaMatch) {
      const parsed = parseFormattedCount(ariaMatch[1])
      if (parsed !== null) return parsed
    }
  }

  // 2. Embedded JSON payload `"stargazerCount":12345` or `"watchers_count":12345`
  const jsonStarMatch = html.match(/"stargazerCount"\s*:\s*(\d+)/)
  if (jsonStarMatch) {
    const parsed = parseFormattedCount(jsonStarMatch[1])
    if (parsed !== null) return parsed
  }

  // 3. aria-label="12345 users starred this repository" anywhere in document
  const globalAriaMatch = html.match(/aria-label=["']([\d,]+)\s+users?\s+starred/i)
  if (globalAriaMatch) {
    const parsed = parseFormattedCount(globalAriaMatch[1])
    if (parsed !== null) return parsed
  }

  // 4. Text pattern `12,345 stars` or inner text of repo-stars-counter-star
  const innerCounterMatch = html.match(
    /id=["']repo-stars-counter-star["'][^>]*>\s*([\d,.]+[kKmM]?)\s*</i
  )
  if (innerCounterMatch) {
    const parsed = parseFormattedCount(innerCounterMatch[1])
    if (parsed !== null) return parsed
  }

  const textStarsMatch = html.match(/(\d+(?:,\d+)*)\s+stars\b/i)
  if (textStarsMatch) {
    const parsed = parseFormattedCount(textStarsMatch[1])
    if (parsed !== null) return parsed
  }

  return null
}

function extractForksFromHtml(html: string): number | null {
  // 1. id="repo-network-counter" with title="1,234"
  const counterTagMatch = html.match(/<[^>]*id=["']repo-network-counter["'][^>]*>/i)
  if (counterTagMatch) {
    const tag = counterTagMatch[0]
    const titleMatch = tag.match(/title=["']([\d,]+)["']/i)
    if (titleMatch) {
      const parsed = parseFormattedCount(titleMatch[1])
      if (parsed !== null) return parsed
    }
  }

  // 2. Embedded JSON `"forkCount":1234`
  const jsonForkMatch = html.match(/"forkCount"\s*:\s*(\d+)/)
  if (jsonForkMatch) {
    const parsed = parseFormattedCount(jsonForkMatch[1])
    if (parsed !== null) return parsed
  }

  // 3. Inner text of repo-network-counter
  const innerCounterMatch = html.match(
    /id=["']repo-network-counter["'][^>]*>\s*([\d,.]+[kKmM]?)\s*</i
  )
  if (innerCounterMatch) {
    const parsed = parseFormattedCount(innerCounterMatch[1])
    if (parsed !== null) return parsed
  }

  // 4. Text pattern `1,234 forks`
  const textForksMatch = html.match(/(\d+(?:,\d+)*)\s+forks\b/i)
  if (textForksMatch) {
    const parsed = parseFormattedCount(textForksMatch[1])
    if (parsed !== null) return parsed
  }

  return null
}

function extractDescriptionFromHtml(html: string, owner: string, name: string): string | null {
  const ogMatch =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)

  if (!ogMatch) return null

  let desc = decodeHtmlEntities(ogMatch[1])
  const fullNameEscaped = `${owner}/${name}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Strip GitHub's boilerplate prefixes/suffixes
  desc = desc
    .replace(new RegExp(`^GitHub\\s*-\\s*${fullNameEscaped}\\s*:\\s*`, 'i'), '')
    .replace(new RegExp(`\\s*-\\s*GitHub\\s*-\\s*${fullNameEscaped}.*$`, 'i'), '')
    .replace(
      new RegExp(
        `\\.?\\s*Contribute to ${fullNameEscaped} development by creating an account on GitHub\\.?$`,
        'i'
      ),
      ''
    )
    .replace(new RegExp(`\\s*-\\s*${fullNameEscaped}$`, 'i'), '')
    .trim()

  if (!desc || /^Contribute to\s+/i.test(desc)) return null
  return desc
}

function extractTopicsFromHtml(html: string): string[] {
  const topics: string[] = []
  const seen = new Set<string>()

  const addTopic = (raw: string) => {
    const clean = raw.trim().toLowerCase()
    if (
      clean &&
      clean.length >= 2 &&
      clean.length <= 45 &&
      /^[a-z0-9][a-z0-9-]*$/.test(clean) &&
      !seen.has(clean)
    ) {
      seen.add(clean)
      topics.push(clean)
    }
  }

  // 1. Anchors with data-octo-click="topic_click"
  const octoRegex = /<a[^>]*data-octo-click=["']topic_click["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = octoRegex.exec(html)) !== null && topics.length < 8) {
    const inner = m[1].replace(/<[^>]+>/g, '').trim()
    addTopic(inner)
  }

  // 2. Links to /topics/([a-z0-9-]+)
  const hrefRegex = /href=["']\/topics\/([a-z0-9-]+)["']/gi
  while ((m = hrefRegex.exec(html)) !== null && topics.length < 8) {
    addTopic(m[1])
  }

  return topics.slice(0, 8)
}

function extractLanguagesFromHtml(html: string): {
  primaryLanguage: string | null
  languages: GalleryRepoLanguage[]
} {
  const languages: GalleryRepoLanguage[] = []

  // Extract language breakdown pairs: <span class="color-fg-default text-bold mr-1">TypeScript</span><span>78.4%</span>
  const langSpanRegex =
    /<span[^>]*class=["'][^"']*color-fg-default\s+text-bold\s+mr-1[^"']*["'][^>]*>([^<]+)<\/span>\s*<span[^>]*>(\d+(?:\.\d+)?)%<\/span>/gi
  let m: RegExpExecArray | null
  while ((m = langSpanRegex.exec(html)) !== null) {
    const langName = decodeHtmlEntities(m[1]).trim()
    const pct = Math.round(parseFloat(m[2]))
    if (langName && langName.toLowerCase() !== 'other') {
      languages.push({
        name: langName,
        bytes: pct * 100,
        percentage: pct
      })
    }
  }

  // Check itemprop="programmingLanguage"
  const itemPropMatch = html.match(/itemprop=["']programmingLanguage["'][^>]*>([^<]+)</i)
  const itemPropLang = itemPropMatch ? decodeHtmlEntities(itemPropMatch[1]).trim() : null

  const primaryLanguage = itemPropLang || (languages.length > 0 ? languages[0].name : null)
  if (primaryLanguage && languages.length === 0) {
    languages.push({ name: primaryLanguage, bytes: 100, percentage: 100 })
  }

  return { primaryLanguage, languages }
}

function extractLicenseFromHtml(html: string): string | null {
  // Look near octicon-law or License section first
  const lawWindowMatch = html.match(/octicon-law[\s\S]{0,600}/i)
  const candidateBlock = lawWindowMatch ? lawWindowMatch[0] : html

  const spdxPatterns: Array<{ rx: RegExp; id: string }> = [
    { rx: /\bApache-2\.0\b|\bApache License 2\.0\b/i, id: 'Apache-2.0' },
    { rx: /\bMIT\b|\bMIT License\b/i, id: 'MIT' },
    { rx: /\bGPL-3\.0\b|\bGNU General Public License v3/i, id: 'GPL-3.0' },
    { rx: /\bAGPL-3\.0\b|\bGNU Affero General Public License/i, id: 'AGPL-3.0' },
    { rx: /\bBSD-3-Clause\b/i, id: 'BSD-3-Clause' },
    { rx: /\bBSD-2-Clause\b/i, id: 'BSD-2-Clause' },
    { rx: /\bISC\b|\bISC License\b/i, id: 'ISC' },
    { rx: /\bMPL-2\.0\b|\bMozilla Public License 2\.0\b/i, id: 'MPL-2.0' }
  ]

  for (const { rx, id } of spdxPatterns) {
    if (rx.test(candidateBlock)) return id
  }

  return null
}

async function fetchRawReadmeWithoutApiQuota(
  owner: string,
  name: string,
  preferredBranch?: string
): Promise<{ readme: string; branchUsed: string }> {
  const branches = Array.from(
    new Set([preferredBranch || 'main', 'main', 'master'].filter(Boolean))
  )

  for (const branch of branches) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${name}/${branch}/README.md`
    try {
      const res = await fetch(rawUrl, {
        headers: {
          'User-Agent': BROWSER_HTML_HEADERS['User-Agent'],
          Accept: 'text/plain,text/markdown,*/*'
        },
        signal: AbortSignal.timeout(5000)
      })
      if (res.ok) {
        const text = await res.text()
        if (text && text.trim().length > 0) {
          return { readme: text.slice(0, 25000), branchUsed: branch }
        }
      }
    } catch {
      // Try next branch fallback
    }
  }

  return { readme: '', branchUsed: preferredBranch || 'main' }
}

/**
 * Hydrates a single repository without consuming GitHub REST API quota (60 req/hr)
 * by scraping public HTML metadata from github.com and fetching raw.githubusercontent.com README.
 */
export async function hydrateSingleRepoWithoutApiQuota(
  repo: GalleryRepository
): Promise<GalleryRepository> {
  const owner = repo.owner.trim()
  const name = repo.name.trim()
  const fullName = `${owner}/${name}`
  const pageUrl = `https://github.com/${owner}/${name}`
  const unghUrl = `https://ungh.cc/repos/${owner}/${name}`

  const [unghData, rawReadmeResult] = await Promise.all([
    (async (): Promise<any | null> => {
      try {
        const res = await fetch(unghUrl, {
          headers: { 'User-Agent': BROWSER_HTML_HEADERS['User-Agent'], Accept: 'application/json' },
          signal: AbortSignal.timeout(4500)
        })
        if (!res.ok) return null
        const json = await res.json()
        return json?.repo || null
      } catch {
        return null
      }
    })(),
    fetchRawReadmeWithoutApiQuota(owner, name, repo.defaultBranch)
  ])

  let htmlText = ''
  if (!unghData || !unghData.description) {
    try {
      const res = await fetch(pageUrl, {
        headers: BROWSER_HTML_HEADERS,
        signal: AbortSignal.timeout(5500)
      })
      if (res.ok) htmlText = await res.text()
    } catch {}
  }

  const parsedStars =
    typeof unghData?.stars === 'number'
      ? unghData.stars
      : htmlText
      ? extractStarsFromHtml(htmlText)
      : null
  const parsedForks =
    typeof unghData?.forks === 'number'
      ? unghData.forks
      : htmlText
      ? extractForksFromHtml(htmlText)
      : null
  const parsedDesc =
    (typeof unghData?.description === 'string' && unghData.description.trim()
      ? unghData.description.trim()
      : null) || (htmlText ? extractDescriptionFromHtml(htmlText, owner, name) : null)
  const parsedTopics = htmlText ? extractTopicsFromHtml(htmlText) : []
  const parsedLangInfo = htmlText
    ? extractLanguagesFromHtml(htmlText)
    : { primaryLanguage: null, languages: [] }
  const parsedLicense = htmlText ? extractLicenseFromHtml(htmlText) : null

  const relativeTimeMatch = htmlText.match(/<relative-time[^>]+datetime=["']([^"']+)["']/i)
  const latestPushIso =
    unghData?.pushedAt || unghData?.updatedAt || (relativeTimeMatch ? relativeTimeMatch[1] : null)

  const readmeText = rawReadmeResult.readme || repo.readme || ''
  const defaultBranch =
    unghData?.defaultBranch || rawReadmeResult.branchUsed || repo.defaultBranch || 'main'

  const readmeSummary = readmeText ? generateExplanationFromReadme('', readmeText) : ''
  const cleanReadmeSummary =
    !isGenericRepoDescription(readmeSummary) && !/[\u4e00-\u9fff]/.test(readmeSummary)
      ? readmeSummary
      : ''

  const effectiveDescription =
    parsedDesc ||
    (!isGenericRepoDescription(repo.description) ? repo.description : '') ||
    cleanReadmeSummary ||
    'Sin descripción provista.'

  const mergedTopics = Array.from(new Set([...parsedTopics, ...(repo.topics || [])])).slice(0, 8)
  const primaryLanguage = parsedLangInfo.primaryLanguage || repo.primaryLanguage || null
  const languages =
    parsedLangInfo.languages.length > 0
      ? parsedLangInfo.languages
      : repo.languages && repo.languages.length > 0
      ? repo.languages
      : primaryLanguage
      ? [{ name: primaryLanguage, bytes: 100, percentage: 100 }]
      : []

  const readmeImage = extractReadmeImage(readmeText, owner, name, defaultBranch)
  const imageUrl =
    readmeImage || repo.imageUrl || `https://opengraph.githubassets.com/1/${owner}/${name}`
  const imageSource: 'readme' | 'opengraph' | 'fallback' = readmeImage
    ? 'readme'
    : repo.imageSource || 'opengraph'

  const explanation = generateExplanationFromReadme(effectiveDescription, readmeText)

  const hydratedRepo: GalleryRepository = {
    ...repo,
    id: repo.id || numericIdFromFullName(fullName),
    owner,
    name,
    fullName,
    url: `https://github.com/${fullName}`,
    avatarUrl: repo.avatarUrl || `https://github.com/${owner}.png?size=128`,
    description: effectiveDescription,
    explanation,
    shortExplanationEs: '',
    readme: readmeText,
    imageUrl,
    imageSource,
    stars: parsedStars !== null ? parsedStars : repo.stars || 0,
    forks: parsedForks !== null ? parsedForks : repo.forks || 0,
    openIssues: repo.openIssues || 0,
    primaryLanguage,
    languages,
    topics: mergedTopics,
    license: parsedLicense || repo.license || null,
    updatedAt: latestPushIso || repo.updatedAt || new Date().toISOString(),
    pushedAt: latestPushIso || repo.pushedAt || repo.updatedAt || new Date().toISOString(),
    defaultBranch
  }

  const synth = buildDeterministicSpanishExplanations(hydratedRepo)
  hydratedRepo.description =
    !isGenericRepoDescription(hydratedRepo.description)
      ? hydratedRepo.description
      : synth.effectiveDescription
  hydratedRepo.shortExplanationEs = synth.shortExplanationEs
  hydratedRepo.longExplanationEs = synth.longExplanationEs
  hydratedRepo.explanation = synth.shortExplanationEs
  hydratedRepo.resourceType = synth.resourceType
  hydratedRepo.agentEvaluation = evaluateAndClassifyRepository(hydratedRepo)

  return hydratedRepo
}

/**
 * Hydrates a batch of repositories with configurable concurrency (default 6).
 * - When a GitHub token is provided, uses the official GitHub API first and falls back to
 *   rate-limit-free HTML + raw README hydration if rate-limited or failed.
 * - When no token is provided, uses rate-limit-free HTML + raw README hydration directly
 *   so it never exhausts the 60 req/hr anonymous REST API quota.
 */
export async function hydrateReposBatchGraphQLOrHtml(
  repos: GalleryRepository[],
  options?: {
    token?: string | null
    concurrency?: number
    onProgress?: (done: number, total: number, repo: GalleryRepository) => void
  }
): Promise<{
  updatedRepos: GalleryRepository[]
  hydrated: GalleryRepository[]
  method: 'graphql' | 'github_rest_or_html'
  hydratedCount: number
  refreshedCount: number
  errors: Array<{ repo: string; error: string }>
}> {
  if (!Array.isArray(repos) || repos.length === 0) {
    return {
      updatedRepos: [],
      hydrated: [],
      method: 'github_rest_or_html',
      hydratedCount: 0,
      refreshedCount: 0,
      errors: []
    }
  }

  const effectiveToken = options?.token?.trim() || process.env.GITHUB_TOKEN?.trim() || null
  const concurrency = Math.max(1, Math.min(12, options?.concurrency || 6))
  const total = repos.length
  const updatedRepos: GalleryRepository[] = new Array(total)
  let doneCount = 0
  let hydratedCount = 0
  let cursor = 0

  const worker = async () => {
    while (true) {
      const idx = cursor++
      if (idx >= total) break
      const original = repos[idx]
      let resultRepo: GalleryRepository = original

      try {
        if (effectiveToken) {
          try {
            const apiRepo = await fetchGitHubRepositoryData(
              original.owner,
              original.name,
              effectiveToken
            )
            resultRepo = {
              ...original,
              ...apiRepo,
              addedAt: original.addedAt || apiRepo.addedAt,
              linkedBookmarkIds: original.linkedBookmarkIds || apiRepo.linkedBookmarkIds,
              notes: original.notes || apiRepo.notes,
              customOrder: original.customOrder
            }
            resultRepo.agentEvaluation = evaluateAndClassifyRepository(resultRepo)
          } catch {
            resultRepo = await hydrateSingleRepoWithoutApiQuota(original)
          }
        } else {
          resultRepo = await hydrateSingleRepoWithoutApiQuota(original)
        }

        if (
          resultRepo.stars > 0 ||
          (resultRepo.readme && resultRepo.readme.length > 0) ||
          (resultRepo.description && resultRepo.description !== 'Sin descripción provista.')
        ) {
          hydratedCount++
        }
      } catch {
        resultRepo = original
      }

      updatedRepos[idx] = resultRepo
      doneCount++
      if (options?.onProgress) {
        try {
          options.onProgress(doneCount, total, resultRepo)
        } catch {
          // Ignore callback errors
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker())
  await Promise.all(workers)

  return {
    updatedRepos,
    hydrated: updatedRepos,
    method: 'github_rest_or_html',
    hydratedCount,
    refreshedCount: hydratedCount,
    errors: []
  }
}
