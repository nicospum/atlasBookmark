import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { DATA_DIR } from '@/lib/db'
import { getAllBookmarks, getBookmarkById, updateBookmark } from '@/lib/bookmarks-repository'
import { BookmarkItem } from '@/lib/types'

export const dynamic = 'force-dynamic'

function sanitizeFileSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function guessExtension(url: string, contentType?: string | null): string {
  if (contentType) {
    if (contentType.includes('png')) return '.png'
    if (contentType.includes('webp')) return '.webp'
    if (contentType.includes('gif')) return '.gif'
    if (contentType.includes('mp4') || contentType.includes('video')) return '.mp4'
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg'
  }
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4'].includes(ext)) return ext
  } catch {}
  return '.jpg'
}

async function archiveItemMedia(item: BookmarkItem): Promise<{
  downloaded: number
  failed: number
  mediaPaths: string[]
  mediaStatus: string
}> {
  if (!item.mediaUrls || item.mediaUrls.length === 0) {
    return { downloaded: 0, failed: 0, mediaPaths: [], mediaStatus: 'not_requested' }
  }

  const mediaDir = path.join(DATA_DIR, 'media')
  fs.mkdirSync(mediaDir, { recursive: true })

  const savedPaths: string[] = [...(item.mediaPaths || [])]
  let downloaded = 0
  let failed = 0

  for (let i = 0; i < item.mediaUrls.length; i++) {
    const url = item.mediaUrls[i]
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      })
      if (!res.ok) {
        failed++
        continue
      }
      const ext = guessExtension(url, res.headers.get('content-type'))
      const fileName = `${sanitizeFileSegment(item.id)}_${i}${ext}`
      const destPath = path.join(mediaDir, fileName)
      const buf = Buffer.from(await res.arrayBuffer())
      fs.writeFileSync(destPath, buf)
      const relPath = `data/media/${fileName}`
      if (!savedPaths.includes(relPath)) {
        savedPaths.push(relPath)
      }
      downloaded++
    } catch {
      failed++
    }
  }

  const mediaStatus =
    downloaded > 0 && failed === 0
      ? 'downloaded'
      : downloaded > 0
      ? 'partial'
      : 'referenced'

  updateBookmark(item.id, {
    mediaPaths: savedPaths,
    mediaStatus
  })

  return { downloaded, failed, mediaPaths: savedPaths, mediaStatus }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    if (body.id) {
      const item = getBookmarkById(String(body.id))
      if (!item) {
        return NextResponse.json({ success: false, error: 'Guardado no encontrado' }, { status: 404 })
      }
      const result = await archiveItemMedia(item)
      const updated = getBookmarkById(item.id)
      return NextResponse.json({
        success: true,
        ...result,
        item: updated,
        message:
          result.downloaded > 0
            ? `Se archivaron ${result.downloaded} archivo(s) en data/media/ (${result.mediaStatus}).`
            : 'No se pudo descargar desde la CDN remota (URL expirada o sin conexión); se conserva la referencia original.'
      })
    }

    if (body.batch) {
      const candidates = getAllBookmarks({ hasMedia: true }).filter(i => i.mediaStatus !== 'downloaded')
      let totalDownloaded = 0
      let totalFailed = 0
      for (const item of candidates.slice(0, 15)) {
        const res = await archiveItemMedia(item)
        totalDownloaded += res.downloaded
        totalFailed += res.failed
      }
      return NextResponse.json({
        success: true,
        processedItems: Math.min(15, candidates.length),
        downloaded: totalDownloaded,
        failed: totalFailed
      })
    }

    return NextResponse.json({ success: false, error: 'Se requiere id o batch: true' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
