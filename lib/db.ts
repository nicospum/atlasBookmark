import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { BookmarkItem, LinkedResource, SourcePlatform, StorageDiagnostics } from './types'
import { normalizeRow } from './importer'
import { synthesizeBookmarkFields } from './resource-investigator'

const BUNDLED_DATA_DIR = path.join(process.cwd(), 'data')
let resolvedDataDir = process.env.ATLAS_DATA_DIR || BUNDLED_DATA_DIR
let isEphemeralFallback = false

function ensureWritableDataDir(): string {
  try {
    if (!fs.existsSync(/*turbopackIgnore: true*/ resolvedDataDir)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ resolvedDataDir, { recursive: true })
    }
    const probeFile = path.join(resolvedDataDir, `.write_probe_${process.pid}`)
    fs.writeFileSync(probeFile, 'ok', 'utf8')
    fs.rmSync(probeFile, { force: true })
    return resolvedDataDir
  } catch {
    // Fallback for read-only serverless filesystems (/var/task on Vercel / Netlify)
    isEphemeralFallback = true
    const tmpDir = path.join(os.tmpdir(), 'atlas-bookmark-data')
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'normalized'), { recursive: true })

    // Seed archive.json and topic_rules.json from bundled data dir if available
    const bundledArchive = path.join(BUNDLED_DATA_DIR, 'normalized', 'archive.json')
    const tmpArchive = path.join(tmpDir, 'normalized', 'archive.json')
    if (fs.existsSync(bundledArchive) && !fs.existsSync(tmpArchive)) {
      try {
        fs.copyFileSync(bundledArchive, tmpArchive)
      } catch {}
    }

    const bundledRules = path.join(BUNDLED_DATA_DIR, 'topic_rules.json')
    const tmpRules = path.join(tmpDir, 'topic_rules.json')
    if (fs.existsSync(bundledRules) && !fs.existsSync(tmpRules)) {
      try {
        fs.copyFileSync(bundledRules, tmpRules)
      } catch {}
    }

    return tmpDir
  }
}

const DATA_DIR = ensureWritableDataDir()
const DB_PATH = path.join(DATA_DIR, 'atlas.db')
const db = new Database(DB_PATH)

