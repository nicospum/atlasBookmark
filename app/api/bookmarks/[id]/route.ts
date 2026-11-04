import { NextRequest, NextResponse } from 'next/server'
import {
  getBookmarkById,
  updateBookmark,
  deleteBookmark
} from '@/lib/bookmarks-repository'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const decodedId = decodeURIComponent(id)
    const item = getBookmarkById(decodedId)
    if (!item) {
      return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 })
    }
    return NextResponse.json({ success: true, item })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const decodedId = decodeURIComponent(id)
    const body = await req.json()

    const updated = updateBookmark(decodedId, {
      ...(typeof body.reviewed === 'boolean' ? { reviewed: body.reviewed } : {}),
      ...(Array.isArray(body.topics) ? { topics: body.topics, classificationStatus: 'manual' } : {}),
      ...(typeof body.aiSummary === 'string' ? { aiSummary: body.aiSummary } : {}),
      ...(Array.isArray(body.entities) ? { entities: body.entities } : {}),
      ...(typeof body.language === 'string' ? { language: body.language } : {})
    })

    return NextResponse.json({ success: true, item: updated })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return PUT(req, context)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const decodedId = decodeURIComponent(id)
    deleteBookmark(decodedId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
