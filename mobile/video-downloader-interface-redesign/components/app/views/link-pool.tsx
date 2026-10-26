'use client'

import { useMemo, useState, useEffect, type Dispatch, type SetStateAction } from 'react'
import { Bookmark, Check, Clock, Copy, Download, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { detectPlatform, type Platform, type PoolLink } from '@/lib/data'
import { EmptyState, PageHeader, Panel, PlatformBadge } from '../primitives'

const filters: { id: Platform | 'all'; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
]

export function LinkPoolView({
  pool,
  setPool,
}: {
  pool: PoolLink[]
  setPool: Dispatch<SetStateAction<PoolLink[]>>
}) {
  const [filter, setFilter] = useState<Platform | 'all'>('all')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pool.map((p) => p.id)))
  const [copied, setCopied] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const fetchPool = async () => {
    try {
      const res = await fetch('/api/saved-links')
      const data = await res.json()
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.links) ? data.links : [])
      if (list.length >= 0) {
        const mapped: PoolLink[] = list.map((d: any, i: number) => ({
          id: d.id || `pool_${i}_${Date.now()}`,
          url: d.url,
          platform: detectPlatform(d.url) || 'tiktok',
          addedAt: d.savedAt ? new Date(d.savedAt).toLocaleString() : 'Az önce',
        }))
        setPool(mapped)
        setSelected(new Set(mapped.map((p) => p.id)))
      }
    } catch {}
  }

  useEffect(() => {
    fetchPool()
  }, [])

  const visible = useMemo(
    () => (filter === 'all' ? pool : pool.filter((p) => p.platform === filter)),
    [pool, filter],
  )
  const selectedCount = visible.filter((p) => selected.has(p.id)).length
  const allSelected = visible.length > 0 && selectedCount === visible.length

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const p of visible) {
        if (allSelected) next.delete(p.id)
        else next.add(p.id)
      }
      return next
    })

  const copy = async (link: PoolLink) => {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(link.id)
      setTimeout(() => setCopied(null), 1500)
    } catch {}
  }

  const handleClearAll = async () => {
    if (!confirm('Tüm link havuzu temizlensin mi?')) return
    try {
      await fetch('/api/saved-links', { method: 'DELETE' })
      setPool([])
      setSelected(new Set())
    } catch {}
  }

  const handleDownloadSelected = async () => {
    const toDownload = visible.filter((p) => selected.has(p.id))
    if (toDownload.length === 0) return

    setIsDownloading(true)
    setStatusMsg(`${toDownload.length} video indiriliyor...`)

    for (const item of toDownload) {
      try {
        await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url }),
        })
      } catch {}
    }

    setIsDownloading(false)
    setStatusMsg('İndirme tamamlandı! Arşiv sekmesinden izleyebilirsiniz.')
    setTimeout(() => setStatusMsg(null), 4000)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="04 — Kütüphane"
        title="Link Havuzu"
        description="Eklenti ve tarayıcıların topladığı linkler burada. İncele, seç ve tek seferde indir."
        actions={
          <>
            <Button variant="outline" size="lg" className="h-10 px-4" onClick={fetchPool}>
              <RefreshCw data-icon="inline-start" />
              Yenile
            </Button>
            <Button
              variant="destructive"
              size="lg"
              className="h-10 px-4"
              onClick={handleClearAll}
              disabled={!pool.length}
            >
              <Trash2 data-icon="inline-start" />
              Tümünü temizle
            </Button>
          </>
        }
      />

      {statusMsg && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          {statusMsg}
        </div>
      )}

      <Panel icon={<Bookmark />} title="Toplanan linkler" description={`${pool.length} link havuzda`}>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-background/40 p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Platform filtresi">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'h-8 rounded-lg px-3 text-xs font-medium transition-colors',
                  filter === f.id
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 md:justify-end">
            <span className="text-xs text-muted-foreground">
              <span className="font-mono text-foreground">{selectedCount}</span> / {visible.length} seçildi
            </span>
            <Button
              size="lg"
              className="h-9 px-4"
              onClick={handleDownloadSelected}
              disabled={!selectedCount || isDownloading}
            >
              <Download data-icon="inline-start" />
              {isDownloading ? 'İndiriliyor...' : 'Seçilenleri indir'}
            </Button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Bookmark />}
              title="Havuz boş"
              description="Keşfet modu ya da tarayıcı eklentisi ile link topladığında burada görünecek."
            />
          </div>
        ) : (
          <>
            <label className="mt-4 flex items-center gap-3 px-3 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="size-4 cursor-pointer rounded accent-[var(--primary)]"
              />
              Tümünü seç
            </label>
            <ul className="mt-2 flex flex-col gap-2">
              {visible.map((link) => {
                const isSelected = selected.has(link.id)
                return (
                  <li
                    key={link.id}
                    className={cn(
                      'group flex flex-col gap-3 rounded-xl border p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between',
                      isSelected
                        ? 'border-primary/40 bg-primary/[0.04]'
                        : 'border-border bg-background/30 hover:border-foreground/15',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(link.id)}
                        className="size-4 cursor-pointer rounded accent-[var(--primary)]"
                      />
                      <PlatformBadge platform={link.platform} />
                      <span className="truncate font-mono text-xs text-foreground/90">{link.url}</span>
                    </div>

                    <div className="flex items-center justify-between gap-3 pl-7 sm:pl-0">
                      <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                        <Clock className="size-3" />
                        {link.addedAt}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => copy(link)}
                          className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Kopyala"
                        >
                          {copied === link.id ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                        </button>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Tarayıcıda aç"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Panel>
    </div>
  )
}
