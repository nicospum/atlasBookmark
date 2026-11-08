import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import os from 'os'
import {
  BookmarkItem,
  GalleryRepoLanguage,
  GalleryRepoRelease,
  GalleryRepository,
  LinkedResource,
  ProjectBlueprint,
  ResourceType,
  SourcePlatform,
  StorageDiagnostics
} from './types'
import { normalizeRow } from './importer'
import { synthesizeBookmarkFields } from './resource-investigator'
import {
  buildDeterministicSpanishExplanations,
  isGenericRepoDescription,
  numericIdFromFullName,
  parseGitHubUrl
} from './github-gallery'

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

    // Seed atlas.db from bundled data dir on Vercel / Netlify serverless cold start
    const bundledDb = path.join(BUNDLED_DATA_DIR, 'atlas.db')
    const tmpDb = path.join(tmpDir, 'atlas.db')
    if (fs.existsSync(bundledDb) && !fs.existsSync(tmpDb)) {
      try {
        fs.copyFileSync(bundledDb, tmpDb)
      } catch {}
    }

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

  CREATE TABLE IF NOT EXISTS github_repos (
    full_name_key TEXT PRIMARY KEY,
    repo_id INTEGER NOT NULL,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    url TEXT NOT NULL,
    avatar_url TEXT DEFAULT '',
    description TEXT DEFAULT '',
    explanation TEXT DEFAULT '',
    short_explanation_es TEXT DEFAULT '',
    long_explanation_es TEXT DEFAULT '',
    explanation_generated_at TEXT DEFAULT '',
    readme TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    image_source TEXT DEFAULT 'opengraph',
    stars INTEGER DEFAULT 0,
    forks INTEGER DEFAULT 0,
    open_issues INTEGER DEFAULT 0,
    primary_language TEXT,
    languages_json TEXT DEFAULT '[]',
    topics_json TEXT DEFAULT '[]',
    license TEXT,
    homepage TEXT,
    default_branch TEXT DEFAULT 'main',
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT '',
    pushed_at TEXT DEFAULT '',
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    latest_release_json TEXT,
    resource_type TEXT DEFAULT 'Otro / pendiente de clasificar',
    linked_bookmark_ids_json TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    custom_order INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_github_repos_stars ON github_repos(stars DESC);
  CREATE INDEX IF NOT EXISTS idx_github_repos_order ON github_repos(custom_order ASC);

  CREATE TABLE IF NOT EXISTS project_blueprints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    goal TEXT DEFAULT '',
    repo_full_names_json TEXT DEFAULT '[]',
    bookmark_ids_json TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS repo_skill_notes (
    skill_id TEXT PRIMARY KEY,
    comments TEXT DEFAULT '',
    recommended TEXT DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    rawPlat === 'instagram'
      ? 'instagram'
      : rawPlat === 'whatsapp'
      ? 'whatsapp'
      : rawPlat === 'github'
      ? 'github'
      : 'x'

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
    syncBookmarksToGitHubGallery(false)
    seedDefaultBlueprintIfNeeded()
  } catch (err) {
    console.error('[ATLAS DB] Error en migración/backfill inicial:', err)
  }
}

