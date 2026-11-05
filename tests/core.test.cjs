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

const {
  parseImportText,
  extractFromHarWithMetrics,
  canonicalUrl,
  normalizeRow,
  sanitizeHarJsonString,
  parseWhatsAppChatText,
  whatsAppMessagesToRows
} = require('../lib/importer.ts')
const {
  analyzeContent,
  getTopicRulesMeta,
  saveTopicRulesWithSnapshot,
  revertTopicRulesFromSnapshot,
  semanticSearchBookmarks
} = require('../lib/ai-analyzer.ts')
const {
  isSafeExternalUrl,
  classifyGitHubUrl
} = require('../lib/resource-investigator.ts')
const {
  getAllBookmarks,
  getBookmarkById,
  insertBookmarksBatch,
  updateBookmark,
  updateBookmarksBatch,
  reclassifyAllBookmarks,
  getAllGalleryRepositories,
  getGalleryRepositoryByFullName,
  saveGalleryRepoWithBookmark,
  syncBookmarksToGitHubGallery
} = require('../lib/bookmarks-repository.ts')
const {
  parseGitHubUrl,
  extractGitHubUrlsFromText,
  parseGalleryImportJson,
  galleryRepoToBookmarkItem,
  explainRepoWithAiServer,
  askGalleryAssistantServer
} = require('../lib/github-gallery.ts')
const { db } = require('../lib/db.ts')
const {
  buildWorkbook,
  generateCsvString,
  buildJsonBackupV2,
  TABLE_DEFAULT_COLUMNS,
  AVAILABLE_COLUMNS,
  ALL_SHEETS
} = require('../lib/excel-export.ts')
const XLSX = require('xlsx')

test('canonical URLs, WhatsApp internal URIs and malicious host rejection', () => {
  assert.equal(canonicalUrl('https://twitter.com/alice/status/123?s=20').url, 'https://x.com/alice/status/123')
  assert.equal(canonicalUrl('https://www.instagram.com/reel/AbC_1/?igsh=x').url, 'https://www.instagram.com/reel/AbC_1/')
  assert.equal(canonicalUrl('whatsapp://message/abc123def456').platform, 'whatsapp')
  assert.equal(canonicalUrl('whatsapp://message/abc123def456').key, 'abc123def456')
  assert.equal(canonicalUrl('https://x.com.evil.example/a/status/123'), null)
  assert.equal(canonicalUrl('javascript:alert(1)'), null)
  assert.equal(canonicalUrl('https://x.com/alice'), null)
})

test('SSRF protection blocks localhost, private IPs and cloud metadata endpoints', () => {
  assert.equal(isSafeExternalUrl('https://github.com/pbakaus/impeccable'), true)
  assert.equal(isSafeExternalUrl('http://localhost:3000/api'), false)
  assert.equal(isSafeExternalUrl('http://127.0.0.1:8080/secret'), false)
  assert.equal(isSafeExternalUrl('http://192.168.1.10/admin'), false)
  assert.equal(isSafeExternalUrl('http://10.0.0.5/internal'), false)
  assert.equal(isSafeExternalUrl('http://169.254.169.254/latest/meta-data/'), false)
  assert.equal(isSafeExternalUrl('file:///etc/passwd'), false)

  const ghRepo = classifyGitHubUrl('https://github.com/pbakaus/impeccable/tree/main/src')
  assert.equal(ghRepo.kind, 'github_repo')
  assert.equal(ghRepo.fullName, 'pbakaus/impeccable')
  assert.equal(classifyGitHubUrl('https://github.com/trending').kind, 'github_other')
  assert.equal(classifyGitHubUrl('https://github.com/pbakaus').kind, 'github_other')
})

