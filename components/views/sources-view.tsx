'use client'

import React, { useMemo } from 'react'
import { FolderHeart, ExternalLink, ArrowRight, X as XIcon, Camera } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BookmarkItem } from '@/lib/types'

interface SourcesViewProps {
  items: BookmarkItem[]
  onSelectAuthor: (authorHandle: string) => void
  onOpenDetail: (item: BookmarkItem) => void
}

export function SourcesView({ items, onSelectAuthor, onOpenDetail }: SourcesViewProps) {
  // Aggregate creators
  const creators = useMemo(() => {
    const map: Record<string, {
      name: string
      handle: string
      platform: 'x' | 'instagram'
      avatar?: string
      count: number
      items: BookmarkItem[]
    }> = {}

    items.forEach(item => {
      const key = `${item.platform}:${item.authorHandle}`
      if (!map[key]) {
        map[key] = {
          name: item.authorName,
          handle: item.authorHandle,
          platform: item.platform,
          avatar: item.authorAvatar,
          count: 0,
          items: []
        }
      }
      map[key].count++
      map[key].items.push(item)
    })

    return Object.values(map).sort((a, b) => b.count - a.count)
  }, [items])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[#8e83f2]">Creadores y Canales</p>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-[-0.04em] text-foreground">
            Fuentes de Contenido
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Los perfiles, autores y publicaciones que más valor aportan a tu archivo personal.
          </p>
        </div>

        <Badge variant="outline" className="border-border bg-[#16181f] text-xs text-muted-foreground">
          {creators.length} autores guardados
        </Badge>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {creators.map(creator => {
          const profileUrl =
            creator.platform === 'x'
              ? `https://x.com/${creator.handle.replace('@', '')}`
              : `https://instagram.com/${creator.handle.replace('@', '')}`

          return (
            <Card
              key={`${creator.platform}-${creator.handle}`}
              className="flex flex-col justify-between border-border/80 bg-card/70 transition-all hover:border-[#7c6cf0]/50 hover:bg-[#1a1c24]"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {creator.avatar ? (
                      <img
                        src={creator.avatar}
                        alt={creator.name}
                        className="size-10 rounded-full border border-border object-cover"
                      />
                    ) : (
                      <div className="grid size-10 place-items-center rounded-full bg-[#353743] text-xs font-semibold">
                        {creator.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-sm font-medium text-foreground">
                        {creator.name}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        {creator.handle}
                      </CardDescription>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={`gap-1 text-[11px] font-normal ${
                      creator.platform === 'x'
                        ? 'border-[#49436f] bg-[#222138] text-[#bfb8ff]'
                        : 'border-[#6f435f] bg-[#38212e] text-[#f2a8d6]'
                    }`}
                  >
                    {creator.platform === 'x' ? <XIcon className="size-2.5" /> : <Camera className="size-2.5" />}
                    {creator.platform === 'x' ? 'X' : 'IG'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="flex flex-col gap-3 pt-0">
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-[#121319] px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Guardados de este autor:</span>
                  <span className="font-semibold text-[#8e83f2]">{creator.count}</span>
                </div>

                {creator.items[0] && (
                  <p
                    onClick={() => onOpenDetail(creator.items[0])}
                    className="cursor-pointer truncate font-serif text-xs text-[#cbc9d8] transition-colors hover:text-foreground"
                  >
                    “{creator.items[0].caption.slice(0, 70)}...”
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ExternalLink className="size-3" /> Ver perfil
                  </a>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectAuthor(creator.handle)}
                    className="text-xs text-[#a59cf5] hover:bg-[#252836]"
                  >
                    Ver en biblioteca <ArrowRight className="size-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
