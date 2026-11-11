import { NextRequest, NextResponse } from 'next/server'
import {
  ATLAS_AGENT_TOOLS,
  executeAgentToolServer,
  inferNaturalLanguageToolCalls,
  shouldRequireToolConfirmation
} from '@/lib/agent-tools'
import { DEFAULT_CUSTOMIZATION_CONFIG } from '@/lib/customization-store'
import { getAllBookmarks, getAllGalleryRepositories } from '@/lib/bookmarks-repository'
import type { AgentSectionContext, AgentToolCallRequest, AgentToolExecutionResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

const pendingTelegramConfirmations = new Map<string, AgentToolCallRequest>()
let lastProcessedUpdateId = 0

function buildDefaultServerSectionContext(): AgentSectionContext {
  const bookmarks = getAllBookmarks()
  const repos = getAllGalleryRepositories()
  const separatedCount = bookmarks.filter(
    b => b.resourceType === 'Archivo separado / Otro tema (No técnico)'
  ).length
  const fallbackLinksCount = bookmarks.filter(b =>
    (b.resources || []).some(r => r.id?.startsWith('fallback_ref:'))
  ).length

  return {
    activeSection: 'Telegram / Hermes Bridge',
    totalBookmarks: bookmarks.length,
    totalRepos: repos.length,
    separatedCount,
    fallbackLinksCount
  }
}

async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string,
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>
) {
  if (!botToken) return null
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const payload: Record<string, any> = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  }
  if (inlineKeyboard && inlineKeyboard.length > 0) {
    payload.reply_markup = { inline_keyboard: inlineKeyboard }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json().catch(() => null)
}

async function answerCallbackQuery(botToken: string, callbackQueryId: string, text: string) {
  if (!botToken) return null
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text
    })
  }).catch(() => null)
}

