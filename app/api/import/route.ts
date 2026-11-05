import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { DATA_DIR, BUNDLED_DATA_DIR } from '@/lib/db'
import {
  parseImportText,
  normalizeRow,
  sanitizeHarJsonString,
  parseWhatsAppChatText,
  whatsAppMessagesToRows
} from '@/lib/importer'
import { insertBookmarksBatch } from '@/lib/bookmarks-repository'
import { INITIAL_BOOKMARKS } from '@/lib/sample-data'
import { BookmarkItem, WhatsAppParsedMessage } from '@/lib/types'

export const dynamic = 'force-dynamic'

function extractTextFilesFromZipViaPython(zipPath: string): Array<{ name: string; content: string }> {
  const pyCode = `
import sys, json, zipfile
sys.stdout.reconfigure(encoding='utf-8')
zpath = sys.argv[1]
out = []
with zipfile.ZipFile(zpath, 'r') as zf:
    for info in zf.infolist():
        if info.is_dir(): continue
        name = info.filename
        if '..' in name or name.startswith('/') or name.startswith('\\\\'): continue
        if name.lower().endswith('.txt') and info.file_size <= 25 * 1024 * 1024:
            raw = zf.read(info)
            out.append({'name': name, 'content': raw.decode('utf-8', errors='replace')})
print(json.dumps(out, ensure_ascii=False))
`
  try {
    const stdout = execFileSync('python', ['-c', pyCode, zipPath], {
      encoding: 'utf8',
      maxBuffer: 30 * 1024 * 1024
    })
    return JSON.parse(stdout)
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''

    // 1. Handle JSON action requests (local HAR sync, WhatsApp preview/import, JSON backup restore)
    if (contentType.includes('application/json')) {
      const body = await req.json()

      if (body.action === 'reimport-local-har') {
        const searchDirs = Array.from(
          new Set([path.join(DATA_DIR, 'raw', 'x'), path.join(BUNDLED_DATA_DIR, 'raw', 'x')])
        )
        const harFiles: string[] = []
        for (const dir of searchDirs) {
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.toLowerCase().endsWith('.har')) {
                const full = path.join(dir, f)
                if (fs.statSync(full).size > 0) {
                  harFiles.push(full)
                }
              }
            }
          }
        }

        if (harFiles.length > 0) {
          const allItemsMap = new Map<string, BookmarkItem>()
          let totalEntries = 0
          let totalRecognized = 0
          let totalSkipped = 0

          for (const harPath of harFiles) {
            try {
              const text = fs.readFileSync(harPath, 'utf8')
              const parsed = parseImportText(text, path.basename(harPath))
              totalEntries += parsed.stages.networkEntries
              totalRecognized += parsed.stages.recognizedResponses
              totalSkipped += parsed.stages.incidentalSkipped
              for (const item of parsed.items) {
                const existing = allItemsMap.get(item.id)
                if (!existing || item.caption.length > existing.caption.length) {
                  allItemsMap.set(item.id, item)
                }
              }
            } catch {}
          }

          const combinedItems = Array.from(allItemsMap.values())
          if (combinedItems.length > 0) {
            const result = insertBookmarksBatch(combinedItems, {
              filename: `data/raw/x (${harFiles.length} archivos HAR)`,
              kind: 'x_har',
              stages: {
                networkEntries: totalEntries,
                recognizedResponses: totalRecognized,
                emptyBodyResponses: 0,
                incidentalSkipped: totalSkipped,
                detectedItems: combinedItems.length,
                errors: 0,
                diagnosticCase: 'ok'
              }
            })
            return NextResponse.json({ success: true, ...result })
          }
        }

        const localArchive = path.join(DATA_DIR, 'normalized', 'archive.json')
        if (fs.existsSync(localArchive)) {
          const text = fs.readFileSync(localArchive, 'utf8')
          const parsed = parseImportText(text, 'archive.json')
          const result = insertBookmarksBatch(parsed.items, {
            filename: 'data/normalized/archive.json',
            kind: 'archive_json',
            errors: parsed.errors,
            messages: parsed.messages,
            stages: parsed.stages
          })
          return NextResponse.json({ success: true, ...result })
        }

        return NextResponse.json(
          { success: false, error: 'No se encontraron capturas HAR locales en data/raw/x ni archive.json.' },
          { status: 404 }
        )
      }

      if (body.action === 'preview-whatsapp') {
        const text = String(body.text || '').trim()
        if (!text) {
          return NextResponse.json(
            { success: false, error: 'Pegá al menos un mensaje o exportación de chat de WhatsApp.' },
            { status: 400 }
          )
        }
        const messages = parseWhatsAppChatText(text)
        return NextResponse.json({
          success: true,
          totalMessages: messages.length,
          withLinksCount: messages.filter(m => m.hasLinks).length,
          messages
        })
      }

      if (body.action === 'import-whatsapp') {
        let messages: WhatsAppParsedMessage[] = []
        if (Array.isArray(body.messages) && body.messages.length > 0) {
          messages = body.messages
        } else if (typeof body.text === 'string' && body.text.trim()) {
          const allParsed = parseWhatsAppChatText(body.text)
          messages = body.onlyWithLinks ? allParsed.filter(m => m.hasLinks) : allParsed
        }

        if (messages.length === 0) {
          return NextResponse.json(
            { success: false, error: 'No hay mensajes de WhatsApp seleccionados para importar.' },
            { status: 400 }
          )
        }

        const rows = whatsAppMessagesToRows(messages, body.filename || 'whatsapp_paste')
        const items = rows
          .map(r => normalizeRow(r, body.filename || 'whatsapp_paste'))
          .filter((i): i is BookmarkItem => Boolean(i))

        const result = insertBookmarksBatch(items, {
          filename: body.filename || 'WhatsApp (mensajes)',
          kind: 'whatsapp',
          stages: {
            networkEntries: messages.length,
            recognizedResponses: 1,
            emptyBodyResponses: 0,
            incidentalSkipped: 0,
            detectedItems: items.length,
            errors: 0,
            diagnosticCase: 'ok'
          }
        })
        return NextResponse.json({ success: true, ...result })
      }

      if (body.action === 'load-sample-data') {
        const result = insertBookmarksBatch(INITIAL_BOOKMARKS, {
          filename: 'sample-data',
          kind: 'demo'
        })
        return NextResponse.json({ success: true, ...result })
      }

      return NextResponse.json({ success: false, error: 'Acción no reconocida.' }, { status: 400 })
    }

    // 2. Handle Multipart FormData File Upload (.har, .json, .zip, .js, .csv, .txt, .html)
    const form = await req.formData()
    const file = form.get('file')
    const previewWhatsApp = form.get('previewWhatsApp') === 'true'

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Seleccioná un archivo para importar.' }, { status: 400 })
    }

    if (file.size === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `El archivo "${file.name}" está vacío (0 bytes). Si exportaste un HAR desde Chrome DevTools tras mucho scroll con video, filtrá primero por "Fetch/XHR" en la pestaña Network antes de exportar el HAR.`,
          diagnosticCase: 'empty_file'
        },
        { status: 400 }
      )
    }

    const safeName = file.name.replace(/[^\w.\-() ]+/g, '_')
    const ext = path.extname(safeName).toLowerCase()

    // Save raw file backup into data/raw/ (sanitizing HAR headers first)
    const subFolder = ext === '.zip' ? 'instagram' : ext === '.har' ? 'x' : 'imports'
    const rawDir = path.join(DATA_DIR, 'raw', subFolder)
    fs.mkdirSync(rawDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const rawDest = path.join(rawDir, `${stamp}_${safeName}`)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (ext === '.har') {
      const sanitizedText = sanitizeHarJsonString(buffer.toString('utf8'))
      fs.writeFileSync(rawDest, sanitizedText, 'utf8')
    } else {
      fs.writeFileSync(rawDest, buffer)
    }

    // If previewWhatsApp is requested for a .txt or .zip file
    if (previewWhatsApp && (ext === '.txt' || ext === '.zip')) {
      let combinedTxt = ''
      if (ext === '.txt') {
        combinedTxt = buffer.toString('utf8')
      } else {
        const txtFiles = extractTextFilesFromZipViaPython(rawDest)
        combinedTxt = txtFiles.map(t => t.content).join('\n')
      }
      const messages = parseWhatsAppChatText(combinedTxt)
      return NextResponse.json({
        success: true,
        filename: safeName,
        totalMessages: messages.length,
        withLinksCount: messages.filter(m => m.hasLinks).length,
        messages
      })
    }

    // Special handling for .zip files (Instagram official export ZIP or WhatsApp Chat ZIP)
    if (ext === '.zip') {
      // First check if it's a WhatsApp chat ZIP containing .txt files
      const txtFiles = extractTextFilesFromZipViaPython(rawDest)
      const waMessages = txtFiles.flatMap(t => parseWhatsAppChatText(t.content))
      if (waMessages.length > 0 && (/whatsapp|chat/i.test(safeName) || txtFiles.some(t => /_chat\.txt|whatsapp/i.test(t.name)))) {
        const withLinks = waMessages.filter(m => m.hasLinks)
        const selected = withLinks.length > 0 ? withLinks : waMessages
        const rows = whatsAppMessagesToRows(selected, safeName)
        const items = rows
          .map(r => normalizeRow(r, safeName))
          .filter((i): i is BookmarkItem => Boolean(i))

        const result = insertBookmarksBatch(items, {
          filename: safeName,
          kind: 'whatsapp_zip',
          stages: {
            networkEntries: waMessages.length,
            recognizedResponses: txtFiles.length,
            emptyBodyResponses: 0,
            incidentalSkipped: waMessages.length - selected.length,
            detectedItems: items.length,
            errors: 0,
            diagnosticCase: 'ok'
          }
        })
        return NextResponse.json({ success: true, ...result })
      }

      const pyScript = path.join(process.cwd(), 'scripts', 'import_instagram_export.py')
      if (!fs.existsSync(pyScript)) {
        return NextResponse.json(
          { success: false, error: 'Descomprimí el archivo ZIP primero o verificá scripts/import_instagram_export.py.' },
          { status: 400 }
        )
      }

      const stdout = execFileSync('python', [pyScript, rawDest], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024
      })
      const pyOut = JSON.parse(stdout)
      const records = Array.isArray(pyOut.records) ? pyOut.records : []
      if (records.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'No se encontraron publicaciones guardadas de Instagram ni chats de WhatsApp dentro del archivo ZIP.'
          },
          { status: 422 }
        )
      }

      const items = records
        .map((r: any) => normalizeRow(r, safeName))
        .filter((i: any): i is NonNullable<typeof i> => Boolean(i))

      const result = insertBookmarksBatch(items, {
        filename: safeName,
        kind: 'instagram_zip',
        errors: Array.isArray(pyOut.errors) ? pyOut.errors.length : 0,
        stages: {
          networkEntries: records.length,
          recognizedResponses: 1,
          emptyBodyResponses: 0,
          incidentalSkipped: 0,
          detectedItems: items.length,
          errors: Array.isArray(pyOut.errors) ? pyOut.errors.length : 0,
          diagnosticCase: 'ok'
        }
      })

      return NextResponse.json({ success: true, ...result })
    }

    // Standard text-based formats (.har, .json, .js, .csv, .txt, .html)
    const text = buffer.toString('utf8')
    const parsed = parseImportText(text, safeName)
    const result = insertBookmarksBatch(parsed.items, {
      filename: safeName,
      kind: ext === '.har' ? 'har_capture' : ext.replace('.', '') || 'file_import',
      errors: parsed.errors,
      messages: parsed.messages,
      stages: parsed.stages
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('[ATLAS IMPORT ERROR]:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'No se pudo procesar el archivo.' },
      { status: 400 }
    )
  }
}
