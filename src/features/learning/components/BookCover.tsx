import { useState } from 'react'
import type { Book } from '@/data/types'
import { cn } from '@/lib/cn'
import { coverTone, coverVariant } from '../selectors'

const JACKET: Record<string, string> = {
  accent: 'bg-accent text-bg',
  sage: 'bg-sage text-bg',
  ocean: 'bg-ocean text-bg',
  plum: 'bg-plum text-bg',
  sand: 'bg-sand text-bg',
  ink: 'bg-ink text-bg',
}

function initials(title: string): string {
  const words = title.replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean)
  return (words[0]?.[0] ?? '·').toUpperCase() + (words[1]?.[0] ?? '').toLowerCase()
}

export interface BookCoverProps {
  book: Pick<Book, 'title' | 'author' | 'coverUrl'>
  /** Width in px; height follows a 2:3 book ratio. */
  width: number
  className?: string
}

/**
 * A book jacket. Uses the cover image when there is one; otherwise an editorial,
 * typographic jacket whose color comes from a stable hash of the title.
 */
export function BookCover({ book, width, className }: BookCoverProps) {
  const [broken, setBroken] = useState<string | null>(null)
  const height = Math.round(width * 1.5)
  const hasImage = !!book.coverUrl && broken !== book.coverUrl
  const toneKey = coverTone(book.title || '?')
  const variant = coverVariant(book.title || '?')
  const small = width < 76
  const pad = Math.max(6, Math.round(width * 0.09))
  const titleSize = Math.round(width * (variant === 1 ? 0.125 : 0.14))
  const authorSize = Math.max(7, Math.round(width * 0.062))

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-[3px_8px_8px_3px] shadow-[0_1px_1px_rgb(0_0_0/0.08),0_10px_22px_-10px_rgb(40_25_10/0.45)] select-none',
        !hasImage && JACKET[toneKey],
        className,
      )}
      style={{ width, height }}
      aria-label={`Capa de ${book.title}`}
      role="img"
    >
      {!hasImage && toneKey !== 'ink' && <div className="pointer-events-none absolute inset-0 hidden dark:block bg-black/25" />}
      {hasImage ? (
        <img
          src={book.coverUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          draggable={false}
          onError={() => setBroken(book.coverUrl ?? null)}
        />
      ) : small ? (
        <div className="absolute inset-0 flex items-center justify-center font-display italic" style={{ fontSize: Math.round(width * 0.4) }}>
          {initials(book.title)}
        </div>
      ) : variant === 0 ? (
        <div className="absolute inset-0 flex flex-col" style={{ padding: pad, paddingLeft: pad + width * 0.05 }}>
          <div className="uppercase tracking-[0.18em] opacity-80 font-semibold truncate" style={{ fontSize: authorSize }}>
            {book.author || 'marina os'}
          </div>
          <div className="mt-[8%] h-px w-1/3 bg-current opacity-40" />
          <div className="font-display leading-[1.04] mt-[10%] break-words hyphens-auto line-clamp-5" style={{ fontSize: titleSize, fontWeight: 520 }}>
            {book.title}
          </div>
          <div className="mt-auto font-display opacity-70" style={{ fontSize: authorSize * 1.5 }}>
            ✦
          </div>
        </div>
      ) : variant === 1 ? (
        <div className="absolute inset-0" style={{ padding: pad * 0.75, paddingLeft: pad * 0.75 + width * 0.04 }}>
          <div className="h-full w-full border border-current/35 rounded-[2px] flex flex-col items-center justify-center text-center" style={{ padding: pad * 0.7 }}>
            <div className="font-display italic leading-[1.08] px-[0.12em] break-words hyphens-auto line-clamp-5" style={{ fontSize: titleSize }}>
              {book.title}
            </div>
            <div className="my-[9%] h-px w-6 bg-current opacity-45" />
            {book.author && (
              <div className="uppercase tracking-[0.16em] opacity-80 font-semibold line-clamp-2" style={{ fontSize: authorSize }}>
                {book.author}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col" style={{ padding: pad, paddingLeft: pad + width * 0.05 }}>
          <div className="font-display italic leading-none opacity-25 -mt-[4%] -ml-[2%]" style={{ fontSize: Math.round(width * 0.62) }} aria-hidden>
            {initials(book.title).slice(0, 1).toLowerCase()}
          </div>
          <div className="mt-auto font-display leading-[1.05] pr-[0.1em] break-words hyphens-auto line-clamp-4" style={{ fontSize: titleSize, fontWeight: 560 }}>
            {book.title}
          </div>
          {book.author && (
            <div className="mt-[7%] opacity-80 truncate" style={{ fontSize: authorSize + 1 }}>
              {book.author}
            </div>
          )}
        </div>
      )}
      {/* spine + paper light */}
      <div className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-black/25 via-black/5 to-transparent" style={{ width: Math.max(4, width * 0.07) }} />
      <div className="pointer-events-none absolute inset-y-0 bg-white/20" style={{ left: Math.max(4, width * 0.07), width: 1 }} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/12 via-transparent to-black/10" />
    </div>
  )
}
