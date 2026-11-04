/**
 * Atlas de Guardados - Extractor Automatizado de Bookmarks (Playwright)
 *
 * Abre una ventana de Chromium con perfil persistente (.atlas_browser_profile)
 * para que el usuario inicie sesión una sola vez y capture sus guardados de X o Instagram
 * interceptando las peticiones internas de red (GraphQL / REST).
 */

import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'

const platform = process.argv[2] || 'x'
const maxItems = parseInt(process.argv[3] || '100', 10)

const DB_PATH = path.join(process.cwd(), 'data', 'atlas.db')
const db = new Database(DB_PATH)

const USER_DATA_DIR = path.join(process.cwd(), '.atlas_browser_profile')
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true })
}

console.log(`[ATLAS] Iniciando extractor para: ${platform.toUpperCase()}`)
console.log(`[ATLAS] Perfil de navegador persistente: ${USER_DATA_DIR}`)

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO bookmarks (
    id, platform, source_url, author_name, author_handle, author_avatar,
    domain, published_at, saved_at, imported_at, caption, content_type,
    collections, topics, entities, ai_summary, language, outgoing_links,
    media_type, media_urls, media_status, reviewed, analysis_method,
    classification_status, capture_source, provenance
  ) VALUES (
    @id, @platform, @sourceUrl, @authorName, @authorHandle, @authorAvatar,
    @domain, @publishedAt, @savedAt, @importedAt, @caption, @contentType,
    @collections, @topics, @entities, @aiSummary, @language, @outgoingLinks,
    @mediaType, @mediaUrls, @mediaStatus, @reviewed, @analysisMethod,
    @classificationStatus, @captureSource, @provenance
  )
