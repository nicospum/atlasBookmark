import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import {
  getAllBookmarks,
  getAllGalleryRepositories,
  syncBookmarksToGitHubGallery,
  syncNormalizedArchiveJson
} from '@/lib/bookmarks-repository'
import {
  buildWorkbook,
  buildRepositoriesWorkbook,
  ALL_SHEETS,
  AVAILABLE_COLUMNS
} from '@/lib/excel-export'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    syncNormalizedArchiveJson()
    const { searchParams } = new URL(req.url)
    const onlyReviewed = searchParams.get('onlyReviewed') === 'true'
    const mode = searchParams.get('mode')

    if (mode === 'repositories' || mode === 'repos') {
      syncBookmarksToGitHubGallery()
      const repos = getAllGalleryRepositories()
      const bookmarks = getAllBookmarks()
      const wb = buildRepositoriesWorkbook(repos, bookmarks)
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      const filename = `atlas-catalogo-repositorios-ia-${new Date().toISOString().slice(0, 10)}.xlsx`

      try {
        const exportsDir = path.join(process.cwd(), 'exports')
        fs.mkdirSync(exportsDir, { recursive: true })
        fs.writeFileSync(path.join(exportsDir, 'repositories_master.xlsx'), buffer)
      } catch {}

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store'
        }
      })
    }

    const items = getAllBookmarks()
    const wb = buildWorkbook(items, {
      sheets: ALL_SHEETS,
      columns: AVAILABLE_COLUMNS,
      onlyReviewed
    })
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const filename = `atlas-guardados-${new Date().toISOString().slice(0, 10)}.xlsx`

    // Also persist a copy in /exports on disk
    try {
      const exportsDir = path.join(process.cwd(), 'exports')
      fs.mkdirSync(exportsDir, { recursive: true })
      fs.writeFileSync(path.join(exportsDir, 'bookmarks_archive.xlsx'), buffer)
    } catch {
      // Non-fatal if disk is read-only
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
