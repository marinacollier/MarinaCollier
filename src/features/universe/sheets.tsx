/** Sheets of Meu Universo, rendered locally by the page (no global registry): detail, item form, diary form, profile. */
import { useMemo, useRef, useState } from 'react'
import { Camera, Heart, NotebookPen, Pencil, Scale as ScaleIcon, X } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { Button, Chip, ChipSelect, DateInput, Field, MoreOptions, MultiChipSelect, NumberInput, Select, SheetLayout, TextArea, TextInput, TitleInput } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { DateKey, NewItem, ScentLog, ScentLogStatus, ScentProfile, UniverseCategory, UniverseItem, UniverseNotesSource, UniverseOccasion, UniverseOpinion, UniverseOwnership } from '@/data/types'
import {
  CATEGORY_LABEL,
  CONFIRM_LABEL,
  DIARY_STATUS_LABEL,
  NOTES_SOURCE_LABEL,
  OCCASION_LABEL,
  OPINION_LABEL,
  OWNERSHIP_LABEL,
  closestOwned,
  isOwned,
  itemTitle,
  money,
  pricePerMl,
} from '@/data/universe/model'
import { formatShortDate } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { resizeImageFile } from '@/features/learning/image'
import { Bottle, PriceInput, Scale, StatusPills, confirmText, listToText, textToList } from './parts'
import { nextItemOrder, removeItemWithUndo, removeLogWithUndo, saveLog } from './ops'

const opts = <T extends string>(labels: Record<T, string>) => (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }))

const REMAINING: Record<NonNullable<UniverseItem['remaining']>, string> = { cheio: 'Cheio', mais_da_metade: 'Mais da metade', metade: 'Metade', pouco: 'Pouco', vazio: 'Vazio' }
const REBUY: Record<NonNullable<UniverseItem['rebuy']>, string> = { sim: 'Recompraria', talvez: 'Talvez', nao: 'Não recompraria' }
const WOULD_BUY: Record<NonNullable<ScentLog['wouldBuy']>, string> = { sim: 'Sim', talvez: 'Talvez', nao: 'Não' }

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-line/70 last:border-0">
      <div className="eyebrow">{label}</div>
      <div className="text-[14.5px] mt-0.5">{children}</div>
    </div>
  )
}

// ─── Detail ─────────────────────────────────────────────────────────────────

