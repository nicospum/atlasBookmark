import { createHash } from 'node:crypto'
import { analyzeContent } from './ai-analyzer'
import type { BookmarkItem, SourcePlatform } from './types'

type Row = Record<string, any>

const isObject = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

export function safeUrl(v: unknown): string {
  try {
    const u = new URL(str(v))
    return ['https:', 'http:'].includes(u.protocol) ? u.href : ''
  } catch {
    return ''
  }
}

export function extractDomain(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function canonicalUrl(v: unknown): { url: string; platform: SourcePlatform; key: string; id: string } | null {
  try {
    const raw = str(v)
    if (!raw) return null
    const u = new URL(raw)
    const host = u.hostname.toLowerCase().replace(/^(www|mobile|m)\./, '')
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null

    if (host === 'x.com' || host === 'twitter.com') {
      const m = u.pathname.match(/^\/(?:([^/]+)\/status|i\/web\/status|i\/status)\/(\d+)/)
      if (m) {
        const handlePart = m[1] && m[1] !== 'i' ? m[1] : 'i'
        const tweetId = m[2]
        const url = handlePart !== 'i'
          ? `https://x.com/${handlePart}/status/${tweetId}`
          : `https://x.com/i/status/${tweetId}`
        return { url, platform: 'x', key: tweetId, id: `x:${tweetId}` }
      }
    }

    if (host === 'instagram.com') {
      const m = u.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([\w-]+)/i)
      if (m) {
        const kind = m[1].toLowerCase() === 'reel' || m[1].toLowerCase() === 'reels' ? 'reel' : 'p'
        const shortcode = m[2]
        return {
          url: `https://www.instagram.com/${kind}/${shortcode}/`,
          platform: 'instagram',
          key: shortcode,
          id: `instagram:${shortcode}`
        }
      }
    }
    return null
  } catch {
    return null
  }
}

export function normalizeDate(v: unknown): string {
  if (v === undefined || v === null || v === '') return ''
  const s = str(v)
  if (!s) return ''
  const n = typeof v === 'number' ? v : /^\d{10,13}$/.test(s) ? Number(s) : null
  const d = new Date(n === null ? s : n < 1e12 ? n * 1000 : n)
  return Number.isFinite(d.getTime()) ? d.toISOString() : ''
}

const stringList = (v: unknown): string[] => {
  if (Array.isArray(v)) {
    return v.filter((s): s is string => typeof s === 'string').map(s => s.trim()).filter(Boolean)
  }
  if (typeof v === 'string' && v.trim()) {
    return v.split(/[|,]/).map(s => s.trim()).filter(Boolean)
  }
  return []
}

/**
 * Walk an X GraphQL response object recursively and yield tweet result objects
 */
function* walkXTweets(value: unknown): Generator<Row> {
  if (isObject(value)) {
    const tr = value.tweet_results
    const result = isObject(tr) ? (isObject(tr.result?.tweet) ? tr.result.tweet : tr.result) : null
    if (isObject(result) && (result.rest_id || result.legacy?.id_str)) {
      yield result
    }
    for (const child of Object.values(value)) {
      yield* walkXTweets(child)
    }
  } else if (Array.isArray(value)) {
    for (const child of value) {
      yield* walkXTweets(child)
    }
  }
}

/**
 * Convert a raw X GraphQL tweet object into a normalized row
 */
