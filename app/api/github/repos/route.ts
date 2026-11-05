import { NextResponse } from 'next/server'
import {
  getAllGalleryRepositories,
  getGalleryRepositoryByFullName,
  saveGalleryRepoWithBookmark,
  upsertGalleryRepository,
  deleteGalleryRepository,
  saveGalleryCustomOrder,
  syncBookmarksToGitHubGallery,
  updateBookmark
} from '@/lib/bookmarks-repository'
import {
  parseGitHubUrl,
  fetchGitHubRepositoryData,
  explainRepoWithAiServer,
  parseGalleryImportJson,
  buildDeterministicSpanishExplanations
} from '@/lib/github-gallery'
import type { AiProviderId, GalleryRepository, ResourceType } from '@/lib/types'

export async function GET() {
  try {
    syncBookmarksToGitHubGallery()
    const repositories = getAllGalleryRepositories()
    return NextResponse.json({
      success: true,
      repositories,
      total: repositories.length
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'No se pudieron cargar los repositorios.' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const action = body?.action || 'add-url'
    const token: string | undefined = body?.token || request.headers.get('x-github-token') || undefined
    const provider: AiProviderId | undefined = body?.provider

    if (action === 'add-url') {
      const rawUrl = String(body?.url || '').trim()
      const parsed = parseGitHubUrl(rawUrl)
      if (!parsed) {
        return NextResponse.json(
          {
            success: false,
            error: 'Ingresá una URL válida de GitHub (ej. https://github.com/owner/repo o owner/repo).'
          },
          { status: 400 }
        )
      }

      const fullKey = `${parsed.owner}/${parsed.repo}`.toLowerCase()
      const existing = getGalleryRepositoryByFullName(fullKey)

      const liveRepo = await fetchGitHubRepositoryData(parsed.owner, parsed.repo, token)
      const aiExpl = await explainRepoWithAiServer(liveRepo, provider)

      const mergedRepo: GalleryRepository = {
        ...liveRepo,
        explanation: aiExpl.shortExplanationEs,
        shortExplanationEs: aiExpl.shortExplanationEs,
        longExplanationEs: aiExpl.longExplanationEs,
        explanationGeneratedAt: new Date().toISOString(),
        resourceType: aiExpl.resourceType || liveRepo.resourceType,
        linkedBookmarkIds: existing?.linkedBookmarkIds || [],
        notes: existing?.notes || body?.notes || ''
      }

      const saved = saveGalleryRepoWithBookmark(mergedRepo)
      return NextResponse.json({
        success: true,
        repository: saved,
        alreadyExisted: Boolean(existing)
      })
    }

    if (action === 'save-repo') {
      const incoming = body?.repository as GalleryRepository | undefined
      if (!incoming || !incoming.owner || !incoming.name) {
        return NextResponse.json(
          { success: false, error: 'Datos de repositorio incompletos.' },
          { status: 400 }
        )
      }

      const synth = buildDeterministicSpanishExplanations(incoming)
      const repoToSave: GalleryRepository = {
        ...incoming,
        shortExplanationEs: incoming.shortExplanationEs || synth.shortExplanationEs,
        longExplanationEs: incoming.longExplanationEs || synth.longExplanationEs,
        explanation: incoming.explanation || incoming.shortExplanationEs || synth.shortExplanationEs,
        resourceType: incoming.resourceType || synth.resourceType,
        addedAt: incoming.addedAt || new Date().toISOString()
      }

      const saved = saveGalleryRepoWithBookmark(repoToSave)
      return NextResponse.json({
        success: true,
        repository: saved
      })
    }

    if (action === 'refresh-repo') {
      const repoNames: string[] = Array.isArray(body?.repos)
        ? body.repos
        : body?.fullName
        ? [String(body.fullName)]
        : []

      if (repoNames.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Indicá al menos un repositorio (owner/repo) para enriquecer.' },
          { status: 400 }
        )
      }

      const refreshed: GalleryRepository[] = []
      const errors: Array<{ repo: string; error: string }> = []

      for (const nameStr of repoNames.slice(0, 15)) {
        const parsed = parseGitHubUrl(nameStr)
        if (!parsed) continue
        try {
          const existing = getGalleryRepositoryByFullName(`${parsed.owner}/${parsed.repo}`)
          const live = await fetchGitHubRepositoryData(parsed.owner, parsed.repo, token)
          const aiExpl = await explainRepoWithAiServer(live, provider)

          const merged: GalleryRepository = {
            ...live,
            explanation: aiExpl.shortExplanationEs,
            shortExplanationEs: aiExpl.shortExplanationEs,
            longExplanationEs: aiExpl.longExplanationEs,
            explanationGeneratedAt: new Date().toISOString(),
            resourceType:
              existing?.resourceType && existing.resourceType !== 'Otro / pendiente de clasificar'
                ? existing.resourceType
                : aiExpl.resourceType || live.resourceType,
            linkedBookmarkIds: existing?.linkedBookmarkIds || [],
            notes: existing?.notes || ''
          }

          const saved = saveGalleryRepoWithBookmark(merged, { createBookmarkIfUnlinked: false })
          refreshed.push(saved)
        } catch (err: any) {
          errors.push({ repo: nameStr, error: err.message || 'Error al enriquecer desde GitHub API' })
        }
      }

      return NextResponse.json({
        success: true,
        refreshedCount: refreshed.length,
        repositories: refreshed,
        errors
      })
    }

    if (action === 'import-json') {
      const jsonText = String(body?.jsonText || '')
      if (!jsonText.trim()) {
        return NextResponse.json(
          { success: false, error: 'El contenido JSON a importar está vacío.' },
          { status: 400 }
        )
      }

      const { repositories: incomingRepos, customOrder } = parseGalleryImportJson(jsonText)
      let addedCount = 0
      let updatedCount = 0

      for (const repo of incomingRepos) {
        const existing = getGalleryRepositoryByFullName(repo.fullName)
        saveGalleryRepoWithBookmark(repo)
        if (existing) {
          updatedCount++
        } else {
          addedCount++
        }
      }

      if (customOrder && customOrder.length > 0) {
        saveGalleryCustomOrder(customOrder)
      }

      return NextResponse.json({
        success: true,
        added: addedCount,
        updated: updatedCount,
        total: getAllGalleryRepositories().length,
        repositories: getAllGalleryRepositories()
      })
    }

    if (action === 'update-repo') {
      const fullName = String(body?.fullName || '')
      const existing = getGalleryRepositoryByFullName(fullName)
      if (!existing) {
        return NextResponse.json(
          { success: false, error: `No se encontró el repositorio "${fullName}".` },
          { status: 404 }
        )
      }

      const nextRepo: GalleryRepository = {
        ...existing,
        ...(body.shortExplanationEs !== undefined ? { shortExplanationEs: String(body.shortExplanationEs) } : {}),
        ...(body.longExplanationEs !== undefined ? { longExplanationEs: String(body.longExplanationEs) } : {}),
        ...(body.explanation !== undefined ? { explanation: String(body.explanation) } : {}),
        ...(body.resourceType !== undefined ? { resourceType: body.resourceType as ResourceType } : {}),
        ...(body.notes !== undefined ? { notes: String(body.notes) } : {}),
        ...(Array.isArray(body.topics) ? { topics: body.topics } : {}),
        ...(body.readme !== undefined ? { readme: String(body.readme) } : {})
      }

      const saved = upsertGalleryRepository(nextRepo)

      // Propagate notes / resourceType to direct github:owner/repo bookmark if present
      const ghBmId = `github:${existing.fullName.toLowerCase()}`
      if (saved.linkedBookmarkIds?.includes(ghBmId)) {
        updateBookmark(
          ghBmId,
          {
            purpose: saved.shortExplanationEs,
            resourceType: saved.resourceType,
            notes: saved.notes,
            topics: saved.topics
          },
          true
        )
      }

      return NextResponse.json({
        success: true,
        repository: saved
      })
    }

    if (action === 'reorder') {
      const customOrder = Array.isArray(body?.customOrder) ? body.customOrder : []
      saveGalleryCustomOrder(customOrder)
      return NextResponse.json({
        success: true
      })
    }

    return NextResponse.json({ success: false, error: `Acción no soportada: ${action}` }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Error al procesar la operación de repositorios.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const targets: Array<string | number> = Array.isArray(body?.repos)
      ? body.repos
      : body?.fullName
      ? [body.fullName]
      : body?.id
      ? [body.id]
      : []

    let deleted = 0
    for (const target of targets) {
      if (deleteGalleryRepository(target)) {
        deleted++
      }
    }

    return NextResponse.json({
      success: true,
      deleted,
      repositories: getAllGalleryRepositories()
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'No se pudo eliminar el repositorio.' },
      { status: 500 }
    )
  }
}
