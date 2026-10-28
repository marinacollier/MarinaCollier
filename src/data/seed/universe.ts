/**
 * Meu Universo · Beauty & Fragrance — exactly what she wrote in docs/specs/BEAUTY_FRAGRANCE.md (27/10/2026).
 *
 * - Inventário principal (§3) and complementar (§4) are HER collection → ownership 'tenho'. Where she asked to
 *   confirm something (versão, categoria, marca), the item is `confirmed: false` and lists which field.
 * - Wishlists (§5, §6) are desires to TEST ('quero_testar'), never owned, never favorite, never "aprovados".
 * - Notes and families come only from the spec. Products she gave no notes for have none (no invented notes).
 * - First diary entry (§7): Yardley Gorgeous in Cashmere EDP, Cape Town, out/2026, amou, comprou, ZAR 600.
 *
 * `applyUniverseSeed` runs at every boot: it only CREATES what is missing and was never deleted by her
 * (`profile.removedSeedIds`). It never overwrites an item, an opinion, a diary entry or her profile.
 */
import type { DB, NewItem, ScentLog, ScentProfile, UniverseCategory, UniverseItem, UniverseOccasion } from '../types'
import type { FeatureSeed } from './context'
import { seedId } from './context'
import { nowISO } from '@/lib/id'

export const universeSeedId = (slug: string) => seedId('universo', slug)

export const UNIVERSE_SEED_IDS = {
  yardley: universeSeedId('yardley-gorgeous-in-cashmere'),
  yardleyLog: seedId('olfativo', 'yardley-cape-town-2026-10'),
} as const

export const SCENT_PROFILE_SEED: ScentProfile = {
  summary: 'Fragrâncias femininas, sofisticadas, sensuais e elegantes, com personalidade e presença, sem serem excessivamente doces.',
  familiesLiked: ['floral amadeirado', 'floral âmbar', 'floral branco cremoso', 'floral cítrico elegante', 'almiscarado confortável', 'amadeirado quente e suave'],
  familiesLess: ['gourmand excessivamente açucarado', 'floral muito adolescente', 'aromático masculino intenso', 'chipre muito seco'],
  notesOfInterest: ['sândalo', 'musk', 'âmbar', 'rosa', 'flor de laranjeira', 'jasmim', 'lavanda', 'bergamota', 'mandarina', 'baunilha equilibrada', 'madeiras suaves'],
  remarks: 'Não são regras absolutas: também gosta de frutados, tropicais e frescos para situações informais.',
  makeupStyle: 'Estética natural, sofisticada, luminosa, com a feição preservada.',
}

type Spec = {
  slug: string
  name: string
  brand?: string
  version?: string
  category?: UniverseCategory
  families?: string[]
  notes?: string[]
  description?: string
  occasions?: UniverseOccasion[]
  occasionText?: string
  confirm?: string[]
}