function tweetFromGraphQL(tweet: Row, provenance: string): Row | null {
  const legacy = isObject(tweet.legacy) ? tweet.legacy : {}
  const tweetId = str(tweet.rest_id || legacy.id_str)
  if (!tweetId) return null

  const userResult = tweet.core?.user_results?.result
  const userCore = isObject(userResult?.core) ? userResult.core : {}
  const userLegacy = isObject(userResult?.legacy) ? userResult.legacy : {}

  const screenName = str(userCore.screen_name || userLegacy.screen_name)
  const authorName = str(userCore.name || userLegacy.name || screenName || 'Usuario de X')
  const authorAvatar = safeUrl(userLegacy.profile_image_url_https || userResult?.avatar?.image_url)

  let caption = str(legacy.full_text)
  const noteText = str(tweet.note_tweet?.note_tweet_results?.result?.text)
  if (noteText) {
    caption = noteText
  }

  const expandedUrls: string[] = []
  const urlsList = Array.isArray(legacy.entities?.urls) ? legacy.entities.urls : []
  for (const u of urlsList) {
    const exp = safeUrl(u?.expanded_url || u?.url)
    if (exp && !expandedUrls.includes(exp)) expandedUrls.push(exp)
  }

  const mediaUrls: string[] = []
  let hasVideo = false
  const mediaList =
    (Array.isArray(legacy.extended_entities?.media) && legacy.extended_entities.media.length > 0
      ? legacy.extended_entities.media
      : Array.isArray(legacy.entities?.media)
      ? legacy.entities.media
      : []) as Row[]

  for (const m of mediaList) {
    if (m?.type === 'video' || m?.type === 'animated_gif') hasVideo = true
    const mUrl = safeUrl(m?.media_url_https || m?.media_url || m?.video_info?.variants?.[0]?.url)
    if (mUrl && !mediaUrls.includes(mUrl)) mediaUrls.push(mUrl)
  }

  const canonical = screenName
    ? `https://x.com/${screenName}/status/${tweetId}`
    : `https://x.com/i/status/${tweetId}`

  return {
    id: `x:${tweetId}`,
    platform: 'x',
    sourceUrl: canonical,
    authorName,
    authorHandle: screenName ? `@${screenName.replace(/^@/, '')}` : '',
    authorAvatar: authorAvatar || undefined,
    publishedAt: normalizeDate(legacy.created_at),
    savedAt: '',
    caption,
    outgoingLinks: expandedUrls,
    mediaUrls,
    mediaType: hasVideo ? 'video' : mediaUrls.length > 1 ? 'album' : mediaUrls.length === 1 ? 'image' : 'none',
    language: str(legacy.lang),
    captureSource: 'x_har',
    provenance
  }
}

/**
 * Extract rows from a Chrome/Edge DevTools .har JSON object
 */
export function extractFromHar(har: Row, filename: string): Row[] {
  const entries = Array.isArray(har?.log?.entries) ? har.log.entries : []
  const byId = new Map<string, Row>()

  for (const entry of entries) {
    const reqUrl = str(entry?.request?.url)
    const content = entry?.response?.content
    let text = str(content?.text)
    if (!text) continue

    if (content?.encoding === 'base64') {
      try {
        text = Buffer.from(text, 'base64').toString('utf8')
      } catch {
        continue
      }
    }

    let payload: any
    try {
      payload = JSON.parse(text)
    } catch {
      continue
    }

    // X Bookmarks GraphQL or Tweet Detail
    if (reqUrl.includes('/Bookmarks') || (reqUrl.includes('/graphql/') && reqUrl.toLowerCase().includes('bookmark'))) {
      for (const tweet of walkXTweets(payload)) {
        const row = tweetFromGraphQL(tweet, filename)
        if (row && !byId.has(row.id)) {
          byId.set(row.id, row)
        }
      }
    }

    // Instagram Saved Posts API in HAR
    if (reqUrl.includes('/api/v1/feed/saved/') || (reqUrl.includes('instagram.com') && reqUrl.includes('graphql'))) {
      const items = Array.isArray(payload?.items) ? payload.items : []
      for (const rawItem of items) {
        const media = isObject(rawItem?.media) ? rawItem.media : rawItem
        const code = str(media?.code || media?.pk)
        if (!code) continue
        const username = str(media?.user?.username)
        const img = safeUrl(media?.image_versions2?.candidates?.[0]?.url)
        const id = `instagram:${code}`
        if (!byId.has(id)) {
          byId.set(id, {
            id,
            platform: 'instagram',
            sourceUrl: `https://www.instagram.com/p/${code}/`,
            authorName: str(media?.user?.full_name || username || 'Instagram User'),
            authorHandle: username ? `@${username}` : '',
            authorAvatar: safeUrl(media?.user?.profile_pic_url) || undefined,
            publishedAt: normalizeDate(media?.taken_at),
            savedAt: '',
            caption: str(media?.caption?.text),
            mediaUrls: img ? [img] : [],
            mediaType: img ? 'image' : 'none',
            captureSource: 'instagram_har',
            provenance: filename
          })
        }
      }
    }
  }

  return Array.from(byId.values())
}

/**
 * Recursively extract rows from any supported JSON structure:
 * - Hermes canonical archive.json
 * - Atlas BookmarkItem[] or browser-extension { items: { ... } }
 * - Official Instagram saved_posts.json / saved_collections.json
 * - Official X API v2 response or X GDPR archive
 */
