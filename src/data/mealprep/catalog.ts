/**
 * INGREDIENT CATALOG + CONVERSION TABLE (the one place for purchase / cooking numbers).
 *
 * What lives here is kitchen logistics, never nutrition: the quantities Marina eats always come
 * from the nutritionist's plans. This table only answers "how much do I BUY / COOK to end up with
 * that much ready food" and "how does it travel / keep".
 *
 * Yields are cooked weight ÷ raw weight, as ranges (everything shown to her is "aproximadamente"):
 *   frango (peito, grelhado/desfiado) 0,70–0,75 · suíno assado 0,70–0,75 · carne bovina 0,65–0,72
 *   peixe 0,75–0,85 · camarão limpo 0,80–0,85
 *   arroz branco 2,5–3,0 · arroz integral 2,3–2,8 · feijão / grão-de-bico 2,0–2,5 · macarrão 2,0–2,4
 *   flocão de milho (cuscuz) 1,6–1,9 · batatas / inhame 0,80–0,95 (casca + água)
 *   legumes no vapor 0,75–0,85 (aparas + água)
 * Purchase rounding uses package-like units (dúzia, pacote 500 g / 1 kg, bandeja, unidades de fruta).
 * Food safety (conservative): cooked food ≤ 3 days in the fridge; the rest of the week goes to the freezer.
 */
import { normalize } from '@/lib/text'

export type ShopCategory = 'proteinas' | 'carboidratos' | 'frutas' | 'legumes' | 'treino' | 'complementos'

export const SHOP_CATEGORY_ORDER: ShopCategory[] = ['proteinas', 'carboidratos', 'frutas', 'legumes', 'treino', 'complementos']

export const SHOP_CATEGORY_LABEL: Record<ShopCategory, string> = {
  proteinas: 'Proteínas e laticínios',
  carboidratos: 'Carboidratos',
  frutas: 'Frutas',
  legumes: 'Legumes e folhas',
  treino: 'Pré/intra-treino',
  complementos: 'Temperos e complementos',
}

export const SHOP_CATEGORY_EMOJI: Record<ShopCategory, string> = {
  proteinas: '🍗',
  carboidratos: '🍚',
  frutas: '🍌',
  legumes: '🥦',
  treino: '⚡',
  complementos: '🧂',
}

/** ❄️ precisa geladeira · 🔥 micro-ondas · 🎒 pode ficar na bolsa · 🧊 levar bolsa térmica */
export type KitIcon = 'geladeira' | 'microondas' | 'bolsa' | 'termica'

export const KIT_ICON: Record<KitIcon, { emoji: string; label: string }> = {
  geladeira: { emoji: '❄️', label: 'precisa geladeira' },
  microondas: { emoji: '🔥', label: 'micro-ondas' },
  bolsa: { emoji: '🎒', label: 'pode ficar na bolsa' },
  termica: { emoji: '🧊', label: 'levar bolsa térmica' },
}

/** How a purchase is rounded. */
export type Pack =
  /** Loose weight at the counter/butcher: range rounded to 0,1 kg (or 50 g below 1 kg). */
  | { kind: 'weight' }
  /** Closed packages: n × size (g or ml). */
  | { kind: 'package'; size: number; unit: 'g' | 'ml'; label: string }
  /** Countable units (fruit, eggs, bread). `per` = grams (or ml of juice) per unit. */
  | { kind: 'units'; per: number; one: string; many: string; dozen?: boolean; perUnit?: 'g' | 'ml'; packOf?: number; packLabel?: string }
  /** "À vontade" leaves: one bunch of each per ~`perMeals` meals. */
  | { kind: 'bunch'; perMeals: number; label: string }
  /** Mixed fruit salad: split equally among these fruits. */
  | { kind: 'mix'; parts: { one: string; many: string; per: number }[] }
  /** Things a kitchen usually has (coffee, cinnamon, whey): show weekly use, "confira em casa". */
  | { kind: 'staple' }

export type CookRole = 'grao' | 'feijao' | 'massa' | 'cuscuz' | 'tuberculo' | 'legumes' | 'proteina' | 'ovo'

