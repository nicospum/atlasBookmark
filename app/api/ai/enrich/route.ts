import { NextRequest, NextResponse } from 'next/server'
import { enrichWithAI } from '@/lib/gemini-enricher'
import {
  getAllBookmarks,
  getBookmarkById,
  updateBookmark,
  reclassifyAllBookmarks
} from '@/lib/bookmarks-repository'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // 1. Batch reclassify deterministic rules across all bookmarks
    if (body.action === 'reclassify-all' || body.reclassifyAll === true) {
      const stats = reclassifyAllBookmarks(Boolean(body.force))
      return NextResponse.json({
        success: true,
        ...stats,
        message: `Reclasificación determinista completada: ${stats.classified} de ${stats.total} guardados clasificados (${stats.preservedManual} manuales preservados).`
      })
    }

    // 2. Batch enrich bookmarks with AI / External Context + Explicit Degradation
    if (body.action === 'enrich-batch' || body.batch === true) {
      const all = getAllBookmarks()
      const limit = Number(body.limit) || 25
      const targets = all.slice(0, limit)
      let enrichedCount = 0
      let lastMethod = 'rules'
      let degradationNotice: string | undefined

      for (const item of targets) {
        const enriched = await enrichWithAI(item.caption, item.topics, body.mode || 'auto', {
          domain: item.domain,
          author: item.authorName,
          handle: item.authorHandle,
          collections: item.collections,
          externalUrls: item.outgoingLinks,
          fetchExternal: Boolean(body.fetchExternal)
        })
        lastMethod = enriched.analysisMethod
        if (enriched.degradationNotice) {
          degradationNotice = enriched.degradationNotice
        }

        updateBookmark(item.id, {
          topics: item.classificationStatus === 'manual' ? item.topics : enriched.topics,
          entities: enriched.entities,
          aiSummary: enriched.aiSummary,
          language: enriched.language,
          analysisMethod: enriched.analysisMethod,
          analyzedAt: enriched.analyzedAt,
          classificationMatches: enriched.classificationMatches,
          confidence: enriched.confidence,
          classificationStatus:
            item.classificationStatus === 'manual'
              ? 'manual'
              : enriched.analysisMethod === 'rules'
              ? 'deterministic'
              : 'llm'
        })
        enrichedCount++
      }

      return NextResponse.json({
        success: true,
        enrichedCount,
        total: all.length,
        methodUsed: lastMethod,
        degradationNotice,
        message: degradationNotice
          ? `Lote de ${enrichedCount} guardados analizado. ${degradationNotice}`
          : `Lote de ${enrichedCount} guardados enriquecido exitosamente con ${lastMethod.toUpperCase()}.`
      })
    }

    // 3. Enrich a specific bookmark by ID and persist to SQLite
    if (body.id) {
      const item = getBookmarkById(String(body.id))
      if (!item) {
        return NextResponse.json({ success: false, error: 'Guardado no encontrado' }, { status: 404 })
      }
      const enriched = await enrichWithAI(item.caption, item.topics, body.mode || 'auto', {
        domain: item.domain,
        author: item.authorName,
        handle: item.authorHandle,
        collections: item.collections,
        externalUrls: item.outgoingLinks,
        fetchExternal: body.fetchExternal !== false
      })
      const updated = updateBookmark(item.id, {
        topics: item.classificationStatus === 'manual' ? item.topics : enriched.topics,
        entities: enriched.entities,
        aiSummary: enriched.aiSummary,
        language: enriched.language,
        analysisMethod: enriched.analysisMethod,
        analyzedAt: enriched.analyzedAt,
        classificationMatches: enriched.classificationMatches,
        confidence: enriched.confidence,
        classificationStatus:
          item.classificationStatus === 'manual'
            ? 'manual'
            : enriched.analysisMethod === 'rules'
            ? 'deterministic'
            : 'llm'
      })
      return NextResponse.json({
        success: true,
        item: updated,
        analysis: enriched,
        degradationNotice: enriched.degradationNotice
      })
    }

    // 4. Ad-hoc text analysis
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
