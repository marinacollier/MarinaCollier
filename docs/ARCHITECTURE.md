# MARINA OS — Architecture & shared contracts

> em constante movimento: corpo, mente e vida.

This document is the contract every module follows. If something here conflicts with a feature's
convenience, the contract wins.

## Stack

- React 19 + TypeScript (strict) + Vite 7 + Tailwind CSS 4
- State: one zustand store (`src/data/store.ts`) holding the whole DB
- Persistence: IndexedDB via `idb-keyval`, behind `StorageAdapter` (`src/data/storage.ts`)
- Motion: framer-motion · Drag & drop: @dnd-kit · Icons: lucide-react
- PWA: vite-plugin-pwa (Workbox, offline shell, autoUpdate)
- Tests: vitest + jsdom + fake-indexeddb · Lint: ESLint 9 flat config

## Folder layout and ownership

```
src/
  app/            routes, sheet registry, ui-store (sheets/toasts), undo, theme  [Architect]
  components/ui   design-system components                                       [Architect]
  components/layout  bottom nav, FAB, sheet host, quick add                      [Architect]
  data/           types (contracts), store, storage, defaults, selectors, seed composer [Architect]
  lib/            date (São Paulo), recurrence, money, text, haptics             [Architect]
  hooks/          useNow/useToday, useKeyboardInset                              [Architect]
  integrations/   providers, sync, ICS, backend client                           [Integrations]
  features/
    today/        Hoje, Top 3, Minha manhã, Agora, fechamento do dia           [Today & Routines]
    tasks/        TaskSheet (all tasks incl. work/life admin/waiting), TasksPage [Today & Routines]
    inbox/        Brain dump capture + triage, notes/ideas                       [Today & Routines]
    agenda/       timeline Hoje/Dia/Semana/Agenda, EventSheet                    [Calendar]
    body/         treinos, objetivos, alimentação, check-in                      [Sports & Wellness]
    finance/      dinheiro, gastos, compras planejadas, orçamento                [Finance]
    work/         Work OS, projetos, waiting for, wins, work inbox, reuniões     [Work OS]
    creator/      Creator / UGC pipeline + content planner                       [Content & UGC]
    learning/     estudos + livros                                               [Learning]
    travel/       viagens / Trip OS                                              [Travel]
    life/         Vida hub, Vida real (life admin), Luna                          [Life Admin]
    goals/        metas (dia/semana/maior)                                       [Goals & Reviews]
    reviews/      revisão semanal, meu mês                                       [Goals & Reviews]
    search/ assistant/ command/   busca universal, Lumos, command palette         [Lumos & Search]
    settings/     Mais, ajustes, personalizar, dados/backup, notificações, Welcome [Settings & Platform]
    integrations/ IntegrationsPage (UI for src/integrations)                      [Integrations]
```

**A module only edits files inside the folders it owns.** Shared files change only through the
Architect. Feature folders may contain any number of internal files (components, selectors, tests).

## Data rules

1. All entities and their fields are defined in `src/data/types.ts`. Never redefine an entity locally.
2. Dates are `DateKey` strings in America/Sao_Paulo. Use `src/lib/date.ts` — never `new Date().toISOString().slice(0,10)`
   (that is UTC and flips the day at 21h in São Paulo).
3. Money is integer cents. Use `formatBRL`, `parseBRL`, `<MoneyInput/>`.
4. Recurring things store a `Recurrence`; completions are `Occurrence`s
   (`actions.toggleOccurrence(parentType, id, date)`). Never mark the rule itself as done.
5. Anything mirrored from outside has `external: ExternalRef` (provider, externalId, globalId, syncStatus, syncHash, lastSyncedAt).
   Dedupe by provider+externalId, then globalId. Possible duplicates are flagged, never silently merged.
6. Generic entities over near-duplicates: `Task` covers ProjectTask / WaitingFor / LifeAdminItem;
   `TripItem` covers reservations/activities/packing; `Goal` covers day/week/long-term; `Expense` covers trip expenses and planned purchases.