export interface CookSpec {
  /** Batch line label ("Arroz branco"). */
  label: string
  role: CookRole
  /** Rough minutes, and whether it cooks on its own (panela de pressão / forno) while you do other things. */
  minutes: number
  passive: boolean
  how: string
  /** Lower = start first. */
  order: number
}

export interface StorageSpec {
  fridgeDays: number
  freezer: boolean
  /** Specific instruction (folhas, fruta cortada, ovo, batata). */
  tip?: string
}

export interface Ingredient {
  key: string
  match: RegExp
  /** Short name used in pots ("frango", "arroz"). */
  short: string
  /** Shopping-list line. Items sharing `buy` are bought together (frango grelhado + desfiado = peito de frango). */
  buyLabel: string
  buy?: string
  category: ShopCategory
  /** cooked ÷ raw (range). Undefined = bought as eaten. */
  yield?: [number, number]
  pack: Pack
  cook?: CookSpec
  storage: StorageSpec
  /** Default "peguei e saí" form for one item. */
  carry: { form: string; icons: KitIcon[] }
  /** Reuse group for diversity (same purchase family). */
  group?: string
  /** Prepared as part of a hot meal (goes into the pot). */
  potted?: boolean
}

const COOKED: StorageSpec = { fridgeDays: 3, freezer: true }
const FRESH_FRUIT: StorageSpec = { fridgeDays: 5, freezer: false, tip: 'Lave e seque antes de guardar; inteira dura mais.' }
const DRY: StorageSpec = { fridgeDays: 30, freezer: false }
const BAG: KitIcon[] = ['bolsa']
const COLD: KitIcon[] = ['geladeira', 'termica']
const HOT: KitIcon[] = ['geladeira', 'microondas', 'termica']

const meat = (key: string, match: RegExp, short: string, buyLabel: string, y: [number, number], group: string, how: string, minutes = 25, passive = false, cookLabel = buyLabel.replace(/ cru.*$/, '')): Ingredient => ({
  key,
  match,
  short,
  buyLabel,
  category: 'proteinas',
  yield: y,
  pack: { kind: 'weight' },
  cook: { label: cookLabel, role: 'proteina', minutes, passive, how, order: 40 },
  storage: COOKED,
  carry: { form: 'na marmita', icons: HOT },
  group,
  potted: true,
})

const fruit = (key: string, match: RegExp, short: string, per: number, one: string, many: string, carry = 'inteira, na bolsa'): Ingredient => ({
  key,
  match,
  short,
  buyLabel: one[0].toUpperCase() + one.slice(1),
  category: 'frutas',
  pack: { kind: 'units', per, one, many },
  storage: FRESH_FRUIT,
  carry: { form: carry, icons: carry.includes('pote') ? COLD : BAG },
  group: 'fruta',
})

const pkg = (size: number, label: string, unit: 'g' | 'ml' = 'g'): Pack => ({ kind: 'package', size, unit, label })