export function parseGalleryRepoRow(row: any): GalleryRepository {
  const safeJson = <T>(val: string | null | undefined, fallback: T): T => {
    if (!val) return fallback
    try {
      return JSON.parse(val) as T
    } catch {
      return fallback
    }
  }

  return {
    id: Number(row.repo_id) || numericIdFromFullName(row.full_name || `${row.owner}/${row.name}`),
    owner: row.owner || '',
    name: row.name || '',
    fullName: row.full_name || `${row.owner}/${row.name}`,
    url: row.url || `https://github.com/${row.owner}/${row.name}`,
    avatarUrl: row.avatar_url || `https://github.com/${row.owner}.png?size=128`,
    description: row.description || 'Sin descripción provista.',
    explanation: row.explanation || row.short_explanation_es || row.description || '',
    shortExplanationEs: row.short_explanation_es || row.explanation || row.description || '',
    longExplanationEs: row.long_explanation_es || row.short_explanation_es || row.description || '',
    explanationGeneratedAt: row.explanation_generated_at || undefined,
    readme: row.readme || undefined,
    imageUrl: row.image_url || `https://opengraph.githubassets.com/1/${row.owner}/${row.name}`,
    imageSource: (row.image_source as any) || 'opengraph',
    stars: Number(row.stars) || 0,
    forks: Number(row.forks) || 0,
    openIssues: Number(row.open_issues) || 0,
    primaryLanguage: row.primary_language || null,
    languages: safeJson<GalleryRepoLanguage[]>(row.languages_json, []),
    topics: safeJson<string[]>(row.topics_json, []),
    license: row.license || null,
    homepage: row.homepage || null,
    defaultBranch: row.default_branch || 'main',
    createdAt: row.created_at || row.added_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.added_at || new Date().toISOString(),
    pushedAt: row.pushed_at || row.updated_at || row.added_at || new Date().toISOString(),
    addedAt: row.added_at || new Date().toISOString(),
    latestRelease: safeJson<GalleryRepoRelease | null>(row.latest_release_json, null),
    resourceType: (row.resource_type as ResourceType) || 'Otro / pendiente de clasificar',
    linkedBookmarkIds: safeJson<string[]>(row.linked_bookmark_ids_json, []),
    notes: row.notes || ''
  }
}

export function getAllGalleryRepositories(): GalleryRepository[] {
  const rows = db
    .prepare(
      'SELECT * FROM github_repos ORDER BY CASE WHEN custom_order > 0 THEN custom_order ELSE 999999 END ASC, stars DESC, added_at DESC'
    )
    .all()
  return rows.map(parseGalleryRepoRow)
}

export function getGalleryRepositoryByFullName(fullName: string): GalleryRepository | null {
  const key = (fullName || '').trim().toLowerCase()
  if (!key) return null
  const row = db.prepare('SELECT * FROM github_repos WHERE full_name_key = ?').get(key)
  return row ? parseGalleryRepoRow(row) : null
}

const UPSERT_GALLERY_REPO_SQL = `
  INSERT OR REPLACE INTO github_repos (
    full_name_key, repo_id, owner, name, full_name, url, avatar_url,
    description, explanation, short_explanation_es, long_explanation_es,
    explanation_generated_at, readme, image_url, image_source,
    stars, forks, open_issues, primary_language, languages_json,
    topics_json, license, homepage, default_branch,
    created_at, updated_at, pushed_at, added_at, latest_release_json,
    resource_type, linked_bookmark_ids_json, notes, custom_order
  ) VALUES (
    @fullNameKey, @repoId, @owner, @name, @fullName, @url, @avatarUrl,
    @description, @explanation, @shortExplanationEs, @longExplanationEs,
    @explanationGeneratedAt, @readme, @imageUrl, @imageSource,
    @stars, @forks, @openIssues, @primaryLanguage, @languagesJson,
    @topicsJson, @license, @homepage, @defaultBranch,
    @createdAt, @updatedAt, @pushedAt, @addedAt, @latestReleaseJson,
    @resourceType, @linkedBookmarkIdsJson, @notes, @customOrder
  )
`