export function ItemDetailSheet({ id, onClose, onEdit, onLog, onCompare }: { id: string; onClose: () => void; onEdit: () => void; onLog: () => void; onCompare: () => void }) {
  const db = useDB()
  const item = db.universeItems.find((i) => i.id === id)
  const logs = useMemo(() => db.scentLogs.filter((l) => l.itemId === id).sort((a, b) => b.date.localeCompare(a.date)), [db.scentLogs, id])
  const close = useMemo(() => (item && !isOwned(item) ? closestOwned(db, item) : undefined), [db, item])
  if (!item) return <SheetLayout title="Não encontrado" onClose={onClose}>{null}</SheetLayout>
  const perMl = pricePerMl(item)
  return (
    <SheetLayout
      eyebrow={item.brand ?? CATEGORY_LABEL[item.category]}
      title={`${item.name}${item.version ? ` ${item.version}` : ''}`}
      onClose={onClose}
      onDelete={() => {
        removeItemWithUndo(item.id)
        onClose()
      }}
      footerExtra={
        <Button variant="soft" size="md" icon={<NotebookPen size={16} />} onClick={onLog}>
          diário
        </Button>
      }
      primary={{ label: 'Editar', onClick: onEdit }}
    >
      <div className="flex gap-4 items-start">
        <Bottle item={item} size={84} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-[13px] text-muted">{CATEGORY_LABEL[item.category]}</div>
          <StatusPills item={item} />
          <div className="flex gap-2">
            <Chip
              selected={!!item.favorite}
              onClick={() => {
                actions.update('universeItems', item.id, { favorite: !item.favorite })
                haptic('light')
              }}
            >
              <Heart size={14} className={item.favorite ? 'fill-current' : undefined} /> favorito
            </Chip>
            <Chip onClick={onCompare}>
              <ScaleIcon size={14} /> comparar
            </Chip>
          </div>
        </div>
      </div>
      {!item.confirmed && item.needsConfirmation?.length ? (
        <div className="rounded-2xl bg-sand-soft text-[13.5px] px-4 py-3">
          <span className="font-medium">A confirmar:</span> {confirmText(item)}.
          <button
            type="button"
            className="block mt-1.5 underline underline-offset-2 text-ink-2"
            onClick={() => {
              actions.update('universeItems', item.id, { confirmed: true, needsConfirmation: [] })
              toast('Marcado como confirmado ✓')
            }}
          >
            Já confirmei tudo
          </button>
        </div>
      ) : null}
      <div>
        {(item.families?.length || item.description) && <Detail label="Perfil">{[item.families?.join(' · '), item.description].filter(Boolean).join(' — ')}</Detail>}
        <Detail label={item.notesSource ? NOTES_SOURCE_LABEL[item.notesSource] : 'Notas'}>{item.notes?.length ? item.notes.join(' · ') : <span className="text-muted">sem notas registradas</span>}</Detail>
        {(item.occasions?.length || item.occasionText) && <Detail label="Ocasiões (usos habituais)">{item.occasionText || item.occasions!.map((o) => OCCASION_LABEL[o]).join(', ')}</Detail>}
        {item.priceCents ? (
          <Detail label="Preço">
            {money(item.priceCents, item.currency)}
            {item.sizeMl ? ` · ${item.sizeMl} ml` : ''}
            {perMl ? ` · ${money(perMl, item.currency)}/ml` : ''}
          </Detail>
        ) : item.sizeMl ? (
          <Detail label="Tamanho">{item.sizeMl} ml</Detail>
        ) : null}
        {(item.country || item.city || item.store) && <Detail label="Onde">{[item.store, item.city, item.country].filter(Boolean).join(' · ')}</Detail>}
        {(item.acquiredOn || item.experiencedOn) && (
          <Detail label="Datas">{[item.experiencedOn && `testado em ${formatShortDate(item.experiencedOn)}`, item.acquiredOn && `comprado em ${formatShortDate(item.acquiredOn)}`].filter(Boolean).join(' · ')}</Detail>
        )}
        {(item.remaining || item.rebuy) && <Detail label="Consumo">{[item.remaining && `restante: ${REMAINING[item.remaining].toLowerCase()}`, item.rebuy && REBUY[item.rebuy]].filter(Boolean).join(' · ')}</Detail>}
        {item.wishGroup && <Detail label="Wishlist">{`${item.wishGroup}${item.wishPriority ? ` · prioridade ${item.wishPriority}` : ''}`}</Detail>}
        {close && <Detail label="Na sua coleção, o mais próximo">{`${itemTitle(close.item)} — em comum: ${close.shared.join(', ')}`}</Detail>}
        {item.observations && <Detail label="Observações">{item.observations}</Detail>}
      </div>
      {logs.length > 0 && (
        <div>
          <div className="eyebrow mb-1.5">Diário</div>
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="rounded-2xl bg-surface-2/60 px-3.5 py-2.5 text-[13.5px]">
                <div className="flex justify-between gap-2">
                  <span>{[formatShortDate(l.date), l.city].filter(Boolean).join(' · ')}</span>
                  {l.verdict && <span className="text-plum">{OPINION_LABEL[l.verdict].toLowerCase()}</span>}
                </div>
                {l.firstImpression && <div className="text-ink-2 mt-0.5">{l.firstImpression}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[12px] text-muted">
        {item.source === 'seed' ? 'Veio do que você contou para o app.' : item.source === 'lumos' ? 'Registrado pela Lumos a partir do que você disse.' : 'Registrado por você.'}
      </p>
    </SheetLayout>
  )
}

// ─── Item form ──────────────────────────────────────────────────────────────

export function ItemFormSheet({ id, defaults, onClose }: { id?: string; defaults?: Partial<UniverseItem>; onClose: () => void }) {
  const existing = useDB((db) => db.universeItems).find((i) => i.id === id)
  const [d, setD] = useState<Partial<UniverseItem>>(() => existing ?? { category: 'perfume', ownership: 'tenho', ...defaults })
  const [families, setFamilies] = useState(() => listToText(existing?.families))
  const [notes, setNotes] = useState(() => listToText(existing?.notes))
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<UniverseItem>) => setD((x) => ({ ...x, ...patch }))
  const wished = d.ownership === 'quero_testar' || d.ownership === 'desejo'

  const save = () => {
    const name = (d.name ?? '').trim()
    if (!name) return
    const fam = textToList(families)
    const nts = textToList(notes)
    const data = {
      ...d,
      name,
      brand: d.brand?.trim() || undefined,
      version: d.version?.trim() || undefined,
      families: fam.length ? fam : undefined,
      notes: nts.length ? nts : undefined,
      notesSource: nts.length ? (d.notesSource ?? 'impressao') : d.notesSource,
    }
    if (existing) actions.update('universeItems', existing.id, data)
    else
      actions.create('universeItems', {
        ...data,
        category: d.category ?? 'perfume',
        ownership: d.ownership ?? 'tenho',
        source: 'marina',
        confirmed: d.confirmed ?? true,
        order: nextItemOrder(),
      } as NewItem<'universeItems'>)
    haptic('success')
    toast(existing ? 'Salvo ✓' : `${name} entrou ${wished ? 'na wishlist' : 'no seu universo'} ✓`)
    onClose()
  }

  return (
    <SheetLayout
      eyebrow={existing ? 'editar' : 'novo no meu universo'}
      title={existing ? itemTitle(existing) : undefined}
      onClose={onClose}
      onDelete={
        existing
          ? () => {
              removeItemWithUndo(existing.id)
              onClose()
            }
          : undefined
      }
      primary={{ label: 'Salvar', onClick: save, disabled: !(d.name ?? '').trim() }}
    >
      <TitleInput autoFocus={!existing} placeholder="Nome (ex.: Libre Intense)" value={d.name ?? ''} onChange={(e) => set({ name: e.target.value })} aria-label="Nome" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca">
          <TextInput value={d.brand ?? ''} onChange={(e) => set({ brand: e.target.value })} placeholder="YSL" />
        </Field>
        <Field label="Versão / concentração">
          <TextInput value={d.version ?? ''} onChange={(e) => set({ version: e.target.value })} placeholder="EDP" />
        </Field>
      </div>
      <Field label="Categoria">
        <Select<UniverseCategory> value={d.category} onChange={(v) => set({ category: v ?? 'perfume' })} options={opts(CATEGORY_LABEL)} />
      </Field>
      <Field label="Na minha vida" hint="Posse é separada da opinião: amar não quer dizer ter.">
        <ChipSelect<UniverseOwnership> value={d.ownership} onChange={(v) => v && set({ ownership: v })} options={opts(OWNERSHIP_LABEL)} />
      </Field>
      <Field label="O que eu acho">
        <ChipSelect<UniverseOpinion> clearable value={d.opinion} onChange={(v) => set({ opinion: v })} options={opts(OPINION_LABEL)} />
      </Field>
      <Field label="Família / perfil" hint="Separe por vírgula. Ex.: floral âmbar">
        <TextInput value={families} onChange={(e) => setFamilies(e.target.value)} placeholder="floral âmbar" />
      </Field>
      <Field label="Notas" hint="Só o que você sabe — campo vazio é melhor que nota inventada.">
        <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="lavanda, flor de laranjeira" />
        <ChipSelect<UniverseNotesSource> clearable className="mt-2" value={d.notesSource} onChange={(v) => set({ notesSource: v })} options={opts(NOTES_SOURCE_LABEL)} />
      </Field>
      <Field label="Ocasiões (usos habituais)">
        <MultiChipSelect<UniverseOccasion> value={d.occasions ?? []} onChange={(v) => set({ occasions: v })} options={opts(OCCASION_LABEL)} />
      </Field>
      <MoreOptions label="preço, onde, consumo, foto">
        <Field label="Ocasião nas suas palavras">
          <TextInput value={d.occasionText ?? ''} onChange={(e) => set({ occasionText: e.target.value || undefined })} />
        </Field>
        <Field label="Características">
          <TextArea rows={2} value={d.description ?? ''} onChange={(e) => set({ description: e.target.value || undefined })} />
        </Field>
        <Field label="Preço">
          <PriceInput cents={d.priceCents} currency={d.currency} onChange={(c, cur) => set({ priceCents: c, currency: cur })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tamanho (ml)">
            <NumberInput value={d.sizeMl} onChange={(v) => set({ sizeMl: v })} />
          </Field>
          <Field label="Loja">
            <TextInput value={d.store ?? ''} onChange={(e) => set({ store: e.target.value || undefined })} />
          </Field>
          <Field label="Cidade">
            <TextInput value={d.city ?? ''} onChange={(e) => set({ city: e.target.value || undefined })} />
          </Field>
          <Field label="País">
            <TextInput value={d.country ?? ''} onChange={(e) => set({ country: e.target.value || undefined })} />
          </Field>
          <Field label="Testado em">
            <DateInput value={d.experiencedOn} onChange={(v) => set({ experiencedOn: v })} />
          </Field>
          <Field label="Comprado em">
            <DateInput value={d.acquiredOn} onChange={(v) => set({ acquiredOn: v })} />
          </Field>
        </div>
        <Field label="Quanto resta">
          <ChipSelect clearable value={d.remaining} onChange={(v) => set({ remaining: v })} options={opts(REMAINING)} />
        </Field>
        <Field label="Recompra">
          <ChipSelect clearable value={d.rebuy} onChange={(v) => set({ rebuy: v })} options={opts(REBUY)} />
        </Field>
        {wished && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Grupo da wishlist">
              <TextInput value={d.wishGroup ?? ''} onChange={(e) => set({ wishGroup: e.target.value || undefined })} placeholder="Meus desejos" />
            </Field>
            <Field label="Prioridade">
              <NumberInput value={d.wishPriority} onChange={(v) => set({ wishPriority: v })} />
            </Field>
          </div>
        )}
        <Field label="Foto">
          <div className="flex items-center gap-3">
            {d.photo && <img src={d.photo} alt="" className="h-16 w-16 rounded-[14px] object-cover" />}
            <Button variant="soft" size="sm" icon={<Camera size={14} />} onClick={() => fileRef.current?.click()}>
              {d.photo ? 'trocar foto' : 'adicionar foto'}
            </Button>
            {d.photo && (
              <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => set({ photo: undefined })}>
                tirar
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                try {
                  set({ photo: await resizeImageFile(f, 480) })
                } catch {
                  toast('Não consegui abrir essa imagem')
                }
              }}
            />
          </div>
        </Field>
        <Field label="Observações">
          <TextArea rows={2} value={d.observations ?? ''} onChange={(e) => set({ observations: e.target.value || undefined })} />
        </Field>
        {existing && !existing.confirmed && (
          <Field label="A confirmar" hint={confirmText(existing) || undefined}>
            <Chip selected={d.confirmed} onClick={() => set(d.confirmed ? { confirmed: false, needsConfirmation: existing.needsConfirmation } : { confirmed: true, needsConfirmation: [] })}>
              já confirmei
            </Chip>
          </Field>
        )}
      </MoreOptions>
    </SheetLayout>
  )
}

// ─── Diary form ─────────────────────────────────────────────────────────────

type LogDraft = Partial<ScentLog>
const NEW = '__new__'

export function LogFormSheet({ id, itemId, today, onClose }: { id?: string; itemId?: string; today: DateKey; onClose: () => void }) {
  const db = useDB()
  const existing = db.scentLogs.find((l) => l.id === id)
  const [d, setD] = useState<LogDraft>(() => existing ?? { itemId, date: today, testedOn: 'pele' })
  const [newBrand, setNewBrand] = useState('')
  const [newName, setNewName] = useState('')
  const set = (patch: LogDraft) => setD((x) => ({ ...x, ...patch }))
  const items = useMemo(
    () =>
      [...db.universeItems]
        .filter((i) => i.category !== 'maquiagem' && i.category !== 'lugar' && i.category !== 'cafe' && i.category !== 'restaurante')
        .sort((a, b) => Number(isOwned(b)) - Number(isOwned(a)) || itemTitle(a).localeCompare(itemTitle(b))),
    [db.universeItems],
  )
  const creating = d.itemId === NEW || (!d.itemId && !items.length)
  const valid = !!d.date && (creating ? !!newName.trim() : !!d.itemId)

  const save = () => {
    if (!valid) return
    const payload = { ...d, itemId: creating ? '' : d.itemId!, date: d.date!, source: existing?.source ?? 'marina', confirmed: d.confirmed ?? true } as NewItem<'scentLogs'> & { id?: string }
    saveLog(payload, creating ? { brand: newBrand.trim() || undefined, name: newName.trim() } : undefined)
    haptic('success')
    toast(existing ? 'Registro salvo ✓' : 'Registrado no diário olfativo ✓')
    onClose()
  }

  return (
    <SheetLayout
      eyebrow="diário olfativo"
      title={existing ? 'Editar registro' : 'Nova experiência'}
      onClose={onClose}
      onDelete={
        existing
          ? () => {
              removeLogWithUndo(existing.id)
              onClose()
            }
          : undefined
      }
      primary={{ label: 'Salvar', onClick: save, disabled: !valid }}
    >
      <Field label="Fragrância">
        <Select
          value={d.itemId}
          onChange={(v) => set({ itemId: v })}
          placeholder="Escolha…"
          options={[...items.map((i) => ({ value: i.id, label: `${itemTitle(i)} · ${OWNERSHIP_LABEL[i.ownership].toLowerCase()}` })), { value: NEW, label: '+ Outra fragrância (nova)' }]}
        />
      </Field>
      {creating && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca">
            <TextInput value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />
          </Field>
          <Field label="Nome">
            <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data">
          <DateInput value={d.date} onChange={(v) => set({ date: v })} />
        </Field>
        <Field label="Cidade">
          <TextInput value={d.city ?? ''} onChange={(e) => set({ city: e.target.value || undefined })} />
        </Field>
        <Field label="País">
          <TextInput value={d.country ?? ''} onChange={(e) => set({ country: e.target.value || undefined })} />
        </Field>
        <Field label="Concentração">
          <TextInput value={d.concentration ?? ''} onChange={(e) => set({ concentration: e.target.value || undefined })} placeholder="EDP, EDT, body mist…" />
        </Field>
      </div>
      <Field label="Testado em">
        <ChipSelect clearable value={d.testedOn} onChange={(v) => set({ testedOn: v })} options={[{ value: 'pele', label: 'Pele' }, { value: 'papel', label: 'Papel' }]} />
      </Field>
      <Field label="Primeira impressão">
        <TextArea rows={2} value={d.firstImpression ?? ''} onChange={(e) => set({ firstImpression: e.target.value || undefined })} />
      </Field>
      <Field label="Veredito">
        <ChipSelect<UniverseOpinion> clearable value={d.verdict} onChange={(v) => set({ verdict: v })} options={opts(OPINION_LABEL)} />
      </Field>
      <Field label="Compraria?">
        <ChipSelect clearable value={d.wouldBuy} onChange={(v) => set({ wouldBuy: v })} options={opts(WOULD_BUY)} />
      </Field>
      <Field label="Status" hint="“Comprado” e “em uso” colocam na sua coleção; testar não.">
        <ChipSelect<ScentLogStatus> clearable value={d.status} onChange={(v) => set({ status: v })} options={opts(DIARY_STATUS_LABEL)} />
      </Field>
      <MoreOptions label="evolução, sensações, preço">
        <Field label="Depois de 30 min">
          <TextInput value={d.after30min ?? ''} onChange={(e) => set({ after30min: e.target.value || undefined })} />
        </Field>
        <Field label="Depois de 2 h">
          <TextInput value={d.after2h ?? ''} onChange={(e) => set({ after2h: e.target.value || undefined })} />
        </Field>
        <Field label="Depois de 6 h">
          <TextInput value={d.after6h ?? ''} onChange={(e) => set({ after6h: e.target.value || undefined })} />
        </Field>
        <Field label="Doçura (1–5)">
          <Scale label="Doçura" value={d.sweetness} onChange={(v) => set({ sweetness: v })} />
        </Field>
        <Field label="Frescor (1–5)">
          <Scale label="Frescor" value={d.freshness} onChange={(v) => set({ freshness: v })} />
        </Field>
        <Field label="Cremosidade (1–5)">
          <Scale label="Cremosidade" value={d.creaminess} onChange={(v) => set({ creaminess: v })} />
        </Field>
        <Field label="Intensidade (1–5)">
          <Scale label="Intensidade" value={d.intensity} onChange={(v) => set({ intensity: v })} />
        </Field>
        <Field label="Conforto (1–5)">
          <Scale label="Conforto" value={d.comfort} onChange={(v) => set({ comfort: v })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Projeção percebida">
            <TextInput value={d.projection ?? ''} onChange={(e) => set({ projection: e.target.value || undefined })} />
          </Field>
          <Field label="Duração percebida">
            <TextInput value={d.duration ?? ''} onChange={(e) => set({ duration: e.target.value || undefined })} />
          </Field>
        </div>
        <Field label="Ocasião ideal">
          <TextInput value={d.idealOccasion ?? ''} onChange={(e) => set({ idealOccasion: e.target.value || undefined })} />
        </Field>
        <Field label="Minha nota (0–10)">
          <Scale label="Nota" max={10} value={d.score} onChange={(v) => set({ score: v })} />
        </Field>
        <Field label="Preço">
          <PriceInput cents={d.priceCents} currency={d.currency} onChange={(c, cur) => set({ priceCents: c, currency: cur })} />
        </Field>
        <Field label="Tamanho (ml)">
          <NumberInput value={d.sizeMl} onChange={(v) => set({ sizeMl: v })} />
        </Field>
        <Field label="Observações">
          <TextArea rows={2} value={d.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
        </Field>
        {existing && !existing.confirmed && (
          <Field label="A confirmar" hint={(existing.needsConfirmation ?? []).map((f) => CONFIRM_LABEL[f] ?? f).join(', ')}>
            <Chip selected={d.confirmed} onClick={() => set(d.confirmed ? { confirmed: false, needsConfirmation: existing.needsConfirmation } : { confirmed: true, needsConfirmation: [] })}>
              já confirmei
            </Chip>
          </Field>
        )}
      </MoreOptions>
    </SheetLayout>
  )
}

// ─── Olfactory profile ──────────────────────────────────────────────────────

export function ProfileFormSheet({ onClose }: { onClose: () => void }) {
  const current = useDB((db) => db.profile.scentProfile)
  const [summary, setSummary] = useState(current?.summary ?? '')
  const [liked, setLiked] = useState(listToText(current?.familiesLiked))
  const [less, setLess] = useState(listToText(current?.familiesLess))
  const [notes, setNotes] = useState(listToText(current?.notesOfInterest))
  const [remarks, setRemarks] = useState(current?.remarks ?? '')
  const [makeup, setMakeup] = useState(current?.makeupStyle ?? '')
  const save = () => {
    const next: ScentProfile = {
      summary: summary.trim() || undefined,
      familiesLiked: textToList(liked),
      familiesLess: textToList(less),
      notesOfInterest: textToList(notes),
      remarks: remarks.trim() || undefined,
      makeupStyle: makeup.trim() || undefined,
    }
    actions.setProfile({ scentProfile: next })
    haptic('success')
    toast('Perfil salvo ✓')
    onClose()
  }
  return (
    <SheetLayout eyebrow="meu DNA olfativo" title="Meu perfil" onClose={onClose} primary={{ label: 'Salvar', onClick: save }}>
      <Field label="Em poucas palavras">
        <TextArea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <Field label="Famílias preferidas" hint="Separe por vírgula.">
        <TextArea rows={2} value={liked} onChange={(e) => setLiked(e.target.value)} />
      </Field>
      <Field label="Menos prioritárias">
        <TextArea rows={2} value={less} onChange={(e) => setLess(e.target.value)} />
      </Field>
      <Field label="Notas de interesse">
        <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Field label="Observações">
        <TextArea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </Field>
      <Field label="Estilo de maquiagem">
        <TextArea rows={2} value={makeup} onChange={(e) => setMakeup(e.target.value)} />
      </Field>
      <p className="text-[12px] text-muted flex items-center gap-1.5">
        <Pencil size={12} /> A Lumos usa este perfil para explicar as sugestões — nunca como regra.
      </p>
    </SheetLayout>
  )
}
