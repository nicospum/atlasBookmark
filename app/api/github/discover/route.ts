import { NextResponse } from 'next/server'
import { fetchGitHubRateLimit, searchGitHubDiscover } from '@/lib/github-gallery'
import type { CreatedAtFilterType, DiscoverCategory } from '@/lib/types'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token =
      request.headers.get('x-github-token') || searchParams.get('token') || undefined

    if (searchParams.get('checkRateLimit') === 'true') {
      const rateLimit = await fetchGitHubRateLimit(token)
      return NextResponse.json({
        success: true,
        rateLimit
      })
    }

    const query = searchParams.get('query') || undefined
    const category = (searchParams.get('category') as DiscoverCategory) || 'featured'
    const language = searchParams.get('language') || undefined
    const topic = searchParams.get('topic') || undefined
    const createdFilter = (searchParams.get('createdFilter') as CreatedAtFilterType) || 'ALL'
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const perPage = Math.min(30, Math.max(6, Number(searchParams.get('perPage')) || 15))
    const userTopics = (searchParams.get('userTopics') || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const userLanguages = (searchParams.get('userLanguages') || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const result = await searchGitHubDiscover(
      {
        query,
        category,
        language,
        topic,
        createdFilter,
        userTopics,
        userLanguages,
        page,
        perPage
      },
      token
    )

    return NextResponse.json({
      success: true,
      ...result
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'No se pudo consultar el explorador de GitHub.'
      },
      { status: 500 }
    )
  }
}