export function extractRows(input: unknown, filename = 'import.json', currentCollections: string[] = []): Row[] {
  if (Array.isArray(input)) {
    return input.flatMap(item => extractRows(item, filename, currentCollections))
  }
  if (!isObject(input)) return []

  // 1. Check if it's a HAR file
  if (isObject(input.log) && Array.isArray(input.log.entries)) {
    return extractFromHar(input, filename)
  }

  // 2. Check if it's browser-extension checkpoint object: { items: { "https://...": { ... } } }
  if (isObject(input.items) && !Array.isArray(input.items)) {
    return Object.values(input.items).flatMap(item => extractRows(item, filename, currentCollections))
  }

  // 3. Track Instagram collection / folder names if present
  let collections = [...currentCollections]
  for (const k of ['collection', 'collection_name', 'collectionName', 'folder']) {
    if (typeof input[k] === 'string' && input[k].trim()) {
      collections.push(input[k].trim())
    }
  }

  // Meta saved_collections.json often groups collections where an entry has title/name and string_map_data
  if (typeof input.title === 'string' && input.title.trim() && Array.isArray(input.string_map_data)) {
    collections.push(input.title.trim())
  }

  // 4. Direct record (Hermes archive.json, Atlas BookmarkItem, CSV row, etc.)
  if (input.record_id || input.sourceUrl || input.url || input['URL Original'] || (input.href && canonicalUrl(input.href))) {
    return [{ ...input, collections: Array.from(new Set([...stringList(input.collections), ...collections])) }]
  }

  // 5. Meta Instagram saved_posts.json structure (string_map_data / string_list_data)
  if (isObject(input.string_map_data) || Array.isArray(input.string_list_data)) {
    const mapValues = isObject(input.string_map_data) ? Object.values(input.string_map_data) : []
    const listValues = Array.isArray(input.string_list_data) ? input.string_list_data : []
    const entries = [...mapValues, ...listValues].filter(isObject)
    const rows: Row[] = []
    for (const e of entries) {
      if (e.href && canonicalUrl(e.href)) {
        rows.push({
          url: e.href,
          authorName: str(input.title || e.value || ''),
          savedAt: e.timestamp,
          collections,
          captureSource: 'instagram_export'
        })
      }
    }
    if (rows.length > 0) return rows
  }

  // 6. X API v2 response with includes
  if (Array.isArray(input.data) && isObject(input.includes)) {
    const users = Array.isArray(input.includes.users) ? input.includes.users.filter(isObject) : []
    const media = Array.isArray(input.includes.media) ? input.includes.media.filter(isObject) : []
    return input.data.filter(isObject).map(t => {
      const user = users.find(u => u.id === t.author_id)
      const keys = isObject(t.attachments) ? stringList(t.attachments.media_keys) : []
      const attachments = media.filter(m => keys.includes(str(m.media_key)))
      return {
        ...t,
        url: `https://x.com/${user?.username || 'i'}/status/${t.id}`,
        caption: isObject(t.note_tweet) ? t.note_tweet.text : t.text,
        authorName: user?.name,
        authorHandle: user?.username ? `@${user.username}` : '',
        authorAvatar: user?.profile_image_url,
        outgoingLinks:
          isObject(t.entities) && Array.isArray(t.entities.urls)
            ? t.entities.urls.filter(isObject).map(u => u.expanded_url)
            : [],
        mediaUrls: attachments.map(m => m.url || m.preview_image_url).filter(Boolean),
        captureSource: 'x_api'
      }
    })
  }

  // 7. X GDPR Archive { tweet: { id_str, full_text, ... } }
  if (isObject(input.tweet)) {
    const tid = str(input.tweet.id_str || input.tweet.id || input.tweet.tweetId)
    if (tid) {
      return extractRows(
        {
          ...input.tweet,
          url: `https://x.com/i/status/${tid}`,
          caption: str(input.tweet.full_text || input.tweet.text),
          captureSource: 'x_gdpr_archive'
        },
        filename,
        collections
      )
    }
  }

  if (input.tweetId && !input.url) {
    return [{ ...input, url: `https://x.com/i/status/${input.tweetId}`, captureSource: 'x_gdpr_archive' }]
  }

  // 8. Recurse into known container arrays or child properties
  const containerKeys = ['items', 'bookmarks', 'saved_saved_media', 'saved_posts', 'saved_collections', 'data', 'records']
  for (const k of containerKeys) {
    if (Array.isArray(input[k])) {
      return extractRows(input[k], filename, collections)
    }
  }

  // Generic recursive fallback for nested Instagram/X JSON
  const nested: Row[] = []
  for (const child of Object.values(input)) {
    if (Array.isArray(child) || isObject(child)) {
      nested.push(...extractRows(child, filename, collections))
    }
  }
  return nested
}

