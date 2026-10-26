'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Bookmark,
  Compass,
  Download,
  Play,
  Square,
  Clock,
  Timer,
  CheckCircle2,
  Zap,
  Radio,
  ExternalLink,
  Sparkles,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { platformMeta, type Platform } from '@/lib/data'
import { PageHeader, Panel } from '../primitives'

// Sadece TikTok ve Instagram (YouTube Shorts kaldırıldı)
const sources: { id: Platform; name: string; detail: string }[] = [
  { id: 'tiktok', name: 'TikTok FYP', detail: 'Sana Özel akışından sonsuz çekim' },
  { id: 'instagram', name: 'Instagram Reels', detail: 'Reels keşfet akışından video çekimi' },
]

const counts = [50, 100, 200, 500]
const actions = [
  { id: 'pool', label: 'Link havuzuna ekle', detail: 'Önce incele, sonra indir', icon: Bookmark },
  { id: 'download', label: 'Doğrudan indir', detail: 'Bulunanları hemen indir', icon: Download },
] as const

export function ExploreView({ onNavigateToPool }: { onNavigateToPool?: () => void }) {
  const [source, setSource] = useState<Platform>('tiktok')
  const [count, setCount] = useState(200)
  const [action, setAction] = useState<(typeof actions)[number]['id']>('pool')
  const [isRunning, setIsRunning] = useState(false)
  const [foundCount, setFoundCount] = useState(0)
  const [recentLinks, setRecentLinks] = useState<string[]>([])
  const [latestLink, setLatestLink] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [statusText, setStatusText] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const selected = sources.find((s) => s.id === source) || sources[0]

  // Geçen süre sayacı
  useEffect(() => {
    if (isRunning) {
      setElapsedSeconds(0)
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isRunning])

  // Backend'den gerçek zamanlı durum sorgusu (Aktifken 650ms hızlı döngü)
  useEffect(() => {
    let pollInterval: NodeJS.Timeout
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/harvest-status')
        const data = await res.json()
        const active = Boolean(data.isRunning)
        setIsRunning(active)
        if (data.found !== undefined) setFoundCount(data.found)
        if (Array.isArray(data.recentLinks) && data.recentLinks.length > 0) {
          setRecentLinks(data.recentLinks)
        }
        if (data.latest) {
          setLatestLink(data.latest)
        }
        if (active) {
          pollInterval = setTimeout(checkStatus, 650)
        }
      } catch {
        setIsRunning(false)
      }
    }
    checkStatus()
    return () => clearTimeout(pollInterval)
  }, [isRunning])

  // Tarayıcıyı Başlat / Durdur
  const handleToggle = async () => {
    if (isRunning) {
      setStatusText('Tarama durduruluyor...')
      try {
        await fetch('/api/harvest-stop', { method: 'POST' })
        await fetch('/api/harvest/stop', { method: 'POST' }).catch(() => {})
      } catch {}
      setIsRunning(false)
      setStatusText('Tarama kullanıcı tarafından durduruldu.')
      setTimeout(() => setStatusText(null), 3500)
    } else {
      setStatusText('Playwright otomasyonu başlatılıyor...')
      try {
        const res = await fetch('/api/harvest-start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: source,
            count,
            autoDownload: action === 'download',
          }),
        })
        const data = await res.json()
        if (data.success) {
          setIsRunning(true)
          setStatusText(`${selected.name} üzerinde gerçek zamanlı tarama başladı!`)
        } else {
          setStatusText(`Hata: ${data.error || 'Başlatılamadı'}`)
        }
      } catch (err: any) {
        setStatusText(`Bağlantı hatası: ${err.message}`)
      }
    }
  }

  // Hesaplamalar
  const remainingVideos = Math.max(0, count - foundCount)
  const averageSecondsPerVideo = foundCount > 2 ? elapsedSeconds / foundCount : 1.8
  const estimatedRemainingSecs = Math.ceil(remainingVideos * averageSecondsPerVideo)
  const progressPercent = Math.min(100, Math.round((foundCount / count) * 100))

  const formatSecs = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    if (m > 0) return `${m} dk ${s < 10 ? '0' : ''}${s} sn`
    return `${s} sn`
  }

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="03 — Keşfet & Topla"
        title="Keşfet Modu"
        description="Akışları otomatik olarak tara, trend videoları link havuzuna topla veya doğrudan indir. Gerçek zamanlı sayaç ile çekilen videoları canlı izle."
      />

      {statusText && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-sm text-foreground flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Radio className="size-4 text-primary animate-pulse" />
            {statusText}
          </span>
          {onNavigateToPool && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onNavigateToPool}>
              Link Havuzunu Gör
            </Button>
          )}
        </div>
      )}

      {/* GERÇEK ZAMANLI VİDEO ÇEKİM GÖSTERGESİ (PROMINENT REAL-TIME DASHBOARD) */}
      <div className="rounded-2xl border border-border bg-gradient-to-b from-card/90 via-card/50 to-background p-6 shadow-xl relative overflow-hidden backdrop-blur-sm">
        {/* Arka plan siber ızgara ışıltısı */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col gap-5 relative z-10">
          {/* Durum Başlığı */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="relative flex size-3">
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full rounded-full opacity-75',
                    isRunning ? 'animate-ping bg-emerald-400' : 'bg-muted-foreground/40'
                  )}
                />
                <span
                  className={cn(
                    'relative inline-flex size-3 rounded-full',
                    isRunning ? 'bg-emerald-500' : 'bg-muted-foreground'
                  )}
                />
              </span>
              <span className="text-sm font-bold tracking-wide uppercase">
                {isRunning
                  ? 'Canlı Video Çekiliyor'
                  : foundCount > 0
                  ? 'Tarama Tamamlandı / Durduruldu'
                  : 'Tarayıcı Hazır Bekliyor'}
              </span>
              <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground border border-border/50">
                {selected.name}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {onNavigateToPool && foundCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 font-medium border-primary/30 hover:bg-primary/10"
                  onClick={onNavigateToPool}
                >
                  <Bookmark className="size-3.5 text-primary" />
                  Havuzu İncele ({foundCount})
                </Button>
              )}
            </div>
          </div>

          {/* Büyük Gerçek Zamanlı Sayaç ve İlerleme */}
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] items-center">
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-foreground">
                  {foundCount}
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-muted-foreground">
                  / {count} <span className="text-xs uppercase font-sans font-medium">Video</span>
                </span>
                <span
                  className={cn(
                    'ml-auto text-lg sm:text-xl font-mono font-black px-3 py-1 rounded-lg border',
                    progressPercent >= 100
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : isRunning
                      ? 'bg-primary/20 text-primary border-primary/30 animate-pulse'
                      : 'bg-card text-muted-foreground border-border'
                  )}
                >
                  %{progressPercent}
                </span>
              </div>

              {/* İlerleme Çubuğu */}
              <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-muted/70 p-0.5 shadow-inner">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-600 via-primary to-orange-500 transition-all duration-300 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                  style={{ width: `${Math.max(isRunning ? 6 : 0, progressPercent)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                <span>0 video</span>
                <span>Hedef: {count} video</span>
              </div>
            </div>

            {/* Gerçek Zamanlı 4'lü Metrik Kartları */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-border/70 bg-card/70 p-3 flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase">
                  <Clock className="size-3 text-primary" />
                  Geçen Süre
                </span>
                <span className="font-mono text-base font-bold text-foreground">
                  {formatElapsed(elapsedSeconds)}
                </span>
              </div>

              <div className="rounded-xl border border-border/70 bg-card/70 p-3 flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase">
                  <Timer className="size-3 text-emerald-400" />
                  Kalan Tahmini
                </span>
                <span className="font-mono text-base font-bold text-emerald-400">
                  {isRunning
                    ? remainingVideos > 0
                      ? `~${formatSecs(estimatedRemainingSecs)}`
                      : 'Bitiyor'
                    : '-'}
                </span>
              </div>

              <div className="rounded-xl border border-border/70 bg-card/70 p-3 flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase">
                  <Zap className="size-3 text-amber-400" />
                  Kalan Video
                </span>
                <span className="font-mono text-base font-bold text-foreground">
                  {remainingVideos} video
                </span>
              </div>

              <div className="rounded-xl border border-border/70 bg-card/70 p-3 flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase">
                  <Layers className="size-3 text-blue-400" />
                  Aksiyon
                </span>
                <span className="text-xs font-bold text-foreground truncate">
                  {action === 'download' ? 'Doğrudan İndir' : 'Link Havuzu'}
                </span>
              </div>
            </div>
          </div>

          {/* Canlı Yakalanan Link Akışı (Streaming Logs) */}
          {(recentLinks.length > 0 || isRunning) && (
            <div className="mt-2 rounded-xl border border-border/80 bg-black/40 p-3.5 flex flex-col gap-2 font-mono text-xs">
              <div className="flex items-center justify-between text-muted-foreground pb-1 border-b border-border/40">
                <span className="flex items-center gap-2 font-semibold text-[11px] uppercase tracking-wider text-foreground">
                  <Sparkles className="size-3.5 text-primary" />
                  Anlık Yakalanan Video Akışı
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {recentLinks.length > 0 ? `Son ${recentLinks.length} video` : 'Akış taranıyor...'}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                {recentLinks.map((link, idx) => (
                  <div
                    key={`${link}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-card/40 px-2.5 py-1.5 border border-border/40 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate text-foreground/90 font-medium">
                        {link}
                      </span>
                    </div>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                      title="Tarayıcıda aç"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                ))}

                {isRunning && (
                  <div className="flex items-center gap-2 text-primary text-[11px] py-1 px-2 animate-pulse">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>Yeni videolar taranıyor ve akış aşağı kaydırılıyor...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel icon={<Compass />} title="Otomatik içerik tarayıcı" description="Kaynağı, hedefi ve aksiyonu seç.">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Kaynak Platform (YouTube Shorts kaldırıldı)
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {sources.map((s) => (
                <ChoiceCard key={s.id} active={source === s.id} onClick={() => setSource(s.id)}>
                  <span aria-hidden className={cn('size-2 rounded-full', platformMeta[s.id].dot)} />
                  <span className="mt-3 text-sm font-semibold text-foreground">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.detail}</span>
                </ChoiceCard>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Hedef Video Sayısı
            </legend>
            <div className="inline-flex rounded-xl border border-border bg-card/60 p-1 shadow-sm">
              {counts.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={count === c}
                  onClick={() => setCount(c)}
                  className={cn(
                    'h-9 rounded-lg px-4 font-mono text-sm font-semibold transition-colors',
                    count === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Aksiyon
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {actions.map((a) => (
                <ChoiceCard key={a.id} active={action === a.id} onClick={() => setAction(a.id)} row>
                  <a.icon className="size-4 text-primary" />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">{a.label}</span>
                    <span className="text-xs text-muted-foreground">{a.detail}</span>
                  </span>
                </ChoiceCard>
              ))}
            </div>
          </fieldset>
        </Panel>

        <Panel title="Özet & Kontrol" className="h-fit lg:sticky lg:top-12">
          <dl className="flex flex-col gap-3.5 text-sm">
            <SummaryRow label="Kaynak" value={selected.name} />
            <SummaryRow label="Hedef" value={`${count} video`} />
            <SummaryRow label="Aksiyon" value={actions.find((a) => a.id === action)!.label} />
            
            {isRunning ? (
              <>
                <div className="my-1 border-t border-border/60" />
                <SummaryRow
                  label="Geçen Süre"
                  value={
                    <span className="flex items-center gap-1.5 font-mono text-primary font-bold">
                      <Clock className="size-3.5" />
                      {formatElapsed(elapsedSeconds)}
                    </span>
                  }
                />
                <SummaryRow
                  label="Kalan Tahmini"
                  value={
                    <span className="flex items-center gap-1.5 font-mono text-emerald-400 font-semibold">
                      <Timer className="size-3.5" />
                      {remainingVideos > 0 ? `~${formatSecs(estimatedRemainingSecs)}` : 'Tamamlanıyor'}
                    </span>
                  }
                />
                <SummaryRow
                  label="Canlı Çekilen"
                  value={
                    <span className="font-mono font-bold text-foreground">
                      {foundCount} / {count}
                    </span>
                  }
                />
              </>
            ) : (
              <SummaryRow
                label="Tahmini Süre"
                value={`~${Math.ceil((count * 1.8) / 60)} dakika`}
              />
            )}
          </dl>

          <Button
            size="lg"
            variant={isRunning ? 'destructive' : 'default'}
            className="mt-6 h-11 w-full shadow-[0_10px_30px_-10px_var(--primary)] font-semibold"
            onClick={handleToggle}
          >
            {isRunning ? (
              <>
                <Square data-icon="inline-start" className="fill-current size-4" />
                Taramayı Durdur ({foundCount} video)
              </>
            ) : (
              <>
                <Play data-icon="inline-start" className="size-4" />
                Taramayı Başlat
              </>
            )}
          </Button>
        </Panel>
      </div>
    </div>
  )
}

function ChoiceCard({
  active,
  onClick,
  row,
  children,
}: {
  active: boolean
  onClick: () => void
  row?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex rounded-xl border p-4 text-left transition-colors',
        row ? 'items-center gap-3' : 'flex-col',
        active
          ? 'border-primary/60 bg-primary/[0.12] ring-2 ring-primary/20 shadow-sm'
          : 'border-border bg-card/60 hover:border-foreground/25',
      )}
    >
      {children}
    </button>
  )
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  )
}
