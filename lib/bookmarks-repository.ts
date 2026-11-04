import fs from 'fs'
import path from 'path'
import { db, DATA_DIR, parseBookmarkRow, bookmarkToDbParams, rebuildFtsIndex, ftsAvailable } from './db'
import { BookmarkItem, ImportHistoryEntry, ImportResult, SourcePlatform } from './types'
import { analyzeContent, semanticSearchBookmarks } from './ai-analyzer'

export interface QueryFilters {
  search?: string
  searchMode?: 'exact' | 'semantic'
  platform?: SourcePlatform | 'all'
  topic?: string
  author?: string
  collection?: string
  status?: 'all' | 'pending' | 'reviewed'
  hasMedia?: boolean
  sortBy?: 'savedDesc' | 'savedAsc' | 'pubDesc'
  limit?: number
  offset?: number
}

export function syncNormalizedArchiveJson() {
  try {
    rebuildFtsIndex(true)

    const rows = db.prepare('SELECT * FROM bookmarks ORDER BY saved_at DESC, published_at DESC').all()
    const items = rows.map(parseBookmarkRow)
    const canonical = items.map(item => ({
      record_id: item.id,
      platform: item.platform === 'instagram' ? 'Instagram' : 'X',
      text: item.caption,
      author: item.authorName,
      handle: item.authorHandle,
      source: item.authorHandle || item.authorName || item.domain || 'Sin fuente',
      url: item.sourceUrl,
      external_urls: item.outgoingLinks,
      domain: item.domain || '',
      published_at: item.publishedAt,
      saved_at: item.savedAt,
      content_type: item.contentType || (item.mediaType !== 'none' ? item.mediaType : 'post'),
      collections: item.collections || [],
      topics: item.topics,
      subtopics: [],
      entities: item.entities,
      language: item.language,
      summary: item.aiSummary,
      has_media: item.mediaType !== 'none' && item.mediaUrls.length > 0,
      media_status: item.mediaStatus || (item.mediaUrls.length > 0 ? 'referenced' : 'not_requested'),
      media_paths: item.mediaPaths || [],
      media_urls: item.mediaUrls,
      capture_source: item.captureSource || 'atlas_unified',
      raw_file: item.provenance || '',
      status: 'captured',
      classification_status: item.classificationStatus || 'deterministic',
      classification_matches: item.classificationMatches || {},
      confidence: item.confidence ?? '',
      reviewed: item.reviewed,
      error: item.error || ''
    }))

    const normDir = path.join(DATA_DIR, 'normalized')
    if (!fs.existsSync(normDir)) {
      fs.mkdirSync(normDir, { recursive: true })
    }
    const target = path.join(normDir, 'archive.json')
    const tmp = `${target}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(canonical, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, target)
  } catch (err) {
    console.warn('[ATLAS] No se pudo sincronizar archive.json:', err)
  }
}

export function getAllBookmarks(filters: QueryFilters = {}): BookmarkItem[] {
  let query = 'SELECT b.* FROM bookmarks b WHERE 1=1'
  const params: any[] = []

  if (filters.platform && filters.platform !== 'all') {
    query += ' AND b.platform = ?'
    params.push(filters.platform)
  }

  if (filters.topic && filters.topic !== 'all') {
    query += ' AND b.topics LIKE ?'
    params.push(`%"${filters.topic}"%`)
  }

  if (filters.author && filters.author !== 'all') {
    query += ' AND (b.author_handle = ? OR b.author_name = ?)'
    params.push(filters.author, filters.author)
  }

  if (filters.collection && filters.collection !== 'all') {
    query += ' AND b.collections LIKE ?'
    params.push(`%"${filters.collection}"%`)
  }

  if (filters.status === 'pending') {
    query += ' AND b.reviewed = 0'
  } else if (filters.status === 'reviewed') {
    query += ' AND b.reviewed = 1'
  }

  if (filters.hasMedia) {
    query += " AND b.media_type != 'none' AND b.media_urls != '[]'"
  }

  if (filters.sortBy === 'savedAsc') {
    query += " ORDER BY COALESCE(NULLIF(b.saved_at, ''), b.published_at) ASC"
  } else if (filters.sortBy === 'pubDesc') {
    query += " ORDER BY COALESCE(NULLIF(b.published_at, ''), b.saved_at) DESC"
  } else {
    query += " ORDER BY COALESCE(NULLIF(b.saved_at, ''), b.published_at) DESC"
  }

  const rows = db.prepare(query).all(...params)
  let items = rows.map(parseBookmarkRow)

  if (filters.search && filters.search.trim()) {
    const rawSearch = filters.search.trim()

    if (filters.searchMode === 'semantic') {
      items = semanticSearchBookmarks(items, rawSearch)
    } else {
      // Try SQLite FTS5 prefix match first when available
      let ftsIds: Set<string> | null = null
      if (ftsAvailable) {
        try {
          const cleanTokens = rawSearch
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
          if (cleanTokens.length > 0) {
            const ftsExpr = cleanTokens.map(t => `"${t}"*`).join(' AND ')
            const ftsRows = db
              .prepare('SELECT id FROM bookmarks_fts WHERE bookmarks_fts MATCH ?')
              .all(ftsExpr) as Array<{ id: string }>
            if (ftsRows.length > 0) {
              ftsIds = new Set(ftsRows.map(r => r.id))
            }
          }
        } catch {
          ftsIds = null
        }
      }

      const q = rawSearch.toLowerCase()
      items = items.filter(item => {
        if (ftsIds && ftsIds.has(item.id)) return true
        const hay = [
          item.caption,
          item.authorName,
          item.authorHandle,
          item.aiSummary,
          item.domain || '',
          item.sourceUrl,
          ...item.topics,
          ...item.entities,
          ...(item.collections || [])
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }
  }

  if (typeof filters.offset === 'number' && filters.offset > 0) {
    items = items.slice(filters.offset)
  }
  if (typeof filters.limit === 'number' && filters.limit > 0) {
    items = items.slice(0, filters.limit)
  }

  return items
}

export function getBookmarkById(id: string): BookmarkItem | null {
  const row = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(id)
  return row ? parseBookmarkRow(row) : null
}

const UPSERT_SQL = `
  INSERT OR REPLACE INTO bookmarks (
    id, platform, source_url, author_name, author_handle, author_avatar,
    domain, published_at, saved_at, imported_at, caption, content_type,
    collections, topics, entities, ai_summary, language, outgoing_links,
    media_type, media_urls, media_paths, media_status, reviewed, analysis_method,
    analyzed_at, classification_status, classification_matches, confidence,
    capture_source, provenance
  ) VALUES (
    @id, @platform, @sourceUrl, @authorName, @authorHandle, @authorAvatar,
    @domain, @publishedAt, @savedAt, @importedAt, @caption, @contentType,
    @collections, @topics, @entities, @aiSummary, @language, @outgoingLinks,
    @mediaType, @mediaUrls, @mediaPaths, @mediaStatus, @reviewed, @analysisMethod,
    @analyzedAt, @classificationStatus, @classificationMatches, @confidence,
    @captureSource, @provenance
  )
`

export function insertBookmark(item: BookmarkItem): boolean {
  const stmt = db.prepare(UPSERT_SQL)
  stmt.run(bookmarkToDbParams(item))
  syncNormalizedArchiveJson()
  return true
}

export function insertBookmarksBatch(
  items: BookmarkItem[],
  meta: { filename?: string; kind?: string; errors?: number; messages?: string[] } = {}
): ImportResult {
  let added = 0
  let duplicates = 0
  let updated = 0

  const findExistingStmt = db.prepare('SELECT * FROM bookmarks WHERE id = ? OR source_url = ?')
  const upsertStmt = db.prepare(UPSERT_SQL)

  const tx = db.transaction((list: BookmarkItem[]) => {
    for (const incoming of list) {
      const existingRow = findExistingStmt.get(incoming.id, incoming.sourceUrl)
      if (!existingRow) {
        upsertStmt.run(bookmarkToDbParams(incoming))
        added++
      } else {
        const existing = parseBookmarkRow(existingRow)
        const hasNewCaption = !existing.caption && incoming.caption
        const hasNewMedia = existing.mediaUrls.length === 0 && incoming.mediaUrls.length > 0
        const hasNewCollections =
          (incoming.collections || []).some(c => !(existing.collections || []).includes(c))

        if (hasNewCaption || hasNewMedia || hasNewCollections) {
          const isManualTopics = existing.classificationStatus === 'manual'
          const mergedTopics = isManualTopics
            ? existing.topics
            : Array.from(
                new Set([
                  ...existing.topics.filter(t => t !== 'Sin clasificar'),
                  ...incoming.topics.filter(t => t !== 'Sin clasificar')
                ])
              )

          const merged: BookmarkItem = {
            ...existing,
            caption: existing.caption || incoming.caption,
            aiSummary: hasNewCaption ? incoming.aiSummary : existing.aiSummary,
            language: existing.language !== 'No determinado' ? existing.language : incoming.language,
            topics: mergedTopics.length > 0 ? mergedTopics : ['Sin clasificar'],
            entities: Array.from(new Set([...existing.entities, ...incoming.entities])),
            collections: Array.from(new Set([...(existing.collections || []), ...(incoming.collections || [])])),
            mediaUrls: Array.from(new Set([...existing.mediaUrls, ...incoming.mediaUrls])),
            mediaPaths: Array.from(new Set([...(existing.mediaPaths || []), ...(incoming.mediaPaths || [])])),
            mediaType: existing.mediaType !== 'none' ? existing.mediaType : incoming.mediaType,
            outgoingLinks: Array.from(new Set([...existing.outgoingLinks, ...incoming.outgoingLinks])),
            authorHandle: existing.authorHandle || incoming.authorHandle,
            authorName:
              existing.authorName && !existing.authorName.startsWith('Usuario')
                ? existing.authorName
                : incoming.authorName || existing.authorName,
            publishedAt: existing.publishedAt || incoming.publishedAt,
            savedAt: existing.savedAt || incoming.savedAt
          }
          upsertStmt.run(bookmarkToDbParams(merged))
          updated++
        } else {
          duplicates++
        }
      }
    }
  })

  tx(items)

  const total = (db.prepare('SELECT COUNT(*) as c FROM bookmarks').get() as { c: number }).c

  // Record in import_history
  try {
    db.prepare(`
      INSERT INTO import_history (
        event_id, created_at, kind, source_file, status, added, duplicates, updated, errors, total_records
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      new Date().toISOString(),
      meta.kind || items[0]?.captureSource || 'import',
      meta.filename || items[0]?.provenance || 'manual',
      'ok',
      added,
      duplicates,
      updated,
      meta.errors || 0,
      total
    )
  } catch {}

  syncNormalizedArchiveJson()

  return {
    added,
    duplicates,
    updated,
    errors: meta.errors || 0,
    total,
    messages: meta.messages || [],
    filename: meta.filename
  }
}

