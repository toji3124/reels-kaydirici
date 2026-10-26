import type { ComponentProps, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { platformMeta, type Platform } from '@/lib/data'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <header className="stagger flex flex-col gap-4 border-b border-border/60 pb-8 mb-8 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-primary/90">
          <span aria-hidden className="h-px w-6 bg-primary/60" />
          {eyebrow}
        </p>
        <h1 className="text-balance bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-3xl font-semibold tracking-tight text-transparent md:text-4xl">
          {title}
        </h1>
        <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Panel({
  title,
  description,
  icon,
  actions,
  className,
  children,
}: {
  title?: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'panel-hover animate-fade-up rounded-2xl border border-border bg-gradient-to-b from-card to-card/60 p-5 shadow-[0_1px_0_0_oklch(1_0_0/0.035)_inset] backdrop-blur-xl md:p-6',
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {icon && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-gradient-to-br from-primary/15 to-primary/5 text-primary shadow-[0_0_20px_-6px_var(--primary)] [&_svg]:size-4">
                {icon}
              </span>
            )}
            <div className="flex flex-col gap-0.5">
              {title && <h2 className="text-base font-semibold">{title}</h2>}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export const inputClass =
  'h-11 w-full rounded-xl border border-input bg-black/40 px-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all duration-300 hover:border-foreground/15 focus-visible:border-primary/50 focus-visible:bg-black/60 focus-visible:ring-4 focus-visible:ring-primary/10'

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />
}

export function SelectField({
  className,
  children,
  ...props
}: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select
        className={cn(inputClass, 'cursor-pointer appearance-none pr-10 [&>option]:bg-popover')}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
    </label>
  )
}

export function PlatformBadge({ platform, className }: { platform: Platform; className?: string }) {
  const meta = platformMeta[platform]
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 text-[11px] font-medium text-foreground/90',
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background/30 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground [&_svg]:size-5">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-sm text-pretty text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

export function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
