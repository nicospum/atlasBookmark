import {
  getAllBookmarks,
  getAllGalleryRepositories,
  huntMissingGitHubReposBatch
} from '@/lib/bookmarks-repository'
import { classifyGitHubUrl } from '@/lib/resource-investigator'
import type { BookmarkItem, DeepHuntResultItem, SourcePlatform } from '@/lib/types'

export const dynamic = 'force-dynamic'

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-github-token'
}

function hasGitHubRepoAlready(bm: BookmarkItem): boolean {
  if (bm.platform === 'github') return true
  if ((bm.resources || []).some(r => r.kind === 'github_repo')) return true
  return (bm.outgoingLinks || []).some(u => classifyGitHubUrl(u)?.kind === 'github_repo')
}

interface HuntStreamParams {
  limit: number
  platform: SourcePlatform | 'all'
  bookmarkIds?: string[]
  token?: string | null
}

function createHuntStreamResponse(request: Request, params: HuntStreamParams): Response {
  const limit = Math.min(60, Math.max(1, params.limit || 24))
  const all = getAllBookmarks()
  const beforeRepoCount = getAllGalleryRepositories().length

  let candidates: BookmarkItem[] = []
  if (Array.isArray(params.bookmarkIds) && params.bookmarkIds.length > 0) {
    const idSet = new Set(params.bookmarkIds)
    candidates = all.filter(b => idSet.has(b.id))
  } else {
    candidates = all.filter(b => {
      if (b.platform === 'github') return false
      if (params.platform && params.platform !== 'all' && b.platform !== params.platform) {
        return false
      }
      return !hasGitHubRepoAlready(b)
    })
  }

  const targetBookmarks = candidates.slice(0, limit)
  const total = targetBookmarks.length
  const BATCH_SIZE = 3
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        } catch {}
      }

      try {
        let scanned = 0
        let hydrated = 0
        let discovered = 0
        const allFindings: DeepHuntResultItem[] = []

        sendEvent({
          type: 'progress',
          scanned: 0,
          total,
          hydrated: 0,
          discovered: 0,
          latestFindings: []
        })

        for (let i = 0; i < targetBookmarks.length; i += BATCH_SIZE) {
          if (request.signal?.aborted) {
            break
          }

          const slice = targetBookmarks.slice(i, i + BATCH_SIZE)
          const batchIds = slice.map(b => b.id)

          const stepResult = await huntMissingGitHubReposBatch({
            bookmarkIds: batchIds,
            limit: batchIds.length,
            platform: params.platform,
            token: params.token
          })

          scanned += stepResult.scannedCount
          hydrated += stepResult.hydratedPostsCount
          discovered += stepResult.discoveredReposCount
          if (stepResult.findings.length > 0) {
            allFindings.push(...stepResult.findings)
          }

          sendEvent({
            type: 'progress',
            scanned,
            total,
            hydrated,
            discovered,
            latestFindings: stepResult.findings
          })
        }

        const afterRepoCount = getAllGalleryRepositories().length
        const newGalleryReposCount = Math.max(0, afterRepoCount - beforeRepoCount)

        const summary = {
          scannedCount: scanned,
          totalCandidates: total,
          hydratedPostsCount: hydrated,
          discoveredReposCount: discovered,
          newGalleryReposCount,
          findings: allFindings
        }

        sendEvent({
          type: 'done',
          summary,
          ...summary
        })
      } catch (err: any) {
        sendEvent({
          type: 'error',
          error: err?.message || 'Error durante el rastreo en tiempo real de repositorios ocultos.'
        })
      } finally {
        try {
          controller.close()
        } catch {}
      }
    }
  })

  return new Response(stream, {
    status: 200,
    headers: SSE_HEADERS
  })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: SSE_HEADERS })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get('limit')) || 24
  const platform = (searchParams.get('platform') as SourcePlatform | 'all') || 'all'
  const rawIds = searchParams.get('bookmarkIds') || ''
  const bookmarkIds = rawIds
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const token =
    request.headers.get('x-github-token') || searchParams.get('token') || undefined

  return createHuntStreamResponse(request, {
    limit,
    platform,
    bookmarkIds: bookmarkIds.length > 0 ? bookmarkIds : undefined,
    token
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const limit = Number(body?.limit) || 24
  const platform = (body?.platform as SourcePlatform | 'all') || 'all'
  const bookmarkIds = Array.isArray(body?.bookmarkIds)
    ? body.bookmarkIds.map((id: unknown) => String(id).trim()).filter(Boolean)
    : undefined
  const token =
    body?.token || request.headers.get('x-github-token') || undefined

  return createHuntStreamResponse(request, {
    limit,
    platform,
    bookmarkIds,
    token
  })
}