export function upsertGalleryRepository(repo: GalleryRepository, customOrder = 0): GalleryRepository {
  const fullName = `${repo.owner}/${repo.name}`
  const key = fullName.toLowerCase()
  const existingRow = db.prepare('SELECT * FROM github_repos WHERE full_name_key = ?').get(key) as any
  const existing = existingRow ? parseGalleryRepoRow(existingRow) : null

  const mergedBookmarkIds = Array.from(
    new Set([...(existing?.linkedBookmarkIds || []), ...(repo.linkedBookmarkIds || [])])
  )
  const mergedTopics = Array.from(
    new Set([...(existing?.topics || []), ...(repo.topics || [])].filter(Boolean))
  )

  const bestRawDesc = !isGenericRepoDescription(repo.description)
    ? repo.description!
    : !isGenericRepoDescription(existing?.description)
    ? existing!.description
    : ''
  const bestReadme = repo.readme || existing?.readme || ''

  const synth = buildDeterministicSpanishExplanations({
    ...existing,
    ...repo,
    description: bestRawDesc,
    readme: bestReadme,
    shortExplanationEs: !isGenericRepoDescription(repo.shortExplanationEs)
      ? repo.shortExplanationEs
      : !isGenericRepoDescription(existing?.shortExplanationEs)
      ? existing?.shortExplanationEs
      : '',
    owner: repo.owner,
    name: repo.name,
    topics: mergedTopics
  })

  const finalRepo: GalleryRepository = {
    id: Number(repo.id) || existing?.id || numericIdFromFullName(fullName),
    owner: repo.owner,
    name: repo.name,
    fullName,
    url: repo.url || `https://github.com/${fullName}`,
    avatarUrl: repo.avatarUrl || existing?.avatarUrl || `https://github.com/${repo.owner}.png?size=128`,
    description: bestRawDesc || synth.effectiveDescription || 'Sin descripción provista.',
    explanation: !isGenericRepoDescription(repo.explanation)
      ? repo.explanation!
      : !isGenericRepoDescription(existing?.explanation)
      ? existing!.explanation!
      : synth.shortExplanationEs,
    shortExplanationEs: !isGenericRepoDescription(repo.shortExplanationEs)
      ? repo.shortExplanationEs!
      : !isGenericRepoDescription(existing?.shortExplanationEs)
      ? existing!.shortExplanationEs!
      : synth.shortExplanationEs,
    longExplanationEs:
      repo.longExplanationEs &&
      !repo.longExplanationEs.includes('referenciado en tus guardados') &&
      !repo.longExplanationEs.includes('detectado en tus guardados')
        ? repo.longExplanationEs
        : existing?.longExplanationEs &&
          !existing.longExplanationEs.includes('referenciado en tus guardados') &&
          !existing.longExplanationEs.includes('detectado en tus guardados')
        ? existing.longExplanationEs
        : synth.longExplanationEs,
    explanationGeneratedAt: repo.explanationGeneratedAt || existing?.explanationGeneratedAt || new Date().toISOString(),
    readme: bestReadme,
    imageUrl:
      repo.imageSource === 'readme'
        ? repo.imageUrl
        : existing?.imageSource === 'readme'
        ? existing.imageUrl
        : repo.imageUrl || existing?.imageUrl || `https://opengraph.githubassets.com/1/${repo.owner}/${repo.name}`,
    imageSource:
      repo.imageSource === 'readme'
        ? 'readme'
        : existing?.imageSource === 'readme'
        ? 'readme'
        : repo.imageSource || existing?.imageSource || 'opengraph',
    stars: Math.max(Number(repo.stars) || 0, Number(existing?.stars) || 0),
    forks: Math.max(Number(repo.forks) || 0, Number(existing?.forks) || 0),
    openIssues: Number(repo.openIssues) || Number(existing?.openIssues) || 0,
    primaryLanguage: repo.primaryLanguage || existing?.primaryLanguage || null,
    languages: repo.languages && repo.languages.length > 0 ? repo.languages : existing?.languages || [],
    topics: mergedTopics,
    license: repo.license || existing?.license || null,
    homepage: repo.homepage || existing?.homepage || null,
    defaultBranch: repo.defaultBranch || existing?.defaultBranch || 'main',
    createdAt: repo.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: repo.updatedAt || existing?.updatedAt || new Date().toISOString(),
    pushedAt: repo.pushedAt || existing?.pushedAt || repo.updatedAt || new Date().toISOString(),
    addedAt: existing?.addedAt || repo.addedAt || new Date().toISOString(),
    latestRelease: repo.latestRelease || existing?.latestRelease || null,
    resourceType:
      repo.resourceType && repo.resourceType !== 'Otro / pendiente de clasificar'
        ? repo.resourceType
        : existing?.resourceType && existing.resourceType !== 'Otro / pendiente de clasificar'
        ? existing.resourceType
        : synth.resourceType,
    linkedBookmarkIds: mergedBookmarkIds,
    notes: repo.notes !== undefined ? repo.notes : existing?.notes || ''
  }

  db.prepare(UPSERT_GALLERY_REPO_SQL).run({
    fullNameKey: key,
    repoId: finalRepo.id,
    owner: finalRepo.owner,
    name: finalRepo.name,
    fullName: finalRepo.fullName,
    url: finalRepo.url,
    avatarUrl: finalRepo.avatarUrl,
    description: finalRepo.description,
    explanation: finalRepo.explanation,
    shortExplanationEs: finalRepo.shortExplanationEs || '',
    longExplanationEs: finalRepo.longExplanationEs || '',
    explanationGeneratedAt: finalRepo.explanationGeneratedAt || '',
    readme: finalRepo.readme || '',
    imageUrl: finalRepo.imageUrl,
    imageSource: finalRepo.imageSource,
    stars: finalRepo.stars,
    forks: finalRepo.forks,
    openIssues: finalRepo.openIssues,
    primaryLanguage: finalRepo.primaryLanguage,
    languagesJson: JSON.stringify(finalRepo.languages || []),
    topicsJson: JSON.stringify(finalRepo.topics || []),
    license: finalRepo.license,
    homepage: finalRepo.homepage,
    defaultBranch: finalRepo.defaultBranch || 'main',
    createdAt: finalRepo.createdAt,
    updatedAt: finalRepo.updatedAt,
    pushedAt: finalRepo.pushedAt,
    addedAt: finalRepo.addedAt,
    latestReleaseJson: finalRepo.latestRelease ? JSON.stringify(finalRepo.latestRelease) : null,
    resourceType: finalRepo.resourceType || 'Otro / pendiente de clasificar',
    linkedBookmarkIdsJson: JSON.stringify(finalRepo.linkedBookmarkIds || []),
    notes: finalRepo.notes || '',
    customOrder: customOrder || (existingRow ? Number(existingRow.custom_order) || 0 : 0)
  })

  return finalRepo
}