/**
 * Normalize a single extracted Row into a canonical BookmarkItem
 */
export function normalizeRow(row: Row, provenance = 'manual'): BookmarkItem | null {
  const rawUrl = str(row.sourceUrl || row.url || row.href || row.uri || row['URL Original'] || row.link)
  const canonical = canonicalUrl(rawUrl)

  // Also support Hermes record_id like "x:2103594988550652353" or "instagram:DBkX28aZ441"
  const rawRecordId = str(row.record_id || row.id)
  if (!canonical && !rawRecordId.startsWith('x:') && !rawRecordId.startsWith('instagram:')) {
    return null
  }

  const platform: SourcePlatform = canonical
    ? canonical.platform
    : rawRecordId.startsWith('instagram:') || str(row.platform).toLowerCase() === 'instagram'
    ? 'instagram'
    : 'x'

  const id =
    rawRecordId.startsWith('x:') || rawRecordId.startsWith('instagram:')
      ? rawRecordId
      : canonical
      ? canonical.id
      : createHash('sha256').update(`${platform}:${rawUrl}`).digest('hex').slice(0, 24)

  const sourceUrl = canonical ? canonical.url : safeUrl(rawUrl) || `https://x.com`
  const caption = str(row.caption ?? row.text ?? row.full_text ?? row['Texto completo'] ?? '').slice(0, 100000)

  const rawTopics = stringList(row.topics ?? row['Temas']).filter(
    t => t && t !== 'Sin clasificar' && t !== 'Pendiente'
  )
  const collections = stringList(row.collections ?? row['Colecciones'])
  const externalUrls = [
    ...stringList(row.external_urls),
    ...stringList(row.outgoingLinks),
    ...stringList(row['Enlaces salientes'])
  ]
    .map(safeUrl)
    .filter(Boolean)

  const handleFromUrl =
    platform === 'x' && sourceUrl.includes('x.com/')
      ? (() => {
          try {
            const seg = new URL(sourceUrl).pathname.split('/')[1]
            return seg && seg !== 'i' ? `@${seg}` : ''
          } catch {
            return ''
          }
        })()
      : ''

  const rawHandle = str(row.authorHandle || row.handle || row.username || row['Handle / Usuario'])
  const authorHandle = rawHandle
    ? `@${rawHandle.replace(/^@/, '')}`
    : handleFromUrl

  const authorName =
    str(row.authorName || row.author || row['Autor']) ||
    (authorHandle ? authorHandle.replace(/^@/, '') : platform === 'x' ? 'Usuario de X' : 'Usuario de Instagram')

  const primaryExternalUrl = externalUrls[0] || sourceUrl
  const domain = str(row.domain) || extractDomain(primaryExternalUrl)

  const analysis = analyzeContent(caption, rawTopics, {
    domain,
    author: authorName,
    handle: authorHandle,
    collections,
    externalUrls
  })

  const mediaUrls = [
    ...stringList(row.mediaUrls),
    ...stringList(row.media_urls),
    ...stringList(row['Multimedia'])
  ]
    .map(safeUrl)
    .filter(Boolean)

  const contentType = str(row.content_type || row.contentType) || (mediaUrls.length > 0 ? 'media' : 'post')
  const isVideo =
    row.mediaType === 'video' ||
    contentType === 'video' ||
    contentType === 'reel' ||
    mediaUrls.some(m => m.toLowerCase().includes('video'))

  const mediaType: BookmarkItem['mediaType'] =
    mediaUrls.length === 0
      ? 'none'
      : isVideo
      ? 'video'
      : mediaUrls.length > 1
      ? 'album'
      : 'image'

  const publishedAt = normalizeDate(row.publishedAt || row.published_at || row.created_at || row['Fecha publicación'])
  const savedAt = normalizeDate(row.savedAt || row.saved_at || row.timestamp || row['Fecha guardado'])
  const importedAt = normalizeDate(row.importedAt) || new Date().toISOString()

  const existingSummary = str(row.aiSummary || row.summary || row['Resumen IA'])
  const aiSummary =
    existingSummary && !existingSummary.startsWith('Sin texto')
      ? existingSummary
      : analysis.aiSummary

  const existingEntities = stringList(row.entities ?? row['Entidades'])
  const entities = Array.from(new Set([...existingEntities, ...analysis.entities]))

  const classificationStatus =
    row.classification_status === 'manual' || row.classificationStatus === 'manual'
      ? 'manual'
      : analysis.topics[0] !== 'Sin clasificar'
      ? 'deterministic'
      : 'pending'

  const classificationMatches = isObject(row.classification_matches)
    ? row.classification_matches
    : isObject(row.classificationMatches)
    ? row.classificationMatches
    : analysis.classificationMatches

  return {
    id,
    platform,
    sourceUrl,
    authorName,
    authorHandle,
    authorAvatar: safeUrl(row.authorAvatar) || undefined,
    domain,
    publishedAt,
    savedAt,
    importedAt,
    caption,
    contentType,
    collections,
    topics: classificationStatus === 'manual' && rawTopics.length > 0 ? rawTopics : analysis.topics,
    entities,
    aiSummary,
    language: str(row.language || row['Idioma']) || analysis.language,
    outgoingLinks: Array.from(new Set([...externalUrls, ...analysis.outgoingLinks])),
    mediaType,
    mediaUrls,
    mediaStatus: str(row.media_status || row.mediaStatus) || (mediaUrls.length > 0 ? 'referenced' : 'not_requested'),
    reviewed: Boolean(row.reviewed || row['Estado'] === 'Revisado'),
    analysisMethod: (row.analysisMethod as any) || 'rules',
    classificationStatus,
    classificationMatches,
    confidence: row.confidence ?? analysis.confidence,
    contentStatus: caption ? 'text' : 'link-only',
    captureSource: str(row.capture_source || row.captureSource) || provenance,
    provenance: str(row.raw_file || row.provenance) || provenance,
    error: str(row.error) || undefined
  }
}