export type BookmarkPatch = Partial<{
  reviewed: boolean
  topics: string[]
  aiSummary: string
  entities: string[]
  language: string
  analysisMethod: BookmarkItem['analysisMethod']
  analyzedAt: string
  classificationStatus: BookmarkItem['classificationStatus']
  classificationMatches: Record<string, string[]>
  confidence: number | string
  mediaPaths: string[]
  mediaStatus: string
  outgoingLinks: string[]
}>

function applyPatchToItem(existing: BookmarkItem, patch: BookmarkPatch): BookmarkItem {
  return {
    ...existing,
    ...(patch.reviewed !== undefined ? { reviewed: patch.reviewed } : {}),
    ...(patch.topics !== undefined
      ? {
          topics: patch.topics.length > 0 ? patch.topics : ['Sin clasificar'],
          classificationStatus: patch.classificationStatus || 'manual'
        }
      : {}),
    ...(patch.aiSummary !== undefined ? { aiSummary: patch.aiSummary } : {}),
    ...(patch.entities !== undefined ? { entities: patch.entities } : {}),
    ...(patch.language !== undefined ? { language: patch.language } : {}),
    ...(patch.analysisMethod !== undefined ? { analysisMethod: patch.analysisMethod } : {}),
    ...(patch.analyzedAt !== undefined ? { analyzedAt: patch.analyzedAt } : {}),
    ...(patch.classificationStatus !== undefined && patch.topics === undefined
      ? { classificationStatus: patch.classificationStatus }
      : {}),
    ...(patch.classificationMatches !== undefined ? { classificationMatches: patch.classificationMatches } : {}),
    ...(patch.confidence !== undefined ? { confidence: patch.confidence } : {}),
    ...(patch.mediaPaths !== undefined ? { mediaPaths: patch.mediaPaths } : {}),
    ...(patch.mediaStatus !== undefined ? { mediaStatus: patch.mediaStatus } : {}),
    ...(patch.outgoingLinks !== undefined ? { outgoingLinks: patch.outgoingLinks } : {})
  }
}

