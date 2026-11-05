import { NextRequest, NextResponse } from 'next/server'
import { enrichWithAI } from '@/lib/gemini-enricher'
import {
  getAllBookmarks,
  getBookmarkById,
  updateBookmark,
  reclassifyAllBookmarks,
  investigateBookmarkById
} from '@/lib/bookmarks-repository'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // 1. Batch reclassify deterministic rules & synthesis across all bookmarks
    if (body.action === 'reclassify-all' || body.reclassifyAll === true) {
      const stats = reclassifyAllBookmarks(Boolean(body.force))
      return NextResponse.json({
        success: true,
        ...stats,
        message: `Reclasificación y síntesis completadas: ${stats.classified} de ${stats.total} guardados clasificados (${stats.preservedManual} manuales preservados).`
      })
    }

    // 2. Batch investigate resources & GitHub repositories
    if (body.action === 'investigate-batch') {
      const all = getAllBookmarks()
      const ids: string[] = Array.isArray(body.ids) && body.ids.length > 0
        ? body.ids
        : all
            .filter(i => i.outgoingLinks.length > 0 || (i.resources && i.resources.length > 0))
            .slice(0, Number(body.limit) || 15)
            .map(i => i.id)

      let investigatedCount = 0
      for (const id of ids) {
        const res = await investigateBookmarkById(id)
        if (res) investigatedCount++
      }

      return NextResponse.json({
        success: true,
        investigatedCount,
        message: `Se investigaron enlaces y repositorios de GitHub en ${investigatedCount} guardado(s).`
      })
    }

    // 3. Batch enrich bookmarks with AI / External Context + Explicit Degradation
    if (body.action === 'enrich-batch' || body.batch === true) {
      const all = getAllBookmarks()
      const limit = Number(body.limit) || 20
      const targets = all.slice(0, limit)
      let enrichedCount = 0
      let lastMethod = 'rules'
      let degradationNotice: string | undefined

      for (const item of targets) {
        await investigateBookmarkById(item.id)
        const refreshed = getBookmarkById(item.id) || item
        const manualFields = new Set(refreshed.manualFields || [])

        const enriched = await enrichWithAI(refreshed.caption, refreshed.topics, body.mode || 'auto', {
          domain: refreshed.domain,
          author: refreshed.authorName,
          handle: refreshed.authorHandle,
          collections: refreshed.collections,
          externalUrls: refreshed.outgoingLinks,
          fetchExternal: Boolean(body.fetchExternal)
        })
        lastMethod = enriched.analysisMethod
        if (enriched.degradationNotice) {
          degradationNotice = enriched.degradationNotice
        }

        updateBookmark(
          refreshed.id,
          {
            topics:
              refreshed.classificationStatus === 'manual' || manualFields.has('topics')
                ? refreshed.topics
                : enriched.topics,
            entities: enriched.entities,
            aiSummary: manualFields.has('purpose') ? refreshed.aiSummary : enriched.aiSummary,
            language: enriched.language,
            analysisMethod: enriched.analysisMethod,
            analyzedAt: enriched.analyzedAt,
            classificationMatches: enriched.classificationMatches,
            confidence: enriched.confidence,
            classificationStatus:
              refreshed.classificationStatus === 'manual'
                ? 'manual'
                : enriched.analysisMethod === 'rules'
                ? 'deterministic'
                : 'llm'
          },
          false
        )
        enrichedCount++
      }

      return NextResponse.json({
        success: true,
        enrichedCount,
        total: all.length,
        methodUsed: lastMethod,
        degradationNotice,
        message: degradationNotice
          ? `Lote de ${enrichedCount} guardados e investigaciones procesado. ${degradationNotice}`
          : `Lote de ${enrichedCount} guardados enriquecido exitosamente con ${lastMethod.toUpperCase()}.`
      })
    }

    // 4. Enrich & investigate a specific bookmark by ID and persist to SQLite
    if (body.id) {
      const initialItem = getBookmarkById(String(body.id))
      if (!initialItem) {
        return NextResponse.json({ success: false, error: 'Guardado no encontrado' }, { status: 404 })
      }

      const investigated = (await investigateBookmarkById(initialItem.id)) || initialItem
      const manualFields = new Set(investigated.manualFields || [])

      const enriched = await enrichWithAI(investigated.caption, investigated.topics, body.mode || 'auto', {
        domain: investigated.domain,
        author: investigated.authorName,
        handle: investigated.authorHandle,
        collections: investigated.collections,
        externalUrls: investigated.outgoingLinks,
        fetchExternal: body.fetchExternal !== false
      })

      const updated = updateBookmark(
        investigated.id,
        {
          topics:
            investigated.classificationStatus === 'manual' || manualFields.has('topics')
              ? investigated.topics
              : enriched.topics,
          entities: enriched.entities,
          aiSummary: manualFields.has('purpose') ? investigated.aiSummary : investigated.purpose || enriched.aiSummary,
          language: enriched.language,
          analysisMethod: enriched.analysisMethod,
          analyzedAt: enriched.analyzedAt,
          classificationMatches: enriched.classificationMatches,
          confidence: enriched.confidence,
          classificationStatus:
            investigated.classificationStatus === 'manual'
              ? 'manual'
              : enriched.analysisMethod === 'rules'
              ? 'deterministic'
              : 'llm'
        },
        false
      )

      return NextResponse.json({
        success: true,
        item: updated,
        analysis: enriched,
        degradationNotice: enriched.degradationNotice
      })
    }

    // 5. Ad-hoc text analysis
    const text = body.text || ''
    const existingTopics = body.existingTopics || []
    if (!text) {
      return NextResponse.json({ success: false, error: 'Texto requerido' }, { status: 400 })
    }

    const result = await enrichWithAI(text, existingTopics, body.mode || 'auto')
    return NextResponse.json({ success: true, analysis: result, degradationNotice: result.degradationNotice })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
