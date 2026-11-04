import { NextRequest, NextResponse } from 'next/server'
import { canonicalUrl, normalizeRow } from '@/lib/importer'
import { insertBookmarksBatch } from '@/lib/bookmarks-repository'
import { BookmarkItem } from '@/lib/types'

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .trim()
}

async function fetchXMetadataViaOEmbed(url: string): Promise<{
  caption?: string
  authorName?: string
  authorHandle?: string
} | null> {
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    })
    if (!res.ok) return null
    const data = await res.json()
    const authorName = typeof data.author_name === 'string' ? data.author_name : undefined
    let authorHandle: string | undefined
    if (typeof data.author_url === 'string') {
      try {
        const seg = new URL(data.author_url).pathname.replace(/^\/+|\/+$/g, '')
        if (seg) authorHandle = `@${seg}`
      } catch {}
    }

    let caption: string | undefined
    if (typeof data.html === 'string') {
      const pMatch = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
      if (pMatch) {
        caption = stripHtml(pMatch[1])
      }
    }

    return { caption, authorName, authorHandle }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rawUrls: string[] = Array.isArray(body.urls)
      ? body.urls
      : typeof body.url === 'string'
      ? [body.url]
      : []

    const manualCaption = typeof body.caption === 'string' ? body.caption.trim() : ''
    const manualTopics = Array.isArray(body.topics) ? body.topics : []

    const validUrls = rawUrls.map(u => String(u).trim()).filter(Boolean)
    if (validUrls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Ingresá al menos una URL válida de X/Twitter o Instagram.' },
        { status: 400 }
      )
    }

    const items: BookmarkItem[] = []
    const messages: string[] = []
    let errors = 0

    for (const rawUrl of validUrls) {
      const canonical = canonicalUrl(rawUrl)
      if (!canonical) {
        errors++
        messages.push(`URL no soportada (solo X/Twitter o Instagram): ${rawUrl}`)
        continue
      }

      let caption = manualCaption
      let authorName = ''
      let authorHandle = ''

      // Attempt live metadata extraction for X URLs when no manual caption was provided
      if (!caption && canonical.platform === 'x') {
        const meta = await fetchXMetadataViaOEmbed(canonical.url)
        if (meta) {
          caption = meta.caption || ''
          authorName = meta.authorName || ''
          authorHandle = meta.authorHandle || ''
        }
      }

      const item = normalizeRow(
        {
          url: canonical.url,
          caption,
          authorName,
          authorHandle,
          topics: manualTopics,
          savedAt: new Date().toISOString(),
          captureSource: 'url_import'
        },
        'url_import'
      )

      if (item) {
        if (manualTopics.length > 0) {
          item.classificationStatus = 'manual'
        }
        items.push(item)
      } else {
        errors++
      }
    }

    if (items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: messages[0] || 'Ninguna de las URLs ingresadas corresponde a una publicación de X o Instagram.'
        },
        { status: 400 }
      )
    }

    const result = insertBookmarksBatch(items, {
      filename: `lote-urls (${items.length})`,
      kind: 'url_import',
      errors,
      messages
    })

    return NextResponse.json({
      success: true,
      ...result,
      items
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
