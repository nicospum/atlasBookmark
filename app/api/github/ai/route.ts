import { NextResponse } from 'next/server'
import {
  listConfiguredAiProviders,
  explainRepoWithAiServer,
  askRepoAssistantServer,
  askGalleryAssistantServer,
  fetchRepositoryReadme,
  compareRepositoriesServer
} from '@/lib/github-gallery'
import {
  getAllBookmarks,
  getAllGalleryRepositories,
  getGalleryRepositoryByFullName,
  upsertGalleryRepository,
  upsertProjectBlueprint
} from '@/lib/bookmarks-repository'
import {
  recommendStackForProjectIdea,
  buildReleaseAndTrendingRadar
} from '@/lib/stack-recommender'
import type { AiProviderId, GalleryRepository } from '@/lib/types'

export async function GET() {
  try {
    const providers = listConfiguredAiProviders()
    return NextResponse.json({
      success: true,
      providers
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Error al obtener proveedores de IA.' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const action = body?.action || 'explain-repo'
    const provider: AiProviderId | undefined = body?.provider
    const token: string | undefined = body?.token || request.headers.get('x-github-token') || undefined

    if (action === 'explain-repo') {
      const repoInput = body?.repo as GalleryRepository | undefined
      if (!repoInput || !repoInput.owner || !repoInput.name) {
        return NextResponse.json(
          { success: false, error: 'Se requiere un repositorio válido (owner/name).' },
          { status: 400 }
        )
      }

      let readme = repoInput.readme || ''
      if (!readme) {
        readme = await fetchRepositoryReadme(repoInput.owner, repoInput.name, token)
      }

      const expl = await explainRepoWithAiServer({ ...repoInput, readme }, provider)

      const existing = getGalleryRepositoryByFullName(`${repoInput.owner}/${repoInput.name}`)
      let updatedRepo: GalleryRepository | undefined
      if (existing) {
        updatedRepo = upsertGalleryRepository({
          ...existing,
          readme: readme || existing.readme,
          explanation: expl.shortExplanationEs,
          shortExplanationEs: expl.shortExplanationEs,
          longExplanationEs: expl.longExplanationEs,
          explanationGeneratedAt: new Date().toISOString(),
          resourceType: expl.resourceType || existing.resourceType
        })
      }

      return NextResponse.json({
        success: true,
        ...expl,
        readme,
        repository: updatedRepo
      })
    }

    if (action === 'repo-chat') {
      const repoInput = body?.repo as GalleryRepository | undefined
      const question = String(body?.question || '').trim()
      const history = Array.isArray(body?.history) ? body.history : []

      if (!repoInput || !question) {
        return NextResponse.json(
          { success: false, error: 'Se requiere repositorio y pregunta.' },
          { status: 400 }
        )
      }

      const answer = await askRepoAssistantServer({
        repo: repoInput,
        question,
        history,
        provider
      })

      return NextResponse.json({
        success: true,
        answer
      })
    }

    if (action === 'gallery-chat') {
      const question = String(body?.question || '').trim()
      const history = Array.isArray(body?.history) ? body.history : []
      if (!question) {
        return NextResponse.json(
          { success: false, error: 'Escribí una consulta para el asistente de galería.' },
          { status: 400 }
        )
      }

      const repos = getAllGalleryRepositories()
      const answer = await askGalleryAssistantServer({
        repos,
        question,
        history,
        provider
      })

      return NextResponse.json({
        success: true,
        answer
      })
    }

    if (action === 'compare-repos') {
      const reposInput: GalleryRepository[] = Array.isArray(body?.repos) ? body.repos : []
      if (reposInput.length < 2) {
        return NextResponse.json(
          { success: false, error: 'Seleccioná al menos 2 repositorios para comparar.' },
          { status: 400 }
        )
      }
      const comparison = await compareRepositoriesServer(reposInput, provider)
      return NextResponse.json({
        success: true,
        comparison
      })
    }

    if (action === 'recommend-stack') {
      const idea = String(body?.idea || '').trim()
      if (!idea) {
        return NextResponse.json(
          { success: false, error: 'Describí tu idea de proyecto para recomendar un stack.' },
          { status: 400 }
        )
      }
      const repos = getAllGalleryRepositories()
      const bookmarks = getAllBookmarks()
      const recommendation = recommendStackForProjectIdea({
        idea,
        repos,
        bookmarks,
        maxRepos: typeof body?.maxRepos === 'number' ? body.maxRepos : 6,
        provider
      })

      if (body?.autoSaveBlueprint === true && recommendation.generatedBlueprint) {
        const savedBp = upsertProjectBlueprint(recommendation.generatedBlueprint)
        recommendation.generatedBlueprint = savedBp
      }

      return NextResponse.json({
        success: true,
        recommendation
      })
    }

    if (action === 'release-radar') {
      const repos = getAllGalleryRepositories()
      const bookmarks = getAllBookmarks()
      const radarItems = buildReleaseAndTrendingRadar(repos, bookmarks)
      return NextResponse.json({
        success: true,
        radarItems
      })
    }

    return NextResponse.json({ success: false, error: `Acción no soportada: ${action}` }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Error al procesar solicitud de IA.' },
      { status: 500 }
    )
  }
}
