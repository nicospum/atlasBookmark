import { NextResponse } from 'next/server'
import { getStats, getImportHistory } from '@/lib/bookmarks-repository'
import fs from 'fs'
import path from 'path'
import { DATA_DIR } from '@/lib/db'

export async function GET() {
  try {
    const stats = getStats()
    const history = getImportHistory(20)
    const localHarPath = path.join(DATA_DIR, 'raw', 'x', 'x.com.initial.har')
    const hasLocalHar = fs.existsSync(localHarPath)

    return NextResponse.json({
      success: true,
      stats,
      history,
      capabilities: {
        hasLocalHar,
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        ollamaModel: process.env.OLLAMA_MODEL || null,
        xApiConfigured: Boolean(process.env.X_CLIENT_ID || process.env.X_USER_ACCESS_TOKEN)
      }
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