async function processSingleTelegramUpdate(
  botToken: string,
  updateObj: any
): Promise<{
  userText?: string
  replyText?: string
  executedResults: AgentToolExecutionResult[]
  pendingConfirmations: AgentToolCallRequest[]
}> {
  const executedResults: AgentToolExecutionResult[] = []
  const pendingConfirmations: AgentToolCallRequest[] = []
  const sectionContext = buildDefaultServerSectionContext()

  if (updateObj.callback_query) {
    const cq = updateObj.callback_query
    const chatId = cq.message?.chat?.id
    const dataStr = String(cq.data || '')

    if (dataStr.startsWith('confirm:')) {
      const confirmId = dataStr.replace('confirm:', '')
      const pendingCall = pendingTelegramConfirmations.get(confirmId)
      if (!pendingCall) {
        await answerCallbackQuery(botToken, cq.id, 'Esta confirmación ya expiró o fue ejecutada.')
        return { executedResults, pendingConfirmations }
      }
      pendingTelegramConfirmations.delete(confirmId)
      const execRes = await executeAgentToolServer(pendingCall, {
        sectionContext,
        currentCustomization: DEFAULT_CUSTOMIZATION_CONFIG
      })
      executedResults.push(execRes)
      await answerCallbackQuery(botToken, cq.id, 'Acción confirmada y ejecutada')
      const replyText = `${execRes.success ? '✅' : '⚠️'} *Acción confirmada en Atlas:*\n${execRes.summaryEs}`
      if (chatId) {
        await sendTelegramMessage(botToken, chatId, replyText)
      }
      return { replyText, executedResults, pendingConfirmations }
    }

    if (dataStr.startsWith('cancel:')) {
      const confirmId = dataStr.replace('cancel:', '')
      pendingTelegramConfirmations.delete(confirmId)
      await answerCallbackQuery(botToken, cq.id, 'Acción cancelada')
      const replyText = '❌ *Acción cancelada por el usuario.*'
      if (chatId) {
        await sendTelegramMessage(botToken, chatId, replyText)
      }
      return { replyText, executedResults, pendingConfirmations }
    }
  }

  const tgMessage = updateObj.message || updateObj.edited_message
  if (tgMessage && tgMessage.text) {
    const chatId = tgMessage.chat?.id
    const text = String(tgMessage.text).trim()

    if (text === '/start' || text === '/help') {
      const welcome = [
        '🤖 *Hermes — Conectado a tu Atlas de Guardados*',
        '',
        `📊 *Estado en vivo:* ${sectionContext.totalRepos} repositorios GitHub | ${sectionContext.totalBookmarks} registros en Biblioteca | ${sectionContext.fallbackLinksCount} con "El Link de ese Link" | ${sectionContext.separatedCount} separados off-topic.`,
        '',
        'Escribime en lenguaje natural igual que en el chat de la app:',
        '• _"Guardá este repo https://github.com/upstash/context7"_',
        '• _"¿Cuántos repositorios y guardados tengo?"_',
        '• _"Investigá los links y comentarios pendientes"_',
        '• _"Separá los archivos off-topic no técnicos"_',
        '• _"Recomendame un stack para un agente con MCP y Telegram"_'
      ].join('\n')

      if (botToken && chatId) {
        await sendTelegramMessage(botToken, chatId, welcome)
      }
      return { userText: text, replyText: welcome, executedResults, pendingConfirmations }
    }

    const inferredCalls = inferNaturalLanguageToolCalls(
      text,
      sectionContext,
      'confirm_sensitive'
    )

    for (const call of inferredCalls) {
      if (shouldRequireToolConfirmation(call.toolName, 'confirm_sensitive')) {
        pendingConfirmations.push(call)
      } else {
        const res = await executeAgentToolServer(call, {
          sectionContext,
          currentCustomization: DEFAULT_CUSTOMIZATION_CONFIG
        })
        executedResults.push(res)
      }
    }

    const replyParts: string[] = []
    for (const ex of executedResults) {
      replyParts.push(`${ex.success ? '✅' : '⚠️'} ${ex.summaryEs}`)
    }

    if (pendingConfirmations.length > 0 && botToken && chatId) {
      for (const pending of pendingConfirmations) {
        const shortId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        pendingTelegramConfirmations.set(shortId, pending)
        await sendTelegramMessage(
          botToken,
          chatId,
          `🛡️ *Confirmación requerida por Hermes*\nHerramienta: \`${pending.toolName}\`\nMotivo: ${pending.reasonEs}`,
          [
            [
              { text: '✅ Confirmar y Ejecutar', callback_data: `confirm:${shortId}` },
              { text: '❌ Cancelar', callback_data: `cancel:${shortId}` }
            ]
          ]
        )
      }
    }

    if (replyParts.length === 0 && pendingConfirmations.length === 0) {
      replyParts.push(
        `🤖 *Hermes (Atlas)*: Recibí tu mensaje (_"${text}"_). Tenés *${sectionContext.totalRepos} repositorios de GitHub* y *${sectionContext.totalBookmarks} guardados totales*. Decime si querés guardar un link, buscar un recurso, auditar un repo o armar un stack.`
      )
    }

    const finalReply = replyParts.join('\n\n')
    if (finalReply && botToken && chatId) {
      await sendTelegramMessage(botToken, chatId, finalReply)
    }

    return {
      userText: text,
      replyText: finalReply,
      executedResults,
      pendingConfirmations
    }
  }

  return { executedResults, pendingConfirmations }
}

