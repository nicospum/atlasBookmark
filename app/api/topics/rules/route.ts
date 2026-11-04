import { NextRequest, NextResponse } from 'next/server'
import {
  getTopicRulesMeta,
  saveTopicRulesWithSnapshot,
  revertTopicRulesFromSnapshot
} from '@/lib/ai-analyzer'
import { reclassifyAllBookmarks } from '@/lib/bookmarks-repository'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const meta = getTopicRulesMeta()
    return NextResponse.json({
      success: true,
      ...meta
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const current = getTopicRulesMeta().rules
    let nextRules: Record<string, string[]> = { ...current }

    if (body.rules && typeof body.rules === 'object' && !Array.isArray(body.rules)) {
      nextRules = body.rules
    } else if (typeof body.topic === 'string' && body.topic.trim()) {
      const topicName = body.topic.trim()
      const terms = Array.isArray(body.terms)
        ? body.terms.map((t: any) => String(t).trim()).filter(Boolean)
        : typeof body.terms === 'string'
        ? body.terms.split(',').map((t: string) => t.trim()).filter(Boolean)
        : []

      if (body.deleteTopic) {
        delete nextRules[topicName]
      } else {
        if (terms.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Ingresá al menos una palabra clave para el tema.' },
            { status: 400 }
          )
        }
        nextRules[topicName] = terms
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Se requiere un mapa de reglas o un tema con palabras clave.' },
        { status: 400 }
      )
    }

    const meta = saveTopicRulesWithSnapshot(nextRules)
    const reclassStats = reclassifyAllBookmarks(false)

    return NextResponse.json({
      success: true,
      ...meta,
      reclassification: reclassStats,
      message: `Reglas guardadas (Rev #${meta.revision}, SHA-256: ${meta.sha256.slice(0, 10)}…). ${reclassStats.classified}/${reclassStats.total} guardados clasificados.`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    if (body.action === 'revert' || body.revert === true) {
      const meta = revertTopicRulesFromSnapshot()
      const reclassStats = reclassifyAllBookmarks(false)
      return NextResponse.json({
        success: true,
        ...meta,
        reclassification: reclassStats,
        message: `Reglas revertidas limpiamente al snapshot previo (SHA-256: ${meta.sha256.slice(0, 10)}…).`
      })
    }

    return NextResponse.json({ success: false, error: 'Acción no reconocida' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }
}
