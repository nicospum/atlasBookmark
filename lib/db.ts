import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { BookmarkItem, SourcePlatform } from './types'
import { normalizeRow } from './importer'

const DATA_DIR = process.env.ATLAS_DATA_DIR || path.join(process.cwd(), 'data')
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const DB_PATH = path.join(DATA_DIR, 'atlas.db')
const db = new Database(DB_PATH)

// Pragmas for performance and data safety
db.pragma('journal_mode = WAL')
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
  const ftsCols = new Set(
    (db.prepare('PRAGMA table_info(bookmarks_fts)').all() as Array<{ name: string }>).map(c => c.name)
  )
  if (ftsCols.size > 0 && (!ftsCols.has('collections') || !ftsCols.has('domain'))) {
    db.exec('DROP TABLE IF EXISTS bookmarks_fts;')
  }
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
      id UNINDEXED,
      caption,
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
        INSERT INTO bookmarks_fts (id, caption, author_name, author_handle, ai_summary, topics, entities, collections, domain)
        SELECT id, caption, author_name, author_handle, ai_summary, topics, entities, collections, domain
        FROM bookmarks;
      `)
    })
    tx()
  } catch {
    // Ignore transient lock during parallel build workers
  }
}

// Remove old fake demo records (bm-1..bm-10) if present, and seed the user's real archive.json bookmarks!
function migrateRealArchiveOnStartup() {
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
        `)

        const tx = db.transaction((records: any[]) => {
          for (const rec of records) {
            const item = normalizeRow(rec, rec.raw_file || 'x.com.initial.har')
            if (!item) continue
            insertStmt.run(bookmarkToDbParams(item))
          }
        })
        tx(rawRecords)

        // Also seed import history if empty
        const histCount = (db.prepare('SELECT COUNT(*) as c FROM import_history').get() as { c: number }).c
        if (histCount === 0) {
          db.prepare(`
            INSERT OR IGNORE INTO import_history (
              event_id, created_at, kind, source_file, status, added, duplicates, updated, errors, total_records
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            'init-har-import',
            new Date().toISOString(),
            'x_har',
            'data/raw/x/x.com.initial.har',
            'ok',
            rawRecords.length,
            0,
            0,
            0,
            rawRecords.length
          )
        }
      }
    }

    rebuildFtsIndex()
  } catch (err) {
    console.error('[ATLAS DB] Error en migración inicial de archive.json:', err)
  }
}

export function bookmarkToDbParams(item: BookmarkItem) {
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

  return {
    id: row.id,
    platform: (String(row.platform).toLowerCase() === 'instagram' ? 'instagram' : 'x') as SourcePlatform,
    sourceUrl: row.source_url,
    authorName: row.author_name,
    authorHandle: row.author_handle,
    authorAvatar: row.author_avatar || undefined,
    domain: row.domain || '',
    publishedAt: row.published_at || '',
    savedAt: row.saved_at || row.published_at || '',
    importedAt: row.imported_at || row.created_at || '',
    caption: row.caption || '',
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

migrateRealArchiveOnStartup()

export { db, DATA_DIR, ftsAvailable }