test('HAR capture extraction: base64 GraphQL Bookmarks, X Article, GitHub Card, Quoted Tweet & noise filtering', () => {
  const graphqlPayload = {
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  entryId: 'tweet-2001',
                  sortIndex: '100',
                  content: {
                    entryType: 'TimelineTimelineItem',
                    itemContent: {
                      tweet_results: {
                        result: {
                          __typename: 'Tweet',
                          rest_id: '2001',
                          core: {
                            user_results: {
                              result: {
                                core: { name: 'Paul Bakaus', screen_name: 'pbakaus' }
                              }
                            }
                          },
                          legacy: {
                            id_str: '2001',
                            full_text: 'Lanzamos Impeccable para Claude Code y Cursor https://t.co/xyz',
                            created_at: 'Wed Nov 04 12:00:00 +0000 2026',
                            entities: {
                              urls: [{ expanded_url: 'https://impeccable.style' }]
                            }
                          },
                          card: {
                            legacy: {
                              binding_values: [
                                { key: 'title', value: { string_value: 'GitHub - pbakaus/impeccable: Design skill package for AI agents' } },
                                { key: 'description', value: { string_value: '18 design skills and commands for Claude Code, Cursor and Gemini CLI.' } },
                                { key: 'card_url', value: { string_value: 'https://github.com/pbakaus/impeccable' } }
                              ]
                            }
                          },
                          quoted_status_result: {
                            result: {
                              __typename: 'Tweet',
                              rest_id: '1999',
                              core: {
                                user_results: {
                                  result: {
                                    core: { name: 'Quoted Dev', screen_name: 'quoteddev' }
                                  }
                                }
                              },
                              legacy: {
                                id_str: '1999',
                                full_text: 'Contexto citado sobre https://github.com/pbakaus/impeccable',
                                entities: {
                                  urls: [{ expanded_url: 'https://github.com/pbakaus/impeccable' }]
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                {
                  entryId: 'SidebarUserRecommendations-99',
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          __typename: 'Tweet',
                          rest_id: '8888',
                          legacy: { id_str: '8888', full_text: 'Ruido incidental que no debe importarse' }
                        }
                      }
                    }
                  }
                },
                {
                  entryId: 'cursor-bottom-1',
                  content: { value: 'abc' }
                }
              ]
            }
          ]
        }
      }
    }
  }

  const base64Body = Buffer.from(JSON.stringify(graphqlPayload), 'utf8').toString('base64')
  const har = {
    log: {
      entries: [
        {
          request: {
            url: 'https://x.com/i/api/graphql/abc123/Bookmarks?variables=%7B%7D',
            headers: [
              { name: 'Cookie', value: 'auth_token=secret123' },
              { name: 'Authorization', value: 'Bearer secret' }
            ]
          },
          response: {
            status: 200,
            content: {
              mimeType: 'application/json',
              encoding: 'base64',
              text: base64Body
            }
          }
        }
      ]
    }
  }

  // Sanitize HAR strips cookies and authorization headers
  const sanitized = JSON.parse(sanitizeHarJsonString(JSON.stringify(har)))
  assert.equal(sanitized.log.entries[0].request.headers.length, 0)

  const parsed = parseImportText(JSON.stringify(har), 'capture.har')
  assert.equal(parsed.stages.networkEntries, 1)
  assert.equal(parsed.stages.recognizedResponses, 1)
  assert.equal(parsed.stages.incidentalSkipped, 2) // SidebarUserRecommendations + cursor
  assert.equal(parsed.items.length, 1) // Only top-level tweet-2001, NOT quoted tweet 1999 or noise 8888

  const item = parsed.items[0]
  assert.equal(item.id, 'x:2001')
  assert.ok(item.outgoingLinks.includes('https://github.com/pbakaus/impeccable'))
  assert.ok(item.caption.includes('pbakaus/impeccable'))
  assert.ok(item.caption.includes('@quoteddev'))
  assert.match(item.title, /^pbakaus\/impeccable/)
  assert.ok(item.resources.some(r => r.fullName === 'pbakaus/impeccable'))
})

