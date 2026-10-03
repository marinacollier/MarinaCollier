/**
 * Built-in composition REFERENCE (code data, not Marina's life).
 *
 * - `per100`: values per 100 g from the Brazilian TACO table (Tabela Brasileira de Composição de
 *   Alimentos, NEPA/UNICAMP, 4ª ed.). Only foods whose values we are confident about carry numbers;
 *   everything else is recognized by name (so the parser and the adaptation rules understand it)
 *   but contributes no numbers — the ledger then says the total is "aproximado".
 * - `role`: what the food mainly brings to a meal. Used by the adaptation rules (e.g. "evitar repetir
 *   proteína"), independently of numbers.
 * - `units`: household portions in grams. `fromPlan: true` means the grams come from the
 *   nutritionist's own measures (e.g. "Ovo — 2 unidades médias (100g)"); otherwise the portion is a
 *   common household estimate and the logged confidence becomes 'estimated'.
 * - CATEGORY_ESTIMATES: packaged / restaurant things that are NOT in TACO. Never presented as label
 *   values — Marina chooses "usar rótulo" or "estimativa" (told to her as an estimate).
 */
import type { Nutrients } from '@/data/types'

export type FoodRole = 'proteina' | 'carbo' | 'gordura' | 'fruta' | 'laticinio' | 'vegetal' | 'doce' | 'bebida' | 'tempero' | 'fibra'

export const TACO_NOTE = 'TACO (referência por 100 g)'

export interface ReferenceFood {
  key: string
  name: string
  emoji?: string
  /** Normalized (lowercase, no accents). Longest match wins. */
  aliases: string[]
  role: FoodRole
  per100?: Nutrients
  /** Unit word (normalized, singular) → grams of one unit. First = default portion. */
  units?: { unit: string; label: string; grams: number; fromPlan?: boolean }[]
  /** Small amounts (spices, coffee) don't make the day "partial" when they have no numbers. */
  negligible?: boolean
}

const n = (kcal: number, protein: number, carbs: number, fat: number, fiber?: number): Nutrients => ({ kcal, protein, carbs, fat, ...(fiber != null ? { fiber } : {}) })

