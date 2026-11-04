import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { DATA_DIR } from '@/lib/db'
import { parseImportText, normalizeRow } from '@/lib/importer'
import { insertBookmarksBatch } from '@/lib/bookmarks-repository'
import { INITIAL_BOOKMARKS } from '@/lib/sample-data'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''

    // 1. Handle JSON action requests (e.g., reimport local HAR or load sample data)
    if (contentType.includes('application/json')) {
      const body = await req.json()

      if (body.action === 'reimport-local-har') {
        const localHar = path.join(DATA_DIR, 'raw', 'x', 'x.com.initial.har')
        const localArchive = path.join(DATA_DIR, 'normalized', 'archive.json')

        if (fs.existsSync(localHar)) {
          const text = fs.readFileSync(localHar, 'utf8')
          const parsed = parseImportText(text, 'x.com.initial.har')
          const result = insertBookmarksBatch(parsed.items, {
            filename: 'data/raw/x/x.com.initial.har',
            kind: 'x_har',
            errors: parsed.errors,
            messages: parsed.messages
          })
          return NextResponse.json({ success: true, ...result })
        } else if (fs.existsSync(localArchive)) {
          const text = fs.readFileSync(localArchive, 'utf8')
          const parsed = parseImportText(text, 'archive.json')
          const result = insertBookmarksBatch(parsed.items, {
            filename: 'data/normalized/archive.json',
            kind: 'archive_json',
            errors: parsed.errors,
            messages: parsed.messages
          })
          return NextResponse.json({ success: true, ...result })
        } else {
          return NextResponse.json(
            { success: false, error: 'No se encontró data/raw/x/x.com.initial.har en el disco.' },
            { status: 404 }
          )
        }
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
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Seleccioná un archivo para importar.' }, { status: 400 })
    }

    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'El archivo seleccionado está vacío.' }, { status: 400 })
    }

    const safeName = file.name.replace(/[^\w.\-() ]+/g, '_')
    const ext = path.extname(safeName).toLowerCase()

    // Save raw file backup into data/raw/
    const subFolder = ext === '.zip' ? 'instagram' : ext === '.har' ? 'x' : 'imports'
    const rawDir = path.join(DATA_DIR, 'raw', subFolder)
    fs.mkdirSync(rawDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const rawDest = path.join(rawDir, `${stamp}_${safeName}`)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    fs.writeFileSync(rawDest, buffer)

    // Special handling for .zip files (Instagram official export ZIP)
    if (ext === '.zip') {
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
            error: 'No se encontraron publicaciones guardadas de Instagram dentro del archivo ZIP.'
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
        errors: Array.isArray(pyOut.errors) ? pyOut.errors.length : 0
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
      messages: parsed.messages
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