export function deleteGalleryRepository(fullNameOrId: string | number): boolean {
  if (typeof fullNameOrId === 'number' || /^\d+$/.test(String(fullNameOrId))) {
    const res = db.prepare('DELETE FROM github_repos WHERE repo_id = ?').run(Number(fullNameOrId))
    return res.changes > 0
  }
  const key = String(fullNameOrId).trim().toLowerCase()
  const res = db.prepare('DELETE FROM github_repos WHERE full_name_key = ?').run(key)
  return res.changes > 0
}

export function saveGalleryCustomOrder(orderedIds: number[]) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return
  const stmt = db.prepare('UPDATE github_repos SET custom_order = ? WHERE repo_id = ?')
  const tx = db.transaction((ids: number[]) => {
    ids.forEach((id, idx) => {
      stmt.run(idx + 1, Number(id))
    })
  })
  tx(orderedIds)
}

const KNOWN_LANGUAGES = [
  'TypeScript',
  'Python',
  'JavaScript',
  'Rust',
  'Go',
  'Swift',
  'Kotlin',
  'Java',
  'C++',
  'C#',
  'Ruby',
  'PHP',
  'Shell',
  'Dart'
]

/**
 * Automatically synchronize all GitHub repositories discovered inside saved bookmarks
 * (X, Instagram, WhatsApp, or direct GitHub imports) into `github_repos`, linking each
 * repository to the bookmark IDs that mentioned it.
 */
