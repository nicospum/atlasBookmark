import { createHash } from 'node:crypto'
import { analyzeContent } from './ai-analyzer'
import { synthesizeBookmarkFields, cleanUrlString } from './resource-investigator'
import type {
  BookmarkItem,
  ImportDiagnosticCase,
  ImportStageMetrics,
  SourcePlatform,
  WhatsAppParsedMessage
} from './types'

type Row = Record<string, any>

const isObject = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

export function safeUrl(v: unknown): string {
  return cleanUrlString(str(v))
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

    if (raw.startsWith('whatsapp://message/')) {
      const key = raw.replace('whatsapp://message/', '').trim()
      if (key) {
        return {
          url: `whatsapp://message/${key}`,
          platform: 'whatsapp',
          key,
          id: `whatsapp:${key}`
        }
      }
    }

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

    if (host === 'github.com') {
      const m = u.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/)
      if (m) {
        const owner = m[1]
        const repo = m[2]
        const reserved = new Set([
          'orgs',
          'users',
          'topics',
          'trending',
          'collections',
          'events',
          'marketplace',
          'sponsors',
          'settings',
          'notifications',
          'login',
          'join',
          'pricing',
          'features',
          'about',
          'security',
          'explore',
          'search',
          'pulls',
          'issues',
          'codespaces'
        ])
        if (!reserved.has(owner.toLowerCase())) {
          const fullKey = `${owner.toLowerCase()}/${repo.toLowerCase()}`
          return {
            url: `https://github.com/${owner}/${repo}`,
            platform: 'github',
            key: fullKey,
            id: `github:${fullKey}`
          }
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

function unwrapTweetResult(rawResult: unknown): Row | null {
  if (!isObject(rawResult)) return null
  if (rawResult.__typename === 'TweetWithVisibilityResults' && isObject(rawResult.tweet)) {
    return rawResult.tweet
  }
  if (isObject(rawResult.tweet)) {
    return rawResult.tweet
  }
  return rawResult
}

function extractCardMeta(tweetObj: Row): { title?: string; description?: string; domain?: string; url?: string } | undefined {
  const bvs = tweetObj?.card?.legacy?.binding_values
  if (!Array.isArray(bvs)) return undefined
  const map: Record<string, string> = {}
  for (const item of bvs) {
    if (isObject(item) && typeof item.key === 'string' && isObject(item.value)) {
      if (typeof item.value.string_value === 'string') {
        map[item.key] = item.value.string_value.trim()
      }
    }
  }
  const title = map.title || ''
  const description = map.description || map.summary_photo_image_alt_text || ''
  const domain = map.domain || map.vanity_url || ''
  const url = map.card_url || ''
  if (!title && !description && !domain) return undefined
  return { title, description, domain, url }
}

function extractArticleMeta(tweetObj: Row): { title?: string; previewText?: string; id?: string } | undefined {
  const art = tweetObj?.article?.article_results?.result
  if (!isObject(art)) return undefined
  const title = str(art.title)
  const previewText = str(art.preview_text)
  const id = str(art.rest_id)
  if (!title && !previewText) return undefined
  return { title, previewText, id }
}

function extractTweetTextAndUrls(tweetObj: Row): {
  text: string
  urls: string[]
  mediaUrls: string[]
  hasVideo: boolean
  cardMeta?: { title?: string; description?: string; domain?: string; url?: string }
  articleMeta?: { title?: string; previewText?: string; id?: string }
} {
  const legacy = isObject(tweetObj.legacy) ? tweetObj.legacy : {}
  let text = str(legacy.full_text)
  const noteText = str(tweetObj.note_tweet?.note_tweet_results?.result?.text)
  if (noteText) {
    text = noteText
  }

  const urls: string[] = []
  const urlsList = Array.isArray(legacy.entities?.urls) ? legacy.entities.urls : []
  for (const u of urlsList) {
    const exp = safeUrl(u?.expanded_url || u?.url)
    if (exp && !urls.includes(exp)) urls.push(exp)
  }

  // Also check note_tweet entity_set urls
  const noteUrls = Array.isArray(tweetObj.note_tweet?.note_tweet_results?.result?.entity_set?.urls)
    ? tweetObj.note_tweet.note_tweet_results.result.entity_set.urls
    : []
  for (const u of noteUrls) {
    const exp = safeUrl(u?.expanded_url || u?.url)
    if (exp && !urls.includes(exp)) urls.push(exp)
  }

  const cardMeta = extractCardMeta(tweetObj)
  const articleMeta = extractArticleMeta(tweetObj)

  // If cardMeta is a GitHub card (e.g. "GitHub - owner/repo: ..."), extract canonical GitHub URL
  if (cardMeta) {
    const ghCardMatch = `${cardMeta.title || ''} ${cardMeta.description || ''}`.match(
      /GitHub\s*-\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i
    )
    if (ghCardMatch && ghCardMatch[1]) {
      const ghUrl = `https://github.com/${ghCardMatch[1].replace(/[.:,;]+$/, '')}`
      if (!urls.includes(ghUrl)) urls.unshift(ghUrl)
    }
    if (cardMeta.url) {
      const cUrl = safeUrl(cardMeta.url)
      if (cUrl && !urls.includes(cUrl) && !cUrl.includes('t.co/')) {
        urls.push(cUrl)
      }
    }
  }

  if (articleMeta?.id) {
    const artUrl = `https://x.com/i/article/${articleMeta.id}`
    if (!urls.includes(artUrl)) urls.push(artUrl)
  }

  // Scan serialized subtree of this tweet for any direct https://github.com/... links
  try {
    const rawSubtree = JSON.stringify({
      note: tweetObj.note_tweet,
      article: tweetObj.article,
      card: tweetObj.card
    })
    const ghMatches = rawSubtree.matchAll(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?/gi)
    for (const m of ghMatches) {
      const cleaned = safeUrl(m[0])
      if (cleaned && !urls.includes(cleaned)) urls.push(cleaned)
    }
  } catch {}

  const mediaUrls: string[] = []
  let hasVideo = false
  const mediaList = (
    Array.isArray(legacy.extended_entities?.media) && legacy.extended_entities.media.length > 0
      ? legacy.extended_entities.media
      : Array.isArray(legacy.entities?.media)
      ? legacy.entities.media
      : []
  ) as Row[]

  for (const m of mediaList) {
    if (m?.type === 'video' || m?.type === 'animated_gif') hasVideo = true
    const mUrl = safeUrl(m?.media_url_https || m?.media_url || m?.video_info?.variants?.[0]?.url)
    if (mUrl && !mediaUrls.includes(mUrl)) mediaUrls.push(mUrl)
  }

  return { text, urls, mediaUrls, hasVideo, cardMeta, articleMeta }
}

/**
 * Convert a raw X GraphQL tweet object into a normalized row,
 * including its nested X Article, Link Card, and Quoted Tweet context.
 */
function tweetFromGraphQL(tweetRaw: Row, provenance: string, orderIndex = 0): Row | null {
  const tweet = unwrapTweetResult(tweetRaw)
  if (!tweet) return null

  const legacy = isObject(tweet.legacy) ? tweet.legacy : {}
  const tweetId = str(tweet.rest_id || legacy.id_str)
  if (!tweetId) return null

  const userResult = tweet.core?.user_results?.result
  const userCore = isObject(userResult?.core) ? userResult.core : {}
  const userLegacy = isObject(userResult?.legacy) ? userResult.legacy : {}

  const screenName = str(userCore.screen_name || userLegacy.screen_name)
  const authorName = str(userCore.name || userLegacy.name || screenName || 'Usuario de X')
  const authorAvatar = safeUrl(userLegacy.profile_image_url_https || userResult?.avatar?.image_url)

  const mainData = extractTweetTextAndUrls(tweet)
  let caption = mainData.text
  const expandedUrls = [...mainData.urls]
  const mediaUrls = [...mainData.mediaUrls]
  let hasVideo = mainData.hasVideo
  let cardMeta = mainData.cardMeta
  let articleMeta = mainData.articleMeta

  // If the tweet has an X Article, enrich caption if caption is just a short link/hook
  if (articleMeta?.title) {
    const artSummary = [articleMeta.title, articleMeta.previewText].filter(Boolean).join(' — ')
    if (artSummary && !caption.includes(articleMeta.title)) {
      caption = caption ? `${caption}\n\n[Artículo X: ${artSummary}]` : artSummary
    }
  }

  // Inspect Quoted Tweet if present ( strictly as context of this bookmark, never as a separate bookmark)
  const quotedRaw = tweet.quoted_status_result?.result
  const quotedTweet = unwrapTweetResult(quotedRaw)
  if (quotedTweet) {
    const qData = extractTweetTextAndUrls(quotedTweet)
    const qUserResult = quotedTweet.core?.user_results?.result
    const qHandle = str(qUserResult?.core?.screen_name || qUserResult?.legacy?.screen_name)
    for (const u of qData.urls) {
      if (!expandedUrls.includes(u)) expandedUrls.push(u)
    }
    for (const m of qData.mediaUrls) {
      if (!mediaUrls.includes(m)) mediaUrls.push(m)
    }
    if (qData.hasVideo) hasVideo = true
    if (!cardMeta && qData.cardMeta) cardMeta = qData.cardMeta
    if (!articleMeta && qData.articleMeta) articleMeta = qData.articleMeta

    const qCleanText = qData.text.replace(/^https?:\/\/t\.co\/\S+$/i, '').trim()
    const qArtInfo = qData.articleMeta?.title
      ? `${qData.articleMeta.title}${qData.articleMeta.previewText ? `: ${qData.articleMeta.previewText}` : ''}`
      : ''
    const qContext = [qCleanText, qArtInfo].filter(Boolean).join(' — ')
    if (qContext && !caption.includes(qContext.slice(0, 40))) {
      caption = caption
        ? `${caption}\n\n[Cita${qHandle ? ` @${qHandle}` : ''}]: ${qContext}`
        : `[Cita${qHandle ? ` @${qHandle}` : ''}]: ${qContext}`
    }
  }

  const canonical = screenName
    ? `https://x.com/${screenName}/status/${tweetId}`
    : `https://x.com/i/status/${tweetId}`

  const publishedAt = normalizeDate(legacy.created_at)

  return {
    id: `x:${tweetId}`,
    platform: 'x',
    sourceUrl: canonical,
    authorName,
    authorHandle: screenName ? `@${screenName.replace(/^@/, '')}` : '',
    authorAvatar: authorAvatar || undefined,
    publishedAt,
    savedAt: publishedAt,
    caption,
    outgoingLinks: expandedUrls,
    mediaUrls,
    mediaType: hasVideo ? 'video' : mediaUrls.length > 1 ? 'album' : mediaUrls.length === 1 ? 'image' : 'none',
    language: str(legacy.lang),
    captureSource: 'x_har',
    provenance,
    cardMeta,
    articleMeta,
    orderIndex
  }
}

/**
 * Extract only genuine bookmarked tweets from an X GraphQL Bookmarks response payload.
 * Filters out SidebarUserRecommendations, cursors, promoted tweets, and prevents
 * quoted tweets from being emitted as standalone false bookmarks.
 */
function extractTopLevelXBookmarkTweets(payload: any): { tweets: Row[]; incidentalSkipped: number } {
  const tweets: Row[] = []
  let incidentalSkipped = 0

  const instructions =
    payload?.data?.bookmark_timeline_v2?.timeline?.instructions ||
    payload?.data?.bookmark_collection_timeline?.timeline?.instructions

  if (Array.isArray(instructions)) {
    for (const inst of instructions) {
      const entries = Array.isArray(inst?.entries)
        ? inst.entries
        : isObject(inst?.entry)
        ? [inst.entry]
        : []

      for (const ent of entries) {
        const entryId = str(ent?.entryId)
        if (!entryId.startsWith('tweet-')) {
          incidentalSkipped++
          continue
        }
        const rawTweet = ent?.content?.itemContent?.tweet_results?.result
        // Skip promoted tweets if present
        if (ent?.content?.itemContent?.promotedMetadata) {
          incidentalSkipped++
          continue
        }
        const unwrapped = unwrapTweetResult(rawTweet)
        if (unwrapped && (unwrapped.rest_id || unwrapped.legacy?.id_str)) {
          tweets.push(unwrapped)
        } else {
          incidentalSkipped++
        }
      }
    }
    return { tweets, incidentalSkipped }
  }

  // Fallback for custom/minimal test fixtures where tweet_results is at top-level or inside TimelineAddEntries
  function walkTopLevelOnly(node: unknown) {
    if (isObject(node)) {
      if (isObject(node.tweet_results)) {
        const unwrapped = unwrapTweetResult(node.tweet_results.result)
        if (unwrapped && (unwrapped.rest_id || unwrapped.legacy?.id_str)) {
          tweets.push(unwrapped)
          return // Do NOT recurse inside a matched tweet_results (avoids extracting quoted tweets as top-level!)
        }
      }
      for (const [k, child] of Object.entries(node)) {
        if (k === 'quoted_status_result' || k === 'retweeted_status_result') {
          incidentalSkipped++
          continue
        }
        walkTopLevelOnly(child)
      }
    } else if (Array.isArray(node)) {
      for (const child of node) {
        walkTopLevelOnly(child)
      }
    }
  }

  walkTopLevelOnly(payload)
  return { tweets, incidentalSkipped }
}

export function extractFromHarWithMetrics(
  har: Row,
  filename: string
): { rows: Row[]; metrics: Omit<ImportStageMetrics, 'added' | 'updated' | 'duplicates' | 'persistedTotal'> } {
  const entries = Array.isArray(har?.log?.entries) ? har.log.entries : []
  const byId = new Map<string, Row>()
  let recognizedResponses = 0
  let emptyBodyResponses = 0
  let incidentalSkipped = 0
  let orderCounter = 0

  for (const entry of entries) {
    const reqUrl = str(entry?.request?.url)
    const method = str(entry?.request?.method || 'GET').toUpperCase()
    if (method === 'OPTIONS') continue

    // Strictly match X Bookmarks GraphQL endpoints (excluding SidebarUserRecommendations, ViewerBadgeCounts, etc.)
    const isXBookmarksEndpoint =
      reqUrl.includes('/Bookmarks') ||
      reqUrl.includes('/BookmarkFolderTimeline') ||
      (reqUrl.includes('/graphql/') && /bookmark/i.test(reqUrl) && !/Sidebar|Viewer|Explore/i.test(reqUrl))

    const isIgSavedEndpoint =
      reqUrl.includes('/api/v1/feed/saved/') ||
      (reqUrl.includes('instagram.com') && reqUrl.includes('graphql') && /saved/i.test(reqUrl))

    if (!isXBookmarksEndpoint && !isIgSavedEndpoint) {
      continue
    }

    const content = entry?.response?.content
    let text = str(content?.text)
    if (!text) {
      emptyBodyResponses++
      continue
    }

    if (content?.encoding === 'base64') {
      try {
        text = Buffer.from(text, 'base64').toString('utf8')
      } catch {
        emptyBodyResponses++
        continue
      }
    }

    let payload: any
    try {
      payload = JSON.parse(text)
    } catch {
      emptyBodyResponses++
      continue
    }

    recognizedResponses++

    if (isXBookmarksEndpoint) {
      const extracted = extractTopLevelXBookmarkTweets(payload)
      incidentalSkipped += extracted.incidentalSkipped
      for (const tweet of extracted.tweets) {
        const row = tweetFromGraphQL(tweet, filename, orderCounter++)
        if (row) {
          const existing = byId.get(row.id)
          if (!existing) {
            byId.set(row.id, row)
          } else {
            // Merge any newly discovered links/media if the same tweet appeared in overlapping pages
            existing.outgoingLinks = Array.from(new Set([...(existing.outgoingLinks || []), ...(row.outgoingLinks || [])]))
            existing.mediaUrls = Array.from(new Set([...(existing.mediaUrls || []), ...(row.mediaUrls || [])]))
            if (!existing.cardMeta && row.cardMeta) existing.cardMeta = row.cardMeta
            if (!existing.articleMeta && row.articleMeta) existing.articleMeta = row.articleMeta
          }
        }
      }
    }

    if (isIgSavedEndpoint) {
      const items = Array.isArray(payload?.items) ? payload.items : []
      for (const rawItem of items) {
        const media = isObject(rawItem?.media) ? rawItem.media : rawItem
        const code = str(media?.code || media?.pk)
        if (!code) {
          incidentalSkipped++
          continue
        }
        const username = str(media?.user?.username)
        const img = safeUrl(media?.image_versions2?.candidates?.[0]?.url)
        const id = `instagram:${code}`
        if (!byId.has(id)) {
          const pubAt = normalizeDate(media?.taken_at)
          byId.set(id, {
            id,
            platform: 'instagram',
            sourceUrl: `https://www.instagram.com/p/${code}/`,
            authorName: str(media?.user?.full_name || username || 'Instagram User'),
            authorHandle: username ? `@${username}` : '',
            authorAvatar: safeUrl(media?.user?.profile_pic_url) || undefined,
            publishedAt: pubAt,
            savedAt: pubAt,
            caption: str(media?.caption?.text),
            mediaUrls: img ? [img] : [],
            mediaType: img ? 'image' : 'none',
            captureSource: 'instagram_har',
            provenance: filename,
            orderIndex: orderCounter++
          })
        }
      }
    }
  }

  const rows = Array.from(byId.values())
  let diagnosticCase: ImportDiagnosticCase = 'ok'
  let diagnosticHint: string | undefined

  if (rows.length === 0) {
    if (recognizedResponses === 0 && emptyBodyResponses > 0) {
      diagnosticCase = 'har_empty_bodies'
      diagnosticHint = `Se detectaron ${emptyBodyResponses} respuestas de Guardados/Bookmarks en el HAR, pero sus cuerpos (response.content.text) están vacíos. Exportá el HAR usando "Save all as HAR with content" o el botón de exportar HAR en Chrome DevTools con el filtro Fetch/XHR.`
    } else if (recognizedResponses === 0) {
      diagnosticCase = 'har_no_bookmark_responses'
      diagnosticHint = `El archivo HAR es válido (${entries.length} entradas de red), pero contiene 0 respuestas de Bookmarks/Guardados. Abrí F12 → Network (filtro Fetch/XHR) ANTES de cargar x.com/i/bookmarks y hacé scroll para que se registren las peticiones GraphQL Bookmarks.`
    } else {
      diagnosticCase = 'no_items_found'
      diagnosticHint = `Se leyeron ${recognizedResponses} respuestas de Bookmarks pero no contenían publicaciones válidas.`
    }
  }

  return {
    rows,
    metrics: {
      networkEntries: entries.length,
      recognizedResponses,
      emptyBodyResponses,
      incidentalSkipped,
      detectedItems: rows.length,
      errors: 0,
      diagnosticCase,
      diagnosticHint
    }
  }
}

export function extractFromHar(har: Row, filename: string): Row[] {
  return extractFromHarWithMetrics(har, filename).rows
}

/**
 * Strip cookies, authorization tokens, and CSRF headers from HAR content before writing to disk.
 */
export function sanitizeHarJsonString(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText)
    if (!isObject(parsed) || !isObject(parsed.log) || !Array.isArray(parsed.log.entries)) {
      return rawText
    }
    const sensitiveHeaderRx = /^(cookie|set-cookie|authorization|x-csrf-token|x-guest-token|x-twitter-auth-type|proxy-authorization)$/i
    for (const entry of parsed.log.entries) {
      if (isObject(entry?.request)) {
        if (Array.isArray(entry.request.headers)) {
          entry.request.headers = entry.request.headers.filter(
            (h: any) => !sensitiveHeaderRx.test(str(h?.name))
          )
        }
        entry.request.cookies = []
      }
      if (isObject(entry?.response)) {
        if (Array.isArray(entry.response.headers)) {
          entry.response.headers = entry.response.headers.filter(
            (h: any) => !sensitiveHeaderRx.test(str(h?.name))
          )
        }
        entry.response.cookies = []
      }
    }
    return JSON.stringify(parsed)
  } catch {
    return rawText
  }
}

/**
 * Anonymize raw phone numbers in WhatsApp sender names so private numbers are not exposed.
 */
export function sanitizeWhatsAppSender(rawSender: string): string {
  const s = (rawSender || '').trim()
  if (!s) return 'Contacto de WhatsApp'
  // Check if it looks like a phone number (+54 9 11 ..., +34 ..., etc.)
  const digits = s.replace(/\D/g, '')
  if (digits.length >= 7 && /^[+\d\s()-]+$/.test(s)) {
    return `Contacto WA (•••${digits.slice(-4)})`
  }
  return s
}

/**
 * Parse WhatsApp exported chat (.txt) or pasted WhatsApp messages into structured messages.
 * Supports:
 * - [d/m/yy, hh:mm:ss] Author: Message (iOS / Web)
 * - d/m/yy, hh:mm - Author: Message (Android)
 * - [hh:mm, d/m/yyyy] Author: Message (WhatsApp Web copy-paste)
 * - Free-form lines or blocks with URLs
 */
export function parseWhatsAppChatText(text: string): WhatsAppParsedMessage[] {
  const clean = (text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim()
  if (!clean) return []

  const lines = clean.split('\n')
  const msgHeaderRx1 = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap]\.?\s*[Mm]\.?)?)\]?\s*(?:-|\s)\s*([^:]+):\s*([\s\S]*)$/
  const msgHeaderRx2 = /^\[(\d{1,2}:\d{2}(?::\d{2})?),\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\]\s*([^:]+):\s*([\s\S]*)$/

  const systemIgnoreRx =
    /(?:cifrados de extremo a extremo|end-to-end encrypted|<Multimedia omitido>|<Media omitted>| eliminó este mensaje|This message was deleted|creó el grupo|cambió el asunto)/i

  const rawMessages: Array<{ dateStr: string; sender: string; body: string }> = []
  let current: { dateStr: string; sender: string; body: string } | null = null

  for (const line of lines) {
    const m1 = line.match(msgHeaderRx1)
    const m2 = !m1 ? line.match(msgHeaderRx2) : null

    if (m1) {
      if (current && current.body.trim()) rawMessages.push(current)
      current = {
        dateStr: `${m1[1]} ${m1[2]}`,
        sender: m1[3].trim(),
        body: m1[4]
      }
    } else if (m2) {
      if (current && current.body.trim()) rawMessages.push(current)
      current = {
        dateStr: `${m2[2]} ${m2[1]}`,
        sender: m2[3].trim(),
        body: m2[4]
      }
    } else if (current) {
      current.body += `\n${line}`
    } else if (line.trim()) {
      // Unstructured pasted message block
      current = {
        dateStr: '',
        sender: 'WhatsApp',
        body: line
      }
    }
  }
  if (current && current.body.trim()) {
    rawMessages.push(current)
  }

  const results: WhatsAppParsedMessage[] = []
  const seenIds = new Set<string>()

  for (const msg of rawMessages) {
    const body = msg.body.trim()
    if (!body || systemIgnoreRx.test(body)) continue

    // Extract URLs
    const rawUrls = body.match(/https?:\/\/[^\s<>"')\]]+/gi) || []
    const urls = Array.from(new Set(rawUrls.map(cleanUrlString).filter(Boolean)))

    // Parse dd/mm/yyyy date if possible
    let isoDate = new Date().toISOString()
    if (msg.dateStr) {
      const dm = msg.dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
      if (dm) {
        const day = Number(dm[1])
        const month = Number(dm[2])
        let year = Number(dm[3])
        if (year < 100) year += 2000
        const hour = Number(dm[4])
        const minute = Number(dm[5])
        const second = Number(dm[6] || 0)
        const d = new Date(Date.UTC(year, Math.max(0, month - 1), day, hour, minute, second))
        if (Number.isFinite(d.getTime())) {
          isoDate = d.toISOString()
        }
      }
    }

    const sender = sanitizeWhatsAppSender(msg.sender)
    const hash = createHash('sha256').update(`whatsapp:${sender}:${body}`).digest('hex').slice(0, 16)
    const id = `whatsapp:${hash}`
    if (seenIds.has(id)) continue
    seenIds.add(id)

    results.push({
      id,
      timestamp: isoDate,
      sender,
      text: body,
      urls,
      hasLinks: urls.length > 0
    })
  }

  return results
}

export function whatsAppMessagesToRows(
  messages: WhatsAppParsedMessage[],
  provenance = 'whatsapp_import'
): Row[] {
  return messages.map(msg => {
    const hash = msg.id.replace(/^whatsapp:/, '')
    return {
      id: msg.id,
      platform: 'whatsapp',
      sourceUrl: `whatsapp://message/${hash}`,
      authorName: msg.sender || 'WhatsApp',
      authorHandle: 'WhatsApp',
      publishedAt: msg.timestamp,
      savedAt: msg.timestamp,
      caption: msg.text,
      outgoingLinks: msg.urls,
      captureSource: 'whatsapp_chat',
      provenance
    }
  })
}

/**
 * Recursively extract rows from any supported JSON structure:
 * - Atlas Backup v2 ({ schema: 'atlas-backup-v2', items: [...] })
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

  // 0. Check if it's an Atlas Versioned Backup v2
  if (input.schema === 'atlas-backup-v2' && Array.isArray(input.items)) {
    return input.items.filter(isObject)
  }

  // 0b. Check if it's a GitHub Visual Gallery JSON export ({ repositories: [...], version: '2.0' })
  if (Array.isArray(input.repositories)) {
    return input.repositories.filter(isObject).map(repo => {
      const fullName = str(repo.fullName || (repo.owner && repo.name ? `${repo.owner}/${repo.name}` : ''))
      const owner = str(repo.owner || fullName.split('/')[0] || 'github')
      const repoUrl = str(repo.url || (fullName ? `https://github.com/${fullName}` : ''))
      const shortExp = str(repo.shortExplanationEs || repo.explanation || repo.description)
      const longExp = str(repo.longExplanationEs || repo.explanation || repo.description)
      return {
        id: fullName ? `github:${fullName.toLowerCase()}` : undefined,
        platform: 'github',
        sourceUrl: repoUrl,
        url: repoUrl,
        title: fullName,
        purpose: shortExp,
        caption: [fullName, str(repo.description), longExp].filter(Boolean).join('\n\n'),
        authorName: owner,
        authorHandle: `@${owner}`,
        authorAvatar: str(repo.avatarUrl || `https://github.com/${owner}.png?size=128`),
        domain: 'github.com',
        publishedAt: str(repo.createdAt || ''),
        savedAt: str(repo.addedAt || repo.updatedAt || ''),
        topics: Array.isArray(repo.topics) ? repo.topics : [],
        outgoingLinks: [repoUrl, str(repo.homepage)].filter(Boolean),
        mediaUrls: str(repo.imageUrl) ? [str(repo.imageUrl)] : [],
        captureSource: 'github_visual_gallery',
        provenance: filename
      }
    })
  }

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

  if (typeof input.title === 'string' && input.title.trim() && Array.isArray(input.string_map_data)) {
    collections.push(input.title.trim())
  }

  // 4. Direct record (Hermes archive.json, Atlas BookmarkItem, CSV row, etc.)
  if (
    input.record_id ||
    input.sourceUrl ||
    input.url ||
    input['URL Original'] ||
    input['Nombre / recurso'] ||
    (input.href && canonicalUrl(input.href))
  ) {
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

  const nested: Row[] = []
  for (const child of Object.values(input)) {
    if (Array.isArray(child) || isObject(child)) {
      nested.push(...extractRows(child, filename, collections))
    }
  }
  return nested
}

/**
 * Normalize a single extracted Row into a canonical BookmarkItem.
 * Implements "Save first, analyze later": basic capture + local deterministic synthesis never fail.
 */
export function normalizeRow(row: Row, provenance = 'manual'): BookmarkItem | null {
  const rawUrl = str(
    row.sourceUrl || row.url || row.href || row.uri || row['URL Original'] || row['Origen URL'] || row.link
  )
  const canonical = canonicalUrl(rawUrl)

  const rawRecordId = str(row.record_id || row.id || row['ID'])
  const rawPlatform = str(row.platform || row['Origen'] || row['Fuente']).toLowerCase()
  const isWhatsAppRow =
    rawPlatform.includes('whatsapp') ||
    rawRecordId.startsWith('whatsapp:') ||
    rawUrl.startsWith('whatsapp://')
  const isGitHubRow =
    rawPlatform.includes('github') ||
    rawRecordId.startsWith('github:') ||
    canonical?.platform === 'github'

  if (
    !canonical &&
    !isWhatsAppRow &&
    !isGitHubRow &&
    !rawRecordId.startsWith('x:') &&
    !rawRecordId.startsWith('instagram:') &&
    !safeUrl(rawUrl)
  ) {
    return null
  }

  const platform: SourcePlatform = isWhatsAppRow
    ? 'whatsapp'
    : isGitHubRow
    ? 'github'
    : canonical
    ? canonical.platform
    : rawRecordId.startsWith('instagram:') || rawPlatform.includes('instagram')
    ? 'instagram'
    : 'x'

  const caption = str(
    row.caption ?? row.text ?? row.full_text ?? row['Texto completo'] ?? row['Texto original'] ?? ''
  ).slice(0, 100000)

  const id =
    rawRecordId.startsWith('x:') ||
    rawRecordId.startsWith('instagram:') ||
    rawRecordId.startsWith('whatsapp:') ||
    rawRecordId.startsWith('github:')
      ? rawRecordId
      : canonical
      ? canonical.id
      : isWhatsAppRow
      ? `whatsapp:${createHash('sha256').update(`${row.authorName || ''}:${caption || rawUrl}`).digest('hex').slice(0, 16)}`
      : `${platform}:${createHash('sha256').update(`${platform}:${rawUrl}:${caption.slice(0, 120)}`).digest('hex').slice(0, 16)}`

  const sourceUrl = canonical
    ? canonical.url
    : isWhatsAppRow
    ? rawUrl.startsWith('whatsapp://')
      ? rawUrl
      : `whatsapp://message/${id.replace(/^whatsapp:/, '')}`
    : safeUrl(rawUrl) || `https://x.com`

  const rawTopics = stringList(row.topics ?? row['Área / tema'] ?? row['Temas']).filter(
    t => t && t !== 'Sin clasificar' && t !== 'Pendiente'
  )
  const collections = stringList(row.collections ?? row['Colecciones'])
  const externalUrls = [
    ...stringList(row.external_urls),
    ...stringList(row.outgoingLinks),
    ...stringList(row['Enlaces salientes']),
    ...stringList(row['Enlaces útiles'])
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
  const authorHandle =
    platform === 'whatsapp'
      ? rawHandle || 'WhatsApp'
      : rawHandle
      ? `@${rawHandle.replace(/^@/, '')}`
      : handleFromUrl

  const authorName =
    str(row.authorName || row.author || row['Autor']) ||
    (platform === 'whatsapp'
      ? 'Contacto de WhatsApp'
      : authorHandle
      ? authorHandle.replace(/^@/, '')
      : platform === 'x'
      ? 'Usuario de X'
      : 'Usuario de Instagram')

  const primaryExternalUrl = externalUrls[0] || (sourceUrl.startsWith('http') ? sourceUrl : '')
  const domain = str(row.domain) || (primaryExternalUrl ? extractDomain(primaryExternalUrl) : 'whatsapp')

  let analysis
  try {
    analysis = analyzeContent(caption, rawTopics, {
      domain,
      author: authorName,
      handle: authorHandle,
      collections,
      externalUrls
    })
  } catch {
    analysis = {
      topics: rawTopics.length > 0 ? rawTopics : ['Sin clasificar'],
      entities: [],
      aiSummary: caption.slice(0, 180) || 'Guardado importado.',
      language: 'Español',
      outgoingLinks: externalUrls,
      classificationMatches: {},
      confidence: 0
    }
  }

  const allOutgoingLinks = Array.from(new Set([...externalUrls, ...analysis.outgoingLinks]))
  const finalTopics =
    (row.classification_status === 'manual' || row.classificationStatus === 'manual') && rawTopics.length > 0
      ? rawTopics
      : analysis.topics

  const existingEntities = stringList(row.entities ?? row['Entidades'])
  const entities = Array.from(new Set([...existingEntities, ...analysis.entities]))

  // Synthesize comprehensible table fields & linked resources
  const synthesis = synthesizeBookmarkFields({
    caption,
    authorName,
    authorHandle,
    platform,
    outgoingLinks: allOutgoingLinks,
    topics: finalTopics,
    entities,
    existingResources: Array.isArray(row.resources) ? row.resources : undefined,
    cardMeta: isObject(row.cardMeta) ? row.cardMeta : undefined,
    articleMeta: isObject(row.articleMeta) ? row.articleMeta : undefined
  })

  const manualFields = Array.isArray(row.manualFields)
    ? row.manualFields
    : Array.isArray(row.manual_fields)
    ? row.manual_fields
    : []

  const title =
    (manualFields.includes('title') && str(row.title)) ||
    str(row.title || row['Nombre / recurso']) ||
    synthesis.title

  const purpose =
    (manualFields.includes('purpose') && str(row.purpose)) ||
    str(row.purpose || row['Para qué sirve']) ||
    synthesis.purpose

  const resourceType =
    ((manualFields.includes('resourceType') && str(row.resourceType || row.resource_type)) ||
      str(row.resourceType || row.resource_type || row['Tipo']) ||
      synthesis.resourceType) as BookmarkItem['resourceType']

  const evaluation =
    (manualFields.includes('evaluation') && str(row.evaluation)) ||
    str(row.evaluation || row['Evaluación breve']) ||
    synthesis.evaluation

  const analysisState =
    (str(row.analysisState || row.analysis_state) as BookmarkItem['analysisState']) || synthesis.analysisState

  const notes = str(row.notes ?? row['Notas'] ?? '')

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
  const importedAt = normalizeDate(row.importedAt || row.imported_at) || new Date().toISOString()

  const existingSummary = str(row.aiSummary || row.summary || row['Resumen IA'])
  const aiSummary =
    existingSummary && !existingSummary.startsWith('Sin texto')
      ? existingSummary
      : purpose || analysis.aiSummary

  const classificationStatus =
    row.classification_status === 'manual' || row.classificationStatus === 'manual' || manualFields.length > 0
      ? 'manual'
      : finalTopics[0] !== 'Sin clasificar'
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
    title,
    purpose,
    resourceType,
    evaluation,
    analysisState,
    notes,
    resources: synthesis.resources,
    manualFields,
    importBatchId: str(row.importBatchId || row.import_batch_id) || undefined,
    contentType,
    collections,
    topics: finalTopics,
    entities,
    aiSummary,
    language: str(row.language || row['Idioma']) || analysis.language,
    outgoingLinks: allOutgoingLinks,
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
): {
  items: BookmarkItem[]
  errors: number
  messages: string[]
  stages: Omit<ImportStageMetrics, 'added' | 'updated' | 'duplicates' | 'persistedTotal'>
} {
  const clean = (text || '').replace(/^\uFEFF/, '').trim()
  if (!clean) {
    throw new Error(
      `El archivo "${filename}" está vacío (0 bytes). Si exportaste un HAR desde Chrome DevTools tras mucho scroll con video, filtrá primero por "Fetch/XHR" en la pestaña Network antes de exportar el HAR.`
    )
  }

  let rows: Row[] = []
  let stageBase: Omit<ImportStageMetrics, 'added' | 'updated' | 'duplicates' | 'persistedTotal'> = {
    networkEntries: 0,
    recognizedResponses: 0,
    emptyBodyResponses: 0,
    incidentalSkipped: 0,
    detectedItems: 0,
    errors: 0,
    diagnosticCase: 'ok'
  }

  if (/\.csv$/i.test(filename)) {
    try {
      rows = parseCsv(clean)
      stageBase.networkEntries = rows.length
      stageBase.recognizedResponses = rows.length > 0 ? 1 : 0
    } catch (err: any) {
      throw new Error(err.message || `No se pudo leer el archivo CSV "${filename}".`)
    }
  } else if (/\.txt$/i.test(filename)) {
    // Check if it looks like a WhatsApp chat export or list of URLs
    const isWhatsAppChat =
      /^\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}/m.test(clean) ||
      /whatsapp/i.test(filename) ||
      /_chat\.txt$/i.test(filename)

    if (isWhatsAppChat) {
      const waMsgs = parseWhatsAppChatText(clean)
      // Prefer messages with links if it's a large chat, or all if small
      const withLinks = waMsgs.filter(m => m.hasLinks)
      const selected = withLinks.length > 0 ? withLinks : waMsgs
      rows = whatsAppMessagesToRows(selected, filename)
      stageBase.networkEntries = waMsgs.length
      stageBase.recognizedResponses = 1
      stageBase.incidentalSkipped = waMsgs.length - selected.length
    } else {
      const lines = clean
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean)
      rows = lines.map(url => ({ url, captureSource: 'txt_urls' }))
      stageBase.networkEntries = lines.length
      stageBase.recognizedResponses = 1
    }
  } else if (/\.html?$/i.test(filename)) {
    rows = parseHtmlLinks(clean, filename)
    stageBase.networkEntries = rows.length
    stageBase.recognizedResponses = 1
  } else {
    // JSON, .har, or Twitter .js (window.YTD.bookmarks.part0 = [...])
    const jsonStr = clean.replace(/^window\.YTD\.[\w.]+\s*=\s*/, '').replace(/;\s*$/, '')
    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      throw new Error(
        `El archivo "${filename}" no contiene JSON válido (puede estar truncado o incompleto). Si es un archivo .HAR de Chrome DevTools, filtrá por "Fetch/XHR" en Network y volvé a exportarlo.`
      )
    }

    if (isObject(parsed) && isObject(parsed.log) && Array.isArray(parsed.log.entries)) {
      const harRes = extractFromHarWithMetrics(parsed, filename)
      rows = harRes.rows
      stageBase = harRes.metrics
      if (rows.length === 0 && stageBase.diagnosticHint) {
        throw new Error(stageBase.diagnosticHint)
      }
    } else {
      rows = extractRows(parsed, filename)
      stageBase.networkEntries = rows.length
      stageBase.recognizedResponses = rows.length > 0 ? 1 : 0
    }
  }

  if (!rows.length) {
    throw new Error(
      `No se encontraron publicaciones guardadas dentro de "${filename}". Si es un HAR de X, abrí F12 → Network (filtro Fetch/XHR) antes de cargar x.com/i/bookmarks y hacé scroll.`
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
        existing.collections = Array.from(new Set([...(existing.collections || []), ...(item.collections || [])]))
        existing.mediaUrls = Array.from(new Set([...existing.mediaUrls, ...item.mediaUrls]))
        existing.outgoingLinks = Array.from(new Set([...existing.outgoingLinks, ...item.outgoingLinks]))
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

  stageBase.detectedItems = byId.size
  stageBase.errors = errors

  return {
    items: Array.from(byId.values()),
    errors,
    messages,
    stages: stageBase
  }
}