// §3 — Inventário principal e ocasiões
const MAIN: Spec[] = [
  { slug: 'ysl-libre-intense', brand: 'YSL', name: 'Libre Intense', families: ['floral âmbar'], notes: ['lavanda', 'flor de laranjeira', 'baunilha'], occasions: ['lazer', 'frio', 'encontro', 'noite', 'elegante'], occasionText: 'Lazer em dias frios, encontros, noites elegantes' },
  { slug: 'dior-escale-a-portofino', brand: 'Dior', name: 'Escale à Portofino', families: ['cítrico aromático'], notes: ['bergamota', 'flor de laranjeira'], occasions: ['calor', 'praia', 'viagem', 'lazer'], occasionText: 'Calor, praia, viagem, lazer' },
  { slug: 'lancome-la-nuit-tresor', brand: 'Lancôme', name: 'La Nuit Trésor', families: ['floral gourmand ambarado'], notes: ['rosa', 'frutas escuras', 'baunilha'], occasions: ['noite', 'frio', 'romance'], occasionText: 'Noites frias, romance' },
  { slug: 'hugo-boss-ma-vie', brand: 'Hugo Boss', name: 'Ma Vie', families: ['floral verde'], notes: ['cacto', 'rosa', 'jasmim', 'cedro'], occasions: ['trabalho', 'reuniao', 'cotidiano'], occasionText: 'Trabalho, reuniões, cotidiano profissional' },
  { slug: 'natura-aura-alba', brand: 'Natura', name: 'Aura Alba', families: ['floral cremoso'], description: 'Floral cremoso e envolvente', occasions: ['noite', 'calor', 'encontro'], occasionText: 'Noites quentes, encontros' },
  { slug: 'natura-una-blush', brand: 'Natura', name: 'Una Blush', families: ['floral frutado quente'], occasions: ['trabalho', 'social'], occasionText: 'Trabalho e ocasiões sociais' },
  { slug: 'hugo-boss-woman-femme', brand: 'Hugo Boss', name: 'Woman / Femme', families: ['floral frutado delicado'], occasions: ['dia', 'cotidiano'], occasionText: 'Dia, cotidiano', confirm: ['versao'] },
  { slug: 'natura-royal-cristal', brand: 'Natura', name: 'Royal Cristal', families: ['floral sofisticado'], occasions: ['trabalho'], occasionText: 'Trabalho' },
  { slug: 'spot-for-her', name: 'Spot For Her', families: ['floral marcante'], occasions: ['noite', 'frio'], occasionText: 'Noites frias', confirm: ['versao'] },
  { slug: 'duchesse-femme', name: 'Duchesse Femme', description: 'Intenso e envolvente', occasions: ['noite', 'frio'], occasionText: 'Noites frias', confirm: ['versao'] },
]

// §4 — Inventário complementar (type often unknown → 'fragrancia' + confirmar categoria)
const NATURA_LINE = { brand: 'Natura' }
const FRAG = { category: 'fragrancia' as const, confirm: ['categoria'] }
const FRAG_BRAND = { category: 'fragrancia' as const, confirm: ['categoria', 'marca'] }
const COMPLEMENTARY: Spec[] = [
  { slug: 'natura-ekos-priprioca', ...NATURA_LINE, ...FRAG, name: 'Ekos Priprioca', families: ['herbal', 'terroso', 'amadeirado'] },
  { slug: 'madeira-em-flor', ...FRAG_BRAND, name: 'Madeira em Flor', families: ['floral amadeirado'] },
  { slug: 'natura-frescor-pitanga', ...NATURA_LINE, ...FRAG, name: 'Frescor Pitanga', families: ['frutado cítrico tropical'] },
  { slug: 'natura-meu-primeiro-humor', ...NATURA_LINE, ...FRAG, name: 'Meu Primeiro Humor', families: ['frutado fresco'] },
  { slug: 'natura-ekos-pequi', ...NATURA_LINE, ...FRAG, name: 'Ekos Pequi', families: ['frutado verde'] },
  { slug: 'natura-ekos-ryo-vivo', ...NATURA_LINE, ...FRAG, name: 'Ekos Ryo Vivo', families: ['verde aromático'] },
  { slug: 'capitiu', ...FRAG_BRAND, name: 'Capitiú', families: ['herbal', 'verde'] },
  { slug: 'meu-amor', ...FRAG_BRAND, name: 'Meu Amor', families: ['floral suave'] },
  { slug: '740-sandalo-e-breu-branco', ...FRAG_BRAND, name: '740 Sândalo e Breu Branco', families: ['amadeirado resinoso'] },
  { slug: 'natura-humor-proprio', ...NATURA_LINE, ...FRAG, name: 'Humor Próprio' },
  { slug: 'natura-frescor-andiroba', ...NATURA_LINE, ...FRAG, name: 'Frescor Andiroba' },
  { slug: 'donna-fatale', ...FRAG_BRAND, name: 'Donna Fatale' },
  { slug: 'cler', ...FRAG_BRAND, name: 'Cler' },
  { slug: 'mo-vermelho', ...FRAG_BRAND, name: 'Mo Vermelho' },
  { slug: 'pita-perfume', ...FRAG_BRAND, name: 'Pita Perfume' },
  { slug: 'natura-seve', brand: 'Natura', name: 'Sève', category: 'oleo_corporal' },
  { slug: 'vs-pure-seduction', brand: "Victoria's Secret", name: 'Pure Seduction', category: 'fragrancia', families: ['frutado doce'], notes: ['ameixa vermelha', 'frésia'], confirm: ['categoria', 'versao'] },
  { slug: 'vs-velvet-petals', brand: "Victoria's Secret", name: 'Velvet Petals', category: 'fragrancia', families: ['floral cremoso e adocicado'], confirm: ['categoria', 'versao'] },
  { slug: 'vs-heart-petals', brand: "Victoria's Secret", name: 'Heart Petals', category: 'fragrancia', families: ['floral delicado'], confirm: ['categoria', 'versao'] },
  { slug: 'cereja-e-avela', ...FRAG_BRAND, name: 'Cereja e Avelã', families: ['gourmand frutado'] },
  { slug: 'rosa-e-baunilha', ...FRAG_BRAND, name: 'Rosa e Baunilha', families: ['floral doce'] },
  { slug: 'gardenia-e-caju', ...FRAG_BRAND, name: 'Gardênia e Caju', families: ['floral tropical'] },
  { slug: 'acerola-e-hibisco', ...FRAG_BRAND, name: 'Acerola e Hibisco', families: ['frutado floral'] },
  { slug: 'johnsons-baby-lavanda', brand: "Johnson's", name: 'Baby Lavanda', category: 'fragrancia', description: 'Lavanda suave e limpa', confirm: ['categoria'] },
]

