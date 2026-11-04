import { NextRequest, NextResponse } from 'next/server'
import {
  getAllBookmarks,
  insertBookmark,
  insertBookmarksBatch,
  updateBookmarksBatch,
  deleteBookmarksBatch,
  getImportHistory,
  getStats
} from '@/lib/bookmarks-repository'
import { normalizeRow } from '@/lib/importer'
import { BookmarkItem } from '@/lib/types'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || searchParams.get('q') || undefined
    const searchMode = (searchParams.get('searchMode') as 'exact' | 'semantic') || 'exact'
    const platform = (searchParams.get('platform') as any) || undefined
    const topic = searchParams.get('topic') || undefined
    const author = searchParams.get('author') || undefined
    const collection = searchParams.get('collection') || undefined
    const status = (searchParams.get('status') as any) || undefined
    const hasMedia = searchParams.get('hasMedia') === 'true'
    const sortBy = (searchParams.get('sortBy') as any) || 'savedDesc'

    const items = getAllBookmarks({
      search,
      searchMode,
      platform,
      topic,
      author,
      collection,
      status,
      hasMedia,
      sortBy
    })

    const history = getImportHistory(25)
    const stats = getStats()

    return NextResponse.json(
      {
        success: true,
        count: items.length,
        items,
        history,
        stats
      },
      { headers: CORS_HEADERS }
    )
  } catch (error: any) {
    console.error('Error fetching bookmarks:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rawList = Array.isArray(body.items)
      ? body.items
      : body.items && typeof body.items === 'object'
      ? Object.values(body.items)
      : null

    if (rawList) {
      const normalizedItems: BookmarkItem[] = rawList
        .map((entry: any) => {
          if (entry && entry.id && entry.sourceUrl && Array.isArray(entry.topics)) {
            return entry as BookmarkItem
          }
          return normalizeRow(entry, body.filename || body.captureSource || 'browser_extension')
        })
        .filter((i): i is BookmarkItem => Boolean(i))

      const result = insertBookmarksBatch(normalizedItems, {
        filename: body.filename || 'import-batch',
        kind: body.kind || 'batch'
      })
      return NextResponse.json({ success: true, ...result }, { headers: CORS_HEADERS })
    } else if (body.item) {
      const normalized =
        body.item.id && body.item.sourceUrl && Array.isArray(body.item.topics)
          ? (body.item as BookmarkItem)
          : normalizeRow(body.item, 'manual')
      if (!normalized) {
        return NextResponse.json({ success: false, error: 'Elemento no válido' }, { status: 400, headers: CORS_HEADERS })
      }
      insertBookmark(normalized)
      return NextResponse.json({ success: true, inserted: 1 }, { headers: CORS_HEADERS })
    }

    return NextResponse.json(
      { success: false, error: 'Formato de payload no válido' },
      { status: 400, headers: CORS_HEADERS }
    )
  } catch (error: any) {
    console.error('Error inserting bookmarks:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Lista de IDs requerida para actualización en lote' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const updatedCount = updateBookmarksBatch(body.ids, {
      ...(typeof body.reviewed === 'boolean' ? { reviewed: body.reviewed } : {}),
      ...(Array.isArray(body.topics) ? { topics: body.topics, classificationStatus: 'manual' } : {})
    })

    return NextResponse.json({ success: true, updated: updatedCount }, { headers: CORS_HEADERS })
  } catch (error: any) {
    console.error('Error updating bookmarks batch:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function PATCH(req: NextRequest) {
  return PUT(req)
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    if (Array.isArray(body.ids)) {
      const count = deleteBookmarksBatch(body.ids)
      return NextResponse.json({ success: true, deleted: count }, { headers: CORS_HEADERS })
    }
    return NextResponse.json(
      { success: false, error: 'Lista de IDs no proporcionada' },
      { status: 400, headers: CORS_HEADERS }
    )
  } catch (error: any) {
    console.error('Error deleting bookmarks:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS_HEADERS })
  }
}