test('HAR diagnostic errors for empty file, invalid JSON, 0 Bookmarks endpoints, and empty bodies', () => {
  assert.throws(() => parseImportText('   ', 'empty.har'), /0 bytes/i)

  const noEndpointsHar = {
    log: {
      entries: [
        {
          request: { url: 'https://video.twimg.com/ext_tw_video/123.mp4' },
          response: { status: 200, content: { mimeType: 'video/mp4', text: '' } }
        }
      ]
    }
  }
  const noEpRes = extractFromHarWithMetrics(noEndpointsHar, 'video_only.har')
  assert.equal(noEpRes.metrics.diagnosticCase, 'har_no_bookmark_responses')
  assert.equal(noEpRes.rows.length, 0)

  const emptyBodyHar = {
    log: {
      entries: [
        {
          request: { url: 'https://x.com/i/api/graphql/xyz/Bookmarks' },
          response: { status: 200, content: { mimeType: 'application/json', text: '' } }
        }
      ]
    }
  }
  const emptyBodyRes = extractFromHarWithMetrics(emptyBodyHar, 'empty_body.har')
  assert.equal(emptyBodyRes.metrics.diagnosticCase, 'har_empty_bodies')
  assert.equal(emptyBodyRes.metrics.emptyBodyResponses, 1)
})

test('Two bookmarks referencing the same GitHub repository preserve both posts and share resource metadata', () => {
  const postA = normalizeRow(
    {
      url: 'https://x.com/dev1/status/3001',
      authorName: 'Dev Uno',
      authorHandle: '@dev1',
      caption: 'Cómo uso https://github.com/pbakaus/impeccable para auditar UI en Cursor'
    },
    'postA.json'
  )
  const postB = normalizeRow(
    {
      url: 'https://x.com/dev2/status/3002',
      authorName: 'Dev Dos',
      authorHandle: '@dev2',
      caption: 'Comparativa de skills de diseño con https://github.com/pbakaus/impeccable en Claude Code'
    },
    'postB.json'
  )

  const res = insertBookmarksBatch([postA, postB])
  assert.equal(res.added, 2)

  const savedA = getBookmarkById('x:3001')
  const savedB = getBookmarkById('x:3002')
  assert.ok(savedA && savedB)
  assert.notEqual(savedA.id, savedB.id)
  assert.match(savedA.caption, /auditar UI en Cursor/)
  assert.match(savedB.caption, /Comparativa de skills/)
  assert.equal(savedA.resources[0].fullName, 'pbakaus/impeccable')
  assert.equal(savedB.resources[0].fullName, 'pbakaus/impeccable')
})

test('Manual edits on title, purpose, resourceType, evaluation and notes are protected across re-import and reclassify', () => {
  const initial = normalizeRow(
    {
      url: 'https://x.com/alice/status/4001',
      caption: 'Librería experimental para agentes con https://github.com/acme/agent-kit'
    },
    'init.json'
  )
  insertBookmarksBatch([initial])

  const edited = updateBookmark('x:4001', {
    title: 'Mi Título Curado Manualmente',
    purpose: 'Mi explicación manual de para qué sirve este kit.',
    resourceType: 'Agente o workflow',
    notes: 'Revisar el fin de semana para integrarlo.',
    topics: ['IA', 'Agentes IA']
  })

  assert.equal(edited.title, 'Mi Título Curado Manualmente')
  assert.equal(edited.notes, 'Revisar el fin de semana para integrarlo.')
  assert.equal(edited.classificationStatus, 'manual')
  assert.ok(edited.manualFields.includes('title'))
  assert.ok(edited.manualFields.includes('purpose'))

  // Re-import the same bookmark from another file: manual fields must remain intact
  const reimported = normalizeRow(
    {
      url: 'https://x.com/alice/status/4001',
      caption: 'Librería experimental para agentes con https://github.com/acme/agent-kit (texto actualizado)'
    },
    'second.json'
  )
  insertBookmarksBatch([reimported])

  const afterReimport = getBookmarkById('x:4001')
  assert.equal(afterReimport.title, 'Mi Título Curado Manualmente')
  assert.equal(afterReimport.purpose, 'Mi explicación manual de para qué sirve este kit.')
  assert.equal(afterReimport.notes, 'Revisar el fin de semana para integrarlo.')

  // Reclassify all (force = false) preserves manual fields
  reclassifyAllBookmarks(false)
  const afterReclassify = getBookmarkById('x:4001')
  assert.equal(afterReclassify.title, 'Mi Título Curado Manualmente')
  assert.equal(afterReclassify.purpose, 'Mi explicación manual de para qué sirve este kit.')
})

