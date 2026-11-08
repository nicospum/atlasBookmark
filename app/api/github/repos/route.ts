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
  expandShortenedUrlsBatch,
  huntMissingGitHubReposBatch,
  importRepositoryListWithDeduplication,
  insertBookmarksBatch
} from '@/lib/bookmarks-repository'
import {
  parseGitHubUrl,
  fetchGitHubRepositoryData,
  explainRepoWithAiServer,
  parseGalleryImportJson,
  buildDeterministicSpanishExplanations,
  fetchUserStarredRepos,
  generateProjectMasterPrompt,
  evaluateAndClassifyRepository,
  extractRepositoriesFromAnyListOrPage
} from '@/lib/github-gallery'
import {
  hydrateSingleRepoWithoutApiQuota,
  hydrateReposBatchGraphQLOrHtml
} from '@/lib/github-batch-hydrator'
import {
  buildCloudSyncBundle,
  pushSyncBundleToGitHubGist,
  pullSyncBundleFromGitHubGist
} from '@/lib/cloud-sync'
import type { AiProviderId, GalleryRepository, ProjectBlueprint, ResourceType } from '@/lib/types'

function enrichReposWithAgentEvaluation(repos: GalleryRepository[]): GalleryRepository[] {
  const bookmarks = getAllBookmarks()
  return repos.map(r => ({
    ...r,
    agentEvaluation: evaluateAndClassifyRepository(r, bookmarks)
  }))
}

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
    const repositories = enrichReposWithAgentEvaluation(getAllGalleryRepositories())
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

    if (action === 'refresh-repo' || action === 'hydrate-batch-fast') {
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

      const targetRepos: GalleryRepository[] = []
      for (const nameStr of repoNames.slice(0, 30)) {
        const parsed = parseGitHubUrl(nameStr)
        if (!parsed) continue
        const fullKey = `${parsed.owner}/${parsed.repo}`
        const existing = getGalleryRepositoryByFullName(fullKey)
        if (existing) {
          targetRepos.push(existing)
        } else {
          targetRepos.push({
            id: Date.now() + Math.floor(Math.random() * 10000),
            owner: parsed.owner,
            name: parsed.repo,
            fullName: fullKey,
            description: 'Sin descripción provista.',
            url: `https://github.com/${fullKey}`,
            stars: 0,
            forks: 0,
            openIssues: 0,
            topics: [],
            languages: [],
            primaryLanguage: null,
            license: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            pushedAt: new Date().toISOString(),
            homepage: null,
            avatarUrl: `https://github.com/${parsed.owner}.png?size=200`,
            readme: '',
            latestRelease: null,
            imageUrl: `https://opengraph.githubassets.com/1/${parsed.owner}/${parsed.repo}`,
            imageSource: 'opengraph',
            explanation: '',
            shortExplanationEs: '',
            longExplanationEs: '',
            explanationGeneratedAt: new Date().toISOString(),
            addedAt: new Date().toISOString()
          })
        }
      }

      const { hydrated, refreshedCount, errors } = await hydrateReposBatchGraphQLOrHtml(targetRepos, {
        token,
        concurrency: 5
      })

      const refreshed: GalleryRepository[] = []
      for (const h of hydrated) {
        let finalRepo = h
        if (provider && provider !== 'deterministic' && hydrated.length <= 4) {
          try {
            const aiExpl = await explainRepoWithAiServer(h, provider)
            finalRepo = {
              ...h,
              explanation: aiExpl.shortExplanationEs,
              shortExplanationEs: aiExpl.shortExplanationEs,
              longExplanationEs: aiExpl.longExplanationEs,
              resourceType:
                h.resourceType && h.resourceType !== 'Otro / pendiente de clasificar'
                  ? h.resourceType
                  : aiExpl.resourceType || h.resourceType
            }
          } catch {}
        }
        const saved = saveGalleryRepoWithBookmark(finalRepo, { createBookmarkIfUnlinked: false })
        refreshed.push(saved)
      }

      return NextResponse.json({
        success: true,
        refreshedCount: refreshed.length || refreshedCount,
        repositories: enrichReposWithAgentEvaluation(refreshed),
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
      const repositories = enrichReposWithAgentEvaluation(getAllGalleryRepositories())
      return jsonWithCors({
        success: true,
        ...stats,
        total: repositories.length,
        repositories
      })
    }

    if (action === 'hunt-missing-repos') {
      const limit = Number(body?.limit) || 20
      const platform = body?.platform || 'all'
      const bookmarkIds = Array.isArray(body?.bookmarkIds) ? body.bookmarkIds : undefined
      const huntResult = await huntMissingGitHubReposBatch({
        limit,
        platform,
        bookmarkIds,
        token
      })
      const repositories = enrichReposWithAgentEvaluation(getAllGalleryRepositories())
      return jsonWithCors({
        success: true,
        ...huntResult,
        total: repositories.length,
        repositories
      })
    }

    if (action === 'preview-list-import') {
      const text = String(body?.text || '')
      const pageUrl = String(body?.pageUrl || '')
      if (!text.trim() && !pageUrl.trim()) {
        return jsonWithCors(
          {
            success: false,
            error: 'Pegá una lista de repositorios o ingresá la URL de una página / Awesome List.'
          },
          { status: 400 }
        )
      }
      const { extracted, sourceLabel } = await extractRepositoriesFromAnyListOrPage({
        text,
        pageUrl,
        token
      })
      const existingSet = new Set(
        getAllGalleryRepositories().map(r => r.fullName.toLowerCase())
      )
      const items = extracted.map(item => {
        const fullName = `${item.owner}/${item.repo}`
        const alreadyExists = existingSet.has(fullName.toLowerCase())
        return {
          ...item,
          fullName,
          alreadyExists
        }
      })
      return jsonWithCors({
        success: true,
        sourceLabel,
        totalDetected: items.length,
        newCount: items.filter(i => !i.alreadyExists).length,
        duplicateCount: items.filter(i => i.alreadyExists).length,
        items
      })
    }

    if (action === 'import-repo-list') {
      const text = String(body?.text || '')
      const pageUrl = String(body?.pageUrl || '')
      const enrichLiveCount = typeof body?.enrichLiveCount === 'number' ? body.enrichLiveCount : 8
      const notes = body?.notes ? String(body.notes) : undefined
      if (!text.trim() && !pageUrl.trim()) {
        return jsonWithCors(
          {
            success: false,
            error: 'Pegá una lista de repositorios o ingresá la URL de una página / Awesome List.'
          },
          { status: 400 }
        )
      }
      const importRes = await importRepositoryListWithDeduplication({
        text,
        pageUrl,
        enrichLiveCount,
        token,
        notes
      })
      const repositories = enrichReposWithAgentEvaluation(importRes.repositories)
      return jsonWithCors({
        success: true,
        ...importRes,
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

    if (action === 'cloud-sync-gist') {
      const mode = String(body?.mode || 'push')
      const gistId = body?.gistId ? String(body.gistId).trim() : undefined

      if (mode === 'push') {
        if (!token) {
          return jsonWithCors(
            {
              success: false,
              error: 'Para subir tu respaldo a GitHub Gist necesitás configurar un GitHub Personal Access Token con permiso "gist".'
            },
            { status: 400 }
          )
        }
        const bundle = buildCloudSyncBundle({
          bookmarks: getAllBookmarks(),
          repositories: getAllGalleryRepositories(),
          blueprints: getAllProjectBlueprints()
        })
        const pushed = await pushSyncBundleToGitHubGist({
          token,
          gistId,
          bundle
        })
        return jsonWithCors({
          success: true,
          mode: 'push',
          gistId: pushed.gistId,
          gistUrl: pushed.gistUrl,
          updatedAt: pushed.updatedAt,
          counts: bundle.counts
        })
      }

      if (mode === 'pull') {
        if (!gistId) {
          return jsonWithCors(
            { success: false, error: 'Ingresá el ID o URL del GitHub Gist para restaurar tu catálogo.' },
            { status: 400 }
          )
        }
        const pulled = await pullSyncBundleFromGitHubGist({ token, gistId })
        if (Array.isArray(pulled.bookmarks) && pulled.bookmarks.length > 0) {
          insertBookmarksBatch(pulled.bookmarks)
        }
        for (const repo of pulled.repositories || []) {
          saveGalleryRepoWithBookmark(repo, { createBookmarkIfUnlinked: false })
        }
        for (const bp of pulled.blueprints || []) {
          if (bp?.name) upsertProjectBlueprint(bp)
        }
        const repositories = enrichReposWithAgentEvaluation(getAllGalleryRepositories())
        return jsonWithCors({
          success: true,
          mode: 'pull',
          exportedAt: pulled.exportedAt,
          counts: pulled.counts,
          repositories,
          blueprints: getAllProjectBlueprints()
        })
      }
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