export function syncBookmarksToGitHubGallery(force = true): { totalRepos: number; linkedRepos: number } {
  try {
    if (!force) {
      const existingCount = (db.prepare('SELECT COUNT(*) as c FROM github_repos').get() as { c: number }).c
      if (existingCount > 0) {
        return { totalRepos: existingCount, linkedRepos: existingCount }
      }
    }
    const rawBookmarks = db.prepare('SELECT * FROM bookmarks ORDER BY saved_at DESC').all()
    const bookmarks = rawBookmarks.map(parseBookmarkRow)

    interface RepoAgg {
      owner: string
      name: string
      fullName: string
      description: string
      purpose: string
      stars: number
      license: string | null
      primaryLanguage: string | null
      topics: Set<string>
      resourceType: ResourceType
      linkedBookmarkIds: Set<string>
      earliestSavedAt: string
      latestSavedAt: string
    }

    const aggMap = new Map<string, RepoAgg>()

    const extractRepoSpecificLine = (caption: string, owner: string, name: string): string => {
      if (!caption) return ''
      const lines = caption.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      const fullLower = `${owner}/${name}`.toLowerCase()
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const lower = line.toLowerCase()
        if (lower.includes(fullLower)) {
          const inlineRemainder = line
            .replace(/https?:\/\/\S+/g, '')
            .replace(new RegExp(`${owner}\\/${name}`, 'ig'), '')
            .replace(/^[\d•*>.:\-–—→\s]+|[\-–—→:\s]+$/g, '')
            .trim()
          if (inlineRemainder.length >= 16 && !/[\u4e00-\u9fff]/.test(inlineRemainder)) {
            return inlineRemainder.slice(0, 260)
          }

          // Check next 1-2 lines when the repo is a heading/bullet ("1. owner/repo →")
          const followParts: string[] = []
          for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
            const nextL = lines[j].trim()
            if (!nextL || /^https?:\/\/\S+$/i.test(nextL)) continue
            if (/^\d{1,2}[.)]\s+/.test(nextL) || /[a-z0-9_.-]+\/[a-z0-9_.-]+\s*→/i.test(nextL)) break
            if (/^\[Cita\s+@/i.test(nextL)) break
            const cleanNext = nextL.replace(/https?:\/\/\S+/g, '').trim()
            if (cleanNext && !/[\u4e00-\u9fff]/.test(cleanNext)) {
              followParts.push(cleanNext)
            }
            if (followParts.join(' ').length >= 140) break
          }
          if (followParts.length > 0) {
            return followParts.join(' ').slice(0, 260)
          }
        }
      }
      return ''
    }

    const registerRepo = (
      owner: string,
      name: string,
      bm: BookmarkItem,
      totalReposInBookmark: number,
      res?: LinkedResource
    ) => {
      const key = `${owner.toLowerCase()}/${name.toLowerCase()}`
      let entry = aggMap.get(key)
      if (!entry) {
        entry = {
          owner,
          name,
          fullName: `${owner}/${name}`,
          description: '',
          purpose: '',
          stars: 0,
          license: null,
          primaryLanguage: null,
          topics: new Set<string>(),
          resourceType: 'Otro / pendiente de clasificar',
          linkedBookmarkIds: new Set<string>(),
          earliestSavedAt: bm.savedAt || bm.publishedAt || new Date().toISOString(),
          latestSavedAt: bm.savedAt || bm.publishedAt || new Date().toISOString()
        }
        aggMap.set(key, entry)
      }

      entry.linkedBookmarkIds.add(bm.id)

      if (
        res?.description &&
        !res.description.startsWith('Repositorio en GitHub (') &&
        !/[\u4e00-\u9fff]/.test(res.description)
      ) {
        if (!entry.description || res.description.length > entry.description.length) {
          entry.description = res.description
        }
      }

      const lineMatch = extractRepoSpecificLine(bm.caption, owner, name)
      if (lineMatch && !entry.description) {
        entry.description = lineMatch
      }

      const cleanBmPurpose = bm.purpose && !/[\u4e00-\u9fff]/.test(bm.purpose) ? bm.purpose : ''
      if (totalReposInBookmark <= 2 && cleanBmPurpose) {
        if (!entry.description) entry.description = cleanBmPurpose
        if (!entry.purpose) entry.purpose = cleanBmPurpose
      } else if (!entry.purpose && lineMatch) {
        entry.purpose = lineMatch
      }

      if (typeof res?.stars === 'number' && res.stars > entry.stars) {
        entry.stars = res.stars
      }
      if (res?.license && !entry.license) {
        entry.license = res.license
      }

      for (const t of bm.topics || []) {
        if (t && t !== 'Sin clasificar') {
          entry.topics.add(t.toLowerCase().replace(/\s+/g, '-'))
        }
      }

      // Detect language hints from bookmark entities/caption if not set
      if (!entry.primaryLanguage) {
        const textHay = `${bm.caption} ${(bm.entities || []).join(' ')}`
        for (const lang of KNOWN_LANGUAGES) {
          const rx = new RegExp(`\\b${lang.replace(/[+]/g, '\\+')}\\b`, 'i')
          if (rx.test(textHay)) {
            entry.primaryLanguage = lang
            break
          }
        }
      }

      if (
        totalReposInBookmark === 1 &&
        entry.resourceType === 'Otro / pendiente de clasificar' &&
        bm.resourceType &&
        bm.resourceType !== 'Otro / pendiente de clasificar'
      ) {
        entry.resourceType = bm.resourceType
      }
    }

    for (const bm of bookmarks) {
      const bmGhRepos = (bm.resources || []).filter(r => r.kind === 'github_repo')
      const totalReposInBm = Math.max(1, bmGhRepos.length)
      for (const res of bmGhRepos) {
        const parsed = parseGitHubUrl(res.fullName || res.resolvedUrl || res.url)
        if (parsed) {
          registerRepo(parsed.owner, parsed.repo, bm, totalReposInBm, res)
        }
      }
      for (const link of bm.outgoingLinks || []) {
        if (link.toLowerCase().includes('github.com/')) {
          const parsed = parseGitHubUrl(link)
          if (parsed) {
            registerRepo(parsed.owner, parsed.repo, bm, totalReposInBm)
          }
        }
      }
      if (bm.platform === 'github' && bm.sourceUrl) {
        const parsed = parseGitHubUrl(bm.sourceUrl)
        if (parsed) {
          registerRepo(parsed.owner, parsed.repo, bm, 1)
        }
      }
    }

    const tx = db.transaction(() => {
      for (const [, agg] of aggMap.entries()) {
        const topicsArr = Array.from(agg.topics).slice(0, 10)
        const desc = agg.description || agg.purpose || ''

        upsertGalleryRepository({
          id: numericIdFromFullName(agg.fullName),
          owner: agg.owner,
          name: agg.name,
          fullName: agg.fullName,
          url: `https://github.com/${agg.fullName}`,
          avatarUrl: `https://github.com/${agg.owner}.png?size=128`,
          description: desc,
          explanation: agg.purpose || '',
          shortExplanationEs: agg.purpose || '',
          longExplanationEs: '',
          imageUrl: `https://opengraph.githubassets.com/1/${agg.owner}/${agg.name}`,
          imageSource: 'opengraph',
          stars: agg.stars,
          forks: 0,
          openIssues: 0,
          primaryLanguage: agg.primaryLanguage,
          languages: agg.primaryLanguage
            ? [{ name: agg.primaryLanguage, bytes: 100, percentage: 100 }]
            : [],
          topics: topicsArr,
          license: agg.license,
          createdAt: agg.earliestSavedAt,
          updatedAt: agg.latestSavedAt,
          pushedAt: agg.latestSavedAt,
          addedAt: agg.latestSavedAt,
          latestRelease: null,
          homepage: null,
          defaultBranch: 'main',
          resourceType: agg.resourceType,
          linkedBookmarkIds: Array.from(agg.linkedBookmarkIds)
        })
      }
    })

    tx()

    const totalRepos = (db.prepare('SELECT COUNT(*) as c FROM github_repos').get() as { c: number }).c
    return { totalRepos, linkedRepos: aggMap.size }
  } catch (err) {
    console.warn('[ATLAS DB] No se pudo sincronizar galería de GitHub:', err)
    return { totalRepos: 0, linkedRepos: 0 }
  }
}