export const REFERENCE_FOODS: ReferenceFood[] = [
  // ── Carboidratos ──
  { key: 'arroz-branco', name: 'Arroz branco cozido', emoji: '🍚', aliases: ['arroz branco', 'arroz'], role: 'carbo', per100: n(128, 2.5, 28.1, 0.2, 1.6), units: [{ unit: 'colher', label: 'colher de sopa cheia', grams: 25, fromPlan: true }] },
  { key: 'arroz-integral', name: 'Arroz integral cozido', emoji: '🍚', aliases: ['arroz integral'], role: 'carbo', per100: n(124, 2.6, 25.8, 1.0, 2.7), units: [{ unit: 'colher', label: 'colher de sopa cheia', grams: 20, fromPlan: true }] },
  { key: 'feijao-preto', name: 'Feijão preto cozido', emoji: '🫘', aliases: ['feijao preto', 'feijao'], role: 'carbo', per100: n(77, 4.5, 14.0, 0.5, 8.4), units: [{ unit: 'concha', label: 'concha pequena', grams: 65, fromPlan: true }] },
  { key: 'feijao-carioca', name: 'Feijão carioca cozido', emoji: '🫘', aliases: ['feijao carioca'], role: 'carbo', per100: n(76, 4.8, 13.6, 0.5, 8.5), units: [{ unit: 'concha', label: 'concha pequena', grams: 65, fromPlan: true }] },
  { key: 'cuscuz', name: 'Cuscuz de milho cozido', emoji: '🌽', aliases: ['cuscuz de milho', 'cuscuz'], role: 'carbo', per100: n(113, 2.2, 25.3, 0.7, 2.1), units: [{ unit: 'pedaco', label: 'pedaço pequeno', grams: 85, fromPlan: true }] },
  { key: 'pao-forma-integral', name: 'Pão de forma integral', emoji: '🍞', aliases: ['pao de forma integral', 'pao de forma', 'pao integral'], role: 'carbo', per100: n(253, 9.4, 49.9, 3.7, 6.9), units: [{ unit: 'fatia', label: 'fatia', grams: 25, fromPlan: true }] },
  { key: 'pao-frances', name: 'Pão francês', emoji: '🥖', aliases: ['pao frances', 'paozinho', 'pao'], role: 'carbo', per100: n(300, 8.0, 58.6, 3.1, 2.3), units: [{ unit: 'unidade', label: 'unidade', grams: 50 }] },
  { key: 'pao-de-queijo', name: 'Pão de queijo', emoji: '🧀', aliases: ['pao de queijo'], role: 'carbo', per100: n(363, 5.1, 34.2, 24.6, 0.6), units: [{ unit: 'unidade', label: 'unidade média', grams: 20 }] },
  { key: 'batata-saute', name: 'Batata inglesa sauté', emoji: '🥔', aliases: ['batata inglesa saute', 'batata saute', 'batata inglesa', 'batata'], role: 'carbo', per100: n(68, 1.3, 14.1, 0.9, 1.4), units: [{ unit: 'colher', label: 'colher de sopa rasa', grams: 25, fromPlan: true }] },
  { key: 'batata-doce', name: 'Batata doce cozida', emoji: '🍠', aliases: ['batata doce'], role: 'carbo', per100: n(77, 0.6, 18.4, 0.1, 2.2), units: [{ unit: 'colher', label: 'colher de sopa cheia', grams: 42, fromPlan: true }] },
  { key: 'aveia', name: 'Aveia em flocos', emoji: '🥣', aliases: ['aveia em flocos', 'aveia'], role: 'carbo', per100: n(394, 13.9, 66.6, 8.5, 9.1), units: [{ unit: 'colher', label: 'colher de sopa', grams: 15 }] },
  { key: 'macarrao', name: 'Macarrão cozido', emoji: '🍝', aliases: ['macarrao integral', 'macarrao'], role: 'carbo' },
  { key: 'pao-sirio', name: 'Pão sírio', emoji: '🫓', aliases: ['pao sirio'], role: 'carbo' },
  { key: 'pao-fermentacao', name: 'Pão de fermentação natural', emoji: '🍞', aliases: ['pao de fermentacao natural', 'fermentacao natural'], role: 'carbo' },
  { key: 'inhame', name: 'Inhame (cará) cozido', emoji: '🥔', aliases: ['inhame', 'cara cozido'], role: 'carbo' },
  { key: 'grao-de-bico', name: 'Grão de bico cozido', emoji: '🫘', aliases: ['grao de bico'], role: 'carbo' },
  { key: 'feijao-verde', name: 'Feijão verde cozido', emoji: '🫘', aliases: ['feijao verde'], role: 'carbo' },
  { key: 'farelo-aveia', name: 'Farelo de aveia', emoji: '🥣', aliases: ['farelo de aveia'], role: 'fibra' },
  { key: 'gel-carbo', name: 'Carbo em gel', emoji: '⚡', aliases: ['gel endurance', 'carbo em gel', 'gel de carbo', 'gel'], role: 'carbo', units: [{ unit: 'sache', label: 'sachê', grams: 30, fromPlan: true }] },
  { key: 'gatorade', name: 'Isotônico', emoji: '🧃', aliases: ['gatorade', 'isotonico'], role: 'bebida' },

  // ── Proteínas ──
  { key: 'frango-grelhado', name: 'Frango grelhado (peito)', emoji: '🍗', aliases: ['file de frango grelhado', 'file de frango', 'peito de frango', 'frango grelhado', 'frango'], role: 'proteina', per100: n(159, 32.0, 0, 2.5, 0), units: [{ unit: 'bife', label: 'bife pequeno', grams: 50, fromPlan: true }, { unit: 'file', label: 'filé', grams: 100 }] },
  { key: 'frango-desfiado', name: 'Frango desfiado (peito cozido)', emoji: '🍗', aliases: ['frango desfiado'], role: 'proteina', per100: n(163, 31.5, 0, 3.2, 0), units: [{ unit: 'colher', label: 'colher de sopa cheia', grams: 25, fromPlan: true }] },
  { key: 'ovo', name: 'Ovo', emoji: '🥚', aliases: ['ovo de galinha', 'ovos', 'ovo mexido', 'ovo cozido', 'ovo'], role: 'proteina', per100: n(146, 13.3, 0.6, 9.5, 0), units: [{ unit: 'unidade', label: 'unidade média', grams: 50, fromPlan: true }] },
  { key: 'patinho', name: 'Patinho grelhado', emoji: '🥩', aliases: ['patinho grelhado', 'patinho'], role: 'proteina', per100: n(219, 35.9, 0, 7.3, 0), units: [{ unit: 'bife', label: 'bife pequeno', grams: 40, fromPlan: true }] },
  { key: 'contrafile', name: 'Contrafilé sem gordura grelhado', emoji: '🥩', aliases: ['contrafile', 'contra file'], role: 'proteina', per100: n(194, 35.9, 0, 4.5, 0), units: [{ unit: 'bife', label: 'bife pequeno', grams: 40, fromPlan: true }] },
  { key: 'file-mignon', name: 'Filé mignon grelhado', emoji: '🥩', aliases: ['file mignon grelhado', 'file mignon'], role: 'proteina', per100: n(220, 32.8, 0, 8.8, 0), units: [{ unit: 'bife', label: 'bife pequeno', grams: 50, fromPlan: true }] },
  { key: 'patinho-moido', name: 'Patinho moído', emoji: '🥩', aliases: ['patinho moido', 'carne moida'], role: 'proteina' },
  { key: 'suino', name: 'Filet mignon suíno assado', emoji: '🥩', aliases: ['filet mignon suino', 'file mignon suino', 'lombo'], role: 'proteina' },
  { key: 'tilapia', name: 'Tilápia grelhada', emoji: '🐟', aliases: ['tilapia'], role: 'proteina' },
  { key: 'salmao', name: 'Salmão grelhado', emoji: '🐟', aliases: ['salmao'], role: 'proteina' },
  { key: 'camarao', name: 'Camarão grelhado', emoji: '🍤', aliases: ['camarao'], role: 'proteina' },
  { key: 'peito-peru', name: 'Peito de peru defumado', emoji: '🦃', aliases: ['peito de peru', 'peru'], role: 'proteina' },
  { key: 'whey', name: 'Whey protein', emoji: '🥤', aliases: ['whey protein concentrado', 'whey protein', 'whey'], role: 'proteina', units: [{ unit: 'medidor', label: 'medidor', grams: 30, fromPlan: true }] },

  // ── Laticínios ──
  { key: 'mucarela', name: 'Queijo muçarela', emoji: '🧀', aliases: ['queijo mucarela', 'queijo mussarela', 'mucarela', 'mussarela', 'queijo'], role: 'laticinio', per100: n(330, 22.6, 3.0, 25.2, 0), units: [{ unit: 'fatia', label: 'fatia média', grams: 20, fromPlan: true }] },
  { key: 'queijo-minas', name: 'Queijo minas frescal', emoji: '🧀', aliases: ['queijo minas', 'minas frescal'], role: 'laticinio', per100: n(264, 17.4, 3.2, 20.2, 0), units: [{ unit: 'fatia', label: 'fatia média', grams: 30, fromPlan: true }] },
  { key: 'ricota', name: 'Ricota', emoji: '🧀', aliases: ['ricota'], role: 'laticinio', per100: n(140, 12.6, 3.8, 8.1, 0), units: [{ unit: 'colher', label: 'colher de sopa', grams: 20 }] },
  { key: 'requeijao', name: 'Requeijão cremoso', emoji: '🧀', aliases: ['requeijao cremoso', 'requeijao'], role: 'laticinio', per100: n(257, 9.6, 2.4, 23.4, 0), units: [{ unit: 'colher', label: 'colher de sopa', grams: 30, fromPlan: true }] },
  { key: 'requeijao-light', name: 'Requeijão light', emoji: '🧀', aliases: ['requeijao light'], role: 'laticinio' },
  { key: 'creme-ricota', name: 'Creme de ricota', emoji: '🧀', aliases: ['creme de ricota'], role: 'laticinio' },
  { key: 'queijo-canastra', name: 'Queijo canastra', emoji: '🧀', aliases: ['queijo canastra', 'canastra'], role: 'laticinio' },
  { key: 'iogurte-natural', name: 'Iogurte natural', emoji: '🥛', aliases: ['iogurte natural', 'iogurte'], role: 'laticinio', per100: n(51, 4.1, 1.9, 3.0, 0), units: [{ unit: 'pote', label: 'pote', grams: 170 }] },
  { key: 'leite-po-integral', name: 'Leite integral em pó', emoji: '🥛', aliases: ['leite de vaca integral em po', 'leite integral em po', 'leite em po'], role: 'laticinio', per100: n(497, 25.4, 39.2, 26.9, 0), units: [{ unit: 'colher', label: 'colher de sopa cheia', grams: 10, fromPlan: true }] },
  { key: 'leite-po-desnatado', name: 'Leite desnatado em pó', emoji: '🥛', aliases: ['leite de vaca desnatado em po', 'leite desnatado em po'], role: 'laticinio', per100: n(362, 34.7, 53.0, 0.9, 0), units: [{ unit: 'colher', label: 'colher de sopa cheia', grams: 10, fromPlan: true }] },
  { key: 'leite-integral', name: 'Leite integral', emoji: '🥛', aliases: ['leite de vaca integral', 'leite integral', 'leite'], role: 'laticinio', per100: n(61, 2.9, 4.3, 3.2, 0), units: [{ unit: 'copo', label: 'copo americano duplo', grams: 240, fromPlan: true }, { unit: 'xicara', label: 'xícara', grams: 100 }] },
  { key: 'leite-desnatado', name: 'Leite desnatado', emoji: '🥛', aliases: ['leite de vaca desnatado', 'leite desnatado'], role: 'laticinio' },
  { key: 'manteiga', name: 'Manteiga', emoji: '🧈', aliases: ['manteiga'], role: 'gordura', per100: n(726, 0.4, 0.1, 82.4, 0), units: [{ unit: 'colher', label: 'ponta de faca', grams: 5 }] },

  // ── Frutas ──
  { key: 'banana-prata', name: 'Banana prata', emoji: '🍌', aliases: ['banana prata', 'banana'], role: 'fruta', per100: n(98, 1.3, 26.0, 0.1, 2.0), units: [{ unit: 'unidade', label: 'unidade média', grams: 65, fromPlan: true }] },
  { key: 'maca', name: 'Maçã Argentina', emoji: '🍎', aliases: ['maca argentina', 'maca'], role: 'fruta', per100: n(63, 0.2, 16.6, 0.2, 2.0), units: [{ unit: 'unidade', label: 'unidade pequena', grams: 80, fromPlan: true }] },
  { key: 'manga', name: 'Manga Palmer', emoji: '🥭', aliases: ['manga palmer', 'manga'], role: 'fruta', per100: n(72, 0.4, 19.4, 0.2, 1.6), units: [{ unit: 'unidade', label: 'unidade média', grams: 140, fromPlan: true }] },
  { key: 'morango', name: 'Morango', emoji: '🍓', aliases: ['morangos', 'morango'], role: 'fruta', per100: n(30, 0.9, 6.8, 0.3, 1.7), units: [{ unit: 'unidade', label: 'unidade', grams: 20, fromPlan: true }] },
  { key: 'uva', name: 'Uva Itália', emoji: '🍇', aliases: ['uva italia', 'uvas', 'uva'], role: 'fruta', per100: n(53, 0.7, 13.6, 0.2, 0.9), units: [{ unit: 'unidade', label: 'uva', grams: 8, fromPlan: true }] },
  { key: 'mamao', name: 'Mamão papaia', emoji: '🍈', aliases: ['mamao papaia', 'mamao'], role: 'fruta', per100: n(40, 0.5, 10.4, 0.1, 1.0), units: [{ unit: 'unidade', label: 'meia unidade', grams: 140 }] },
  { key: 'abacaxi', name: 'Abacaxi', emoji: '🍍', aliases: ['abacaxi'], role: 'fruta', per100: n(48, 0.9, 12.3, 0.1, 1.0), units: [{ unit: 'fatia', label: 'fatia', grams: 75 }] },
  { key: 'melancia', name: 'Melancia', emoji: '🍉', aliases: ['melancia'], role: 'fruta', per100: n(33, 0.9, 8.1, 0, 0.1), units: [{ unit: 'fatia', label: 'fatia', grams: 200 }] },
  { key: 'melao', name: 'Melão', emoji: '🍈', aliases: ['melao'], role: 'fruta', per100: n(29, 0.7, 7.5, 0, 0.3), units: [{ unit: 'fatia', label: 'fatia', grams: 150 }] },
  { key: 'kiwi', name: 'Kiwi', emoji: '🥝', aliases: ['kiwi'], role: 'fruta', per100: n(51, 1.3, 11.5, 0.6, 2.7), units: [{ unit: 'unidade', label: 'unidade', grams: 75 }] },
  { key: 'tangerina', name: 'Tangerina Poncã', emoji: '🍊', aliases: ['tangerina ponca', 'tangerina', 'mexerica', 'ponca'], role: 'fruta', per100: n(38, 0.8, 9.6, 0.1, 0.9), units: [{ unit: 'unidade', label: 'unidade', grams: 135 }] },
  { key: 'laranja', name: 'Laranja pera', emoji: '🍊', aliases: ['laranja pera', 'laranja'], role: 'fruta', per100: n(37, 1.0, 8.9, 0.1, 0.8), units: [{ unit: 'unidade', label: 'unidade', grams: 140 }] },
  { key: 'abacate', name: 'Abacate', emoji: '🥑', aliases: ['abacate'], role: 'gordura', per100: n(96, 1.2, 6.0, 8.4, 6.3), units: [{ unit: 'colher', label: 'colher de sopa', grams: 30 }] },
  { key: 'salada-frutas', name: 'Salada de frutas', emoji: '🍓', aliases: ['salada de frutas'], role: 'fruta' },

  // ── Bebidas ──
  { key: 'suco-laranja', name: 'Suco de laranja', emoji: '🧃', aliases: ['suco de laranja'], role: 'bebida', per100: n(33, 0.7, 7.6, 0.1, 0), units: [{ unit: 'copo', label: 'copo americano duplo', grams: 240, fromPlan: true }] },
  { key: 'agua-coco', name: 'Água de coco', emoji: '🥥', aliases: ['agua de coco'], role: 'bebida', per100: n(22, 0, 5.3, 0, 0.1), units: [{ unit: 'copo', label: 'copo médio', grams: 200, fromPlan: true }] },
  { key: 'cafe', name: 'Café coado', emoji: '☕', aliases: ['cafe coado', 'cafe preto', 'cafe', 'cafezinho'], role: 'bebida', per100: n(9, 0.7, 1.5, 0.5, 0), units: [{ unit: 'xicara', label: 'xícara de chá', grams: 200, fromPlan: true }], negligible: true },
  { key: 'suco-uva', name: 'Suco de uva', emoji: '🍇', aliases: ['suco de uva'], role: 'bebida' },
  { key: 'suco-acerola', name: 'Suco de acerola', emoji: '🧃', aliases: ['suco natural de acerola', 'suco de acerola'], role: 'bebida' },
  { key: 'suco-outro', name: 'Suco', emoji: '🧃', aliases: ['suco de tangerina', 'suco de limao'], role: 'bebida' },

  // ── Doces ──
  { key: 'doce-de-leite', name: 'Doce de leite', emoji: '🍯', aliases: ['doce de leite'], role: 'doce', per100: n(306, 5.5, 59.5, 6.0, 0), units: [{ unit: 'colher', label: 'colher de café cheia', grams: 8, fromPlan: true }] },
  { key: 'mel', name: 'Mel', emoji: '🍯', aliases: ['mel de abelha', 'mel'], role: 'doce', per100: n(309, 0, 84.0, 0, 0), units: [{ unit: 'colher', label: 'colher de sopa rasa', grams: 15, fromPlan: true }] },
  { key: 'goiabada', name: 'Doce de goiaba', emoji: '🍬', aliases: ['doce de goiaba', 'goiabada'], role: 'doce', per100: n(269, 0.6, 74.1, 0, 3.7), units: [{ unit: 'colher', label: 'colher de chá cheia', grams: 9, fromPlan: true }] },
  { key: 'chocolate-amargo', name: 'Chocolate amargo 70%', emoji: '🍫', aliases: ['chocolate amargo', 'chocolate 70'], role: 'doce', units: [{ unit: 'barra', label: 'barra pequena', grams: 30, fromPlan: true }] },

  // ── Gorduras boas / sementes ──
  { key: 'castanha-caju', name: 'Castanha de caju', emoji: '🥜', aliases: ['castanha de caju', 'castanhas de caju', 'caju'], role: 'gordura', per100: n(570, 18.5, 29.1, 46.3, 3.7), units: [{ unit: 'unidade', label: 'unidade', grams: 2.5, fromPlan: true }] },
  { key: 'castanha-para', name: 'Castanha-do-brasil', emoji: '🌰', aliases: ['castanha do brasil', 'castanha do para', 'castanha da amazonia', 'castanhas', 'castanha'], role: 'gordura', per100: n(643, 14.5, 15.1, 63.5, 7.9), units: [{ unit: 'unidade', label: 'unidade', grams: 4, fromPlan: true }] },
  { key: 'amendoim', name: 'Amendoim', emoji: '🥜', aliases: ['amendoim'], role: 'gordura', per100: n(606, 22.5, 18.7, 54.0, 7.8), units: [{ unit: 'colher', label: 'colher de sopa cheia', grams: 19, fromPlan: true }] },
  { key: 'linhaca', name: 'Linhaça', emoji: '🌾', aliases: ['semente de linhaca', 'linhaca'], role: 'fibra', per100: n(495, 14.1, 43.3, 32.3, 33.5), units: [{ unit: 'colher', label: 'colher de sobremesa rasa', grams: 10, fromPlan: true }] },
  { key: 'gergelim', name: 'Gergelim', emoji: '🌾', aliases: ['semente de gergelim', 'gergelim'], role: 'fibra', per100: n(584, 21.2, 21.6, 50.4, 11.9), units: [{ unit: 'colher', label: 'colher de sopa rasa', grams: 15, fromPlan: true }] },
  { key: 'chia', name: 'Chia', emoji: '🌾', aliases: ['semente de chia', 'chia'], role: 'fibra', units: [{ unit: 'colher', label: 'colher de sopa cheia', grams: 15, fromPlan: true }] },
  { key: 'psyllium', name: 'Psyllium', emoji: '🌾', aliases: ['psyllium'], role: 'fibra' },

  // ── Vegetais / temperos ──
  { key: 'tomate', name: 'Tomate', emoji: '🍅', aliases: ['tomate'], role: 'vegetal', per100: n(15, 1.1, 3.1, 0.2, 1.2), units: [{ unit: 'unidade', label: 'unidade', grams: 100 }] },
  { key: 'salada-folhas', name: 'Salada de folhas', emoji: '🥬', aliases: ['salada alface', 'alface', 'rucula', 'salada verde', 'folhas'], role: 'vegetal', negligible: true },
  { key: 'legumes', name: 'Legumes cozidos', emoji: '🥦', aliases: ['salada de legumes', 'legumes'], role: 'vegetal' },
  { key: 'molho-tomate', name: 'Molho de tomate', emoji: '🍅', aliases: ['molho de tomate'], role: 'tempero', negligible: true },
  { key: 'canela', name: 'Canela', emoji: '🤎', aliases: ['canela em po', 'canela'], role: 'tempero', negligible: true },
]