test('WhatsApp chat parsing, phone number anonymization and import without fake HTTP URLs', () => {
  const sampleChat = [
    '[04/11/2026, 14:30:12] +54 9 11 4455-6677: Mirá este servidor MCP para automatizar el navegador https://github.com/microsoft/playwright-mcp',
    '[04/11/2026, 14:31:00] Nico: Gracias! Lo guardo.',
    '04/11/2026, 14:35 - +54 9 11 4455-6677: También te paso la doc oficial https://modelcontextprotocol.io/introduction'
  ].join('\n')

  const messages = parseWhatsAppChatText(sampleChat)
  assert.equal(messages.length, 3)
  // Phone number anonymized to last 4 digits
  assert.equal(messages[0].sender, 'Contacto WA (•••6677)')
  assert.equal(messages[0].hasLinks, true)
  assert.equal(messages[1].hasLinks, false)

  // Convert only messages with links into rows
  const rows = whatsAppMessagesToRows(messages.filter(m => m.hasLinks), 'WhatsApp Chat.txt')
  assert.equal(rows.length, 2)

  const items = rows.map(r => normalizeRow(r, 'WhatsApp Chat.txt')).filter(Boolean)
  assert.equal(items.length, 2)
  assert.ok(items[0].sourceUrl.startsWith('whatsapp://message/'))
  assert.equal(items[0].platform, 'whatsapp')
  assert.match(items[0].title, /^microsoft\/playwright-mcp/)
  assert.equal(items[0].resourceType, 'Servidor MCP o conector')

  const dbRes = insertBookmarksBatch(items)
  assert.equal(dbRes.added, 2)
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

  // FTS5 search finds "Bauhaus"
  const foundExact = getAllBookmarks({ search: 'Bauhaus', searchMode: 'exact' })
  assert.equal(foundExact.length, 1)
  assert.equal(foundExact[0].id, first.id)
})

