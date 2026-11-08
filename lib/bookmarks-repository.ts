import fs from 'fs'
import path from 'path'
import {
  db,
  DATA_DIR,
  parseBookmarkRow,
  bookmarkToDbParams,
  rebuildFtsIndex,
  ftsAvailable,
  upsertCachedResource,
  getCachedResource,
  getStorageDiagnostics,
  getAllGalleryRepositories,
  getGalleryRepositoryByFullName,
  upsertGalleryRepository,
  deleteGalleryRepository,
  saveGalleryCustomOrder,
  syncBookmarksToGitHubGallery,
  getAllProjectBlueprints,
  upsertProjectBlueprint,
  deleteProjectBlueprint
} from './db'
import {
  AnalysisState,
  BookmarkItem,
  DeepHuntResultItem,
  GalleryRepository,
  ImportHistoryEntry,
  ImportResult,
  ImportStageMetrics,
  LinkedResource,
  ProjectBlueprint,
  ResourceType,
  SourcePlatform
} from './types'
import { analyzeContent, semanticSearchBookmarks } from './ai-analyzer'
import {
  investigateResourceUrlLive,
  synthesizeBookmarkFields,
  buildLinkedResourcesFromUrls,
  isShortenerUrl,
  resolveShortenedUrl,
  classifyGitHubUrl,
  hydrateXStatusUrl,
  searchGitHubRepoByPostContext
} from './resource-investigator'
import {
  galleryRepoToBookmarkItem,
  extractRepositoriesFromAnyListOrPage,
  buildDeterministicSpanishExplanations,
  numericIdFromFullName,
  fetchGitHubRepositoryData
} from './github-gallery'
import {
  runWebNavigatorAgentForBookmark,
  fallbackReferenceToLinkedResource,
  evaluateBookmarkScopeAndOffTopic,
  skillBuildFallbackReferenceLink
} from './web-navigator-agent'

export interface QueryFilters {
  search?: string
  searchMode?: 'exact' | 'semantic'
  platform?: SourcePlatform | 'all'
  topic?: string
  resourceType?: ResourceType | 'all'
  analysisState?: AnalysisState | 'all'
  hasGitHub?: boolean
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
    syncBookmarksToGitHubGallery()

