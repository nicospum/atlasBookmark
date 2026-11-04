import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const platform = body.platform || 'x'
    const maxItems = body.maxItems || 50

    const scriptFile = path.join(/*turbopackIgnore: true*/ process.cwd(), 'scripts', 'browser-extractor.mjs')

    // Spawn script in background
    const child = spawn('node', [scriptFile, platform, String(maxItems)], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd()
    })

    child.unref()

    return NextResponse.json({
      success: true,
      message: `Ventana de extracción para ${platform.toUpperCase()} iniciada. Se abrirá una ventana de Chromium en tu pantalla para capturar tus guardados.`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
