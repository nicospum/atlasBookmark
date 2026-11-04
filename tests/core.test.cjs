const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { test, after } = require('node:test')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  module._compile(transpiled, filename)
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-tests-'))
process.env.ATLAS_DATA_DIR = temp

const { parseImportText, canonicalUrl, normalizeRow } = require('../lib/importer.ts')
const {
  analyzeContent,
  getTopicRulesMeta,
  saveTopicRulesWithSnapshot,
  revertTopicRulesFromSnapshot,
  semanticSearchBookmarks
} = require('../lib/ai-analyzer.ts')
const {
  getAllBookmarks,
  getBookmarkById,
  insertBookmarksBatch,
  updateBookmarksBatch,
  reclassifyAllBookmarks
} = require('../lib/bookmarks-repository.ts')
const { db } = require('../lib/db.ts')
const { buildWorkbook, AVAILABLE_COLUMNS, ALL_SHEETS } = require('../lib/excel-export.ts')
const XLSX = require('xlsx')

test('canonical URLs and malicious host rejection', () => {
  assert.equal(canonicalUrl('https://twitter.com/alice/status/123?s=20').url, 'https://x.com/alice/status/123')
  assert.equal(canonicalUrl('https://www.instagram.com/reel/AbC_1/?igsh=x').url, 'https://www.instagram.com/reel/AbC_1/')
  assert.equal(canonicalUrl('https://x.com.evil.example/a/status/123'), null)
  assert.equal(canonicalUrl('javascript:alert(1)'), null)
  assert.equal(canonicalUrl('https://x.com/alice'), null)
})

test('Meta export preserves timestamp without inventing text or publication date', () => {
  const r = parseImportText(
    JSON.stringify({
      saved_saved_media: [
        {
          title: 'alice',
          string_map_data: {
            'Saved on': { href: 'https://www.instagram.com/p/ABC/', timestamp: 1700000000 }
          }
        }
      ]
    }),
    'saved_posts.json'
  )
  assert.equal(r.items.length, 1)
  assert.equal(r.items[0].savedAt, '2023-11-14T22:13:20.000Z')
  assert.equal(r.items[0].caption, '')
  assert.equal(r.items[0].publishedAt, '')
  assert.equal(r.items[0].contentStatus, 'link-only')
})

test('CSV multiline quoting and X API expanded text', () => {
  const r = parseImportText(
    'url,caption,authorName\r\nhttps://x.com/a/status/555,"Diseño, con\nFigma y ""React""",A',
    'bookmarks.csv'
  )
  assert.match(r.items[0].caption, /\nFigma y "React"/)

  const api = {
    data: [
      {
        id: '999',
        text: 'Short',
        note_tweet: { text: 'Full article' },
        author_id: '7',
        created_at: '2026-01-01T00:00:00Z',
        attachments: { media_keys: ['m1'] }
      }
    ],
    includes: {
      users: [{ id: '7', name: 'Alice', username: 'alice' }],
      media: [{ media_key: 'm1', url: 'https://pbs.twimg.com/media/x.jpg' }]
    }
  }
  const item = parseImportText(JSON.stringify(api), 'x.json').items[0]
  assert.equal(item.caption, 'Full article')
  assert.equal(item.authorHandle, '@alice')
  assert.equal(item.savedAt, '')
  assert.equal(item.mediaUrls.length, 1)
})

test('Invalid records counted, malformed input rejected, archive JS never executed', () => {
  const r = parseImportText(
    JSON.stringify([{ url: 'https://x.com/a/status/321' }, { url: 'javascript:alert(1)' }]),
    'a.json'
  )
  assert.equal(r.items.length, 1)
  assert.equal(r.errors, 1)
  assert.throws(() => parseImportText('{bad', 'a.json'))
  assert.throws(() => parseImportText('process.exit()', 'a.js'))
  assert.equal(
    parseImportText('window.YTD.bookmark.part0 = [{"url":"https://x.com/a/status/777"}];', 'bookmark.js').items.length,
    1
  )
})