    const rows = db.prepare('SELECT * FROM bookmarks ORDER BY saved_at DESC, published_at DESC').all()
    const items = rows.map(parseBookmarkRow)
    const canonical = items.map(item => ({
      record_id: item.id,
      platform:
        item.platform === 'instagram'
          ? 'Instagram'
          : item.platform === 'whatsapp'
          ? 'WhatsApp'
          : item.platform === 'github'
          ? 'GitHub'
          : 'X',
      title: item.title || '',
      purpose: item.purpose || '',
      resource_type: item.resourceType || 'Otro / pendiente de clasificar',
      evaluation: item.evaluation || '',
      analysis_state: item.analysisState || 'completed',
      notes: item.notes || '',
      resources: item.resources || [],
      manual_fields: item.manualFields || [],
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

  if (filters.resourceType && filters.resourceType !== 'all') {
    query += ' AND b.resource_type = ?'
    params.push(filters.resourceType)
  }

  if (filters.analysisState && filters.analysisState !== 'all') {
    query += ' AND b.analysis_state = ?'
    params.push(filters.analysisState)
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
    query += " ORDER BY COALESCE(NULLIF(b.saved_at, ''), b.published_at, b.imported_at) ASC"
  } else if (filters.sortBy === 'pubDesc') {
    query += " ORDER BY COALESCE(NULLIF(b.published_at, ''), b.saved_at, b.imported_at) DESC"
  } else {
    query += " ORDER BY COALESCE(NULLIF(b.saved_at, ''), b.published_at, b.imported_at) DESC"
  }

  const rows = db.prepare(query).all(...params)
  let items = rows.map(parseBookmarkRow)

  if (filters.hasGitHub) {
    items = items.filter(
      item =>
        (item.resources || []).some(r => r.kind === 'github_repo') ||
        item.outgoingLinks.some(u => u.toLowerCase().includes('github.com/'))
    )
  }

  if (filters.search && filters.search.trim()) {
    const rawSearch = filters.search.trim()

    if (filters.searchMode === 'semantic') {
      items = semanticSearchBookmarks(items, rawSearch)
    } else {
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
          item.title || '',
          item.purpose || '',
          item.resourceType || '',
          item.evaluation || '',
          item.notes || '',
          item.caption,
          item.authorName,
          item.authorHandle,
          item.aiSummary,
          item.domain || '',
          item.sourceUrl,
          ...item.topics,
          ...item.entities,
          ...(item.collections || []),
          ...(item.resources || []).map(r => `${r.name} ${r.fullName || ''} ${r.resolvedUrl} ${r.description}`)
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
    domain, published_at, saved_at, imported_at, caption,
    title, purpose, resource_type, evaluation, analysis_state, notes,
    resources_json, manual_fields, import_batch_id, content_type,
    collections, topics, entities, ai_summary, language, outgoing_links,
    media_type, media_urls, media_paths, media_status, reviewed, analysis_method,
    analyzed_at, classification_status, classification_matches, confidence,
    capture_source, provenance
  ) VALUES (
    @id, @platform, @sourceUrl, @authorName, @authorHandle, @authorAvatar,
    @domain, @publishedAt, @savedAt, @importedAt, @caption,
    @title, @purpose, @resourceType, @evaluation, @analysisState, @notes,
    @resourcesJson, @manualFields, @importBatchId, @contentType,
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
  meta: {
    filename?: string
    kind?: string
    errors?: number
    messages?: string[]
    stages?: Omit<ImportStageMetrics, 'added' | 'updated' | 'duplicates' | 'persistedTotal'>
  } = {}
): ImportResult {
  let added = 0
  let duplicates = 0
  let updated = 0
  const batchId = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const findExistingStmt = db.prepare('SELECT * FROM bookmarks WHERE id = ? OR source_url = ?')
  const upsertStmt = db.prepare(UPSERT_SQL)

  const tx = db.transaction((list: BookmarkItem[]) => {
    for (const incoming of list) {
      const existingRow = findExistingStmt.get(incoming.id, incoming.sourceUrl)
      if (!existingRow) {
        upsertStmt.run(bookmarkToDbParams({ ...incoming, importBatchId: incoming.importBatchId || batchId }))
        added++
      } else {
        const existing = parseBookmarkRow(existingRow)
        const manualFields = new Set(existing.manualFields || [])
        const isManualTopics = existing.classificationStatus === 'manual' || manualFields.has('topics')

        const hasLongerCaption = incoming.caption && incoming.caption.length > (existing.caption || '').length + 10
        const hasNewLinks = incoming.outgoingLinks.some(u => !existing.outgoingLinks.includes(u))
        const hasNewResources = (incoming.resources || []).some(
          r => !(existing.resources || []).some(er => (er.resolvedUrl || er.url) === (r.resolvedUrl || r.url))
        )
        const hasNewMedia = existing.mediaUrls.length === 0 && incoming.mediaUrls.length > 0
        const hasNewCollections = (incoming.collections || []).some(c => !(existing.collections || []).includes(c))
        const hasMissingSynthesis = !existing.title || !existing.purpose

        if (
          hasLongerCaption ||
          hasNewLinks ||
          hasNewResources ||
          hasNewMedia ||
          hasNewCollections ||
          hasMissingSynthesis
        ) {
          const mergedTopics = isManualTopics
            ? existing.topics
            : Array.from(
                new Set([
                  ...existing.topics.filter(t => t !== 'Sin clasificar'),
                  ...incoming.topics.filter(t => t !== 'Sin clasificar')
                ])
              )

          const mergedCaption = hasLongerCaption ? incoming.caption : existing.caption || incoming.caption
          const mergedLinks = Array.from(new Set([...existing.outgoingLinks, ...incoming.outgoingLinks]))
          const mergedEntities = Array.from(new Set([...existing.entities, ...incoming.entities]))

          // Merge resources and re-synthesize non-manual fields
          const syn = synthesizeBookmarkFields({
            caption: mergedCaption,
            authorName: existing.authorName || incoming.authorName,
            authorHandle: existing.authorHandle || incoming.authorHandle,
            platform: existing.platform,
            outgoingLinks: mergedLinks,
            topics: mergedTopics.length > 0 ? mergedTopics : ['Sin clasificar'],
            entities: mergedEntities,
            existingResources: incoming.resources && incoming.resources.length > 0 ? incoming.resources : existing.resources
          })

          const merged: BookmarkItem = {
            ...existing,
            caption: mergedCaption,
            title: manualFields.has('title') && existing.title ? existing.title : incoming.title || syn.title,
            purpose: manualFields.has('purpose') && existing.purpose ? existing.purpose : incoming.purpose || syn.purpose,
            resourceType:
              manualFields.has('resourceType') && existing.resourceType
                ? existing.resourceType
                : incoming.resourceType || syn.resourceType,
            evaluation:
              manualFields.has('evaluation') && existing.evaluation
                ? existing.evaluation
                : incoming.evaluation || syn.evaluation,
            analysisState: syn.analysisState,
            notes: existing.notes || incoming.notes || '',
            resources: syn.resources,
            manualFields: Array.from(manualFields),
            aiSummary: manualFields.has('purpose') ? existing.aiSummary : syn.purpose || existing.aiSummary,
            language: existing.language !== 'No determinado' ? existing.language : incoming.language,
            topics: mergedTopics.length > 0 ? mergedTopics : ['Sin clasificar'],
            entities: mergedEntities,
            collections: Array.from(new Set([...(existing.collections || []), ...(incoming.collections || [])])),
            mediaUrls: Array.from(new Set([...existing.mediaUrls, ...incoming.mediaUrls])),
            mediaPaths: Array.from(new Set([...(existing.mediaPaths || []), ...(incoming.mediaPaths || [])])),
            mediaType: existing.mediaType !== 'none' ? existing.mediaType : incoming.mediaType,
            outgoingLinks: mergedLinks,
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

  try {
    db.prepare(`
      INSERT INTO import_history (
        event_id, created_at, kind, source_file, status, added, duplicates, updated, errors, total_records
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      batchId,
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

  const stages: ImportStageMetrics = {
    networkEntries: meta.stages?.networkEntries ?? items.length,
    recognizedResponses: meta.stages?.recognizedResponses ?? 1,
    emptyBodyResponses: meta.stages?.emptyBodyResponses ?? 0,
    incidentalSkipped: meta.stages?.incidentalSkipped ?? 0,
    detectedItems: meta.stages?.detectedItems ?? items.length,
    added,
    updated,
    duplicates,
    errors: meta.errors || 0,
    persistedTotal: total,
    diagnosticCase: meta.stages?.diagnosticCase ?? 'ok',
    diagnosticHint: meta.stages?.diagnosticHint
  }

  return {
    added,
    duplicates,
    updated,
    errors: meta.errors || 0,
    total,
    messages: meta.messages || [],
    filename: meta.filename,
    stages
  }
}

export type BookmarkPatch = Partial<{
  reviewed: boolean
  caption: string
  authorName: string
  authorHandle: string
  title: string
  purpose: string
  resourceType: ResourceType
  evaluation: string
  analysisState: AnalysisState
  notes: string
  resources: LinkedResource[]
  manualFields: string[]
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

function applyPatchToItem(existing: BookmarkItem, patch: BookmarkPatch, isManualEdit = true): BookmarkItem {
  const manualSet = new Set(existing.manualFields || [])
  if (isManualEdit) {
    if (patch.title !== undefined) manualSet.add('title')
    if (patch.purpose !== undefined) manualSet.add('purpose')
    if (patch.resourceType !== undefined) manualSet.add('resourceType')
    if (patch.evaluation !== undefined) manualSet.add('evaluation')
    if (patch.notes !== undefined) manualSet.add('notes')
    if (patch.topics !== undefined) manualSet.add('topics')
  }

  return {
    ...existing,
    ...(patch.reviewed !== undefined ? { reviewed: patch.reviewed } : {}),
    ...(patch.caption !== undefined ? { caption: patch.caption } : {}),
    ...(patch.authorName !== undefined ? { authorName: patch.authorName } : {}),
    ...(patch.authorHandle !== undefined ? { authorHandle: patch.authorHandle } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.purpose !== undefined ? { purpose: patch.purpose } : {}),
    ...(patch.resourceType !== undefined ? { resourceType: patch.resourceType } : {}),
    ...(patch.evaluation !== undefined ? { evaluation: patch.evaluation } : {}),
    ...(patch.analysisState !== undefined ? { analysisState: patch.analysisState } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.resources !== undefined ? { resources: patch.resources } : {}),
    manualFields: patch.manualFields !== undefined ? patch.manualFields : Array.from(manualSet),
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

export function updateBookmark(id: string, patch: BookmarkPatch, isManualEdit = true): BookmarkItem | null {
  const existing = getBookmarkById(id)
  if (!existing) return null

  const updated = applyPatchToItem(existing, patch, isManualEdit)
  insertBookmark(updated)
  return updated
}

export function updateBookmarksBatch(ids: string[], patch: BookmarkPatch, isManualEdit = true): number {
  if (!Array.isArray(ids) || ids.length === 0) return 0
  const getStmt = db.prepare('SELECT * FROM bookmarks WHERE id = ?')
  const upsertStmt = db.prepare(UPSERT_SQL)

  const tx = db.transaction((idList: string[]) => {
    let count = 0
    for (const id of idList) {
      const row = getStmt.get(id)
      if (!row) continue
      const existing = parseBookmarkRow(row)
      const updated = applyPatchToItem(existing, patch, isManualEdit)
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
  return Boolean(updateBookmark(id, { reviewed }, false))
}

export function updateBookmarkTopics(id: string, topics: string[]): boolean {
  return Boolean(updateBookmark(id, { topics, classificationStatus: 'manual' }, true))
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

/**
 * Investigate external links and GitHub repositories for a single bookmark,
 * updating the shared resources_cache and re-synthesizing non-manual fields.
 */
export async function investigateBookmarkById(id: string): Promise<BookmarkItem | null> {
  const item = getBookmarkById(id)
  if (!item) return null

  const manualFields = new Set(item.manualFields || [])
  const currentResources =
    item.resources && item.resources.length > 0
      ? item.resources
      : buildLinkedResourcesFromUrls(item.outgoingLinks, item.caption, item.topics)

  const updatedResources: LinkedResource[] = []
  const newlyDiscoveredGhUrls: string[] = []

  // Investigate up to 4 primary resources per bookmark to stay fast and respect rate limits
  for (let i = 0; i < currentResources.length; i++) {
    const res = currentResources[i]
    const cached = getCachedResource(res.resolvedUrl || res.url)
    if (cached && cached.verificationStatus === 'confirmed') {
      updatedResources.push(cached)
      continue
    }

    if (i < 4) {
      const live = await investigateResourceUrlLive(res.resolvedUrl || res.url, item.caption, item.topics)
      upsertCachedResource(live.resource)
      updatedResources.push(live.resource)
      for (const ghUrl of live.discoveredGitHubUrls) {
        if (!newlyDiscoveredGhUrls.includes(ghUrl)) {
          newlyDiscoveredGhUrls.push(ghUrl)
        }
      }
    } else {
      updatedResources.push(res)
    }
  }

  // If external web pages revealed GitHub repository links, investigate the first discovered GitHub repo!
  for (const ghUrl of newlyDiscoveredGhUrls.slice(0, 2)) {
    const alreadyPresent = updatedResources.some(
      r => (r.resolvedUrl || r.url).toLowerCase() === ghUrl.toLowerCase()
    )
    if (!alreadyPresent) {
      const ghLive = await investigateResourceUrlLive(ghUrl, item.caption, item.topics)
      upsertCachedResource(ghLive.resource)
      updatedResources.unshift(ghLive.resource)
    }
  }

  const allLinks = Array.from(
    new Set([...item.outgoingLinks, ...newlyDiscoveredGhUrls, ...updatedResources.map(r => r.resolvedUrl || r.url)])
  )

  const syn = synthesizeBookmarkFields({
    caption: item.caption,
    authorName: item.authorName,
    authorHandle: item.authorHandle,
    platform: item.platform,
    outgoingLinks: allLinks,
    topics: item.topics,
    entities: item.entities,
    existingResources: updatedResources
  })

  const patch: BookmarkPatch = {
    outgoingLinks: allLinks,
    resources: syn.resources,
    analysisState: 'completed',
    analysisMethod: 'investigator',
    analyzedAt: new Date().toISOString(),
    ...(manualFields.has('title') ? {} : { title: syn.title }),
    ...(manualFields.has('purpose') ? {} : { purpose: syn.purpose, aiSummary: syn.purpose }),
    ...(manualFields.has('resourceType') ? {} : { resourceType: syn.resourceType }),
    ...(manualFields.has('evaluation') ? {} : { evaluation: syn.evaluation })
  }

  return updateBookmark(id, patch, false)
}

export function reclassifyAllBookmarks(force = false): { total: number; classified: number; preservedManual: number } {
  const all = getAllBookmarks()
  let classified = 0
  let preservedManual = 0

  const upsertStmt = db.prepare(UPSERT_SQL)

  const tx = db.transaction(() => {
    for (const item of all) {
      const manualFields = new Set(item.manualFields || [])
      const isManual = item.classificationStatus === 'manual' || manualFields.size > 0
      if (isManual && !force) {
        preservedManual++
      }

      const analysis = analyzeContent(item.caption, [], {
        domain: item.domain,
        author: item.authorName,
        handle: item.authorHandle,
        collections: item.collections,
        externalUrls: item.outgoingLinks
      })

      const finalTopics =
        isManual && !force && item.topics.length > 0 && item.topics[0] !== 'Sin clasificar'
          ? item.topics
          : analysis.topics

      if (finalTopics[0] !== 'Sin clasificar') classified++

      const syn = synthesizeBookmarkFields({
        caption: item.caption,
        authorName: item.authorName,
        authorHandle: item.authorHandle,
        platform: item.platform,
        outgoingLinks: item.outgoingLinks,
        topics: finalTopics,
        entities: Array.from(new Set([...item.entities, ...analysis.entities])),
        existingResources: (item.resources || []).filter(r => r.verificationStatus === 'confirmed')
      })

      const updated: BookmarkItem = {
        ...item,
        topics: finalTopics,
        entities: Array.from(new Set([...item.entities, ...analysis.entities])),
        title: manualFields.has('title') && !force && item.title ? item.title : syn.title,
        purpose: manualFields.has('purpose') && !force && item.purpose ? item.purpose : syn.purpose,
        resourceType:
          manualFields.has('resourceType') && !force && item.resourceType
            ? item.resourceType
            : syn.resourceType,
        evaluation:
          manualFields.has('evaluation') && !force && item.evaluation ? item.evaluation : syn.evaluation,
        analysisState: syn.analysisState,
        resources: syn.resources,
        aiSummary: manualFields.has('purpose') && !force ? item.aiSummary : syn.purpose || analysis.aiSummary,
        language: item.language || analysis.language,
        classificationStatus: isManual && !force ? 'manual' : finalTopics[0] !== 'Sin clasificar' ? 'deterministic' : 'pending',
        classificationMatches: analysis.classificationMatches,
        confidence: String(analysis.confidence)
      }

      upsertStmt.run(bookmarkToDbParams(updated))
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
  const totalWa = items.filter(i => i.platform === 'whatsapp').length
  const totalGithub = items.filter(i => i.platform === 'github').length
  const reviewed = items.filter(i => i.reviewed).length
  const withMedia = items.filter(i => i.mediaType !== 'none' && i.mediaUrls.length > 0).length
  const withGitHub = items.filter(
    i =>
      i.platform === 'github' ||
      (i.resources || []).some(r => r.kind === 'github_repo') ||
      i.outgoingLinks.some(u => u.toLowerCase().includes('github.com/'))
  ).length
  const downloadedMedia = items.filter(i => i.mediaStatus === 'downloaded').length
  const unclassified = items.filter(
    i => i.topics.length === 0 || (i.topics.length === 1 && i.topics[0] === 'Sin clasificar')
  ).length
  let totalGalleryRepos = 0
  try {
    totalGalleryRepos = (db.prepare('SELECT COUNT(*) as c FROM github_repos').get() as { c: number }).c
  } catch {}

  return {
    total,
    totalX,
    totalIg,
    totalWa,
    totalGithub,
    totalGalleryRepos,
    reviewed,
    pending: total - reviewed,
    withMedia,
    withGitHub,
    downloadedMedia,
    unclassified,
    storage: getStorageDiagnostics()
  }
}

/**
 * Save a GitHub Repository into `github_repos` AND ensure it is linked to
 * a BookmarkItem in `bookmarks` (creating or updating `github:owner/repo` if not already
 * linked to an X/Instagram/WhatsApp bookmark), so it is immediately searchable and exportable
 * across the entire application.
 */
export function saveGalleryRepoWithBookmark(
  repo: GalleryRepository,
  options: { createBookmarkIfUnlinked?: boolean } = { createBookmarkIfUnlinked: true }
): GalleryRepository {
  const fullNameKey = `${repo.owner}/${repo.name}`.toLowerCase()
  const existingGalleryRepo = getGalleryRepositoryByFullName(fullNameKey)
  const existingLinkedIds = Array.from(
    new Set([...(existingGalleryRepo?.linkedBookmarkIds || []), ...(repo.linkedBookmarkIds || [])])
  )

  const ghBookmarkId = `github:${fullNameKey}`
  const existingGhBookmark = getBookmarkById(ghBookmarkId)

  if (options.createBookmarkIfUnlinked !== false && (existingLinkedIds.length === 0 || existingGhBookmark)) {
    const bmItem = galleryRepoToBookmarkItem({
      ...repo,
      linkedBookmarkIds: Array.from(new Set([...existingLinkedIds, ghBookmarkId]))
    })
    db.prepare(UPSERT_SQL).run(bookmarkToDbParams(bmItem))
    if (!existingLinkedIds.includes(ghBookmarkId)) {
      existingLinkedIds.push(ghBookmarkId)
    }
  }

  // Also update any linked bookmarks' cached resource entry so the 8-column table shows live stars/license!
  upsertCachedResource({
    id: `res-gh-${fullNameKey.replace(/[^a-z0-9]/g, '-')}`,
    url: `https://github.com/${repo.owner}/${repo.name}`,
    resolvedUrl: `https://github.com/${repo.owner}/${repo.name}`,
    domain: 'github.com',
    kind: 'github_repo',
    name: repo.name,
    fullName: `${repo.owner}/${repo.name}`,
    description: repo.shortExplanationEs || repo.description || '',
    purpose: repo.shortExplanationEs || repo.description || '',
    resourceType: repo.resourceType || 'Otro / pendiente de clasificar',
    topics: repo.topics || [],
    stars: repo.stars,
    license: repo.license || undefined,
    verificationStatus: 'confirmed',
    provenanceChain: [`https://github.com/${repo.owner}/${repo.name}`],
    evidenceBasis: 'github_api'
  })

  const savedRepo = upsertGalleryRepository({
    ...repo,
    linkedBookmarkIds: existingLinkedIds
  })

  syncNormalizedArchiveJson()
  return savedRepo
}

/**
 * Scans saved bookmarks for shortened links (t.co, bit.ly, tinyurl.com, etc.),
 * expands them via HTTP redirect / t.co HTML refresh, updates outgoingLinks & resources,
 * and synchronizes newly discovered GitHub repositories into the Gallery.
 */
export async function expandShortenedUrlsBatch(limit = 30): Promise<{
  checkedBookmarks: number
  expandedUrls: number
  newGitHubRepos: number
  expandedExamples: Array<{ from: string; to: string }>
}> {
  const all = getAllBookmarks()
  const beforeRepoCount = getAllGalleryRepositories().length
  let checkedBookmarks = 0
  let expandedUrls = 0
  const expandedExamples: Array<{ from: string; to: string }> = []

  const candidates = all.filter(bm => {
    const inlineUrls = (bm.caption || '').match(/https?:\/\/(?:t\.co|bit\.ly|tinyurl\.com|buff\.ly|ow\.ly)\/[A-Za-z0-9_-]+/gi) || []
    const hasShortInLinks = (bm.outgoingLinks || []).some(u => isShortenerUrl(u))
    return hasShortInLinks || inlineUrls.length > 0
  })

  for (const bm of candidates.slice(0, limit)) {
    checkedBookmarks++
    const inlineMatches =
      (bm.caption || '').match(/https?:\/\/(?:t\.co|bit\.ly|tinyurl\.com|buff\.ly|ow\.ly)\/[A-Za-z0-9_-]+/gi) || []
    const allShortUrls = Array.from(
      new Set([...(bm.outgoingLinks || []).filter(u => isShortenerUrl(u)), ...inlineMatches])
    )

    if (allShortUrls.length === 0) continue

    const resolvedLinks: string[] = []
    for (const shortUrl of allShortUrls.slice(0, 6)) {
      const resolved = await resolveShortenedUrl(shortUrl)
      if (resolved && resolved !== shortUrl && !isShortenerUrl(resolved)) {
        expandedUrls++
        resolvedLinks.push(resolved)
        if (expandedExamples.length < 10) {
          expandedExamples.push({ from: shortUrl, to: resolved })
        }
      }
    }

    if (resolvedLinks.length > 0) {
      const mergedLinks = Array.from(
        new Set([
          ...(bm.outgoingLinks || []).filter(u => !allShortUrls.includes(u)),
          ...resolvedLinks
        ])
      )
      const syn = synthesizeBookmarkFields({
        caption: bm.caption,
        authorName: bm.authorName,
        authorHandle: bm.authorHandle,
        platform: bm.platform,
        outgoingLinks: mergedLinks,
        topics: bm.topics,
        entities: bm.entities,
        existingResources: bm.resources
      })
      const manualFields = new Set(bm.manualFields || [])
      updateBookmark(
        bm.id,
        {
          outgoingLinks: mergedLinks,
          resources: syn.resources,
          ...(manualFields.has('title') ? {} : { title: syn.title }),
          ...(manualFields.has('purpose') ? {} : { purpose: syn.purpose, aiSummary: syn.purpose }),
          ...(manualFields.has('resourceType') ? {} : { resourceType: syn.resourceType }),
          ...(manualFields.has('evaluation') ? {} : { evaluation: syn.evaluation })
        },
        false
      )
    }
  }

  syncBookmarksToGitHubGallery(true)
  const afterRepoCount = getAllGalleryRepositories().length
  return {
    checkedBookmarks,
    expandedUrls,
    newGitHubRepos: Math.max(0, afterRepoCount - beforeRepoCount),
    expandedExamples
  }
}

/**
 * Deep Repo Hunter ("Cazador Profundo de Repositorios Ocultos"):
 * For saved posts from X, WhatsApp, or Instagram where the GitHub repository link
 * is NOT in the initial post (e.g. bare X link sent via WhatsApp, link in replies/comments,
 * behind an intermediate landing page, or only mentioned by name/CLI in a video or caption):
 * 1. Hydrates bare X/Twitter status URLs via FxTwitter / VxTwitter / oEmbed.
 * 2. Expands shortlinks (t.co, bit.ly) and scrapes external landing pages for github.com/owner/repo links.
 * 3. Infers candidate tool/repo names from post context and searches GitHub API to discover the repository.
 */
export async function huntMissingGitHubReposBatch(options: {
  limit?: number
  platform?: SourcePlatform | 'all'
  bookmarkIds?: string[]
  token?: string | null
} = {}): Promise<{
  scannedCount: number
  hydratedPostsCount: number
  discoveredReposCount: number
  newGalleryReposCount: number
  findings: DeepHuntResultItem[]
}> {
  const limit = Math.min(150, Math.max(1, options.limit || 25))
  const all = getAllBookmarks()
  const beforeRepoCount = getAllGalleryRepositories().length

  const hasGitHubRepoAlready = (bm: BookmarkItem): boolean => {
    if (bm.platform === 'github') return true
    if ((bm.resources || []).some(r => r.kind === 'github_repo')) return true
    return (bm.outgoingLinks || []).some(u => classifyGitHubUrl(u)?.kind === 'github_repo')
  }

  let candidates: BookmarkItem[] = []
  if (Array.isArray(options.bookmarkIds) && options.bookmarkIds.length > 0) {
    const idSet = new Set(options.bookmarkIds)
    candidates = all.filter(b => idSet.has(b.id))
  } else {
    candidates = all.filter(b => {
      if (b.platform === 'github') return false
      if (options.platform && options.platform !== 'all' && b.platform !== options.platform) {
        return false
      }
      return !hasGitHubRepoAlready(b)
    })
  }

  let scannedCount = 0
  let hydratedPostsCount = 0
  let discoveredReposCount = 0
  const findings: DeepHuntResultItem[] = []

  const processCandidate = async (bm: BookmarkItem) => {
    scannedCount++
    let currentCaption = bm.caption || ''
    let currentAuthorName = bm.authorName
    let currentAuthorHandle = bm.authorHandle
    const currentLinks = new Set<string>(bm.outgoingLinks || [])
    const discoveredForThisBm: DeepHuntResultItem['discoveredRepos'] = []

    // Step 0: Run Smart Web & Comment Navigator Agent (Off-Topic check + Thread/Comment Jina Reader + AI Grounding + Fallback Link)
    const navOut = await runWebNavigatorAgentForBookmark(bm, { token: options.token })

    if (navOut.isOffTopic && navOut.offTopicInfo) {
      const manualFields = new Set(bm.manualFields || [])
      const nextTopics = manualFields.has('topics')
        ? bm.topics
        : Array.from(new Set([...navOut.offTopicInfo.suggestedTopics, ...(bm.topics || []).filter(t => t !== 'Sin clasificar')]))
      updateBookmark(
        bm.id,
        {
          ...(manualFields.has('resourceType')
            ? {}
            : { resourceType: 'Archivo separado / Otro tema (No técnico)' }),
          topics: nextTopics,
          ...(manualFields.has('evaluation')
            ? {}
            : {
                evaluation: `Archivo separado (${navOut.offTopicInfo.categoryLabel}): ${navOut.offTopicInfo.reasonEs}`
              })
        },
        false
      )
      findings.push({
        bookmarkId: bm.id,
        bookmarkTitle: bm.title || bm.id,
        platform: bm.platform,
        sourceUrl: bm.sourceUrl,
        discoveredRepos: [],
        isOffTopicSeparated: true,
        offTopicCategory: navOut.offTopicInfo.categoryLabel
      })
      return
    }

    if (navOut.hydratedText && navOut.hydratedText !== currentCaption) {
      currentCaption = navOut.hydratedText
      hydratedPostsCount++
    }
    if (navOut.hydratedAuthorName) currentAuthorName = navOut.hydratedAuthorName
    if (navOut.hydratedAuthorHandle) currentAuthorHandle = navOut.hydratedAuthorHandle
    for (const u of navOut.expandedLinks) currentLinks.add(u)
    for (const r of navOut.discoveredRepos) {
      if (!discoveredForThisBm.some(d => d.fullName.toLowerCase() === r.fullName.toLowerCase())) {
        discoveredForThisBm.push(r)
      }
    }

    // Step 2: Expand shortlinks & scrape external landing pages for GitHub links (only if not yet found)
    const nonSocialLinks =
      discoveredForThisBm.length === 0
        ? Array.from(currentLinks).filter(
            u => !/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com|instagram\.com)\//i.test(u)
          )
        : []
    for (const extUrl of nonSocialLinks.slice(0, 3)) {
      const ghDirect = classifyGitHubUrl(extUrl)
      if (ghDirect?.kind === 'github_repo' && ghDirect.fullName) {
        if (!discoveredForThisBm.some(d => d.fullName.toLowerCase() === ghDirect.fullName!.toLowerCase())) {
          discoveredForThisBm.push({
            fullName: ghDirect.fullName,
            url: ghDirect.canonicalUrl,
            description: 'Enlace directo a repositorio GitHub',
            discoveryMethod: 'shortlink_expansion',
            confidence: 'confirmado'
          })
        }
        continue
      }

      const live = await investigateResourceUrlLive(extUrl, currentCaption, bm.topics)
      upsertCachedResource(live.resource)
      for (const ghUrl of live.discoveredGitHubUrls) {
        currentLinks.add(ghUrl)
        const parsedGh = classifyGitHubUrl(ghUrl)
        if (
          parsedGh?.fullName &&
          !discoveredForThisBm.some(d => d.fullName.toLowerCase() === parsedGh.fullName!.toLowerCase())
        ) {
          discoveredForThisBm.push({
            fullName: parsedGh.fullName,
            url: parsedGh.canonicalUrl,
            description: `Descubierto dentro de la página externa (${live.resource.domain || extUrl})`,
            discoveryMethod: 'external_page_scrape',
            confidence: 'confirmado'
          })
        }
      }
    }

    // Step 3: If still no GitHub repo found, infer tool/repo name from caption/video/thread & search GitHub API!
    if (discoveredForThisBm.length === 0) {
      const searched = await searchGitHubRepoByPostContext({
        caption: currentCaption,
        title: bm.title,
        authorHandle: currentAuthorHandle,
        authorName: currentAuthorName,
        entities: bm.entities,
        token: options.token
      })
      if (searched) {
        currentLinks.add(searched.url)
        discoveredForThisBm.push({
          fullName: searched.fullName,
          url: searched.url,
          description: searched.description || `Inferido por búsqueda inteligente en GitHub API`,
          stars: searched.stars,
          discoveryMethod: 'github_search_inference',
          confidence: searched.confidence
        })
      }
    }

    const fallbackRef =
      discoveredForThisBm.length === 0
        ? navOut.fallbackReference ||
          skillBuildFallbackReferenceLink({
            sourceUrl: bm.sourceUrl,
            platform: bm.platform,
            authorHandle: currentAuthorHandle,
            authorName: currentAuthorName,
            title: bm.title,
            caption: currentCaption,
            expandedUrls: Array.from(currentLinks),
            candidateQueries: []
          })
        : undefined

    if (discoveredForThisBm.length > 0 || currentCaption !== bm.caption || fallbackRef) {
      discoveredReposCount += discoveredForThisBm.length
      const updatedLinks = Array.from(currentLinks)
      const existingWithFallback = [...(bm.resources || [])]
      if (fallbackRef) {
        const fbRes = fallbackReferenceToLinkedResource(fallbackRef, bm.topics)
        if (!existingWithFallback.some(r => (r.resolvedUrl || r.url) === fbRes.resolvedUrl)) {
          existingWithFallback.push(fbRes)
        }
      }

      const syn = synthesizeBookmarkFields({
        caption: currentCaption,
        authorName: currentAuthorName,
        authorHandle: currentAuthorHandle,
        platform: bm.platform,
        outgoingLinks: updatedLinks,
        topics: bm.topics,
        entities: bm.entities,
        existingResources: existingWithFallback
      })

      const manualFields = new Set(bm.manualFields || [])
      const huntNote =
        discoveredForThisBm.length > 0
          ? `[Cazador de Repos]: ${discoveredForThisBm
              .map(
                d =>
                  `${d.fullName} (${
                    d.discoveryMethod === 'ai_web_grounding'
                      ? 'Agente IA / Web'
                      : d.discoveryMethod === 'jina_reader_thread'
                      ? 'hilo/comentario'
                      : d.discoveryMethod === 'github_search_inference'
                      ? 'búsqueda GitHub'
                      : 'hidratación de link'
                  })`
              )
              .join(', ')}`
          : fallbackRef
          ? `[Link de Referencia / Búsqueda Asistida]: ${fallbackRef.primaryLabel} → ${fallbackRef.primaryUrl} | Buscar en GitHub: ${fallbackRef.githubSearchUrl}`
          : ''

      updateBookmark(
        bm.id,
        {
          caption: currentCaption,
          authorName: currentAuthorName,
          authorHandle: currentAuthorHandle,
          outgoingLinks: updatedLinks,
          resources: syn.resources,
          analysisState: 'completed',
          ...(manualFields.has('title') ? {} : { title: syn.title }),
          ...(manualFields.has('purpose') ? {} : { purpose: syn.purpose, aiSummary: syn.purpose }),
          ...(manualFields.has('resourceType') ? {} : { resourceType: syn.resourceType }),
          ...(manualFields.has('evaluation') ? {} : { evaluation: syn.evaluation }),
          ...(huntNote && !(bm.notes || '').includes(huntNote.slice(0, 38))
            ? { notes: [bm.notes, huntNote].filter(Boolean).join('\n') }
            : {})
        },
        false
      )

      if (discoveredForThisBm.length > 0 || fallbackRef) {
        findings.push({
          bookmarkId: bm.id,
          bookmarkTitle: syn.title || bm.title || bm.id,
          platform: bm.platform,
          sourceUrl: bm.sourceUrl,
          discoveredRepos: discoveredForThisBm,
          fallbackReference: fallbackRef
        })
      }
    }
  }

  const sliceToProcess = candidates.slice(0, limit)
  const CONCURRENCY = 8
  for (let i = 0; i < sliceToProcess.length; i += CONCURRENCY) {
    const chunk = sliceToProcess.slice(i, i + CONCURRENCY)
    await Promise.all(chunk.map(bm => processCandidate(bm)))
  }

  syncBookmarksToGitHubGallery(true)
  const afterRepoCount = getAllGalleryRepositories().length

  return {
    scannedCount,
    hydratedPostsCount,
    discoveredReposCount,
    newGalleryReposCount: Math.max(0, afterRepoCount - beforeRepoCount),
    findings
  }
}

/**
 * Super-Importer for Lists of Repositories & Awesome Pages with Strict Deduplication:
 * Accepts free text (URLs, Markdown lists, CSV, JSON, or shorthand `owner/repo` lines)
 * and/or a Page/Awesome-List URL, extracts all repositories, skips duplicates already in DB,
 * and saves all new ones into the Gallery & Bookmarks catalog.
 */
export async function importRepositoryListWithDeduplication(params: {
  text?: string
  pageUrl?: string
  enrichLiveCount?: number
  token?: string | null
  notes?: string
}): Promise<{
  sourceLabel: string
  totalDetected: number
  added: number
  duplicatesSkipped: number
  addedFullNames: string[]
  skippedFullNames: string[]
  repositories: GalleryRepository[]
}> {
  const { extracted, sourceLabel } = await extractRepositoriesFromAnyListOrPage({
    text: params.text,
    pageUrl: params.pageUrl,
    token: params.token
  })

  let added = 0
  let duplicatesSkipped = 0
  const addedFullNames: string[] = []
  const skippedFullNames: string[] = []
  const enrichLimit = typeof params.enrichLiveCount === 'number' ? params.enrichLiveCount : 8
  let liveFetchedSoFar = 0

  for (const item of extracted) {
    const fullName = `${item.owner}/${item.repo}`
    const existing = getGalleryRepositoryByFullName(fullName)

    if (existing) {
      duplicatesSkipped++
      skippedFullNames.push(existing.fullName)
      // If the existing entry had no notes and the imported list provided contextHint, preserve it non-destructively
      if (item.contextHint && !existing.notes) {
        upsertGalleryRepository({
          ...existing,
          notes: `Contexto de lista (${sourceLabel}): ${item.contextHint}`
        })
      }
      continue
    }

    let newRepo: GalleryRepository | null = null
    if (liveFetchedSoFar < enrichLimit) {
      try {
        newRepo = await fetchGitHubRepositoryData(item.owner, item.repo, params.token)
        liveFetchedSoFar++
      } catch {
        newRepo = null
      }
    }

    if (!newRepo) {
      const now = new Date().toISOString()
      const initialDesc =
        item.contextHint || `Repositorio importado desde ${sourceLabel} (${fullName}).`
      const baseRepo: GalleryRepository = {
        id: numericIdFromFullName(fullName),
        owner: item.owner,
        name: item.repo,
        fullName,
        url: item.cleanUrl,
        avatarUrl: `https://github.com/${item.owner}.png?size=128`,
        description: initialDesc,
        explanation: initialDesc,
        imageUrl: `https://opengraph.githubassets.com/1/${item.owner}/${item.repo}`,
        imageSource: 'opengraph',
        stars: 0,
        forks: 0,
        openIssues: 0,
        primaryLanguage: null,
        languages: [],
        topics: [],
        license: null,
        createdAt: now,
        updatedAt: now,
        pushedAt: now,
        latestRelease: null,
        addedAt: now,
        homepage: null,
        defaultBranch: 'main',
        notes: params.notes || (item.contextHint ? `Importado de ${sourceLabel}: ${item.contextHint}` : `Importado de ${sourceLabel}`)
      }
      const synth = buildDeterministicSpanishExplanations(baseRepo)
      baseRepo.shortExplanationEs = synth.shortExplanationEs
      baseRepo.longExplanationEs = synth.longExplanationEs
      baseRepo.explanation = synth.shortExplanationEs
      baseRepo.resourceType = synth.resourceType
      newRepo = baseRepo
    } else if (params.notes || item.contextHint) {
      newRepo.notes = [params.notes, item.contextHint ? `Lista (${sourceLabel}): ${item.contextHint}` : '']
        .filter(Boolean)
        .join(' — ')
    }

    saveGalleryRepoWithBookmark(newRepo)
    added++
    addedFullNames.push(newRepo.fullName)
  }

  const repositories = getAllGalleryRepositories()
  return {
    sourceLabel,
    totalDetected: extracted.length,
    added,
    duplicatesSkipped,
    addedFullNames,
    skippedFullNames,
    repositories
  }
}

export {
  getAllGalleryRepositories,
  getGalleryRepositoryByFullName,
  upsertGalleryRepository,
  deleteGalleryRepository,
  saveGalleryCustomOrder,
  syncBookmarksToGitHubGallery,
  getAllProjectBlueprints,
  upsertProjectBlueprint,
  deleteProjectBlueprint
}