export async function GET() {
  const ctx = buildDefaultServerSectionContext()
  return NextResponse.json({
    success: true,
    service: 'Atlas de Guardados — Hermes & Telegram Bridge',
    telegramBotConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    hermesGatewayConfigured: Boolean(process.env.HERMES_GATEWAY_URL),
    toolsAvailable: ATLAS_AGENT_TOOLS.length,
    statusSummary: {
      totalBookmarks: ctx.totalBookmarks,
      totalRepos: ctx.totalRepos,
      separatedOffTopic: ctx.separatedCount,
      fallbackLinksCount: ctx.fallbackLinksCount
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const botToken = String(body.botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim()

    // 1. Verify Bot & Connect (works both via Webhook AND via Long-Polling on localhost/Vercel)
    if (body.action === 'register-webhook') {
      if (!botToken) {
        return NextResponse.json(
          { success: false, error: 'Pegá primero el Token de tu Bot de Telegram (de @BotFather).' },
          { status: 400 }
        )
      }

      // Always verify the bot token first via getMe
      const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
      const meData = await meRes.json().catch(() => null)
      if (!meRes.ok || !meData?.ok) {
        return NextResponse.json(
          {
            success: false,
            error: `Token rechazado por Telegram: ${meData?.description || 'Verificá que sea un token de @BotFather (formato 123456:ABC...). Si es una API Key de Hermes/OpenRouter, pegala arriba en "Hermes Key ★".'}`
          },
          { status: 400 }
        )
      }

      const botUsername = meData.result?.username ? `@${meData.result.username}` : meData.result?.first_name || 'Bot'
      const host = req.nextUrl.host || ''
      const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')

      // Delete any blocked webhook first so getUpdates polling works everywhere immediately
      await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`).catch(() => null)

      let mode = 'polling'
      let webhookUrl = `${req.nextUrl.protocol}//${host}/api/agent/telegram`

      if (!isLocalhost && body.preferWebhook) {
        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            allowed_updates: ['message', 'callback_query']
          })
        })
        const tgData = await tgRes.json().catch(() => null)
        if (tgData?.ok) {
          mode = 'webhook'
        }
      }

      return NextResponse.json({
        success: true,
        botUsername,
        mode,
        webhookUrl,
        message: `✅ Bot ${botUsername} verificado y vinculado con Hermes (modo ${
          mode === 'polling' ? 'Sincronización Directa en Vivo sin necesidad de túnel' : 'Webhook HTTPS'
        }). Mandale un mensaje a ${botUsername} en Telegram (ej. "/start" o "Guardá https://github.com/owner/repo") y se ejecutará automáticamente.`
      })
    }

    // 2. Poll Telegram Updates (getUpdates) so Telegram works on localhost AND behind Vercel Auth
    if (body.action === 'poll-updates') {
      if (!botToken || !/^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(botToken)) {
        return NextResponse.json({ success: false, updatesProcessed: 0 })
      }
      const offsetParam = lastProcessedUpdateId > 0 ? `?offset=${lastProcessedUpdateId + 1}&timeout=1` : '?timeout=1'
      const updRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates${offsetParam}`)
      const updData = await updRes.json().catch(() => null)
      if (!updData?.ok || !Array.isArray(updData.result) || updData.result.length === 0) {
        return NextResponse.json({ success: true, updatesProcessed: 0, events: [] })
      }

      const events = []
      for (const upd of updData.result) {
        if (typeof upd.update_id === 'number' && upd.update_id > lastProcessedUpdateId) {
          lastProcessedUpdateId = upd.update_id
        }
        const out = await processSingleTelegramUpdate(botToken, upd)
        if (out.userText || out.replyText || out.executedResults.length > 0) {
          events.push(out)
        }
      }

      return NextResponse.json({
        success: true,
        updatesProcessed: events.length,
        events
      })
    }

    // 3. Direct Hermes external command
    if (body.action === 'hermes-command') {
      const text = String(body.text || body.message || '').trim()
      if (!text) {
        return NextResponse.json(
          { success: false, error: 'Se requiere un comando en "text" o "message".' },
          { status: 400 }
        )
      }
      const out = await processSingleTelegramUpdate(botToken, {
        message: { text, chat: { id: body.chatId || 0 } }
      })
      return NextResponse.json({
        success: true,
        agent: 'hermes',
        ...out
      })
    }

    // 4. Standard Incoming Webhook Payload from Telegram
    if (body.message || body.edited_message || body.callback_query) {
      const out = await processSingleTelegramUpdate(botToken, body)
      return NextResponse.json({ ok: true, ...out })
    }

    return NextResponse.json({ ok: true, message: 'No Telegram message payload found.' })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Error en el puente Hermes / Telegram' },
      { status: 500 }
    )
  }
}
