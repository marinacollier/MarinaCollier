import type { Place } from '@/data/types'
import { ufTiles, type AreaStatus } from '@/data/places/model'
import { cn } from '@/lib/cn'

const TILE: Record<AreaStatus | 'none', string> = {
  moro: 'bg-accent text-bg border-accent',
  visitei: 'bg-accent-soft text-accent border-accent/35',
  quero_ir: 'bg-surface text-sand border-sand border-dashed',
  none: 'bg-surface-2/70 text-muted/80 border-transparent',
}

const STATUS_WORD: Record<AreaStatus, string> = { moro: 'moro aqui', visitei: 'conheço', quero_ir: 'quero conhecer' }

/** The 27 UFs as a tile grid (roughly where they sit on the map). Plain CSS, no map library. */
export function BrazilGrid({ places, selected, onTile }: { places: Place[]; selected?: string; onTile: (uf: string, known: boolean) => void }) {
  const tiles = ufTiles(places)
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 max-w-[340px] mx-auto" role="list" aria-label="Estados do Brasil">
        {tiles.map((t) => (
          <button
            key={t.uf}
            type="button"
            role="listitem"
            onClick={() => onTile(t.uf, !!t.status && t.status !== 'quero_ir')}
            aria-label={`${t.name}${t.status ? ` — ${STATUS_WORD[t.status]}` : ''}`}
            aria-pressed={selected === t.uf}
            style={{ gridColumnStart: t.col + 1, gridRowStart: t.row + 1 }}
            className={cn(
              'aspect-square rounded-[10px] border text-[11.5px] font-semibold tracking-wide flex items-center justify-center transition active:scale-95',
              TILE[t.status ?? 'none'],
              selected === t.uf && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
            )}
          >
            {t.uf}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-4 text-[12px] text-muted">
        <Legend cls={TILE.visitei}>conheço</Legend>
        <Legend cls={TILE.moro}>moro</Legend>
        <Legend cls={TILE.quero_ir}>quero conhecer</Legend>
      </div>
    </div>
  )
}

function Legend({ cls, children }: { cls: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded-[4px] border', cls)} aria-hidden />
      {children}
    </span>
  )
}