test('Whole-word topic rules, dynamic SHA-256 snapshot and 1-click revert', () => {
  assert.deepEqual(analyzeContent('viajar y cuidar la familia').topics, ['Sin clasificar'])
  assert.ok(analyzeContent('IA con React y diseño').topics.includes('IA'))
  assert.equal(analyzeContent('').language, 'No determinado')

  const initialMeta = getTopicRulesMeta()
  const updatedRules = { ...initialMeta.rules, 'Robótica': ['robot', 'ros2', 'humanoide'] }
  const afterSave = saveTopicRulesWithSnapshot(updatedRules)
  assert.equal(afterSave.hasBackup, true)
  assert.equal(afterSave.backupSha256, initialMeta.sha256)
  assert.ok(analyzeContent('Nuevo robot humanoide con ROS2').topics.includes('Robótica'))

  const afterRevert = revertTopicRulesFromSnapshot()
  assert.equal(afterRevert.sha256, initialMeta.sha256)
  assert.equal(afterRevert.hasBackup, false)
})

test('Conceptual semantic search ranks related posts above unrelated ones', () => {
  const items = [
    normalizeRow({ url: 'https://x.com/a/status/10', caption: 'Orquestación de agentes LLM con Claude y MCP' }, 't'),
    normalizeRow({ url: 'https://x.com/b/status/11', caption: 'Receta de cocina tradicional en Tokio' }, 't')
  ]
  const ranked = semanticSearchBookmarks(items, 'inteligencia artificial y modelos')
  assert.ok(ranked.length >= 1)
  assert.equal(ranked[0].id, 'x:10')
  assert.ok(ranked[0].semanticScore > 0.2)
})

test('SQLite deduplication, enrichment, FTS5 search and batch transactional updates', () => {
  const first = normalizeRow({ url: 'https://twitter.com/a/status/123' }, 'first.json')
  assert.equal(insertBookmarksBatch([first]).added, 1)
  assert.equal(insertBookmarksBatch([first]).duplicates, 1)

  // Batch update reviewed & manual topics in a single transaction
  const updatedCount = updateBookmarksBatch([first.id], { reviewed: true, topics: ['Mi tema'] })
  assert.equal(updatedCount, 1)

  const enriched = normalizeRow(
    { url: 'https://x.com/a/status/123?s=99', caption: 'Diseño de interfaces en Figma y Bauhaus', savedAt: '2026-01-01' },
    'new.json'
  )
  assert.equal(insertBookmarksBatch([enriched]).updated, 1)
  assert.equal(getBookmarkById(first.id).reviewed, true)
  assert.ok(getBookmarkById(first.id).topics.includes('Mi tema'))

  // Reclassify preserves manual classification
  const reclass = reclassifyAllBookmarks(false)
  assert.equal(reclass.preservedManual, 1)

  // FTS5 search finds "Bauhaus"
  const foundExact = getAllBookmarks({ search: 'Bauhaus', searchMode: 'exact' })
  assert.equal(foundExact.length, 1)
  assert.equal(foundExact[0].id, first.id)
})

test('XLSX round trip preserves literal text, Confianza column, selected sheets and multiple topics', () => {
  const item = normalizeRow(
    { url: 'https://x.com/a/status/888', caption: '=HYPERLINK("https://example.com")', topics: ['Uno', 'Dos'] },
    'test'
  )
  item.topics = ['Uno', 'Dos']
  item.confidence = 0.85

  assert.ok(AVAILABLE_COLUMNS.includes('Confianza'))
  assert.ok(AVAILABLE_COLUMNS.includes('Handle / Usuario'))

  const wb = buildWorkbook([item], { sheets: ALL_SHEETS, columns: AVAILABLE_COLUMNS })
  const round = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
  assert.deepEqual(round.SheetNames, ALL_SHEETS)
  assert.equal(round.Sheets.Todos.B2.t, 's')
  assert.equal(round.Sheets.Todos.B2.f, undefined)

  const rows = XLSX.utils.sheet_to_json(round.Sheets['Por tema'])
  assert.equal(rows.length, 2)
  assert.equal(rows[0]['Confianza'], '85%')

  const filtered = buildWorkbook([{ ...item, reviewed: false }], {
    sheets: ['Todos'],
    columns: ['Autor'],
    onlyReviewed: true
  })
  assert.equal(XLSX.utils.sheet_to_json(filtered.Sheets.Todos).length, 0)
  assert.throws(() => buildWorkbook([item], { sheets: ['invalid'], columns: ['Autor'] }))
})

after(() => {
  try {
    db.close()
  } catch {}
  if (path.resolve(path.dirname(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('atlas-tests-')) {
    throw Error('Invalid temp')
  }
  fs.rmSync(temp, { recursive: true, force: true })
})