type Wish = { slug: string; brand: string; name: string; version?: string; families?: string[]; notes?: string[]; description?: string }

// §5 — Wishlist Victoria's Secret (ordem = compatibilidade estimada)
const WISH_VS: Wish[] = [
  { slug: 'vs-very-sexy-night', brand: "Victoria's Secret", name: 'Very Sexy Night', notes: ['ameixa escura', 'íris', 'madeiras'], description: 'Noturno e sofisticado' },
  { slug: 'vs-bombshell-seduction', brand: "Victoria's Secret", name: 'Bombshell Seduction', notes: ['peônia branca', 'sálvia', 'musk'], description: 'Limpo e sensual' },
  { slug: 'vs-bare-magnolia', brand: "Victoria's Secret", name: 'Bare Magnolia', notes: ['magnólia', 'madeiras', 'musk de baunilha'], description: 'Cremoso' },
  { slug: 'vs-bare', brand: "Victoria's Secret", name: 'Bare', notes: ['mandarina', 'violeta', 'sândalo'], description: 'Cheiro de pele' },
  { slug: 'vs-very-sexy', brand: "Victoria's Secret", name: 'Very Sexy', families: ['floral amadeirado'], description: 'Marcante' },
  { slug: 'vs-bare-rose', brand: "Victoria's Secret", name: 'Bare Rose', notes: ['rosa', 'pera', 'madeiras'], description: 'Delicado' },
  { slug: 'vs-bombshell', brand: "Victoria's Secret", name: 'Bombshell', notes: ['maracujá', 'peônia', 'orquídea'], description: 'Fresco e solar' },
  { slug: 'vs-very-sexy-scarlet', brand: "Victoria's Secret", name: 'Very Sexy Scarlet', families: ['floral almiscarado'], description: 'Envolvente' },
  { slug: 'vs-bombshell-passion', brand: "Victoria's Secret", name: 'Bombshell Passion', families: ['frutado floral'], notes: ['cassis', 'peônia', 'rosa'] },
  { slug: 'vs-tease-creme-cloud', brand: "Victoria's Secret", name: 'Tease Crème Cloud', notes: ['baunilha cremosa', 'sândalo'], description: 'Confortável' },
]