export function updateBookmark(id: string, patch: BookmarkPatch): BookmarkItem | null {
  const existing = getBookmarkById(id)
  if (!existing) return null

  const updated = applyPatchToItem(existing, patch)
  insertBookmark(updated)
  return updated
}

export function updateBookmarksBatch(ids: string[], patch: BookmarkPatch): number {
  if (!Array.isArray(ids) || ids.length === 0) return 0
  const getStmt = db.prepare('SELECT * FROM bookmarks WHERE id = ?')
  const upsertStmt = db.prepare(UPSERT_SQL)

  const tx = db.transaction((idList: string[]) => {
    let count = 0
    for (const id of idList) {
      const row = getStmt.get(id)
      if (!row) continue
      const existing = parseBookmarkRow(row)
      const updated = applyPatchToItem(existing, patch)
      upsertStmt.run(bookmarkToDbParams(updated))
      count++
    }
    return count
  })

  const updatedCount = tx(ids)
  syncNormalizedArchiveJson()
  return updatedCount
}

export function updateBookmarkReviewed(id: string, reviewed: boolean): boolean {
  return Boolean(updateBookmark(id, { reviewed }))
}

export function updateBookmarkTopics(id: string, topics: string[]): boolean {
  return Boolean(updateBookmark(id, { topics, classificationStatus: 'manual' }))
}