export function parseProjectBlueprintRow(row: any): ProjectBlueprint {
  const safeArr = (val: string | null | undefined): string[] => {
    if (!val) return []
    try {
      const parsed = JSON.parse(val)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return {
    id: String(row.id),
    name: String(row.name || 'Proyecto sin nombre'),
    description: String(row.description || ''),
    goal: String(row.goal || ''),
    repoFullNames: safeArr(row.repo_full_names_json),
    bookmarkIds: safeArr(row.bookmark_ids_json),
    notes: String(row.notes || ''),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString())
  }
}

export function getAllProjectBlueprints(): ProjectBlueprint[] {
  try {
    const rows = db.prepare('SELECT * FROM project_blueprints ORDER BY updated_at DESC').all()
    return rows.map(parseProjectBlueprintRow)
  } catch {
    return []
  }
}

export function upsertProjectBlueprint(
  input: Partial<ProjectBlueprint> & { name: string }
): ProjectBlueprint {
  const now = new Date().toISOString()
  const id = input.id || `bp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const existingRow = db.prepare('SELECT * FROM project_blueprints WHERE id = ?').get(id) as any
  const existing = existingRow ? parseProjectBlueprintRow(existingRow) : null

  const finalBp: ProjectBlueprint = {
    id,
    name: input.name.trim() || existing?.name || 'Nuevo Proyecto IA',
    description: input.description !== undefined ? input.description : existing?.description || '',
    goal: input.goal !== undefined ? input.goal : existing?.goal || '',
    repoFullNames: Array.from(
      new Set(input.repoFullNames !== undefined ? input.repoFullNames : existing?.repoFullNames || [])
    ),
    bookmarkIds: Array.from(
      new Set(input.bookmarkIds !== undefined ? input.bookmarkIds : existing?.bookmarkIds || [])
    ),
    notes: input.notes !== undefined ? input.notes : existing?.notes || '',
    createdAt: existing?.createdAt || input.createdAt || now,
    updatedAt: now
  }

  db.prepare(`
    INSERT OR REPLACE INTO project_blueprints (
      id, name, description, goal, repo_full_names_json, bookmark_ids_json, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    finalBp.id,
    finalBp.name,
    finalBp.description,
    finalBp.goal,
    JSON.stringify(finalBp.repoFullNames),
    JSON.stringify(finalBp.bookmarkIds),
    finalBp.notes,
    finalBp.createdAt,
    finalBp.updatedAt
  )

  return finalBp
}

export function deleteProjectBlueprint(id: string): boolean {
  try {
    const res = db.prepare('DELETE FROM project_blueprints WHERE id = ?').run(id)
    return res.changes > 0
  } catch {
    return false
  }
}

export function seedDefaultBlueprintIfNeeded() {
  try {
    const count = (db.prepare('SELECT COUNT(*) as c FROM project_blueprints').get() as { c: number }).c
    if (count > 0) return

    const topRepos = db
      .prepare('SELECT full_name FROM github_repos ORDER BY stars DESC, repo_id ASC LIMIT 6')
      .all() as Array<{ full_name: string }>
    const repoNames = topRepos.map(r => r.full_name)
    if (repoNames.length === 0) return

    upsertProjectBlueprint({
      id: 'bp-starter-ai-stack',
      name: 'Stack Agentes, Skills & MCP para Desarrollo IA',
      description:
        'Blueprint inicial generado automáticamente con repositorios clave de tu galería para potenciar flujos con Claude Code, Cursor y Antigravity.',
      goal:
        'Integrar skills reutilizables, servidores MCP y subagentes especializados en nuestro entorno de desarrollo asistido por IA.',
      repoFullNames: repoNames,
      bookmarkIds: [],
      notes:
        'Puedes agregar o quitar repositorios desde la Galería de Repositorios y exportar este proyecto como PROMPT_MAESTRO.md o CLAUDE.md.'
    })
  } catch {}
}

export function getAllSkillNoteOverrides(): Map<
  string,
  { skillId: string; comments?: string; recommended?: any; updatedAt?: string }
> {
  const map = new Map<string, { skillId: string; comments?: string; recommended?: any; updatedAt?: string }>()
  try {
    const rows = db.prepare('SELECT * FROM repo_skill_notes').all() as Array<{
      skill_id: string
      comments: string
      recommended: string
      updated_at: string
    }>
    for (const r of rows) {
      map.set(r.skill_id, {
        skillId: r.skill_id,
        comments: r.comments,
        recommended: r.recommended || undefined,
        updatedAt: r.updated_at
      })
    }
  } catch {}
  return map
}

export function upsertSkillNoteOverride(input: {
  skillId: string
  comments?: string
  recommended?: string
}) {
  const now = new Date().toISOString()
  const existing = db
    .prepare('SELECT * FROM repo_skill_notes WHERE skill_id = ?')
    .get(input.skillId) as { comments?: string; recommended?: string } | undefined

  const nextComments = input.comments !== undefined ? input.comments : existing?.comments || ''
  const nextRecommended =
    input.recommended !== undefined ? input.recommended : existing?.recommended || ''

  db.prepare(`
    INSERT OR REPLACE INTO repo_skill_notes (skill_id, comments, recommended, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(input.skillId, nextComments, nextRecommended, now)

  return { skillId: input.skillId, comments: nextComments, recommended: nextRecommended, updatedAt: now }
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
