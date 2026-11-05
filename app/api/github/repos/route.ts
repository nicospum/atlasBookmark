import { NextResponse } from 'next/server'
import {
  getAllBookmarks,
  getAllGalleryRepositories,
  getGalleryRepositoryByFullName,
  saveGalleryRepoWithBookmark,
  upsertGalleryRepository,
  deleteGalleryRepository,
  saveGalleryCustomOrder,
  syncBookmarksToGitHubGallery,
  updateBookmark,
  getAllProjectBlueprints,
  upsertProjectBlueprint,
  deleteProjectBlueprint,
  expandShortenedUrlsBatch
} from '@/lib/bookmarks-repository'
import {
  parseGitHubUrl,
  fetchGitHubRepositoryData,
  explainRepoWithAiServer,
  parseGalleryImportJson,
  buildDeterministicSpanishExplanations,
  fetchUserStarredRepos,
  generateProjectMasterPrompt
} from '@/lib/github-gallery'
import type { AiProviderId, GalleryRepository, ProjectBlueprint, ResourceType } from '@/lib/types'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-github-token'
}

function jsonWithCors(data: any, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status || 200,
    headers: CORS_HEADERS
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET() {
  try {
    syncBookmarksToGitHubGallery()
    const repositories = getAllGalleryRepositories()
    const blueprints = getAllProjectBlueprints()
    return jsonWithCors({
      success: true,
      repositories,
      blueprints,
      total: repositories.length
    })
  } catch (error: any) {
    return jsonWithCors(
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
        return jsonWithCors(
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
      return jsonWithCors({
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
      return jsonWithCors({
        success: true
      })
    }

    if (action === 'import-github-stars') {
      const username = String(body?.username || '').trim()
      const page = Number(body?.page) || 1
      const perPage = Number(body?.perPage) || 50
      if (!username) {
        return jsonWithCors(
          { success: false, error: 'Ingresá un nombre de usuario de GitHub válido.' },
          { status: 400 }
        )
      }

      const starredRepos = await fetchUserStarredRepos(username, { page, perPage, token })
      let added = 0
      let updated = 0

      for (const repo of starredRepos) {
        const existing = getGalleryRepositoryByFullName(repo.fullName)
        saveGalleryRepoWithBookmark(repo)
        if (existing) {
          updated++
        } else {
          added++
        }
      }

      const repositories = getAllGalleryRepositories()
      return jsonWithCors({
        success: true,
        username,
        fetched: starredRepos.length,
        added,
        updated,
        total: repositories.length,
        repositories
      })
    }

    if (action === 'expand-short-links') {
      const limit = Number(body?.limit) || 30
      const stats = await expandShortenedUrlsBatch(limit)
      const repositories = getAllGalleryRepositories()
      return jsonWithCors({
        success: true,
        ...stats,
        total: repositories.length,
        repositories
      })
    }

    if (action === 'save-blueprint') {
      const bpInput = body?.blueprint as Partial<ProjectBlueprint> & { name?: string }
      if (!bpInput || !bpInput.name || !bpInput.name.trim()) {
        return jsonWithCors(
          { success: false, error: 'El proyecto necesita un nombre válido.' },
          { status: 400 }
        )
      }
      const blueprint = upsertProjectBlueprint({
        ...bpInput,
        name: bpInput.name.trim()
      })
      return jsonWithCors({
        success: true,
        blueprint,
        blueprints: getAllProjectBlueprints()
      })
    }

    if (action === 'delete-blueprint') {
      const id = String(body?.id || '').trim()
      if (!id) {
        return jsonWithCors({ success: false, error: 'ID de proyecto requerido.' }, { status: 400 })
      }
      deleteProjectBlueprint(id)
      return jsonWithCors({
        success: true,
        blueprints: getAllProjectBlueprints()
      })
    }

    if (action === 'generate-master-prompt') {
      const bpInput = body?.blueprint as ProjectBlueprint | undefined
      const blueprintId = String(body?.blueprintId || bpInput?.id || '')
      const allBlueprints = getAllProjectBlueprints()
      const blueprint =
        bpInput && bpInput.name
          ? bpInput
          : allBlueprints.find(b => b.id === blueprintId) || allBlueprints[0]

      if (!blueprint) {
        return jsonWithCors(
          { success: false, error: 'No se encontró el proyecto para generar el prompt.' },
          { status: 404 }
        )
      }

      const repos = getAllGalleryRepositories()
      const bookmarks = getAllBookmarks()
      const markdown = generateProjectMasterPrompt({ blueprint, repos, bookmarks })

      return jsonWithCors({
        success: true,
        markdown,
        blueprint
      })
    }

    return jsonWithCors({ success: false, error: `Acción no soportada: ${action}` }, { status: 400 })
  } catch (error: any) {
    return jsonWithCors(
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