/**
 * Category-level estimates for things that are not in TACO (packaged, restaurant). `nutrients` is
 * a rough per-unit ESTIMATE (confidence 'estimated', always said out loud); missing nutrients
 * means "anoto sem números".
 */
export interface CategoryEstimate {
  key: string
  name: string
  emoji?: string
  aliases: string[]
  role: FoodRole
  unitLabel: string
  nutrients?: Nutrients
  /** Brand-like products: ask "usar rótulo?" first. */
  packaged?: boolean
}

export const CATEGORY_ESTIMATES: CategoryEstimate[] = [
  { key: 'iogurte-proteico', name: 'Iogurte proteico', emoji: '🥛', aliases: ['iogurte proteico', 'bebida proteica', 'yopro', 'yo pro', 'whey shake', 'shake de proteina', 'shake proteico'], role: 'proteina', unitLabel: 'unidade', nutrients: n(130, 15, 12, 2), packaged: true },
  { key: 'barra-proteina', name: 'Barra de proteína', emoji: '🍫', aliases: ['barra de proteina', 'barrinha de proteina', 'barra proteica', 'barrinha proteica'], role: 'proteina', unitLabel: 'barra', nutrients: n(200, 15, 20, 7), packaged: true },
  { key: 'barra-cereal', name: 'Barra de cereal', emoji: '🍫', aliases: ['barra de cereal', 'barrinha de cereal', 'barrinha'], role: 'carbo', unitLabel: 'barra', nutrients: n(90, 1, 16, 2), packaged: true },
  { key: 'brownie', name: 'Brownie', emoji: '🍫', aliases: ['brownie', 'browne'], role: 'doce', unitLabel: 'pedaço', nutrients: n(250, 3, 32, 13), packaged: true },
  { key: 'bolo', name: 'Bolo', emoji: '🍰', aliases: ['bolo', 'fatia de bolo'], role: 'doce', unitLabel: 'fatia', nutrients: n(250, 4, 38, 9) },
  { key: 'cookie', name: 'Cookie', emoji: '🍪', aliases: ['cookie', 'cookies', 'biscoito', 'bolacha'], role: 'doce', unitLabel: 'unidade', nutrients: n(120, 1.5, 16, 6), packaged: true },
  { key: 'chocolate', name: 'Chocolate', emoji: '🍫', aliases: ['chocolate', 'bombom', 'quadradinho de chocolate'], role: 'doce', unitLabel: 'porção pequena', nutrients: n(135, 2, 14, 8), packaged: true },
  { key: 'sorvete', name: 'Sorvete', emoji: '🍦', aliases: ['sorvete', 'picole', 'gelato'], role: 'doce', unitLabel: 'bola', nutrients: n(130, 2, 16, 7) },
  { key: 'doce', name: 'Doce', emoji: '🍬', aliases: ['doce', 'docinho', 'brigadeiro', 'sobremesa'], role: 'doce', unitLabel: 'porção', nutrients: n(150, 2, 22, 6) },
  { key: 'pizza', name: 'Pizza', emoji: '🍕', aliases: ['pizza'], role: 'carbo', unitLabel: 'fatia', nutrients: n(280, 12, 30, 12) },
  { key: 'acai', name: 'Açaí', emoji: '🫐', aliases: ['acai'], role: 'carbo', unitLabel: 'tigela' },
  { key: 'japones', name: 'Comida japonesa', emoji: '🍣', aliases: ['japones', 'japa', 'sushi', 'sashimi', 'temaki', 'comida japonesa'], role: 'carbo', unitLabel: 'refeição' },
  { key: 'hamburguer', name: 'Hambúrguer', emoji: '🍔', aliases: ['hamburguer', 'burger'], role: 'carbo', unitLabel: 'unidade' },
  { key: 'salgado', name: 'Salgado', emoji: '🥟', aliases: ['salgado', 'coxinha', 'empada', 'esfiha', 'pastel'], role: 'carbo', unitLabel: 'unidade' },
  { key: 'tapioca', name: 'Tapioca', emoji: '🫓', aliases: ['tapioca'], role: 'carbo', unitLabel: 'unidade' },
]