`)

function quickClassify(text) {
  const lower = (text || '').toLowerCase()
  const rules = {
    'IA': ['ia', 'ai', 'llm', 'agent', 'agents', 'claude', 'gpt', 'opus', 'openai', 'gemini', 'prompt', 'rag'],
    'Diseño': ['design', 'diseño', 'figma', 'ux', 'ui', 'css', 'tailwind', 'layout'],
    'Programación': ['code', 'coding', 'typescript', 'javascript', 'python', 'github', 'api', 'react', 'next.js', 'sqlite'],
    'Producto': ['product', 'producto', 'startup', 'saas', 'launch', 'analytics', 'mvp'],
    'Lecturas': ['book', 'libro', 'paper', 'article', 'essay', 'guide', 'tutorial'],
    'Cultura': ['art', 'arte', 'film', 'music', 'video', 'history']
  }
  const topics = []
  for (const [topic, words] of Object.entries(rules)) {
    if (words.some(w => lower.includes(w))) topics.push(topic)
  }
  return topics.length > 0 ? topics.slice(0, 4) : ['Ideas']
}

function* walkTweets(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const tr = value.tweet_results
    const result = tr && typeof tr === 'object' ? (tr.result?.tweet || tr.result) : null
    if (result && typeof result === 'object' && (result.rest_id || result.legacy?.id_str)) {
      yield result
    }
    for (const child of Object.values(value)) {
      yield* walkTweets(child)
    }
  } else if (Array.isArray(value)) {
    for (const child of value) {
      yield* walkTweets(child)
    }
  }
}

async function run() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 820 },
    args: ['--disable-blink-features=AutomationControlled']
  })

  const page = await context.newPage()
  let capturedCount = 0
  const seenIds = new Set()

  if (platform === 'x') {
    console.log('[ATLAS] Navegando a https://x.com/i/bookmarks ...')

    page.on('response', async response => {
      const url = response.url()
      if (url.includes('/Bookmarks') || (url.includes('/graphql/') && url.toLowerCase().includes('bookmark'))) {
        try {
          const json = await response.json()
          for (const tweet of walkTweets(json)) {
            const legacy = tweet.legacy || {}
            const tweetId = tweet.rest_id || legacy.id_str
            if (!tweetId || seenIds.has(tweetId)) continue
            seenIds.add(tweetId)

            const userRes = tweet.core?.user_results?.result || {}
            const userCore = userRes.core || {}
            const userLegacy = userRes.legacy || {}
            const screenName = userCore.screen_name || userLegacy.screen_name || 'usuario'
            const authorName = userCore.name || userLegacy.name || screenName
            const authorHandle = `@${screenName}`
            const authorAvatar = userLegacy.profile_image_url_https || null

            let caption = legacy.full_text || ''
            if (tweet.note_tweet?.note_tweet_results?.result?.text) {
              caption = tweet.note_tweet.note_tweet_results.result.text
            }

            const publishedAt = legacy.created_at ? new Date(legacy.created_at).toISOString() : new Date().toISOString()
            const sourceUrl = `https://x.com/${screenName}/status/${tweetId}`

            const mediaList = legacy.extended_entities?.media || legacy.entities?.media || []
            const mediaUrls = mediaList.map(m => m.media_url_https || m.media_url).filter(Boolean)
            const outgoingLinks = (legacy.entities?.urls || []).map(u => u.expanded_url || u.url).filter(Boolean)
            const topics = quickClassify(caption)
            const cleanSummary = caption.replace(/https?:\/\/\S+/g, '').trim().slice(0, 180)

            insertStmt.run({
              id: `x:${tweetId}`,
              platform: 'x',
              sourceUrl,
              authorName,
              authorHandle,
              authorAvatar,
              domain: 'x.com',
              publishedAt,
              savedAt: new Date().toISOString(),
              importedAt: new Date().toISOString(),
              caption,
              contentType: mediaUrls.length > 0 ? 'media' : 'post',
              collections: '[]',
              topics: JSON.stringify(topics),
              entities: '[]',
              aiSummary: cleanSummary || `Post guardado de ${authorHandle}`,
              language: legacy.lang === 'en' ? 'Inglés' : 'Español',
              outgoingLinks: JSON.stringify(outgoingLinks),
              mediaType: mediaUrls.length > 0 ? 'image' : 'none',
              mediaUrls: JSON.stringify(mediaUrls),
              mediaStatus: mediaUrls.length > 0 ? 'referenced' : 'not_requested',
              reviewed: 0,
              analysisMethod: 'rules',
              classificationStatus: 'deterministic',
              captureSource: 'playwright_live',
              provenance: 'playwright_x_session'
            })

            capturedCount++
            console.log(`[ATLAS] + Guardado X: ${authorHandle} [Total sesión: ${capturedCount}]`)
          }
        } catch {}
      }
    })

    await page.goto('https://x.com/i/bookmarks', { waitUntil: 'domcontentloaded' })

    for (let scroll = 0; scroll < 20 && capturedCount < maxItems; scroll++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.4))
      const delay = Math.floor(Math.random() * 1400) + 2200
      await page.waitForTimeout(delay)
    }
  } else if (platform === 'instagram') {
    console.log('[ATLAS] Navegando a https://www.instagram.com/ ...')

    page.on('response', async response => {
      const url = response.url()
      if (url.includes('/api/v1/feed/saved/') || url.includes('/graphql/query')) {
        try {
          const json = await response.json()
          const items = json.items || []
          for (const raw of items) {
            const item = raw.media || raw
            const shortcode = item.code || item.pk
            if (!shortcode || seenIds.has(shortcode)) continue
            seenIds.add(shortcode)

            const caption = item.caption?.text || ''
            const user = item.user || {}
            const username = user.username || 'usuario'
            const authorName = user.full_name || username
            const authorHandle = `@${username}`
            const authorAvatar = user.profile_pic_url || null
            const sourceUrl = `https://www.instagram.com/p/${shortcode}/`
            const publishedAt = item.taken_at ? new Date(item.taken_at * 1000).toISOString() : new Date().toISOString()
            const mediaUrls = item.image_versions2?.candidates?.[0]?.url ? [item.image_versions2.candidates[0].url] : []
            const topics = quickClassify(caption)

            insertStmt.run({
              id: `instagram:${shortcode}`,
              platform: 'instagram',
              sourceUrl,
              authorName,
              authorHandle,
              authorAvatar,
              domain: 'instagram.com',
              publishedAt,
              savedAt: new Date().toISOString(),
              importedAt: new Date().toISOString(),
              caption,
              contentType: 'post',
              collections: '[]',
              topics: JSON.stringify(topics),
              entities: '[]',
              aiSummary: caption ? caption.slice(0, 180) : `Publicación guardada de ${authorHandle}`,
              language: 'Español',
              outgoingLinks: JSON.stringify([sourceUrl]),
              mediaType: mediaUrls.length > 0 ? 'image' : 'none',
              mediaUrls: JSON.stringify(mediaUrls),
              mediaStatus: mediaUrls.length > 0 ? 'referenced' : 'not_requested',
              reviewed: 0,
              analysisMethod: 'rules',
              classificationStatus: 'deterministic',
              captureSource: 'playwright_live',
              provenance: 'playwright_ig_session'
            })

            capturedCount++
            console.log(`[ATLAS] + Guardado IG: ${authorHandle} [Total sesión: ${capturedCount}]`)
          }
        } catch {}
      }
    })

    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' })
    console.log('[ATLAS] Inicia sesión si es necesario y entra a Perfil -> Guardado.')
    await page.waitForTimeout(30000)
  }

  console.log(`[ATLAS] Extracción finalizada. Total guardados procesados: ${capturedCount}`)
  await context.close()
  process.exit(0)
}

run().catch(err => {
  console.error('[ATLAS] Error en extractor:', err)
  process.exit(1)
})