/** ORDER MATTERS: the first match wins (specific before generic). */
export const INGREDIENTS: Ingredient[] = [
  // ── Pré/intra-treino and sweets (before "leite", "queijo", "mel"...) ──
  { key: 'doce-de-leite', match: /doce de leite/, short: 'doce de leite', buyLabel: 'Doce de leite cremoso', category: 'treino', pack: pkg(400, 'pote de 400 g'), storage: { fridgeDays: 30, freezer: false, tip: 'Depois de aberto, geladeira.' }, carry: { form: 'potinho já porcionado', icons: BAG } },
  { key: 'gel', match: /\bgel\b/, short: 'gel', buyLabel: 'Gel de carboidrato', category: 'treino', pack: { kind: 'units', per: 30, one: 'sachê', many: 'sachês' }, storage: DRY, carry: { form: 'no bolso / cinto', icons: BAG } },
  { key: 'gatorade', match: /gatorade/, short: 'isotônico', buyLabel: 'Isotônico (Gatorade)', category: 'treino', pack: pkg(500, 'garrafa de 500 ml', 'ml'), storage: DRY, carry: { form: 'garrafa', icons: BAG } },
  { key: 'pao-de-queijo', match: /pao de queijo/, short: 'pão de queijo', buyLabel: 'Pão de queijo', category: 'treino', pack: { kind: 'units', per: 20, one: 'pão de queijo (congelado ou padaria)', many: 'pães de queijo (congelado ou padaria)' }, storage: { fridgeDays: 2, freezer: true, tip: 'Asse na véspera ou congele cru e asse na hora.' }, carry: { form: 'saquinho', icons: BAG } },
  { key: 'mel', match: /^mel\b|mel de abelha/, short: 'mel', buyLabel: 'Mel', category: 'treino', pack: pkg(300, 'pote de 300 g'), storage: DRY, carry: { form: 'sachê / potinho', icons: BAG } },
  { key: 'goiabada', match: /goiaba/, short: 'goiabada', buyLabel: 'Doce de goiaba em pasta', category: 'treino', pack: pkg(300, 'pacote de 300 g'), storage: DRY, carry: { form: 'potinho', icons: BAG } },
  { key: 'chocolate', match: /chocolate/, short: 'chocolate 70%', buyLabel: 'Chocolate amargo 70%', category: 'treino', pack: pkg(80, 'barra de 80 g'), storage: DRY, carry: { form: 'pedaço embrulhado', icons: BAG } },

  // ── Proteínas ──
  { ...meat('frango-desfiado', /frango desfiado/, 'frango desfiado', 'Peito de frango cru', [0.7, 0.75], 'frango', 'Cozinhe na pressão com tempero (~20 min) e desfie ainda morno.', 30, true, 'Frango desfiado'), buy: 'frango' },
  meat('frango', /frango/, 'frango', 'Peito de frango cru', [0.7, 0.75], 'frango', 'Tempere e grelhe os filés (ou asse 25 min a 200 °C).', 25, false, 'Frango grelhado'),
  meat('suino', /suino/, 'filé mignon suíno', 'Filé mignon suíno cru', [0.7, 0.75], 'suino', 'Asse temperado a 200 °C por ~35 min e fatie em medalhões.', 40, true),
  meat('patinho-moido', /patinho moido/, 'patinho moído', 'Patinho moído cru', [0.7, 0.75], 'carne', 'Refogue a carne moída soltinha com tempero (~15 min).', 15),
  meat('patinho', /patinho/, 'patinho', 'Patinho em bifes cru', [0.65, 0.72], 'carne', 'Grelhe os bifes rapidinho dos dois lados.', 20),
  meat('contrafile', /contrafile/, 'contrafilé', 'Contrafilé sem gordura cru', [0.65, 0.72], 'carne', 'Grelhe os bifes e fatie.', 20),
  meat('file-mignon', /file mignon/, 'filé mignon', 'Filé mignon cru', [0.65, 0.72], 'carne', 'Grelhe os bifes e fatie.', 20),
  meat('camarao', /camarao/, 'camarão', 'Camarão limpo cru', [0.8, 0.85], 'peixe', 'Salteie 3–4 min — passa do ponto rápido.', 10),
  meat('salmao', /salmao/, 'salmão', 'Salmão sem pele cru', [0.75, 0.85], 'peixe', 'Asse 15 min a 200 °C.', 20, true),
  meat('tilapia', /tilapia/, 'tilápia', 'Filé de tilápia cru', [0.75, 0.85], 'peixe', 'Grelhe ou asse 15 min a 200 °C.', 20, true),
  { key: 'peito-de-peru', match: /peito de peru/, short: 'peito de peru', buyLabel: 'Peito de peru defumado fatiado', category: 'proteinas', pack: { kind: 'weight' }, storage: { fridgeDays: 4, freezer: false }, carry: { form: 'no sanduíche', icons: COLD }, group: 'frios' },
  {
    key: 'ovo', match: /\bovo\b/, short: 'ovos', buyLabel: 'Ovos', category: 'proteinas',
    pack: { kind: 'units', per: 50, one: 'ovo', many: 'ovos', dozen: true },
    cook: { label: 'Omelete assada individual', role: 'ovo', minutes: 25, passive: true, how: 'Bata os ovos com sal, distribua em forminhas de muffin e asse 20 min a 180 °C.', order: 60 },
    storage: { fridgeDays: 3, freezer: true, tip: 'Omelete assada: 3 dias na geladeira ou 1 mês no freezer. Ovo mexido é melhor feito na hora.' },
    carry: { form: 'omelete assada individual', icons: COLD }, group: 'ovo',
  },
  { key: 'mussarela', match: /mussarela|mucarela/, short: 'muçarela', buyLabel: 'Queijo muçarela fatiado', category: 'proteinas', pack: { kind: 'weight' }, storage: { fridgeDays: 5, freezer: false }, carry: { form: 'fatia separada', icons: COLD }, group: 'queijo' },
  { key: 'queijo-minas', match: /queijo minas/, short: 'queijo minas', buyLabel: 'Queijo minas', category: 'proteinas', pack: { kind: 'weight' }, storage: { fridgeDays: 5, freezer: false }, carry: { form: 'fatia separada', icons: COLD }, group: 'queijo' },
  { key: 'canastra', match: /canastra/, short: 'queijo canastra', buyLabel: 'Queijo canastra', category: 'proteinas', pack: { kind: 'weight' }, storage: { fridgeDays: 7, freezer: false }, carry: { form: 'fatia em saquinho', icons: BAG }, group: 'queijo' },
  { key: 'ricota', match: /ricota/, short: 'creme de ricota', buyLabel: 'Creme de ricota', category: 'proteinas', pack: pkg(200, 'pote de 200 g'), storage: { fridgeDays: 5, freezer: false }, carry: { form: 'potinho', icons: COLD }, group: 'queijo' },
  { key: 'requeijao', match: /requeijao/, short: 'requeijão light', buyLabel: 'Requeijão light', category: 'proteinas', pack: pkg(200, 'copo de 200 g'), storage: { fridgeDays: 5, freezer: false }, carry: { form: 'potinho', icons: COLD }, group: 'queijo' },
  { key: 'leite-po-desnatado', match: /desnatado em po/, short: 'leite em pó desnatado', buyLabel: 'Leite em pó desnatado', category: 'proteinas', pack: pkg(300, 'pacote de 300 g'), storage: DRY, carry: { form: 'no kit seco do shaker', icons: BAG }, group: 'leite' },
  { key: 'leite-po', match: /leite.*em po/, short: 'leite em pó', buyLabel: 'Leite em pó integral', category: 'proteinas', pack: pkg(400, 'pacote de 400 g'), storage: DRY, carry: { form: 'no kit seco do shaker', icons: BAG }, group: 'leite' },
  { key: 'leite-uht', match: /leite.*uht/, short: 'leite', buyLabel: 'Leite UHT', category: 'proteinas', pack: pkg(1000, 'caixa de 1 L', 'ml'), storage: { fridgeDays: 3, freezer: false, tip: 'Aberto: 3 dias na geladeira.' }, carry: { form: 'garrafinha gelada', icons: COLD }, group: 'leite' },
  { key: 'whey', match: /whey/, short: 'whey', buyLabel: 'Whey protein concentrado', category: 'proteinas', pack: { kind: 'staple' }, storage: DRY, carry: { form: 'no kit seco do shaker', icons: BAG } },

  // ── Carboidratos ──
  { key: 'arroz-integral', match: /arroz integral/, short: 'arroz integral', buyLabel: 'Arroz integral', category: 'carboidratos', yield: [2.3, 2.8], pack: pkg(1000, 'pacote de 1 kg'), cook: { label: 'Arroz integral', role: 'grao', minutes: 40, passive: true, how: 'Refogue e cozinhe com ~2,5× de água (ou na pressão, 15 min).', order: 10 }, storage: COOKED, carry: { form: 'na marmita', icons: HOT }, group: 'arroz', potted: true },
  { key: 'arroz-branco', match: /arroz/, short: 'arroz', buyLabel: 'Arroz branco', category: 'carboidratos', yield: [2.5, 3], pack: pkg(1000, 'pacote de 1 kg'), cook: { label: 'Arroz branco', role: 'grao', minutes: 25, passive: true, how: 'Refogue e cozinhe com ~2× de água, tampado, fogo baixo.', order: 20 }, storage: COOKED, carry: { form: 'na marmita', icons: HOT }, group: 'arroz', potted: true },
  { key: 'feijao-preto', match: /feijao preto/, short: 'feijão', buyLabel: 'Feijão preto', category: 'carboidratos', yield: [2, 2.5], pack: pkg(1000, 'pacote de 1 kg'), cook: { label: 'Feijão preto', role: 'feijao', minutes: 45, passive: true, how: 'Deixe de molho na véspera; pressão ~30 min depois de pegar pressão, tempere.', order: 0 }, storage: COOKED, carry: { form: 'na marmita', icons: HOT }, group: 'feijao', potted: true },
  { key: 'feijao-carioca', match: /feijao carioca/, short: 'feijão carioca', buyLabel: 'Feijão carioca', category: 'carboidratos', yield: [2, 2.5], pack: pkg(1000, 'pacote de 1 kg'), cook: { label: 'Feijão carioca', role: 'feijao', minutes: 40, passive: true, how: 'Molho na véspera; pressão ~25 min.', order: 1 }, storage: COOKED, carry: { form: 'na marmita', icons: HOT }, group: 'feijao', potted: true },
  { key: 'feijao-verde', match: /feijao verde/, short: 'feijão verde', buyLabel: 'Feijão verde', category: 'carboidratos', yield: [2, 2.3], pack: pkg(500, 'pacote de 500 g'), cook: { label: 'Feijão verde', role: 'feijao', minutes: 25, passive: true, how: 'Cozinhe ~20 min em água com sal.', order: 2 }, storage: COOKED, carry: { form: 'na marmita', icons: HOT }, group: 'feijao', potted: true },
  { key: 'grao-de-bico', match: /grao de bico/, short: 'grão-de-bico', buyLabel: 'Grão-de-bico', category: 'carboidratos', yield: [2, 2.5], pack: pkg(500, 'pacote de 500 g'), cook: { label: 'Grão-de-bico', role: 'feijao', minutes: 40, passive: true, how: 'Molho na véspera; pressão ~25 min.', order: 3 }, storage: COOKED, carry: { form: 'na marmita', icons: HOT }, group: 'feijao', potted: true },
  { key: 'macarrao-integral', match: /macarrao integral/, short: 'macarrão integral', buyLabel: 'Macarrão integral', category: 'carboidratos', yield: [2, 2.4], pack: pkg(500, 'pacote de 500 g'), cook: { label: 'Macarrão integral', role: 'massa', minutes: 15, passive: false, how: 'Cozinhe 1 min a menos que o pacote (al dente aguenta melhor), escorra e regue um fio de água fria.', order: 50 }, storage: COOKED, carry: { form: 'na marmita', icons: HOT }, group: 'massa', potted: true },
  { key: 'macarrao', match: /macarrao/, short: 'macarrão', buyLabel: 'Macarrão', category: 'carboidratos', yield: [2, 2.4], pack: pkg(500, 'pacote de 500 g'), cook: { label: 'Macarrão', role: 'massa', minutes: 15, passive: false, how: 'Cozinhe 1 min a menos que o pacote (al dente aguenta melhor), escorra e regue um fio de água fria.', order: 50 }, storage: COOKED, carry: { form: 'na marmita', icons: HOT }, group: 'massa', potted: true },
  { key: 'cuscuz', match: /cuscuz/, short: 'cuscuz', buyLabel: 'Flocão de milho (cuscuz)', category: 'carboidratos', yield: [1.6, 1.9], pack: pkg(500, 'pacote de 500 g'), cook: { label: 'Cuscuz de milho', role: 'cuscuz', minutes: 15, passive: false, how: 'Hidrate o flocão com água e sal 10 min, cozinhe na cuscuzeira ~10 min e porcione morno.', order: 30 }, storage: COOKED, carry: { form: 'pote de cuscuz porcionado', icons: HOT }, group: 'cuscuz', potted: true },
  { key: 'batata-doce', match: /batata doce/, short: 'batata-doce', buyLabel: 'Batata-doce', category: 'carboidratos', yield: [0.85, 0.95], pack: { kind: 'weight' }, cook: { label: 'Batata-doce', role: 'tuberculo', minutes: 30, passive: true, how: 'Cozinhe em pedaços (ou asse 30 min a 200 °C).', order: 25 }, storage: COOKED, carry: { form: 'na marmita', icons: HOT }, group: 'batata', potted: true },
  { key: 'batata', match: /batata/, short: 'batata', buyLabel: 'Batata inglesa', category: 'carboidratos', yield: [0.85, 0.95], pack: { kind: 'weight' }, cook: { label: 'Batata sauté', role: 'tuberculo', minutes: 30, passive: false, how: 'Cozinhe em cubos até ficar macia e doure na frigideira com sal e ervas.', order: 25 }, storage: { fridgeDays: 3, freezer: false, tip: 'Batata cozida não congela bem (fica aguada): a dos dias de freezer vale fazer numa rodada rápida no meio da semana.' }, carry: { form: 'na marmita', icons: HOT }, group: 'batata', potted: true },
  { key: 'inhame', match: /inhame/, short: 'inhame', buyLabel: 'Inhame (cará)', category: 'carboidratos', yield: [0.8, 0.9], pack: { kind: 'weight' }, cook: { label: 'Inhame', role: 'tuberculo', minutes: 25, passive: true, how: 'Descasque e cozinhe em água com sal até ficar macio.', order: 26 }, storage: COOKED, carry: { form: 'na marmita', icons: HOT }, group: 'batata', potted: true },
  { key: 'pao-de-forma', match: /pao de forma/, short: 'pão de forma', buyLabel: 'Pão de forma 50% integral', category: 'carboidratos', pack: { kind: 'units', per: 25, one: 'fatia', many: 'fatias', packOf: 20, packLabel: 'pacote (~20 fatias)' }, storage: { fridgeDays: 7, freezer: true, tip: 'Congela fatiado e vai direto pra torradeira.' }, carry: { form: 'sanduíche pronto', icons: COLD }, group: 'pao' },
  { key: 'pao-sirio', match: /pao sirio/, short: 'pão sírio', buyLabel: 'Pão sírio', category: 'carboidratos', pack: { kind: 'units', per: 60, one: 'unidade', many: 'unidades', packOf: 6, packLabel: 'pacote (~6 unidades)' }, storage: { fridgeDays: 5, freezer: true }, carry: { form: 'pão sírio recheado', icons: COLD }, group: 'pao' },
  { key: 'pao-fermentacao', match: /fermentacao natural/, short: 'pão de fermentação natural', buyLabel: 'Pão de fermentação natural', category: 'carboidratos', pack: pkg(500, 'pão de ~500 g'), storage: { fridgeDays: 4, freezer: true, tip: 'Fatie e congele: torra direto do freezer.' }, carry: { form: 'sanduíche pronto', icons: COLD }, group: 'pao' },
  { key: 'aveia', match: /aveia/, short: 'farelo de aveia', buyLabel: 'Farelo de aveia', category: 'carboidratos', pack: pkg(200, 'caixa de 200 g'), storage: DRY, carry: { form: 'no kit seco do shaker', icons: BAG } },

  // ── Frutas ──
  { key: 'suco-laranja', match: /suco de laranja/, short: 'suco de laranja', buyLabel: 'Laranja pera (pra suco)', category: 'frutas', pack: { kind: 'units', per: 90, perUnit: 'ml', one: 'laranja', many: 'laranjas' }, storage: { fridgeDays: 2, freezer: true, tip: 'Suco espremido: até 2 dias fechado na geladeira (ou cubos no freezer).' }, carry: { form: 'garrafinha de suco gelado', icons: COLD }, group: 'laranja' },
  { key: 'suco-tangerina', match: /suco de tangerina/, short: 'suco de tangerina', buyLabel: 'Tangerina (pra suco)', category: 'frutas', pack: { kind: 'units', per: 70, perUnit: 'ml', one: 'tangerina', many: 'tangerinas' }, storage: { fridgeDays: 2, freezer: true }, carry: { form: 'garrafinha de suco gelado', icons: COLD }, group: 'tangerina' },
  { key: 'suco-limao', match: /suco de limao/, short: 'limonada', buyLabel: 'Limão', category: 'frutas', pack: { kind: 'units', per: 100, perUnit: 'ml', one: 'limão', many: 'limões' }, storage: { fridgeDays: 2, freezer: true }, carry: { form: 'garrafinha gelada', icons: COLD } },
  { key: 'suco-uva', match: /suco de uva/, short: 'suco de uva', buyLabel: 'Suco de uva integral', category: 'frutas', pack: pkg(1000, 'garrafa de 1 L', 'ml'), storage: { fridgeDays: 5, freezer: false }, carry: { form: 'garrafinha', icons: COLD } },
  { key: 'acerola', match: /acerola/, short: 'suco de acerola', buyLabel: 'Polpa de acerola', category: 'frutas', pack: { kind: 'units', per: 240, perUnit: 'ml', one: 'polpa', many: 'polpas' }, storage: { fridgeDays: 1, freezer: true }, carry: { form: 'garrafinha gelada', icons: COLD } },
  { key: 'agua-coco', match: /agua de coco/, short: 'água de coco', buyLabel: 'Água de coco', category: 'frutas', pack: pkg(1000, 'caixa de 1 L', 'ml'), storage: { fridgeDays: 2, freezer: false }, carry: { form: 'caixinha', icons: BAG } },
  {
    key: 'salada-frutas', match: /salada de frutas/, short: 'salada de frutas', buyLabel: 'Frutas pra salada de frutas', category: 'frutas',
    pack: { kind: 'mix', parts: [{ one: 'laranja', many: 'laranjas', per: 130 }, { one: 'banana', many: 'bananas', per: 65 }, { one: 'maçã', many: 'maçãs', per: 130 }, { one: 'mamão papaia', many: 'mamões papaia', per: 270 }] },
    storage: { fridgeDays: 2, freezer: false, tip: 'Fruta cortada dura ~2 dias: corte a cada 2 dias e pingue limão; a banana, corte na hora.' },
    carry: { form: 'pote porcionado', icons: COLD }, group: 'fruta',
  },
  fruit('banana', /banana/, 'banana', 65, 'banana prata', 'bananas prata'),
  fruit('maca', /\bmaca\b/, 'maçã', 80, 'maçã pequena', 'maçãs pequenas'),
  fruit('manga', /manga/, 'manga', 140, 'manga palmer', 'mangas palmer', 'em cubos, pote'),
  fruit('morango', /morango/, 'morango', 20, 'morango', 'morangos', 'lavado, pote'),
  fruit('uva', /\buva\b/, 'uva', 8, 'uva', 'uvas', 'lavada, pote'),
  fruit('abacaxi', /abacaxi/, 'abacaxi', 900, 'abacaxi', 'abacaxis', 'em fatias, pote'),
  fruit('kiwi', /kiwi/, 'kiwi', 65, 'kiwi', 'kiwis'),
  fruit('melancia', /melancia/, 'melancia', 1500, 'pedaço de melancia (~1,5 kg)', 'pedaços de melancia (~1,5 kg)', 'em cubos, pote'),
  fruit('melao', /melao/, 'melão', 900, 'melão', 'melões', 'em cubos, pote'),
  fruit('tangerina', /tangerina/, 'tangerina', 135, 'tangerina ponkã', 'tangerinas ponkã'),
  fruit('ameixa', /ameixa/, 'ameixa', 34, 'ameixa', 'ameixas'),
  fruit('mamao', /mamao/, 'mamão', 270, 'mamão papaia', 'mamões papaia', 'em cubos, pote'),

  // ── Legumes e folhas ──
  { key: 'folhas', match: /alface|rucula/, short: 'folhas', buyLabel: 'Folhas (alface lisa, alface roxa, rúcula)', category: 'legumes', pack: { kind: 'bunch', perMeals: 3, label: '1 pé de alface lisa + 1 pé de alface roxa + 1 maço de rúcula' }, storage: { fridgeDays: 5, freezer: false, tip: 'Lave, seque bem e guarde em pote com papel-toalha. Tempere só na hora — nunca congele.' }, carry: { form: 'pote de folhas (molho à parte)', icons: COLD } },
  { key: 'legumes', match: /legumes/, short: 'legumes', buyLabel: 'Legumes pro vapor (os que você gosta: brócolis, cenoura, abobrinha, vagem…)', category: 'legumes', yield: [0.75, 0.85], pack: { kind: 'weight' }, cook: { label: 'Legumes no vapor', role: 'legumes', minutes: 20, passive: false, how: 'Corte em pedaços parecidos e cozinhe no vapor até ficarem al dente (assim aguentam melhor a semana).', order: 35 }, storage: { fridgeDays: 3, freezer: true, tip: 'Legumes al dente congelam bem; os bem cozidos ficam moles.' }, carry: { form: 'na marmita', icons: HOT }, potted: true },
  { key: 'molho-tomate', match: /molho de tomate/, short: 'molho de tomate', buyLabel: 'Molho de tomate', category: 'complementos', pack: pkg(300, 'caixinha de 300 g'), storage: { fridgeDays: 3, freezer: true, tip: 'Aberto: 3 dias na geladeira (ou congele em porções).' }, carry: { form: 'na marmita', icons: HOT }, potted: true },

  // ── Temperos e complementos ──
  { key: 'cafe', match: /cafe/, short: 'café', buyLabel: 'Café em pó', category: 'complementos', pack: { kind: 'staple' }, storage: DRY, carry: { form: 'garrafinha térmica', icons: BAG } },
  { key: 'canela', match: /canela/, short: 'canela', buyLabel: 'Canela em pó', category: 'complementos', pack: { kind: 'staple' }, storage: DRY, carry: { form: 'já no café', icons: BAG } },
  { key: 'chia', match: /chia/, short: 'chia', buyLabel: 'Semente de chia', category: 'complementos', pack: pkg(200, 'pacote de 200 g'), storage: DRY, carry: { form: 'já misturada no pote', icons: BAG } },
  { key: 'gergelim', match: /gergelim/, short: 'gergelim', buyLabel: 'Gergelim', category: 'complementos', pack: pkg(200, 'pacote de 200 g'), storage: DRY, carry: { form: 'já misturado no pote', icons: BAG } },
  { key: 'linhaca', match: /linhaca/, short: 'linhaça', buyLabel: 'Linhaça dourada', category: 'complementos', pack: pkg(200, 'pacote de 200 g'), storage: DRY, carry: { form: 'já misturada no pote', icons: BAG } },
  { key: 'psyllium', match: /psyllium/, short: 'psyllium', buyLabel: 'Psyllium', category: 'complementos', pack: pkg(200, 'pacote de 200 g'), storage: DRY, carry: { form: 'saquinho', icons: BAG } },
  { key: 'castanha-caju', match: /castanha de caju/, short: 'castanha de caju', buyLabel: 'Castanha de caju', category: 'complementos', pack: pkg(100, 'pacote de 100 g'), storage: DRY, carry: { form: 'saquinho porcionado', icons: BAG }, group: 'castanha' },
  { key: 'castanha-para', match: /castanha do (brasil|para)/, short: 'castanha-do-pará', buyLabel: 'Castanha-do-pará', category: 'complementos', pack: pkg(100, 'pacote de 100 g'), storage: DRY, carry: { form: 'saquinho porcionado', icons: BAG }, group: 'castanha' },
  { key: 'amendoim', match: /amendoim/, short: 'amendoim', buyLabel: 'Amendoim', category: 'complementos', pack: pkg(150, 'pacote de 150 g'), storage: DRY, carry: { form: 'saquinho porcionado', icons: BAG }, group: 'castanha' },
]

const cache = new Map<string, Ingredient>()

/** Ingredient profile for a food name; unknown foods get a neutral profile (bought as written). */
export function ingredientOf(food: string): Ingredient {
  const n = normalize(food)
  const hit = cache.get(n)
  if (hit) return hit
  const found =
    INGREDIENTS.find((i) => i.match.test(n)) ??
    ({
      key: `outro:${n}`,
      match: /$^/,
      short: food.toLowerCase(),
      buyLabel: food,
      category: 'complementos',
      pack: { kind: 'weight' },
      storage: { fridgeDays: 3, freezer: false },
      carry: { form: 'como estiver', icons: BAG },
    } satisfies Ingredient)
  cache.set(n, found)
  return found
}

/** Purchase key (frango grelhado and desfiado share "frango"). */
export function buyKeyOf(ing: Ingredient): string {
  return ing.buy ?? ing.key
}