// §6 — Wishlist outras marcas (sugestões, não testadas nem aprovadas)
const WISH_HIGH: Wish[] = [
  { slug: 'prada-paradoxe-edp', brand: 'Prada', name: 'Paradoxe', version: 'EDP', families: ['floral âmbar'], notes: ['neroli', 'flores brancas', 'musk'] },
  { slug: 'chanel-coco-mademoiselle-edp', brand: 'Chanel', name: 'Coco Mademoiselle', version: 'EDP', families: ['cítrico'], notes: ['rosa', 'jasmim', 'patchouli'] },
  { slug: 'chloe-rose-tangerine', brand: 'Chloé', name: 'Rose Tangerine', notes: ['rosa', 'tangerina', 'cedro'] },
  { slug: 'miss-dior-edp', brand: 'Dior', name: 'Miss Dior', version: 'EDP', families: ['floral elegante'], notes: ['rosa', 'madeiras'] },
  { slug: 'armani-my-way-parfum', brand: 'Armani', name: 'My Way', version: 'Parfum', notes: ['flores brancas', 'íris', 'baunilha', 'madeiras'] },
]
const WISH_OTHER: Wish[] = [
  { slug: 'chanel-chance-eau-tendre', brand: 'Chanel', name: 'Chance Eau Tendre' },
  { slug: 'narciso-rodriguez-pure-musc', brand: 'Narciso Rodriguez', name: 'Pure Musc' },
  { slug: 'narciso-rodriguez-musc-noir-rose', brand: 'Narciso Rodriguez', name: 'Musc Noir Rose' },
  { slug: 'jo-malone-wood-sage-sea-salt', brand: 'Jo Malone', name: 'Wood Sage & Sea Salt' },
  { slug: 'guerlain-mon-guerlain', brand: 'Guerlain', name: 'Mon Guerlain' },
  { slug: 'guerlain-aqua-allegoria-mandarine-basilic', brand: 'Guerlain', name: 'Aqua Allegoria Mandarine Basilic' },
  { slug: 'hermes-un-jardin-sur-le-nil', brand: 'Hermès', name: 'Un Jardin Sur Le Nil' },
  { slug: 'prada-la-femme', brand: 'Prada', name: 'La Femme' },
  { slug: 'parfums-de-marly-delina', brand: 'Parfums de Marly', name: 'Delina' },
]

export const WISH_GROUPS = {
  vs: "Victoria's Secret",
  high: 'Outras marcas · alta prioridade',
  other: 'Outras marcas · candidatos',
} as const