export function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const firstLine = text.split(/\r?\n/)[0] || ''
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ','

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (c === delimiter && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += c
    }
  }
  if (quoted) throw new Error('CSV inválido: comillas sin cerrar.')
  row.push(cell)
  if (row.some(Boolean)) rows.push(row)
  const headers = rows.shift()?.map(h => h.trim()) || []
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])))
}

export function parseHtmlLinks(html: string, filename: string): Row[] {
  const igRegex = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?/gi
  const xRegex = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(?:[^/\s"']+\/status|i\/status)\/\d+/gi
  const matches = [...(html.match(igRegex) || []), ...(html.match(xRegex) || [])]
  return Array.from(new Set(matches)).map(url => ({ url, provenance: filename }))
}

export function parseImportText(
  text: string,
  filename: string
): { items: BookmarkItem[]; errors: number; messages: string[] } {
  const clean = text.replace(/^\uFEFF/, '').trim()
  let rows: Row[] = []

  try {
    if (/\.csv$/i.test(filename)) {
      rows = parseCsv(clean)
    } else if (/\.txt$/i.test(filename)) {
      rows = clean
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean)
        .map(url => ({ url, captureSource: 'txt_urls' }))
    } else if (/\.html?$/i.test(filename)) {
      rows = parseHtmlLinks(clean, filename)
    } else {
      // JSON, .har, or Twitter .js (window.YTD.bookmarks.part0 = [...])
      const jsonStr = clean.replace(/^window\.YTD\.[\w.]+\s*=\s*/, '').replace(/;\s*$/, '')
      const parsed = JSON.parse(jsonStr)
      rows = extractRows(parsed, filename)
    }
  } catch (err: any) {
    throw new Error(
      `No se pudo leer "${filename}". Formatos soportados: .HAR (DevTools), .JSON (X/Instagram/Atlas), .ZIP (Instagram), .JS (Archivo X), .CSV, .HTML o .TXT.`
    )
  }

  if (!rows.length) {
    throw new Error(
      `No se encontraron publicaciones guardadas dentro de "${filename}". Si es un HAR de X, asegúrate de haber abierto x.com/i/bookmarks con la pestaña Network activa.`
    )
  }

  const byId = new Map<string, BookmarkItem>()
  const messages: string[] = []
  let errors = 0

  rows.forEach((row, index) => {
    const item = normalizeRow(row, filename)
    if (item) {
      const existing = byId.get(item.id)
      if (existing) {
        // Merge collections & media if seen multiple times in the same file
        existing.collections = Array.from(new Set([...(existing.collections || []), ...(item.collections || [])]))
        existing.mediaUrls = Array.from(new Set([...existing.mediaUrls, ...item.mediaUrls]))
        if (!existing.caption && item.caption) existing.caption = item.caption
      } else {
        byId.set(item.id, item)
      }
    } else {
      errors++
      if (messages.length < 15) {
        messages.push(`Elemento #${index + 1}: URL o formato no reconocido.`)
      }
    }
  })

  return {
    items: Array.from(byId.values()),
    errors,
    messages
  }
}