7. Seeds: each feature exports a `FeatureSeed` from its `seed.ts` returning only its own collections.
   Cross-references use `SEED_IDS`. No invented appointments or money values. Unproven items use status `review` / `a_confirmar`.

## Reading and writing state

```ts
const db = useDB()                                        // whole DB
const tasks = useDB((db) => db.tasks)                     // one collection (stable ref)
const today = useToday()
const list = useMemo(() => tasksForDay(db, today), [db, today])  // derive in useMemo

actions.create('tasks', { title, status: 'todo', order: nextOrder(db.tasks) })
actions.update('tasks', id, { status: 'done', completedAt: nowISO() })
removeWithUndo('tasks', id)                               // delete + "Desfazer" toast
```

Never return a new array/object from a `useDB` selector (zustand v5 re-render loop).

## UI rules

- Mobile-first for iPhone (390×844). Touch targets ≥ 44px. Inputs are 16px (no iOS zoom).
- Pages: `<Page><PageHeader title=… /> … </Page>`. Page bottom padding already clears nav + FAB.
- Creation/editing happens in bottom sheets: `openSheet('task', { defaults: {...} })`.
  Each sheet uses `<SheetLayout title primary onDelete onClose={closeSheet}>`. One required field max;
  everything secondary goes inside `<MoreOptions>`.
- Lists: `SwipeRow` (right = concluir, left = apagar + desfazer), `SortableList` for reorder (long-press handle).
- Feedback: `haptic()` on completion, `toast()` for confirmations; `toast(msg, { tone: 'win' })` for wins only.
- Colors only via tokens (`bg-surface`, `text-muted`, `bg-accent-soft`, `TONE[tone]`). Dark mode is a token swap.
- Typography: `font-display` (Fraunces) for titles/numbers that matter, DM Sans for everything else; `.eyebrow` for section labels.
- Empty states: warm, short, never guilty (`<EmptyState emoji title text action/>`).

## Voice

pt-BR, leve, direta, carinhosa, com energia. Emojis pontuais. **Proibido**: culpa ("você falhou",
"atrasado", "streak perdido"), scores ("produtividade 71%"), rankings, comparações negativas.
Prefer "ficou de ontem", "quando der", "sem pressa", "que bom!".

## Routes

See `src/app/routes.tsx` (`ROUTES` constants). Bottom nav: Hoje · Agenda · Vida · Trabalho · Mais.

## Integrations

See `docs/INTEGRATIONS.md`. Providers implement interfaces from `src/integrations/types.ts`.
Components never call providers directly. No tokens in the browser. Flags in `profile.featureFlags`.
Unavailable integrations show "Disponível em breve" or "Configuração necessária" — never a fake "Conectar".

## Real Life Seed (v2) — rules

- Marina's life enters **only as data** through the same models the UI uses. No component or
  selector may special-case names ("Luna", "TotalPass", "Interlagos", project names). Behaviour comes
  from generic data: `profile.work`, `profile.rhythm`, `constraints`, `weekTemplate`, modalities' `group`
  / `heavyLogistics`, `planType`, `period`, `exdates`, routine `essential` items.
- Four kinds of information (`PlanType`): **fixo**, **base**, **flexivel**, **a_confirmar**. Uncertain
  things are never turned into confirmed commitments (trip items `a_confirmar`, payments
  `paymentStatus`, tasks `review`).
- Every seed record has a stable id (`seedId(area, slug)` or `SEED_IDS`). `data/seed/migrate.ts`
  adds missing seed records to existing databases by id (additive, idempotent, never overwrites).
  Bump `LIFE_SEED_VERSION` when existing installs should receive new seed records.
- Planning logic lives in `data/planning.ts` (presencial days, work blocks, conflicts, suggestions,
  week template). It never blocks or deletes; conflicts are shown with `ConflictCard`
  (Mover / Manter assim / Ignorar → `ConflictAck`).