export function deleteBookmark(id: string): boolean {
  const stmt = db.prepare('DELETE FROM bookmarks WHERE id = ?')
  stmt.run(id)
  syncNormalizedArchiveJson()
  return true
}

export function deleteBookmarksBatch(ids: string[]): number {
  const stmt = db.prepare('DELETE FROM bookmarks WHERE id = ?')
  const tx = db.transaction((idList: string[]) => {
    let count = 0
    for (const id of idList) {
      const res = stmt.run(id)
      count += res.changes
    }
    return count
  })
  const removed = tx(ids)
  syncNormalizedArchiveJson()
  return removed
}

export function reclassifyAllBookmarks(force = false): { total: number; classified: number; preservedManual: number } {
  const all = getAllBookmarks()
  let classified = 0
  let preservedManual = 0

  const upsertStmt = db.prepare(`
    UPDATE bookmarks
    SET topics = ?, entities = ?, ai_summary = ?, language = ?,
        classification_status = ?, classification_matches = ?, confidence = ?
    WHERE id = ?
  `)

  const tx = db.transaction(() => {
    for (const item of all) {
      if (item.classificationStatus === 'manual' && !force) {
        preservedManual++
        if (item.topics.length > 0 && item.topics[0] !== 'Sin clasificar') classified++
        continue
      }
      const analysis = analyzeContent(item.caption, [], {
        domain: item.domain,
        author: item.authorName,
        handle: item.authorHandle,
        collections: item.collections,
        externalUrls: item.outgoingLinks
      })
      const status = analysis.topics[0] !== 'Sin clasificar' ? 'deterministic' : 'pending'
      if (status === 'deterministic') classified++

      upsertStmt.run(
        JSON.stringify(analysis.topics),
        JSON.stringify(Array.from(new Set([...item.entities, ...analysis.entities]))),
        item.aiSummary && !item.aiSummary.startsWith('Sin texto') ? item.aiSummary : analysis.aiSummary,
        item.language || analysis.language,
        status,
        JSON.stringify(analysis.classificationMatches),
        String(analysis.confidence),
        item.id
      )
    }
  })

  tx()
  syncNormalizedArchiveJson()
  return { total: all.length, classified, preservedManual }
}

export function getImportHistory(limit = 30): ImportHistoryEntry[] {
  try {
    return db
      .prepare('SELECT * FROM import_history ORDER BY created_at DESC LIMIT ?')
      .all(limit) as ImportHistoryEntry[]
  } catch {
    return []
  }
}

export function getStats() {
  const items = getAllBookmarks()
  const total = items.length
  const totalX = items.filter(i => i.platform === 'x').length
  const totalIg = items.filter(i => i.platform === 'instagram').length
  const reviewed = items.filter(i => i.reviewed).length
  const withMedia = items.filter(i => i.mediaType !== 'none' && i.mediaUrls.length > 0).length
  const downloadedMedia = items.filter(i => i.mediaStatus === 'downloaded').length
  const unclassified = items.filter(
    i => i.topics.length === 0 || (i.topics.length === 1 && i.topics[0] === 'Sin clasificar')
  ).length

  return {
    total,
    totalX,
    totalIg,
    reviewed,
    pending: total - reviewed,
    withMedia,
    downloadedMedia,
    unclassified
  }
}