/** Items and the first diary entry as payloads (stable ids, no timestamps). */
export function universeSeedPayloads(): { items: NewItem<'universeItems'>[]; logs: NewItem<'scentLogs'>[] } {
  const items: NewItem<'universeItems'>[] = []
  let order = 0
  const owned = (s: Spec) => {
    const confirm = s.confirm ?? []
    const item: NewItem<'universeItems'> = {
      id: universeSeedId(s.slug),
      category: s.category ?? 'perfume',
      name: s.name,
      ownership: 'tenho',
      source: 'seed',
      confirmed: confirm.length === 0,
      order: order++,
    }
    if (s.brand) item.brand = s.brand
    if (s.version) item.version = s.version
    if (s.families?.length) item.families = s.families
    if (s.notes?.length) {
      item.notes = s.notes
      item.notesSource = 'documentado'
    }
    if (s.description) item.description = s.description
    if (s.occasions?.length) item.occasions = s.occasions
    if (s.occasionText) item.occasionText = s.occasionText
    if (confirm.length) item.needsConfirmation = confirm
    items.push(item)
  }
  MAIN.forEach(owned)
  // Yardley — bought in Cape Town, out/2026, ZAR 600. Profile, volume and duration still to confirm.
  items.push({
    id: UNIVERSE_SEED_IDS.yardley,
    category: 'perfume',
    brand: 'Yardley',
    name: 'Gorgeous in Cashmere',
    version: 'EDP',
    ownership: 'tenho',
    opinion: 'amei',
    notesSource: 'a_confirmar',
    occasionText: 'A definir após uso',
    priceCents: 60000,
    currency: 'ZAR',
    country: 'África do Sul',
    city: 'Cape Town',
    observations: 'Compra em Cape Town, outubro de 2026. Perfil a verificar pelo produto oficial.',
    source: 'seed',
    confirmed: false,
    needsConfirmation: ['notas', 'volume', 'duracao'],
    order: order++,
  })
  COMPLEMENTARY.forEach(owned)
  const wish = (w: Wish, group: string, priority: number) => {
    const item: NewItem<'universeItems'> = {
      id: universeSeedId(w.slug),
      category: 'perfume',
      brand: w.brand,
      name: w.name,
      ownership: 'quero_testar',
      wishGroup: group,
      wishPriority: priority,
      source: 'seed',
      confirmed: true,
      order: order++,
    }
    if (w.version) item.version = w.version
    if (w.families?.length) item.families = w.families
    if (w.notes?.length) {
      item.notes = w.notes
      item.notesSource = 'documentado'
    }
    if (w.description) item.description = w.description
    items.push(item)
  }
  WISH_VS.forEach((w, i) => wish(w, WISH_GROUPS.vs, i + 1))
  WISH_HIGH.forEach((w, i) => wish(w, WISH_GROUPS.high, i + 1))
  WISH_OTHER.forEach((w, i) => wish(w, WISH_GROUPS.other, i + 1))

  const logs: NewItem<'scentLogs'>[] = [
    {
      id: UNIVERSE_SEED_IDS.yardleyLog,
      itemId: UNIVERSE_SEED_IDS.yardley,
      // The exact day isn't known: the spec date (27/10/2026), flagged "data a confirmar".
      date: '2026-10-27',
      city: 'Cape Town',
      country: 'África do Sul',
      concentration: 'EDP',
      firstImpression: 'Delicioso',
      verdict: 'amei',
      wouldBuy: 'sim',
      status: 'comprado',
      priceCents: 60000,
      currency: 'ZAR',
      notes: 'Amou a fragrância e depois comprou. Confirmar volume, notas e duração após uso.',
      source: 'seed',
      confirmed: false,
      needsConfirmation: ['data', 'volume', 'notas', 'duracao'],
    },
  ]
  return { items, logs }
}

export const seedUniverse: FeatureSeed = (ctx) => {
  const { items, logs } = universeSeedPayloads()
  return {
    universeItems: items.map((i) => ctx.make('universeItems', i)),
    scentLogs: logs.map((l) => ctx.make('scentLogs', l)),
    profile: { scentProfile: structuredClone(SCENT_PROFILE_SEED) },
  }
}

/**
 * Idempotent and additive: creates items/diary entries whose id is missing (and that she never deleted), and her
 * olfactory profile only when it was never set. Returns the SAME db object when there is nothing to add.
 */
export function applyUniverseSeed(db: DB, now: string = nowISO()): DB {
  const { items, logs } = universeSeedPayloads()
  const removed = new Set(db.profile.removedSeedIds ?? [])
  const universeItems = db.universeItems ?? []
  const scentLogs = db.scentLogs ?? []
  const haveItems = new Set(universeItems.map((i) => i.id))
  const haveLogs = new Set(scentLogs.map((l) => l.id))
  const addItems = items.filter((i) => !haveItems.has(i.id!) && !removed.has(i.id!))
  const itemIds = new Set([...haveItems, ...addItems.map((i) => i.id!)])
  const addLogs = logs.filter((l) => !haveLogs.has(l.id!) && !removed.has(l.id!) && itemIds.has(l.itemId))
  const needsProfile = db.profile.scentProfile === undefined
  if (!addItems.length && !addLogs.length && !needsProfile) return db
  const stamp = <T extends { id?: string }>(x: T) => ({ ...x, id: x.id!, createdAt: now, updatedAt: now })
  return {
    ...db,
    profile: needsProfile ? { ...db.profile, scentProfile: structuredClone(SCENT_PROFILE_SEED) } : db.profile,
    universeItems: addItems.length ? [...universeItems, ...addItems.map((i) => stamp(i) as UniverseItem)] : universeItems,
    scentLogs: addLogs.length ? [...scentLogs, ...addLogs.map((l) => stamp(l) as ScentLog)] : scentLogs,
  }
}
