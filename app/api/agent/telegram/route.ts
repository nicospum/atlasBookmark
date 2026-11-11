import { NextRequest, NextResponse } from 'next/server'
import {
  ATLAS_AGENT_TOOLS,
  executeAgentToolServer,
  inferNaturalLanguageToolCalls,
  shouldRequireToolConfirmation
} from '@/lib/agent-tools'
import { DEFAULT_CUSTOMIZATION_CONFIG } from '@/lib/customization-store'
import { getAllBookmarks, getAllGalleryRepositories } from '@/lib/bookmarks-repository'
import type { AgentSectionContext, AgentToolCallRequest } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Store pending confirmations in-memory for Telegram inline button callbacks
const pendingTelegramConfirmations = new Map<string, AgentToolCallRequest>()

function buildDefaultServerSectionContext(): AgentSectionContext {
  const bookmarks = getAllBookmarks()
  const repos = getAllGalleryRepositories()
  const separatedCount = bookmarks.filter(
    b => b.resourceType === 'Archivo separado / Otro tema (No técnico)'
  ).length
  const fallbackLinksCount = bookmarks.filter(b =>
    (b.urls || []).some(u => String(u).startsWith('fallback_ref:'))
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
    },
    usage: {
      telegramWebhookUrl: '/api/agent/telegram',
      registerAction: 'POST /api/agent/telegram { "action": "register-webhook", "botToken": "...", "webhookUrl": "https://tu-dominio.vercel.app/api/agent/telegram" }',
      hermesDirectAction: 'POST /api/agent/telegram { "action": "hermes-command", "text": "Guardá https://github.com/owner/repo" }'
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const botToken = String(body.botToken || process.env.TELEGRAM_BOT_TOKEN || '').trim()

    // 1. Register Telegram Webhook in 1 click from the web app
    if (body.action === 'register-webhook') {
      if (!botToken) {
        return NextResponse.json(
          { success: false, error: 'Falta TELEGRAM_BOT_TOKEN para registrar el webhook.' },
          { status: 400 }
        )
      }
      const origin =
        String(body.webhookUrl || '').trim() ||
        `${req.nextUrl.protocol}//${req.nextUrl.host}/api/agent/telegram`

      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: origin,
          allowed_updates: ['message', 'callback_query']
        })
      })
      const tgData = await tgRes.json()
      return NextResponse.json({
        success: Boolean(tgData.ok),
        webhookUrl: origin,
        telegramResponse: tgData
      })
    }

    // 2. Direct Hermes external bridge command (e.g. from local Hermes daemon / CLI / MCP)
    if (body.action === 'hermes-command') {
      const text = String(body.text || body.message || '').trim()
      if (!text) {
        return NextResponse.json(
          { success: false, error: 'Se requiere un comando en "text" o "message".' },
          { status: 400 }
        )
      }
      const sectionContext = buildDefaultServerSectionContext()
      const inferredCalls = inferNaturalLanguageToolCalls(
        text,
        sectionContext,
        'confirm_sensitive'
      )
      const executedResults = []
      const pendingConfirmations = []

      for (const call of inferredCalls) {
        if (call.requiresConfirmation && !body.autoConfirmSensitive) {
          pendingConfirmations.push(call)
        } else {
          const res = await executeAgentToolServer(
            call.toolName,
            call.args,
            DEFAULT_CUSTOMIZATION_CONFIG,
            sectionContext
          )
          executedResults.push(res)
        }
      }

      const replyLines: string[] = []
      if (executedResults.length > 0) {
        for (const r of executedResults) {
          replyLines.push(`${r.success ? '✅' : '⚠️'} ${r.summaryEs}`)
        }
      } else if (pendingConfirmations.length > 0) {
        for (const p of pendingConfirmations) {
          replyLines.push(`🛡️ Confirmación requerida para \`${p.toolName}\`: ${p.reasonEs}`)
        }
      } else {
        replyLines.push(
          `🤖 **Hermes (Atlas Bridge)**: Estado actual: **${sectionContext.totalBookmarks} guardados**, **${sectionContext.totalRepos} repos GitHub**, **${sectionContext.fallbackLinksCount} enlaces de referencia** y **${sectionContext.separatedCount} archivos separados**.`
        )
      }

      return NextResponse.json({
        success: true,
        agent: 'hermes',
        replyText: replyLines.join('\n\n'),
        executedResults,
        pendingConfirmations
      })
    }

    // 3. Telegram Callback Query (Confirm / Cancel button clicked inside Telegram)
    if (body.callback_query) {
      const cq = body.callback_query
      const chatId = cq.message?.chat?.id
      const dataStr = String(cq.data || '')

      if (dataStr.startsWith('confirm:')) {
        const confirmId = dataStr.replace('confirm:', '')
        const pendingCall = pendingTelegramConfirmations.get(confirmId)
        if (!pendingCall) {
          await answerCallbackQuery(botToken, cq.id, 'Esta confirmación ya expiró o fue ejecutada.')
          return NextResponse.json({ ok: true })
        }
        pendingTelegramConfirmations.delete(confirmId)
        const sectionContext = buildDefaultServerSectionContext()
        const execRes = await executeAgentToolServer(
          pendingCall.toolName,
          pendingCall.args,
          DEFAULT_CUSTOMIZATION_CONFIG,
          sectionContext
        )
        await answerCallbackQuery(botToken, cq.id, 'Acción confirmada y ejecutada')
        if (chatId) {
          await sendTelegramMessage(
            botToken,
            chatId,
            `${execRes.success ? '✅' : '⚠️'} *Acción confirmada en Atlas:*\n${execRes.summaryEs}`
          )
        }
        return NextResponse.json({ ok: true, executed: execRes })
      }

      if (dataStr.startsWith('cancel:')) {
        const confirmId = dataStr.replace('cancel:', '')
        pendingTelegramConfirmations.delete(confirmId)
        await answerCallbackQuery(botToken, cq.id, 'Acción cancelada')
        if (chatId) {
          await sendTelegramMessage(botToken, chatId, '❌ *Acción cancelada por el usuario.*')
        }
        return NextResponse.json({ ok: true, cancelled: true })
      }
    }

    // 4. Standard Telegram Incoming Message Webhook
    const tgMessage = body.message || body.edited_message
    if (tgMessage && tgMessage.text) {
      const chatId = tgMessage.chat?.id
      const text = String(tgMessage.text).trim()

      // Optional allowlist of Telegram chat IDs for security
      const allowedChats = String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      if (allowedChats.length > 0 && !allowedChats.includes(String(chatId))) {
        if (botToken && chatId) {
          await sendTelegramMessage(
            botToken,
            chatId,
            `⛔ Tu Chat ID (\`${chatId}\`) no está en TELEGRAM_ALLOWED_CHAT_IDS.`
          )
        }
        return NextResponse.json({ ok: true, unauthorized: true })
      }

      const sectionContext = buildDefaultServerSectionContext()

      if (text === '/start' || text === '/help') {
        const welcome = [
          '🤖 *Hermes — Conectado a tu Atlas de Guardados*',
          '',
          `📊 *Estado en vivo:* ${sectionContext.totalBookmarks} guardados | ${sectionContext.totalRepos} repos GitHub | ${sectionContext.fallbackLinksCount} con "El Link de ese Link" | ${sectionContext.separatedCount} separados off-topic.`,
          '',
          'Podés escribirme en lenguaje natural igual que en el chat de la app:',
          '• _"Guardá este repo https://github.com/upstash/context7"_',
          '• _"¿Cuántos guardados y repos tengo ahora?"_',
          '• _"Investigá los links y comentarios pendientes"_',
          '• _"Separá los archivos off-topic no técnicos"_',
          '• _"Recomendame un stack para un agente con MCP y Telegram"_',
          '• _"Auditá la seguridad de pbakaus/impeccable"_'
        ].join('\n')

        if (botToken && chatId) {
          await sendTelegramMessage(botToken, chatId, welcome)
        }
        return NextResponse.json({ ok: true, replyText: welcome })
      }

      const inferredCalls = inferNaturalLanguageToolCalls(
        text,
        sectionContext,
        'confirm_sensitive'
      )

      const executedResults = []
      const pendingConfirmations = []

      for (const call of inferredCalls) {
        if (shouldRequireToolConfirmation(call.toolName, 'confirm_sensitive')) {
          pendingConfirmations.push(call)
        } else {
          const res = await executeAgentToolServer(
            call.toolName,
            call.args,
            DEFAULT_CUSTOMIZATION_CONFIG,
            sectionContext
          )
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
          `🤖 *Hermes (Atlas)*: Recibí tu mensaje. Actualmente tenés *${sectionContext.totalBookmarks} guardados* y *${sectionContext.totalRepos} repositorios*. Decime si querés guardar un link, buscar un recurso, auditar un repo o armar un stack.`
        )
      }

      if (replyParts.length > 0 && botToken && chatId) {
        await sendTelegramMessage(botToken, chatId, replyParts.join('\n\n'))
      }

      return NextResponse.json({
        ok: true,
        executedResults,
        pendingConfirmations
      })
    }

    return NextResponse.json({ ok: true, message: 'No Telegram message payload found.' })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Error en el puente Hermes / Telegram' },
      { status: 500 }
    )
  }
}
