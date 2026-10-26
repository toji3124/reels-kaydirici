'use client'

import { useMemo, useState } from 'react'
import { ClipboardPaste, Download, Link2, Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { detectPlatform, type Platform } from '@/lib/data'
import { PageHeader, Panel, PlatformBadge } from '../primitives'

type QueueItem = { id: string; url: string; platform: Platform; progress: number; status: string }

const MAX_LINKS = 1000

export function UrlDownloaderView() {
  const [text, setText] = useState('')
  const [parallel, setParallel] = useState(25)
  const [queue, setQueue] = useState<QueueItem[]>([])

  const links = useMemo(
    () => text.split(/\s+/).map((l) => l.trim()).filter(Boolean),
    [text],
  )
  const counts = useMemo(() => {
    const c: Partial<Record<Platform, number>> = {}
    for (const l of links) {
      const p = detectPlatform(l)
      if (p) c[p] = (c[p] ?? 0) + 1
    }
    return c
  }, [links])

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText()
      setText((t) => (t ? `${t}\n${clip}` : clip))
    } catch {}
  }

  const handleStart = async () => {
    const rawLinks = links.filter((l) => detectPlatform(l))
    if (rawLinks.length === 0) return

    const newItems: QueueItem[] = rawLinks.map((url, i) => ({
      id: `${Date.now()}-${i}`,
      url: url,
      platform: detectPlatform(url) || 'tiktok',
      progress: 0,
      status: 'Sırada',
    }))

    setQueue((q) => [...newItems, ...q])
    setText('')

    const queueToProcess = [...newItems]
    const concurrency = Math.min(parallel, 10)

    const processItem = async (item: QueueItem) => {
      setQueue((q) =>
        q.map((x) => (x.id === item.id ? { ...x, progress: 40, status: 'İndiriliyor...' } : x))
      )
      try {
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url }),
        })
        const data = await res.json()
        if (data.success) {
          setQueue((q) =>
            q.map((x) => (x.id === item.id ? { ...x, progress: 100, status: 'Tamamlandı' } : x))
          )
        } else {
          setQueue((q) =>
            q.map((x) => (x.id === item.id ? { ...x, progress: 0, status: 'Hata' } : x))
          )
        }
      } catch {
        setQueue((q) =>
          q.map((x) => (x.id === item.id ? { ...x, progress: 0, status: 'Bağlantı Hatası' } : x))
        )
      }
    }

    const workers = []
    for (let i = 0; i < concurrency; i++) {
      workers.push(
        (async () => {
          while (queueToProcess.length > 0) {
            const item = queueToProcess.shift()
            if (item) await processItem(item)
          }
        })()
      )
    }
    await Promise.all(workers)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="01 — İndir"
        title="URL İndirici"
        description="Instagram Reels, TikTok ve YouTube linklerini toplu olarak yapıştır, tek tıkla paralel indir."
        actions={
          <Button variant="outline" size="lg" className="h-10 px-4" onClick={handlePaste}>
            <ClipboardPaste data-icon="inline-start" />
            Panodan yapıştır
          </Button>
        }
      />

      <Panel
        icon={<Link2 />}
        title="Toplu link içe aktar"
        description="Her satıra bir link gelecek şekilde yapıştır."
      >
        <div className="relative">
          <label htmlFor="links" className="sr-only">
            Video linkleri
          </label>
          <textarea
            id="links"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            spellCheck={false}
            placeholder={'https://www.instagram.com/reel/ABC123...\nhttps://www.tiktok.com/@user/video/123456...\nhttps://www.youtube.com/shorts/1tSrULuaDIo'}
            className="w-full resize-y rounded-xl border border-input bg-background/60 p-4 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 outline-none transition focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-primary/20"
          />
          <span className="pointer-events-none absolute right-3 bottom-3 rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
            {links.length} / {MAX_LINKS}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(['instagram', 'tiktok', 'youtube'] as const).map((p) => (
            <span key={p} className="flex items-center gap-2">
              <PlatformBadge platform={p} />
              <span className="font-mono text-xs text-muted-foreground">{counts[p] ?? 0}</span>
            </span>
          ))}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            size="lg"
            className="h-10 px-4 text-muted-foreground"
            onClick={() => setText('')}
            disabled={!text}
          >
            <Trash2 data-icon="inline-start" />
            Temizle
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Paralel</span>
              <div className="flex h-10 items-center rounded-xl border border-input bg-background/60">
                <button
                  type="button"
                  className="flex size-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  onClick={() => setParallel((v) => Math.max(1, v - 1))}
                >
                  <Minus className="size-3.5" />
                  <span className="sr-only">Azalt</span>
                </button>
                <span className="w-8 text-center font-mono text-sm">{parallel}</span>
                <button
                  type="button"
                  className="flex size-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  onClick={() => setParallel((v) => Math.min(50, v + 1))}
                >
                  <Plus className="size-3.5" />
                  <span className="sr-only">Artır</span>
                </button>
              </div>
            </div>
            <Button
              size="lg"
              className="h-10 px-5 shadow-[0_10px_30px_-10px_var(--primary)]"
              onClick={handleStart}
              disabled={links.length === 0}
            >
              <Download data-icon="inline-start" />
              İndirmeyi başlat
            </Button>
          </div>
        </div>
      </Panel>

      <Panel
        title="İndirme kuyruğu"
        description={`${queue.length} öğe`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => setQueue([])} disabled={!queue.length}>
            Kuyruğu temizle
          </Button>
        }
      >
        {queue.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Kuyruk boş.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {queue.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                <PlatformBadge platform={item.platform} className="self-start sm:self-auto" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90">{item.url}</span>
                <div className="flex items-center gap-3 sm:w-64">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={item.progress === 100 ? 'h-full bg-success' : 'h-full bg-primary'}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <span className="w-20 text-right text-xs text-muted-foreground">{item.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