test('Table, CSV, XLSX and JSON Backup v2 round trip preserve literal text and 8 default columns', () => {
  const item = normalizeRow(
    { url: 'https://x.com/a/status/888', caption: '=HYPERLINK("https://example.com")', topics: ['Uno', 'Dos'] },
    'test'
  )
  item.topics = ['Uno', 'Dos']
  item.confidence = 0.85

  assert.equal(TABLE_DEFAULT_COLUMNS.length, 8)
  assert.ok(AVAILABLE_COLUMNS.includes('Confianza'))
  assert.ok(AVAILABLE_COLUMNS.includes('Handle / Usuario'))

  // CSV matches TABLE_DEFAULT_COLUMNS and escapes formula injection
  const csv = generateCsvString([item], { columns: TABLE_DEFAULT_COLUMNS })
  assert.ok(csv.includes('Nombre / recurso,Para qué sirve,Tipo,Área / tema,Enlaces útiles,Evaluación breve,Estado del análisis,Origen'))

  // JSON Backup v2 round trip re-import
  const backupJson = JSON.stringify(buildJsonBackupV2([item]))
  const restored = parseImportText(backupJson, 'atlas-backup-v2.json')
  assert.equal(restored.items.length, 1)
  assert.equal(restored.items[0].id, 'x:888')

  const wb = buildWorkbook([item], { sheets: ALL_SHEETS, columns: ['ID', 'Texto completo', 'Confianza'] })
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

test('GitHub Visual Gallery integration: bidirectional sync, bulk text extraction, JSON v2.0 import and AI Spanish explanations', async () => {
  // 1. URL parsing & bulk text extraction
  assert.deepEqual(parseGitHubUrl('https://github.com/anthropics/skills.git'), {
    owner: 'anthropics',
    repo: 'skills'
  })
  assert.equal(parseGitHubUrl('https://github.com/trending'), null)

  const extracted = extractGitHubUrlsFromText(
    'Te recomiendo mirar https://github.com/anthropics/skills y también github.com/modelcontextprotocol/servers).'
  )
  assert.equal(extracted.length, 2)
  assert.equal(extracted[0].cleanUrl, 'https://github.com/anthropics/skills')
  assert.equal(extracted[1].cleanUrl, 'https://github.com/modelcontextprotocol/servers')

  // 2. Sync from saved bookmarks into github_repos table
  const syncRes = syncBookmarksToGitHubGallery()
  assert.ok(syncRes.totalRepos >= 2)

  const galleryRepos = getAllGalleryRepositories()
  const impeccableRepo = getGalleryRepositoryByFullName('pbakaus/impeccable')
  assert.ok(impeccableRepo)
  assert.equal(impeccableRepo.fullName, 'pbakaus/impeccable')
  // Both x:3001 and x:3002 from earlier test must be linked to pbakaus/impeccable
  assert.ok(impeccableRepo.linkedBookmarkIds.includes('x:3001'))
  assert.ok(impeccableRepo.linkedBookmarkIds.includes('x:3002'))

  // 3. Direct gallery repo save creates/updates a first-class BookmarkItem (platform === 'github')
  const parsedGallery = parseGalleryImportJson(
    JSON.stringify({
      version: '2.0',
      repositories: [
        {
          id: 90001,
          owner: 'VoltAgent',
          name: 'awesome-claude-code-subagents',
          fullName: 'VoltAgent/awesome-claude-code-subagents',
          url: 'https://github.com/VoltAgent/awesome-claude-code-subagents',
          description: 'Curated subagents and skills for Claude Code.',
          stars: 4200,
          forks: 310,
          primaryLanguage: 'TypeScript',
          topics: ['claude-code', 'subagents', 'skills']
        }
      ]
    })
  )
  assert.equal(parsedGallery.repositories.length, 1)
  const savedGalleryRepo = saveGalleryRepoWithBookmark(parsedGallery.repositories[0])
  assert.equal(savedGalleryRepo.fullName, 'VoltAgent/awesome-claude-code-subagents')
  assert.ok(savedGalleryRepo.linkedBookmarkIds.includes('github:voltagent/awesome-claude-code-subagents'))

  const linkedBm = getBookmarkById('github:voltagent/awesome-claude-code-subagents')
  assert.ok(linkedBm)
  assert.equal(linkedBm.platform, 'github')
  assert.ok(linkedBm.evaluation.includes('4,200') || linkedBm.evaluation.includes('4.200'))

  // 4. Deterministic Spanish AI fallback explanation & gallery assistant
  const expl = await explainRepoWithAiServer(savedGalleryRepo, 'deterministic')
  assert.ok(expl.shortExplanationEs.length > 10)
  assert.ok(expl.longExplanationEs.includes('VoltAgent/awesome-claude-code-subagents'))

  const chatReply = await askGalleryAssistantServer({
    repos: getAllGalleryRepositories(),
    question: '¿Qué repositorios tengo para subagentes o skills de Claude Code?',
    provider: 'deterministic'
  })
  assert.ok(chatReply.includes('VoltAgent/awesome-claude-code-subagents') || chatReply.includes('pbakaus/impeccable'))
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