// Pragmas for performance and data safety
try {
  db.pragma('journal_mode = WAL')
} catch {
  db.pragma('journal_mode = DELETE')
}
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    source_url TEXT NOT NULL UNIQUE,
    author_name TEXT NOT NULL,
    author_handle TEXT NOT NULL,
    author_avatar TEXT,
    domain TEXT DEFAULT '',
    published_at TEXT NOT NULL,
    saved_at TEXT NOT NULL,
    imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
    caption TEXT NOT NULL,
    title TEXT DEFAULT '',
    purpose TEXT DEFAULT '',
    resource_type TEXT DEFAULT 'Otro / pendiente de clasificar',
    evaluation TEXT DEFAULT '',
    analysis_state TEXT DEFAULT 'completed',
    notes TEXT DEFAULT '',
    resources_json TEXT DEFAULT '[]',
    manual_fields TEXT DEFAULT '[]',
    import_batch_id TEXT DEFAULT '',
    content_type TEXT DEFAULT 'post',
    collections TEXT DEFAULT '[]',
    topics TEXT NOT NULL,
    entities TEXT NOT NULL,
    ai_summary TEXT NOT NULL,
    language TEXT NOT NULL,
    outgoing_links TEXT NOT NULL,
    media_type TEXT NOT NULL,
    media_urls TEXT NOT NULL,
    media_paths TEXT DEFAULT '[]',
    media_status TEXT DEFAULT 'not_requested',
    reviewed INTEGER NOT NULL DEFAULT 0,
    analysis_method TEXT DEFAULT 'rules',
    analyzed_at TEXT DEFAULT '',
    classification_status TEXT DEFAULT 'deterministic',
    classification_matches TEXT DEFAULT '{}',
    confidence TEXT DEFAULT '',
    capture_source TEXT DEFAULT '',
    provenance TEXT DEFAULT '',
    raw_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_bookmarks_platform ON bookmarks(platform);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_saved_at ON bookmarks(saved_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_reviewed ON bookmarks(reviewed);

  CREATE TABLE IF NOT EXISTS resources_cache (
    canonical_url TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT DEFAULT '',
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS checkpoints (
    platform TEXT PRIMARY KEY,
    cursor TEXT,
    last_id TEXT,
    total_captured INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS import_history (
    event_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    source_file TEXT NOT NULL,
    status TEXT NOT NULL,
    added INTEGER DEFAULT 0,
    duplicates INTEGER DEFAULT 0,
    updated INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    total_records INTEGER DEFAULT 0
  );
`)

// Ensure new unified columns exist if migrating an older atlas.db
const existingCols = new Set(
  (db.prepare('PRAGMA table_info(bookmarks)').all() as Array<{ name: string }>).map(c => c.name)
)

const extraColumns: Array<[string, string]> = [
  ['domain', "TEXT DEFAULT ''"],
  ['imported_at', "TEXT DEFAULT ''"],
  ['title', "TEXT DEFAULT ''"],
  ['purpose', "TEXT DEFAULT ''"],
  ['resource_type', "TEXT DEFAULT 'Otro / pendiente de clasificar'"],
  ['evaluation', "TEXT DEFAULT ''"],
  ['analysis_state', "TEXT DEFAULT 'completed'"],
  ['notes', "TEXT DEFAULT ''"],
  ['resources_json', "TEXT DEFAULT '[]'"],
  ['manual_fields', "TEXT DEFAULT '[]'"],
  ['import_batch_id', "TEXT DEFAULT ''"],
  ['content_type', "TEXT DEFAULT 'post'"],
  ['collections', "TEXT DEFAULT '[]'"],
  ['media_paths', "TEXT DEFAULT '[]'"],
  ['media_status', "TEXT DEFAULT 'not_requested'"],
  ['analysis_method', "TEXT DEFAULT 'rules'"],
  ['analyzed_at', "TEXT DEFAULT ''"],
  ['classification_status', "TEXT DEFAULT 'deterministic'"],
  ['classification_matches', "TEXT DEFAULT '{}'"],
  ['confidence', "TEXT DEFAULT ''"],
  ['capture_source', "TEXT DEFAULT ''"],
  ['provenance', "TEXT DEFAULT ''"]
]

for (const [colName, colDef] of extraColumns) {
  if (!existingCols.has(colName)) {
    try {
      db.exec(`ALTER TABLE bookmarks ADD COLUMN ${colName} ${colDef}`)
    } catch {
      // Column already added
    }
  }
}

// Initialize SQLite FTS5 Virtual Table for instant full-text search
let ftsAvailable = false
try {
  // Drop legacy triggers that used external-content 'delete' syntax on bookmarks_fts
  db.exec(`
    DROP TRIGGER IF EXISTS bookmarks_ai;
    DROP TRIGGER IF EXISTS bookmarks_ad;
    DROP TRIGGER IF EXISTS bookmarks_au;
  `)
  const ftsCols = new Set(
    (db.prepare('PRAGMA table_info(bookmarks_fts)').all() as Array<{ name: string }>).map(c => c.name)
  )
  if (ftsCols.size > 0 && (!ftsCols.has('title') || !ftsCols.has('purpose') || !ftsCols.has('notes'))) {
    db.exec('DROP TABLE IF EXISTS bookmarks_fts;')
  }
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
      id UNINDEXED,
      title,
      purpose,
      resource_type,
      caption,
      notes,
      author_name,
      author_handle,
      ai_summary,
      topics,
      entities,
      collections,
      domain
    );
  `)
  ftsAvailable = true
} catch {
  ftsAvailable = false
}

export function rebuildFtsIndex(force = false) {
  if (!ftsAvailable) return
  try {
    if (!force) {
      const bmCount = (db.prepare('SELECT COUNT(*) as c FROM bookmarks').get() as { c: number }).c
      const ftsCount = (db.prepare('SELECT COUNT(*) as c FROM bookmarks_fts').get() as { c: number }).c
      if (bmCount === ftsCount) return
    }
    const tx = db.transaction(() => {
      db.exec('DELETE FROM bookmarks_fts;')
      db.exec(`
        INSERT INTO bookmarks_fts (
          id, title, purpose, resource_type, caption, notes,
          author_name, author_handle, ai_summary, topics, entities, collections, domain
        )
        SELECT
          id, title, purpose, resource_type, caption, notes,
          author_name, author_handle, ai_summary, topics, entities, collections, domain
        FROM bookmarks;
      `)
    })
    tx()
  } catch {
    // Ignore transient lock during parallel build workers
  }
}

export function upsertCachedResource(res: LinkedResource) {
  try {
    const key = (res.resolvedUrl || res.url || '').toLowerCase().trim()
    if (!key) return
    db.prepare(`
      INSERT OR REPLACE INTO resources_cache (
        canonical_url, resource_id, kind, name, data_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      key,
      res.id,
      res.kind,
      res.fullName || res.name || '',
      JSON.stringify(res),
      new Date().toISOString()
    )
  } catch {}
}

export function getCachedResource(url: string): LinkedResource | null {
  try {
    const key = (url || '').toLowerCase().trim()
    if (!key) return null
    const row = db
      .prepare('SELECT data_json FROM resources_cache WHERE canonical_url = ?')
      .get(key) as { data_json: string } | undefined
    if (!row) return null
    return JSON.parse(row.data_json) as LinkedResource
  } catch {
    return null
  }
}

export function getAllCachedResources(): LinkedResource[] {
  try {
    const rows = db.prepare('SELECT data_json FROM resources_cache ORDER BY updated_at DESC').all() as Array<{
      data_json: string
    }>
    return rows
      .map(r => {
        try {
          return JSON.parse(r.data_json) as LinkedResource
        } catch {
          return null
        }
      })
      .filter((r): r is LinkedResource => Boolean(r))
  } catch {
    return []
  }
}

export function bookmarkToDbParams(item: BookmarkItem) {
  const resources = Array.isArray(item.resources) ? item.resources : []
  for (const r of resources) {
    if (r.verificationStatus === 'confirmed' || r.kind === 'github_repo') {
      upsertCachedResource(r)
    }
  }

  return {
    id: item.id,
    platform: item.platform,
    sourceUrl: item.sourceUrl,
    authorName: item.authorName || 'Usuario',
    authorHandle: item.authorHandle || '',
    authorAvatar: item.authorAvatar || null,
    domain: item.domain || '',
    publishedAt: item.publishedAt || '',
    savedAt: item.savedAt || item.publishedAt || new Date().toISOString(),
    importedAt: item.importedAt || new Date().toISOString(),
    caption: item.caption || '',
    title: item.title || '',
    purpose: item.purpose || '',
    resourceType: item.resourceType || 'Otro / pendiente de clasificar',
    evaluation: item.evaluation || '',
    analysisState: item.analysisState || 'completed',
    notes: item.notes || '',
    resourcesJson: JSON.stringify(resources),
    manualFields: JSON.stringify(item.manualFields || []),
    importBatchId: item.importBatchId || '',
    contentType: item.contentType || 'post',
    collections: JSON.stringify(item.collections || []),
    topics: JSON.stringify(item.topics || []),
    entities: JSON.stringify(item.entities || []),
    aiSummary: item.aiSummary || '',
    language: item.language || 'Español',
    outgoingLinks: JSON.stringify(item.outgoingLinks || []),
    mediaType: item.mediaType || 'none',
    mediaUrls: JSON.stringify(item.mediaUrls || []),
    mediaPaths: JSON.stringify(item.mediaPaths || []),
    mediaStatus: item.mediaStatus || (item.mediaUrls?.length ? 'referenced' : 'not_requested'),
    reviewed: item.reviewed ? 1 : 0,
    analysisMethod: item.analysisMethod || 'rules',
    analyzedAt: item.analyzedAt || '',
    classificationStatus: item.classificationStatus || 'deterministic',
    classificationMatches: JSON.stringify(item.classificationMatches || {}),
    confidence: String(item.confidence ?? ''),
    captureSource: item.captureSource || 'manual',
    provenance: item.provenance || ''
  }
}

export function parseBookmarkRow(row: any): BookmarkItem {
  const safeJson = <T>(val: string | null | undefined, fallback: T): T => {
    if (!val) return fallback
    try {
      return JSON.parse(val) as T
    } catch {
      return fallback
    }
  }

  const rawPlat = String(row.platform || '').toLowerCase()
  const platform: SourcePlatform =
    rawPlat === 'instagram' ? 'instagram' : rawPlat === 'whatsapp' ? 'whatsapp' : 'x'

  const storedResources = safeJson<LinkedResource[]>(row.resources_json, [])
  // Enrich with shared resources_cache if a resource was confirmed by another bookmark!
  const enrichedResources = storedResources.map(r => {
    const cached = getCachedResource(r.resolvedUrl || r.url)
    if (cached && cached.verificationStatus === 'confirmed' && r.verificationStatus !== 'confirmed') {
      return cached
    }
    return r
  })

  return {
    id: row.id,
    platform,
    sourceUrl: row.source_url,
    authorName: row.author_name,
    authorHandle: row.author_handle,
    authorAvatar: row.author_avatar || undefined,
    domain: row.domain || '',
    publishedAt: row.published_at || '',
    savedAt: row.saved_at || row.published_at || '',
    importedAt: row.imported_at || row.created_at || '',
    caption: row.caption || '',
    title: row.title || '',
    purpose: row.purpose || '',
    resourceType: (row.resource_type as any) || 'Otro / pendiente de clasificar',
    evaluation: row.evaluation || '',
    analysisState: (row.analysis_state as any) || 'completed',
    notes: row.notes || '',
    resources: enrichedResources,
    manualFields: safeJson<string[]>(row.manual_fields, []),
    importBatchId: row.import_batch_id || undefined,
    contentType: row.content_type || 'post',
    collections: safeJson<string[]>(row.collections, []),
    topics: safeJson<string[]>(row.topics, []),
    entities: safeJson<string[]>(row.entities, []),
    aiSummary: row.ai_summary || '',
    language: row.language || 'Español',
    outgoingLinks: safeJson<string[]>(row.outgoing_links, []),
    mediaType: (row.media_type as any) || 'none',
    mediaUrls: safeJson<string[]>(row.media_urls, []),
    mediaPaths: safeJson<string[]>(row.media_paths, []),
    mediaStatus: row.media_status || 'not_requested',
    reviewed: Boolean(row.reviewed),
    analysisMethod: (row.analysis_method as any) || 'rules',
    analyzedAt: row.analyzed_at || undefined,
    classificationStatus: (row.classification_status as any) || 'deterministic',
    classificationMatches: safeJson<Record<string, string[]>>(row.classification_matches, {}),
    confidence: row.confidence ? Number(row.confidence) || row.confidence : '',
    contentStatus: row.caption ? 'text' : 'link-only',
    captureSource: row.capture_source || '',
    provenance: row.provenance || ''
  }
}

function migrateAndBackfillOnStartup() {
  try {
    const demoCount = (
      db.prepare("SELECT COUNT(*) as c FROM bookmarks WHERE id LIKE 'bm-%'").get() as { c: number }
    ).c
    if (demoCount > 0) {
      db.prepare("DELETE FROM bookmarks WHERE id LIKE 'bm-%'").run()
    }

    const currentCount = (db.prepare('SELECT COUNT(*) as c FROM bookmarks').get() as { c: number }).c
    const archiveJsonPath = path.join(DATA_DIR, 'normalized', 'archive.json')

    if (currentCount === 0 && fs.existsSync(archiveJsonPath)) {
      const rawContent = fs.readFileSync(archiveJsonPath, 'utf8')
      const rawRecords = JSON.parse(rawContent)
      if (Array.isArray(rawRecords) && rawRecords.length > 0) {
        const insertStmt = db.prepare(`
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
        `)

        const tx = db.transaction((records: any[]) => {
          for (const rec of records) {
            const item = normalizeRow(rec, rec.raw_file || 'x.com.initial.har')
            if (!item) continue
            insertStmt.run(bookmarkToDbParams(item))
          }
        })
        tx(rawRecords)
      }
    }

    // Backfill any existing rows where title or purpose is empty
    const missingSynthesisRows = db
      .prepare("SELECT * FROM bookmarks WHERE title = '' OR purpose = '' OR resources_json = '[]'")
      .all()

    if (missingSynthesisRows.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE bookmarks
        SET title = ?, purpose = ?, resource_type = ?, evaluation = ?,
            analysis_state = ?, resources_json = ?
        WHERE id = ?
      `)
      const tx = db.transaction((rows: any[]) => {
        for (const r of rows) {
          const item = parseBookmarkRow(r)
          const syn = synthesizeBookmarkFields({
            caption: item.caption,
            authorName: item.authorName,
            authorHandle: item.authorHandle,
            platform: item.platform,
            outgoingLinks: item.outgoingLinks,
            topics: item.topics,
            entities: item.entities,
            existingResources: item.resources
          })
          const nextTitle = item.title || syn.title
          const nextPurpose = item.purpose || syn.purpose
          const nextType =
            item.resourceType && item.resourceType !== 'Otro / pendiente de clasificar'
              ? item.resourceType
              : syn.resourceType
          const nextEval = item.evaluation || syn.evaluation
          const nextState = syn.analysisState
          for (const res of syn.resources) {
            if (res.verificationStatus === 'confirmed' || res.kind === 'github_repo') {
              upsertCachedResource(res)
            }
          }
          updateStmt.run(
            nextTitle,
            nextPurpose,
            nextType,
            nextEval,
            nextState,
            JSON.stringify(syn.resources),
            item.id
          )
        }
      })
      tx(missingSynthesisRows)
    }

    rebuildFtsIndex()
  } catch (err) {
    console.error('[ATLAS DB] Error en migración/backfill inicial:', err)
  }
}

export function getStorageDiagnostics(): StorageDiagnostics {
  const totalBookmarks = (db.prepare('SELECT COUNT(*) as c FROM bookmarks').get() as { c: number }).c
  const totalResourcesCached = (db.prepare('SELECT COUNT(*) as c FROM resources_cache').get() as { c: number }).c
  const platformEnv: StorageDiagnostics['platformEnv'] = process.env.VERCEL
    ? 'vercel'
    : process.env.NETLIFY
    ? 'netlify'
    : 'local'

  return {
    mode: isEphemeralFallback || platformEnv !== 'local' ? 'cloud_ephemeral' : 'local_persistent',
    platformEnv,
    dbPath: DB_PATH,
    writable: true,
    totalBookmarks,
    totalResourcesCached
  }
}

migrateAndBackfillOnStartup()

export { db, DATA_DIR, BUNDLED_DATA_DIR, ftsAvailable }
