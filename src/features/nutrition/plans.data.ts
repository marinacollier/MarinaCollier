/**
 * Day plans prescribed by the nutritionist (PDF "Planejamento alimentar", 02/10/2026),
 * transcribed verbatim: foods, quantities, "Opções de substituição" (one string per option) and
 * "Observações". Only the PDF ligature "ﬁ" was normalized to "fi"; spelling is kept as written.
 * DATA ONLY — the app never edits or computes these values.
 */
import type { PlannedMeal } from '@/data/types'

/** SEGUNDA FEIRA E QUARTA FEIRA — Planejamento alimentar */
export const PLAN_SEGUNDA_E_QUARTA: PlannedMeal[] = [
  {
    time: "05:00",
    name: "Pré-treino",
    phase: "pre",
    items: [
      { food: "Café coado", qty: "1 Xícara(s) chá (200ml)" },
      { food: "Canela em pó", qty: "0.5 Colher(es) café cheia(s) (2g)" },
      {
        food: "Banana prata",
        qty: "1 unidade(s) média(s) (65g)",
        substitutions: [
          "Maçã Argentina - 1 unidade(s) pequena(s) (80g)",
          "Manga palmer - 0.5 unidade(s) média(s) (70g)",
          "Morango - 10 unidade(s) (200g)",
          "Uva Itália - 15 unidades (120g)",
        ],
      },
      {
        food: "Doce de leite cremoso",
        qty: "3 Colher(es) café cheia(s) (24g)",
        substitutions: [
          "Mel de abelha - 1.5 Colher(es) de sopa rasa(s) (22.5g)",
          "Chocolate amargo 70% cacau - 0.5 Barra(s) pequena(s) (15g)",
          "Doce de goiaba em pasta - 3 Colher(es) chá cheia(s) (27g)",
        ],
      },
    ],
    notes: "Opção 2\n. 1 café coado\n. 1 und carbo em gel (Vitafor ou Integral medica ou Dux) ou 1 und de gatorade",
  },
  {
    time: "08:00",
    name: "Café da manhã (pós-treino)",
    phase: "pos",
    items: [
      {
        food: "Cuscuz de milho cozido (sem sal)",
        qty: "2 Pedaço(s) pequeno(s) (170g)",
        substitutions: [
          "Pão de fermentação natural - 1 Porção(ões) (105g)",
          "Pão sírio - 1.5 Unidade(s) (90g)",
          "Pão de Forma 50% Integral 7 grãos (Plusvita) - 3 Fatia(s) (75g)",
          "Inhame (cará) cozido com sal - 3.5 Colher(es) de servir cheia(s) (217g)",
        ],
      },
      {
        food: "Ovo de galinha mexido com sal",
        qty: "2 Unidade(s) média(s) (100g)",
        substitutions: [
          "Peito de peru defumado - 3 Fatia(s) média(s) (60g)",
          "Frango desfiado - 2.5 Colher(es) de sopa cheia(s) (50g)",
          "Patinho moído - 0.4 Filé(s) médio(s) (44g)",
        ],
      },
      {
        food: "Queijo muçarela/mussarela",
        qty: "1 Fatia(s) média(s) (20g)",
        substitutions: [
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Creme de ricota - 1 Colher(es) de sopa (20g)",
          "Requeijão light 30% menos gordura (betania) - 1 colher de sopa (30g)",
        ],
      },
      {
        food: "Semente de chia",
        qty: "0.8 colher(es) de sopa cheia(s) (12g)",
        substitutions: [
          "Semente de gergelim - 0.4 colher(es) de sopa rasa(s) (6g)",
          "Semente de linhaça dourada - 0.8 colher(es) de sobremesa rasa(s) (8g)",
          "Psyllium - 1 Colher(es) de sopa (10g)",
        ],
      },
    ],
  },
  {
    time: "12:00",
    name: "Almoço",
    phase: "refeicao",
    items: [
      { food: "Salada de legumes cozidos no vapor com sal", qty: "2 Colher(es) de servir cheia(s) (110g)" },
      {
        food: "Arroz branco cozido",
        qty: "6 colher(es) de sopa cheia(s) (150g)",
        substitutions: [
          "Arroz integral cozido - 6 colher(es) de sopa cheia(s) (120g)",
          "Batata inglesa sauté - 11.4 colher(es) de sopa rasa(s) (285g)",
          "Macarrão cozido - 6 colher(es) de arroz rasa(s) (150g)",
          "Macarrão integral cozido - 6 colher(es) de arroz rasa(s) (150g)",
        ],
      },
      {
        food: "Feijão preto cozido",
        qty: "2 concha(s) pequena(s) cheia(s) (130g)",
        substitutions: [
          "Feijão carioca cozido - 1.6 concha(s) pequena(s) cheia(s) (104g)",
          "Grão de bico cozido - 1.5 colher(es) de arroz cheia (67.5g)",
          "Feijão verde cozido - 6 Colher(es) de sopa (150g)",
        ],
      },
      {
        food: "Filé de frango grelhado",
        qty: "2 bife(s) pequeno(s) (100g)",
        substitutions: [
          "Frango desfiado - 4 colher(es) de sopa cheia(s) (100g)",
          "Filet Mignon Suíno Assado - 1.3 Medalhão (130g)",
          "Contrafilé sem gordura grelhado - 2.4 bife(s) pequeno(s) (96g)",
          "Filé mignon grelhado - 1.8 bife(s) pequeno(s) (90g)",
          "Patinho grelhado - 2.2 bife(s) pequeno(s) (88g)",
          "Camarão grelhado - 12 unidade(s) média(s) (120g)",
          "Salmão sem pele grelhado - 0.65 filé(s) pequeno(s) (78g)",
          "Tilápia grelhada com sal - 2.2 filé(s) médio(s) (132g)",
        ],
      },
      {
        food: "Suco de laranja",
        qty: "1 Copo(s) americano(s) duplo(s) (240ml)",
        substitutions: [
          "Água de coco - 1 Copo(s) médio(s) (200ml)",
          "Suco natural de acerola (sem açúcar) - 1 Copo(s) americano(s) duplo(s) (240ml)",
        ],
      },
    ],
  },
  {
    time: "16:00",
    name: "Lanche da tarde",
    phase: "refeicao",
    items: [
      { food: "Salada de frutas - laranja, banana, maçã e mamão", qty: "2 Colher(es) de servir rasa(s) (110g)" },
      {
        food: "Leite de vaca integral em pó",
        qty: "2 colher(es) de sopa cheia(s) (20g)",
        substitutions: [
          "Leite de vaca desnatado UHT - 1 copo(s) americano(s) duplo(s) (240ml)",
          "Leite de vaca desnatado em pó - 2.5 colher(es) de sopa cheia(s) (25g)",
          "Leite de vaca integral UHT - 0.6 copo(s) americano(s) duplo(s) (144ml)",
        ],
      },
      { food: "Whey protein concentrado", qty: "1 Medidor(es) (30g)" },
    ],
  },
  {
    time: "20:00",
    name: "Jantar",
    phase: "refeicao",
    items: [
      { food: "Salada de legumes cozidos no vapor com sal", qty: "3 Colher(es) de servir cheia(s) (165g)" },
      {
        food: "Batata inglesa sauté",
        qty: "8 colher(es) de sopa rasa(s) (200g)",
        substitutions: [
          "Arroz integral cozido - 1.6 Colher(es) de servir cheia(s) (88g)",
          "Arroz branco cozido - 4.2 Colher(es) de sopa cheia(s) (105g)",
          "Macarrão cozido - 2 Colher(es) de servir cheia(s) (100g)",
          "Macarrão integral cozido - 2 Colher(es) de servir cheia(s) (100g)",
          "Cuscuz de milho cozido - 1.4 Pedaço(s) pequeno(s) (119g)",
          "Batata doce cozida - 3 Colher(es) de sopa cheia(s) (126g)",
          "Inhame (cará) cozido com sal - 2.5 Colher(es) de servir cheia(s) (155g)",
        ],
      },
      {
        food: "Filé de frango grelhado",
        qty: "1.5 bife(s) pequeno(s) (75g)",
        substitutions: [
          "Frango desfiado - 3 colher(es) de sopa cheia(s) (75g)",
          "Contrafilé sem gordura grelhado - 1.8 bife(s) pequeno(s) (72g)",
          "Filé mignon grelhado - 1.4 bife(s) pequeno(s) (67.5g)",
          "Patinho grelhado - 1.7 bife(s) pequeno(s) (66g)",
          "Camarão grelhdao - 9 unidade(s) média(s) (90g)",
          "Salmão sem pele grelhado - 0.5 filé(s) pequeno(s) (58.5g)",
          "Tilápia grelhada com sal - 1.7 filé(s) médio(s) (99g)",
          "Ovo de galinha mexido com sal - 2 Unidade(s) média(s) (100g)",
        ],
      },
      {
        food: "Requeijão light 30% menos gordura (betania)",
        qty: "1 colher de sopa (30g)",
        substitutions: [
          "Creme de ricota - 1 Colher(es) de sopa (20g)",
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Queijo muçarela/mussarela - 1 Fatia(s) média(s) (20g)",
        ],
      },
    ],
  },
]

/** TERÇA FEIRA — Planejamento alimentar */
export const PLAN_TERCA: PlannedMeal[] = [
  {
    time: "05:00",
    name: "Pré-treino",
    phase: "pre",
    items: [
      { food: "Café coado", qty: "1 Xícara(s) chá (200ml)" },
      { food: "Canela em pó", qty: "0.5 Colher(es) café cheia(s) (2g)" },
      {
        food: "Banana prata",
        qty: "1 unidade(s) média(s) (65g)",
        substitutions: [
          "Maçã Argentina - 1 unidade(s) pequena(s) (80g)",
          "Manga palmer - 0.5 unidade(s) média(s) (70g)",
          "Morango - 10 unidade(s) (200g)",
          "Uva Itália - 15 unidades (120g)",
        ],
      },
      {
        food: "Doce de leite cremoso",
        qty: "3 Colher(es) café cheia(s) (24g)",
        substitutions: [
          "Mel de abelha - 1.5 Colher(es) de sopa rasa(s) (22.5g)",
          "Chocolate amargo 70% cacau - 0.5 Barra(s) pequena(s) (15g)",
          "Doce de goiaba em pasta - 3 Colher(es) chá cheia(s) (27g)",
        ],
      },
    ],
  },
  {
    time: "08:00",
    name: "Café da manhã (pós-treino)",
    phase: "pos",
    items: [
      {
        food: "Pão de Forma 50% Integral 7 grãos (Plusvita)",
        qty: "2 Fatia(s) (50g)",
        substitutions: [
          "Pão de fermentação natural - 0.7 Porção(ões) (70g)",
          "Pão sírio - 1 Unidade(s) (63g)",
          "Cuscuz de milho cozido (sem sal) - 1.4 Pedaço(s) pequeno(s) (119g)",
          "Inhame (cará) cozido com sal - 2.4 Colher(es) de servir cheia(s) (151.9g)",
        ],
      },
      {
        food: "Ovo de galinha mexido com sal",
        qty: "2 Unidade(s) média(s) (100g)",
        substitutions: [
          "Peito de peru defumado - 3 Fatia(s) média(s) (60g)",
          "Frango desfiado - 2.5 Colher(es) de sopa cheia(s) (50g)",
          "Patinho moído - 0.4 Filé(s) médio(s) (44g)",
        ],
      },
      {
        food: "Queijo muçarela/mussarela",
        qty: "1 Fatia(s) média(s) (20g)",
        substitutions: [
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Creme de ricota - 1 Colher(es) de sopa (20g)",
          "Requeijão light 30% menos gordura (betania) - 1 colher de sopa (30g)",
        ],
      },
      {
        food: "Semente de chia",
        qty: "0.8 colher(es) de sopa cheia(s) (12g)",
        substitutions: [
          "Semente de gergelim - 0.4 colher(es) de sopa rasa(s) (6g)",
          "Semente de linhaça dourada - 0.8 colher(es) de sobremesa rasa(s) (8g)",
          "Psyllium - 1 Colher(es) de sopa (10g)",
        ],
      },
    ],
  },
  {
    time: "12:00",
    name: "Almoço",
    phase: "refeicao",
    items: [
      { food: "Salada de legumes cozidos no vapor com sal", qty: "3 Colher(es) de servir cheia(s) (165g)" },
      {
        food: "Arroz integral cozido",
        qty: "4 colher(es) de sopa cheia(s) (80g)",
        substitutions: [
          "Arroz branco cozido - 4 colher(es) de sopa cheia(s) (100g)",
          "Batata inglesa sauté - 7.6 colher(es) de sopa rasa(s) (190g)",
          "Macarrão cozido - 4 colher(es) de arroz rasa(s) (100g)",
          "Macarrão integral cozido - 4 colher(es) de arroz rasa(s) (100g)",
        ],
      },
      {
        food: "Feijão preto cozido",
        qty: "2 concha(s) pequena(s) cheia(s) (130g)",
        substitutions: [
          "Feijão carioca cozido - 1.6 concha(s) pequena(s) cheia(s) (104g)",
          "Grão de bico cozido - 1.5 colher(es) de arroz cheia (67.5g)",
          "Feijão verde cozido - 6 Colher(es) de sopa (150g)",
        ],
      },
      {
        food: "Filet Mignon Suíno Assado",
        qty: "1.6 Medalhão (162.5g)",
        substitutions: [
          "Frango desfiado - 5 colher(es) de sopa cheia(s) (125g)",
          "Filé de frango grelhado - 2.5 bife(s) pequeno(s) (125g)",
          "Contrafilé sem gordura grelhado - 3 bife(s) pequeno(s) (120g)",
          "Filé mignon grelhado - 2.3 bife(s) pequeno(s) (112.5g)",
          "Patinho grelhado - 2.8 bife(s) pequeno(s) (110g)",
          "Camarão grelhado - 15 unidade(s) média(s) (150g)",
          "Salmão sem pele grelhado - 0.8 filé(s) pequeno(s) (97.5g)",
          "Tilápia grelhada com sal - 2.8 filé(s) médio(s) (165g)",
        ],
      },
      {
        food: "Suco de laranja",
        qty: "1 Copo(s) americano(s) duplo(s) (240ml)",
        substitutions: [
          "Água de coco - 1 Copo(s) médio(s) (200ml)",
          "Suco natural de acerola (sem açúcar) - 1 Copo(s) americano(s) duplo(s) (240ml)",
        ],
      },
    ],
  },
  {
    time: "16:00",
    name: "Lanche da tarde",
    phase: "refeicao",
    items: [
      {
        food: "Banana prata",
        qty: "1 unidade(s) média(s) (65g)",
        substitutions: [
          "Abacaxi - 2 fatia(s) pequena(s) (150g)",
          "Maçã Argentina - 1 unidade(s) pequena(s) (80g)",
          "Mamão papaia - 0.5 unidade(s) pequena(s) (135g)",
          "Morango - 10 unidade(s) (200g)",
        ],
      },
      { food: "Farelo de aveia oat bran (Quaker)", qty: "1 Colher(es) de sopa (10g)" },
      {
        food: "Leite de vaca integral em pó",
        qty: "2 colher(es) de sopa cheia(s) (20g)",
        substitutions: [
          "Leite de vaca desnatado UHT - 1 copo(s) americano(s) duplo(s) (240ml)",
          "Leite de vaca desnatado em pó - 2.5 colher(es) de sopa cheia(s) (25g)",
          "Leite de vaca integral UHT - 0.6 copo(s) americano(s) duplo(s) (144ml)",
        ],
      },
      { food: "Whey protein concentrado", qty: "1 Medidor(es) (30g)" },
    ],
  },
  {
    time: "20:00",
    name: "Jantar",
    phase: "refeicao",
    items: [
      { food: "Salada alface lisa, alface roxa, rúcula e sal", qty: "À vontade" },
      {
        food: "Cuscuz de milho cozido",
        qty: "2 Pedaço(s) pequeno(s) (170g)",
        substitutions: [
          "Arroz integral cozido - 2.3 Colher(es) de servir cheia(s) (125.7g)",
          "Arroz branco cozido - 6 Colher(es) de sopa cheia(s) (150g)",
          "Macarrão cozido - 2.9 Colher(es) de servir cheia(s) (142.9g)",
          "Macarrão integral cozido - 2.9 Colher(es) de servir cheia(s) (142.9g)",
          "Batata inglesa sauté - 11.4 colher(es) de sopa rasa(s) (285.7g)",
          "Batata doce cozida - 4.3 Colher(es) de sopa cheia(s) (180g)",
          "Inhame (cará) cozido com sal - 3.6 Colher(es) de servir cheia(s) (221.4g)",
        ],
      },
      {
        food: "Filé de frango grelhado",
        qty: "2 bife(s) pequeno(s) (100g)",
        substitutions: [
          "Frango desfiado - 4 colher(es) de sopa cheia(s) (100g)",
          "Contrafilé sem gordura grelhado - 2.4 bife(s) pequeno(s) (96g)",
          "Filé mignon grelhado - 1.9 bife(s) pequeno(s) (90g)",
          "Patinho grelhado - 2.3 bife(s) pequeno(s) (88g)",
          "Camarão grelhdao - 12 unidade(s) média(s) (120g)",
          "Salmão sem pele grelhado - 0.7 filé(s) pequeno(s) (78g)",
          "Tilápia grelhada com sal - 2.3 filé(s) médio(s) (132g)",
          "Ovo de galinha mexido com sal - 2.7 Unidade(s) média(s) (133.3g)",
        ],
      },
      {
        food: "Creme de ricota",
        qty: "1 Colher(es) de sopa (20g)",
        substitutions: [
          "Requeijão light 30% menos gordura (betania) - 1 colher de sopa (30g)",
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Queijo muçarela/mussarela - 1 Fatia(s) média(s) (20g)",
        ],
      },
      {
        food: "Suco de laranja",
        qty: "1 Copo(s) americano(s) duplo(s) (240ml)",
        substitutions: [
          "Suco de tangerina - 1 Copo(s) americano(s) duplo(s) (240ml)",
          "Suco de limão - 1 Copo(s) médio(s) (200ml)",
        ],
      },
    ],
  },
]

/** QUINTA FEIRA — Planejamento alimentar */
export const PLAN_QUINTA: PlannedMeal[] = [
  {
    time: "05:00",
    name: "Pré-treino",
    phase: "pre",
    items: [
      { food: "Café coado", qty: "1 Xícara(s) chá (200ml)" },
      { food: "Canela em pó", qty: "0.5 Colher(es) café cheia(s) (2g)" },
      {
        food: "Banana prata",
        qty: "1 unidade(s) média(s) (65g)",
        substitutions: [
          "Maçã Argentina - 1 unidade(s) pequena(s) (80g)",
          "Manga palmer - 0.5 unidade(s) média(s) (70g)",
          "Morango - 10 unidade(s) (200g)",
          "Uva Itália - 15 unidades (120g)",
        ],
      },
      {
        food: "Doce de leite cremoso",
        qty: "3 Colher(es) café cheia(s) (24g)",
        substitutions: [
          "Mel de abelha - 1.5 Colher(es) de sopa rasa(s) (22.5g)",
          "Chocolate amargo 70% cacau - 0.5 Barra(s) pequena(s) (15g)",
          "Doce de goiaba em pasta - 3 Colher(es) chá cheia(s) (27g)",
        ],
      },
    ],
  },
  {
    time: "08:00",
    name: "Café da manhã (pós-treino)",
    phase: "pos",
    items: [
      {
        food: "Cuscuz de milho cozido (sem sal)",
        qty: "2 Pedaço(s) pequeno(s) (170g)",
        substitutions: [
          "Pão de fermentação natural - 1 Porção(ões) (105g)",
          "Pão sírio - 1.5 Unidade(s) (90g)",
          "Pão de Forma 50% Integral 7 grãos (Plusvita) - 3 Fatia(s) (75g)",
          "Inhame (cará) cozido com sal - 3.5 Colher(es) de servir cheia(s) (217g)",
        ],
      },
      {
        food: "Ovo de galinha mexido com sal",
        qty: "2 Unidade(s) média(s) (100g)",
        substitutions: [
          "Peito de peru defumado - 3 Fatia(s) média(s) (60g)",
          "Frango desfiado - 2.5 Colher(es) de sopa cheia(s) (50g)",
          "Patinho moído - 0.4 Filé(s) médio(s) (44g)",
        ],
      },
      {
        food: "Queijo muçarela/mussarela",
        qty: "1 Fatia(s) média(s) (20g)",
        substitutions: [
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Creme de ricota - 1 Colher(es) de sopa (20g)",
          "Requeijão light 30% menos gordura (betania) - 1 colher de sopa (30g)",
        ],
      },
      {
        food: "Semente de chia",
        qty: "0.8 colher(es) de sopa cheia(s) (12g)",
        substitutions: [
          "Semente de gergelim - 0.4 colher(es) de sopa rasa(s) (6g)",
          "Semente de linhaça dourada - 0.8 colher(es) de sobremesa rasa(s) (8g)",
          "Psyllium - 1 Colher(es) de sopa (10g)",
        ],
      },
    ],
  },
  {
    time: "12:00",
    name: "Almoço",
    phase: "refeicao",
    items: [
      { food: "Salada de legumes cozidos no vapor com sal", qty: "2 Colher(es) de servir cheia(s) (110g)" },
      {
        food: "Arroz branco cozido",
        qty: "6 colher(es) de sopa cheia(s) (150g)",
        substitutions: [
          "Arroz integral cozido - 6 colher(es) de sopa cheia(s) (120g)",
          "Batata inglesa sauté - 11.4 colher(es) de sopa rasa(s) (285g)",
          "Macarrão cozido - 6 colher(es) de arroz rasa(s) (150g)",
          "Macarrão integral cozido - 6 colher(es) de arroz rasa(s) (150g)",
        ],
      },
      {
        food: "Feijão preto cozido",
        qty: "2 concha(s) pequena(s) cheia(s) (130g)",
        substitutions: [
          "Feijão carioca cozido - 1.6 concha(s) pequena(s) cheia(s) (104g)",
          "Grão de bico cozido - 1.5 colher(es) de arroz cheia (67.5g)",
          "Feijão verde cozido - 6 Colher(es) de sopa (150g)",
        ],
      },
      {
        food: "Filé de frango grelhado",
        qty: "2 bife(s) pequeno(s) (100g)",
        substitutions: [
          "Frango desfiado - 4 colher(es) de sopa cheia(s) (100g)",
          "Filet Mignon Suíno Assado - 1.3 Medalhão (130g)",
          "Contrafilé sem gordura grelhado - 2.4 bife(s) pequeno(s) (96g)",
          "Filé mignon grelhado - 1.8 bife(s) pequeno(s) (90g)",
          "Patinho grelhado - 2.2 bife(s) pequeno(s) (88g)",
          "Camarão grelhado - 12 unidade(s) média(s) (120g)",
          "Salmão sem pele grelhado - 0.65 filé(s) pequeno(s) (78g)",
          "Tilápia grelhada com sal - 2.2 filé(s) médio(s) (132g)",
        ],
      },
    ],
  },
  {
    time: "16:00",
    name: "Lanche da tarde",
    phase: "refeicao",
    items: [
      {
        food: "Salada de frutas - laranja, banana, maçã e mamão",
        qty: "2 Colher(es) de servir rasa(s) (110g)",
        substitutions: [
          "Abacaxi - 2 fatia(s) pequena(s) (150g)",
          "Kiwi - 2 unidade(s) pequena(s) (130g)",
          "Melancia - 1 fatia(s) média(s) (200g)",
          "Melão - 2 fatia(s) grande(s) (230g)",
          "Tangerina Ponkã - 1 unidade(s) média(s) (135g)",
          "Ameixa - 3 unidade(s) pequena(s) (102g)",
        ],
      },
      {
        food: "Leite de vaca integral em pó",
        qty: "2 colher(es) de sopa cheia(s) (20g)",
        substitutions: [
          "Leite de vaca desnatado UHT - 1 copo(s) americano(s) duplo(s) (240ml)",
          "Leite de vaca desnatado em pó - 2.5 colher(es) de sopa cheia(s) (25g)",
          "Leite de vaca integral UHT - 0.6 copo(s) americano(s) duplo(s) (144ml)",
        ],
      },
      { food: "Whey protein concentrado", qty: "1 Medidor(es) (30g)" },
    ],
  },
  {
    time: "20:00",
    name: "Jantar",
    phase: "refeicao",
    items: [
      { food: "Salada alface lisa, alface roxa, rúcula e sal", qty: "À vontade" },
      { food: "Molho de tomate industrializado", qty: "2 Colher(es) de sopa cheia(s) (40g)" },
      {
        food: "Macarrão cozido",
        qty: "3 Colher(es) de servir cheia(s) (150g)",
        substitutions: [
          "Arroz integral cozido - 2.3 Colher(es) de servir cheia(s) (125.7g)",
          "Arroz branco cozido - 6 Colher(es) de sopa cheia(s) (150g)",
          "Cuscuz de milho cozido - 2 Pedaço(s) pequeno(s) (170g)",
          "Macarrão integral cozido - 3 Colher(es) de servir cheia(s) (150g)",
          "Batata inglesa sauté - 11.4 colher(es) de sopa rasa(s) (285.7g)",
          "Batata doce cozida - 4.3 Colher(es) de sopa cheia(s) (180g)",
          "Inhame (cará) cozido com sal - 3.6 Colher(es) de servir cheia(s) (221.4g)",
        ],
      },
      {
        food: "Patinho Moido",
        qty: "2.3 bife(s) pequeno(s) (88g)",
        substitutions: [
          "Frango desfiado - 4 colher(es) de sopa cheia(s) (100g)",
          "Contrafilé sem gordura grelhado - 2.4 bife(s) pequeno(s) (96g)",
          "Filé mignon grelhado - 1.9 bife(s) pequeno(s) (90g)",
          "Filé de frango grelhado - 2 bife(s) pequeno(s) (100g)",
          "Camarão grelhADO - 12 unidade(s) média(s) (120g)",
          "Salmão sem pele grelhado - 0.7 filé(s) pequeno(s) (78g)",
          "Tilápia grelhada com sal - 2.3 filé(s) médio(s) (132g)",
          "Ovo de galinha mexido com sal - 2.7 Unidade(s) média(s) (133.3g)",
        ],
      },
      {
        food: "Queijo muçarela/mussarela",
        qty: "1 Fatia(s) média(s) (20g)",
        substitutions: [
          "Creme de ricota - 1 Colher(es) de sopa (20g)",
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Requeijão light 30% menos gordura (betania) - 1 colher de sopa (30g)",
        ],
      },
    ],
  },
]

/** SEXTA FEIRA — Planejamento alimentar */
export const PLAN_SEXTA: PlannedMeal[] = [
  {
    time: "05:00",
    name: "Pré-treino",
    phase: "pre",
    items: [
      { food: "Café coado", qty: "1 Xícara(s) chá (200ml)" },
      { food: "Canela em pó", qty: "0.5 Colher(es) café cheia(s) (2g)" },
      {
        food: "Banana prata",
        qty: "1 unidade(s) média(s) (65g)",
        substitutions: [
          "Maçã Argentina - 1 unidade(s) pequena(s) (80g)",
          "Manga palmer - 0.5 unidade(s) média(s) (70g)",
          "Morango - 10 unidade(s) (200g)",
          "Uva Itália - 15 unidades (120g)",
        ],
      },
      {
        food: "Doce de leite cremoso",
        qty: "4 Colher(es) café cheia(s) (32g)",
        substitutions: [
          "Mel de abelha - 2 Colher(es) de sopa rasa(s) (30g)",
          "Chocolate amargo 70% cacau - 0.7 Barra(s) pequena(s) (20g)",
          "Doce de goiaba em pasta - 4 Colher(es) chá cheia(s) (36g)",
        ],
      },
    ],
  },
  {
    time: "06:40",
    name: "Intra-treino",
    phase: "intra",
    items: [
      {
        food: "Gel - Endurance - Tangerina (Marca: Vitafor)",
        qty: "1 Sachê(s) (30g)",
        substitutions: [
          "Mel de abelha - 3 Colher(es) de sobremesa rasa(s) (27g)",
          "Gatorade Laranja - 0.5 Unidade(s) (250ml)",
        ],
      },
    ],
    notes: "Utilizar um carbo em Gel após 40 min de corrida continua",
  },
  {
    time: "08:00",
    name: "Café da manhã (pós-treino)",
    phase: "pos",
    items: [
      {
        food: "Cuscuz de milho cozido (sem sal)",
        qty: "2 Pedaço(s) pequeno(s) (170g)",
        substitutions: [
          "Pão de fermentação natural - 1 Porção(ões) (105g)",
          "Pão sírio - 1.5 Unidade(s) (90g)",
          "Pão de Forma 50% Integral 7 grãos (Plusvita) - 3 Fatia(s) (75g)",
          "Inhame (cará) cozido com sal - 3.5 Colher(es) de servir cheia(s) (217g)",
        ],
      },
      {
        food: "Ovo de galinha mexido com sal",
        qty: "2 Unidade(s) média(s) (100g)",
        substitutions: [
          "Peito de peru defumado - 3 Fatia(s) média(s) (60g)",
          "Frango desfiado - 2.5 Colher(es) de sopa cheia(s) (50g)",
          "Patinho moído - 0.4 Filé(s) médio(s) (44g)",
        ],
      },
      {
        food: "Queijo muçarela/mussarela",
        qty: "1 Fatia(s) média(s) (20g)",
        substitutions: [
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Creme de ricota - 1 Colher(es) de sopa (20g)",
          "Requeijão light 30% menos gordura (betania) - 1 colher de sopa (30g)",
        ],
      },
      {
        food: "Semente de chia",
        qty: "0.8 colher(es) de sopa cheia(s) (12g)",
        substitutions: [
          "Semente de gergelim - 0.4 colher(es) de sopa rasa(s) (6g)",
          "Semente de linhaça dourada - 0.8 colher(es) de sobremesa rasa(s) (8g)",
          "Psyllium - 1 Colher(es) de sopa (10g)",
        ],
      },
      {
        food: "Suco de laranja",
        qty: "1 Copo(s) americano(s) duplo(s) (240ml)",
        substitutions: [
          "Suco de uva concentrado - 1 Copo(s) americano(s) pequeno(s) cheio(s) (165ml)",
        ],
      },
    ],
  },
  {
    time: "12:00",
    name: "Almoço",
    phase: "refeicao",
    items: [
      { food: "Salada de legumes cozidos no vapor com sal", qty: "2 Colher(es) de servir cheia(s) (110g)" },
      {
        food: "Arroz branco cozido",
        qty: "6 colher(es) de sopa cheia(s) (150g)",
        substitutions: [
          "Arroz integral cozido - 6 colher(es) de sopa cheia(s) (120g)",
          "Batata inglesa sauté - 11.4 colher(es) de sopa rasa(s) (285g)",
          "Macarrão cozido - 6 colher(es) de arroz rasa(s) (150g)",
          "Macarrão integral cozido - 6 colher(es) de arroz rasa(s) (150g)",
        ],
      },
      {
        food: "Feijão preto cozido",
        qty: "2 concha(s) pequena(s) cheia(s) (130g)",
        substitutions: [
          "Feijão carioca cozido - 1.6 concha(s) pequena(s) cheia(s) (104g)",
          "Grão de bico cozido - 1.5 colher(es) de arroz cheia (67.5g)",
          "Feijão verde cozido - 6 Colher(es) de sopa (150g)",
        ],
      },
      {
        food: "Filé de frango grelhado",
        qty: "2 bife(s) pequeno(s) (100g)",
        substitutions: [
          "Frango desfiado - 4 colher(es) de sopa cheia(s) (100g)",
          "Filet Mignon Suíno Assado - 1.3 Medalhão (130g)",
          "Contrafilé sem gordura grelhado - 2.4 bife(s) pequeno(s) (96g)",
          "Filé mignon grelhado - 1.8 bife(s) pequeno(s) (90g)",
          "Patinho grelhado - 2.2 bife(s) pequeno(s) (88g)",
          "Camarão grelhado - 12 unidade(s) média(s) (120g)",
          "Salmão sem pele grelhado - 0.65 filé(s) pequeno(s) (78g)",
          "Tilápia grelhada com sal - 2.2 filé(s) médio(s) (132g)",
        ],
      },
      {
        food: "Suco de laranja",
        qty: "1 Copo(s) americano(s) duplo(s) (240ml)",
        substitutions: [
          "Água de coco - 1 Copo(s) médio(s) (200ml)",
          "Suco natural de acerola (sem açúcar) - 1 Copo(s) americano(s) duplo(s) (240ml)",
        ],
      },
    ],
  },
  {
    time: "16:00",
    name: "Lanche da tarde",
    phase: "refeicao",
    items: [
      {
        food: "Castanha de caju",
        qty: "8 unidade(s) (20g)",
        substitutions: [
          "Amendoim - 1 colher(es) de sopa cheia(s) (19g)",
          "Castanha do Brasil (castanha do Pará, castanha da Amazônia) - 4 unidade(s) (16g)",
          "Chocolate amargo 70% cacau - 0.7 Barra(s) pequena(s) (21g)",
        ],
      },
      {
        food: "Leite de vaca integral em pó",
        qty: "2 colher(es) de sopa cheia(s) (20g)",
        substitutions: [
          "Leite de vaca desnatado UHT - 1 copo(s) americano(s) duplo(s) (240ml)",
          "Leite de vaca desnatado em pó - 2.5 colher(es) de sopa cheia(s) (25g)",
          "Leite de vaca integral UHT - 0.6 copo(s) americano(s) duplo(s) (144ml)",
        ],
      },
      { food: "Whey protein concentrado", qty: "1 Medidor(es) (30g)" },
    ],
  },
  {
    time: "20:00",
    name: "Jantar",
    phase: "refeicao",
    items: [
      { food: "Salada de legumes cozidos no vapor com sal", qty: "3 Colher(es) de servir cheia(s) (165g)" },
      {
        food: "Batata inglesa sauté",
        qty: "8 colher(es) de sopa rasa(s) (200g)",
        substitutions: [
          "Arroz integral cozido - 1.6 Colher(es) de servir cheia(s) (88g)",
          "Arroz branco cozido - 4.2 Colher(es) de sopa cheia(s) (105g)",
          "Macarrão cozido - 2 Colher(es) de servir cheia(s) (100g)",
          "Macarrão integral cozido - 2 Colher(es) de servir cheia(s) (100g)",
          "Cuscuz de milho cozido - 1.4 Pedaço(s) pequeno(s) (119g)",
          "Batata doce cozida - 3 Colher(es) de sopa cheia(s) (126g)",
          "Inhame (cará) cozido com sal - 2.5 Colher(es) de servir cheia(s) (155g)",
        ],
      },
      {
        food: "Filé de frango grelhado",
        qty: "1.5 bife(s) pequeno(s) (75g)",
        substitutions: [
          "Frango desfiado - 3 colher(es) de sopa cheia(s) (75g)",
          "Contrafilé sem gordura grelhado - 1.8 bife(s) pequeno(s) (72g)",
          "Filé mignon grelhado - 1.4 bife(s) pequeno(s) (67.5g)",
          "Patinho grelhado - 1.7 bife(s) pequeno(s) (66g)",
          "Camarão grelhdao - 9 unidade(s) média(s) (90g)",
          "Salmão sem pele grelhado - 0.5 filé(s) pequeno(s) (58.5g)",
          "Tilápia grelhada com sal - 1.7 filé(s) médio(s) (99g)",
          "Ovo de galinha mexido com sal - 2 Unidade(s) média(s) (100g)",
        ],
      },
      {
        food: "Requeijão light 30% menos gordura (betania)",
        qty: "1 colher de sopa (30g)",
        substitutions: [
          "Creme de ricota - 1 Colher(es) de sopa (20g)",
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Queijo muçarela/mussarela - 1 Fatia(s) média(s) (20g)",
        ],
      },
    ],
  },
]

/** SÁBADO — Planejamento alimentar */
export const PLAN_SABADO: PlannedMeal[] = [
  {
    time: "08:00",
    name: "Café da manhã",
    phase: "refeicao",
    items: [
      {
        food: "Pão de Forma 50% Integral 7 grãos (Plusvita)",
        qty: "2 Fatia(s) (50g)",
        substitutions: [
          "Pão de fermentação natural - 0.7 Porção(ões) (70g)",
          "Pão sírio - 1 Unidade(s) (63g)",
          "Cuscuz de milho cozido (sem sal) - 1.4 Pedaço(s) pequeno(s) (119g)",
          "Inhame (cará) cozido com sal - 2.4 Colher(es) de servir cheia(s) (151.9g)",
        ],
      },
      {
        food: "Ovo de galinha mexido com sal",
        qty: "2 Unidade(s) média(s) (100g)",
        substitutions: [
          "Peito de peru defumado - 3 Fatia(s) média(s) (60g)",
          "Frango desfiado - 2.5 Colher(es) de sopa cheia(s) (50g)",
          "Patinho moído - 0.4 Filé(s) médio(s) (44g)",
        ],
      },
      {
        food: "Queijo muçarela/mussarela",
        qty: "1 Fatia(s) média(s) (20g)",
        substitutions: [
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Creme de ricota - 1 Colher(es) de sopa (20g)",
          "Requeijão light 30% menos gordura (betania) - 1 colher de sopa (30g)",
        ],
      },
      {
        food: "Semente de chia",
        qty: "0.8 colher(es) de sopa cheia(s) (12g)",
        substitutions: [
          "Semente de gergelim - 0.4 colher(es) de sopa rasa(s) (6g)",
          "Semente de linhaça dourada - 0.8 colher(es) de sobremesa rasa(s) (8g)",
          "Psyllium - 1 Colher(es) de sopa (10g)",
        ],
      },
      {
        food: "Tangerina Ponkã",
        qty: "1 unidade(s) média(s) (135g)",
        substitutions: [
          "Abacaxi - 2 fatia(s) pequena(s) (150g)",
          "Mamão papaia - 0.5 unidade(s) pequena(s) (135g)",
          "Morango - 10 unidade(s) (200g)",
          "Uva Itália - 15 unidades (120g)",
        ],
      },
    ],
  },
  {
    time: "12:00",
    name: "Almoço",
    phase: "refeicao",
    items: [
      { food: "Salada de legumes cozidos no vapor com sal", qty: "3 Colher(es) de servir cheia(s) (165g)" },
      {
        food: "Arroz integral cozido",
        qty: "5 colher(es) de sopa cheia(s) (100g)",
        substitutions: [
          "Arroz branco cozido - 5 colher(es) de sopa cheia(s) (125g)",
          "Batata inglesa sauté - 9.5 colher(es) de sopa rasa(s) (237.5g)",
          "Macarrão cozido - 5 colher(es) de arroz rasa(s) (125g)",
          "Macarrão integral cozido - 5 colher(es) de arroz rasa(s) (125g)",
        ],
      },
      {
        food: "Feijão preto cozido",
        qty: "2 concha(s) pequena(s) cheia(s) (130g)",
        substitutions: [
          "Feijão carioca cozido - 1.6 concha(s) pequena(s) cheia(s) (104g)",
          "Grão de bico cozido - 1.5 colher(es) de arroz cheia (67.5g)",
          "Feijão verde cozido - 6 Colher(es) de sopa (150g)",
        ],
      },
      {
        food: "Frango desfiado",
        qty: "5 colher(es) de sopa cheia(s) (125g)",
        substitutions: [
          "Filet Mignon Suíno Assado - 1.6 Medalhão (162.5g)",
          "Filé de frango grelhado - 2.5 bife(s) pequeno(s) (125g)",
          "Contrafilé sem gordura grelhado - 3 bife(s) pequeno(s) (120g)",
          "Filé mignon grelhado - 2.3 bife(s) pequeno(s) (112.5g)",
          "Patinho grelhado - 2.8 bife(s) pequeno(s) (110g)",
          "Camarão grelhado - 15 unidade(s) média(s) (150g)",
          "Salmão sem pele grelhado - 0.8 filé(s) pequeno(s) (97.5g)",
          "Tilápia grelhada com sal - 2.8 filé(s) médio(s) (165g)",
        ],
      },
      {
        food: "Suco de laranja",
        qty: "1 Copo(s) americano(s) duplo(s) (240ml)",
        substitutions: [
          "Água de coco - 1 Copo(s) médio(s) (200ml)",
          "Suco natural de acerola (sem açúcar) - 1 Copo(s) americano(s) duplo(s) (240ml)",
        ],
      },
    ],
  },
  {
    time: "16:00",
    name: "Lanche da tarde",
    phase: "refeicao",
    items: [
      {
        food: "Banana prata",
        qty: "2 unidade(s) média(s) (130g)",
        substitutions: [
          "Abacaxi - 4 fatia(s) pequena(s) (300g)",
          "Maçã Argentina - 2 unidade(s) pequena(s) (160g)",
          "Mamão papaia - 1 unidade(s) pequena(s) (270g)",
          "Morango - 20 unidade(s) (400g)",
        ],
      },
      { food: "Farelo de aveia oat bran (Quaker)", qty: "1 Colher(es) de sopa (10g)" },
      {
        food: "Leite de vaca integral em pó",
        qty: "2 colher(es) de sopa cheia(s) (20g)",
        substitutions: [
          "Leite de vaca desnatado UHT - 1 copo(s) americano(s) duplo(s) (240ml)",
          "Leite de vaca desnatado em pó - 2.5 colher(es) de sopa cheia(s) (25g)",
          "Leite de vaca integral UHT - 0.6 copo(s) americano(s) duplo(s) (144ml)",
        ],
      },
      { food: "Whey protein concentrado", qty: "1 Medidor(es) (30g)" },
    ],
  },
  {
    time: "20:00",
    name: "Jantar",
    phase: "refeicao",
    items: [
      { food: "Salada alface lisa, alface roxa, rúcula e sal", qty: "À vontade" },
      { food: "Molho de tomate industrializado", qty: "3 Colher(es) de sopa cheia(s) (60g)" },
      {
        food: "Macarrão cozido",
        qty: "3.5 Colher(es) de servir cheia(s) (175g)",
        substitutions: [
          "Arroz integral cozido - 2.8 Colher(es) de servir cheia(s) (153.9g)",
          "Arroz branco cozido - 7.3 Colher(es) de sopa cheia(s) (183.7g)",
          "Cuscuz de milho cozido - 2.4 Pedaço(s) pequeno(s) (208.2g)",
          "Macarrão integral cozido - 3.6 Colher(es) de servir cheia(s) (175g)",
          "Batata inglesa sauté - 14 colher(es) de sopa rasa(s) (349.9g)",
          "Batata doce cozida - 5.3 Colher(es) de sopa cheia(s) (220.4g)",
          "Inhame (cará) cozido com sal - 4.4 Colher(es) de servir cheia(s) (271.1g)",
        ],
      },
      {
        food: "Filé de frango grelhado",
        qty: "2 bife(s) pequeno(s) (100g)",
        substitutions: [
          "Frango desfiado - 4 colher(es) de sopa cheia(s) (100g)",
          "Contrafilé sem gordura grelhado - 2.4 bife(s) pequeno(s) (96g)",
          "Filé mignon grelhado - 1.9 bife(s) pequeno(s) (90g)",
          "Patinho grelhado - 2.3 bife(s) pequeno(s) (88g)",
          "Camarão grelhdao - 12 unidade(s) média(s) (120g)",
          "Salmão sem pele grelhado - 0.7 filé(s) pequeno(s) (78g)",
          "Tilápia grelhada com sal - 2.3 filé(s) médio(s) (132g)",
          "Ovo de galinha mexido com sal - 2.7 Unidade(s) média(s) (133.3g)",
        ],
      },
      {
        food: "Creme de ricota",
        qty: "1 Colher(es) de sopa (20g)",
        substitutions: [
          "Requeijão light 30% menos gordura (betania) - 1 colher de sopa (30g)",
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Queijo muçarela/mussarela - 1 Fatia(s) média(s) (20g)",
        ],
      },
      {
        food: "Suco de laranja",
        qty: "1 Copo(s) americano(s) duplo(s) (240ml)",
        substitutions: [
          "Suco de tangerina - 1 Copo(s) americano(s) duplo(s) (240ml)",
          "Suco de limão - 1 Copo(s) médio(s) (200ml)",
        ],
      },
    ],
  },
]

/** DOMINGO — Planejamento alimentar */
export const PLAN_DOMINGO: PlannedMeal[] = [
  {
    time: "05:00",
    name: "Pré-treino",
    phase: "pre",
    items: [
      { food: "Café coado", qty: "1 Xícara(s) chá (200ml)" },
      { food: "Canela em pó", qty: "0.5 Colher(es) café cheia(s) (2g)" },
      {
        food: "Banana prata",
        qty: "1 unidade(s) média(s) (65g)",
        substitutions: [
          "Maçã Argentina - 1 unidade(s) pequena(s) (80g)",
          "Manga palmer - 0.5 unidade(s) média(s) (70g)",
          "Morango - 10 unidade(s) (200g)",
          "Uva Itália - 15 unidades (120g)",
        ],
      },
      {
        food: "Doce de leite cremoso",
        qty: "4 Colher(es) café cheia(s) (32g)",
        substitutions: [
          "Mel de abelha - 2 Colher(es) de sopa rasa(s) (30g)",
          "Chocolate amargo 70% cacau - 0.7 Barra(s) pequena(s) (20g)",
          "Doce de goiaba em pasta - 4 Colher(es) chá cheia(s) (36g)",
        ],
      },
    ],
  },
  {
    time: "06:40",
    name: "Intra-treino",
    phase: "intra",
    items: [
      { food: "Pão de queijo assado", qty: "2 Unidade(s) média(s) (40g)" },
      { food: "Queijo canastra", qty: "1 Fatia(s) média(s) (30g)" },
    ],
  },
  {
    time: "07:20",
    name: "Intra-treino",
    phase: "intra",
    items: [
      {
        food: "Gel - Endurance - Tangerina (Marca: Vitafor)",
        qty: "1 Sachê(s) (30g)",
        substitutions: [
          "Mel de abelha - 3 Colher(es) de sobremesa rasa(s) (27g)",
          "Gatorade Laranja - 0.5 Unidade(s) (250ml)",
        ],
      },
    ],
    notes: "Utilizar um carbo em Gel após 40 min de corrida continua",
  },
  {
    time: "08:00",
    name: "Café da manhã (pós-treino)",
    phase: "pos",
    items: [
      {
        food: "Cuscuz de milho cozido (sem sal)",
        qty: "2 Pedaço(s) pequeno(s) (170g)",
        substitutions: [
          "Pão de fermentação natural - 1 Porção(ões) (105g)",
          "Pão sírio - 1.5 Unidade(s) (90g)",
          "Pão de Forma 50% Integral 7 grãos (Plusvita) - 3 Fatia(s) (75g)",
          "Inhame (cará) cozido com sal - 3.5 Colher(es) de servir cheia(s) (217g)",
        ],
      },
      {
        food: "Ovo de galinha mexido com sal",
        qty: "2 Unidade(s) média(s) (100g)",
        substitutions: [
          "Peito de peru defumado - 3 Fatia(s) média(s) (60g)",
          "Frango desfiado - 2.5 Colher(es) de sopa cheia(s) (50g)",
          "Patinho moído - 0.4 Filé(s) médio(s) (44g)",
        ],
      },
      {
        food: "Queijo muçarela/mussarela",
        qty: "1 Fatia(s) média(s) (20g)",
        substitutions: [
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Creme de ricota - 1 Colher(es) de sopa (20g)",
          "Requeijão light 30% menos gordura (betania) - 1 colher de sopa (30g)",
        ],
      },
      {
        food: "Semente de chia",
        qty: "0.8 colher(es) de sopa cheia(s) (12g)",
        substitutions: [
          "Semente de gergelim - 0.4 colher(es) de sopa rasa(s) (6g)",
          "Semente de linhaça dourada - 0.8 colher(es) de sobremesa rasa(s) (8g)",
          "Psyllium - 1 Colher(es) de sopa (10g)",
        ],
      },
      {
        food: "Suco de laranja",
        qty: "1 Copo(s) americano(s) duplo(s) (240ml)",
        substitutions: [
          "Suco de uva concentrado - 1 Copo(s) americano(s) pequeno(s) cheio(s) (165ml)",
        ],
      },
    ],
  },
  {
    time: "12:00",
    name: "Almoço",
    phase: "refeicao",
    items: [
      { food: "Salada de legumes cozidos no vapor com sal", qty: "2 Colher(es) de servir cheia(s) (110g)" },
      {
        food: "Arroz branco cozido",
        qty: "6 colher(es) de sopa cheia(s) (150g)",
        substitutions: [
          "Arroz integral cozido - 6 colher(es) de sopa cheia(s) (120g)",
          "Batata inglesa sauté - 11.4 colher(es) de sopa rasa(s) (285g)",
          "Macarrão cozido - 6 colher(es) de arroz rasa(s) (150g)",
          "Macarrão integral cozido - 6 colher(es) de arroz rasa(s) (150g)",
        ],
      },
      {
        food: "Feijão preto cozido",
        qty: "2 concha(s) pequena(s) cheia(s) (130g)",
        substitutions: [
          "Feijão carioca cozido - 1.6 concha(s) pequena(s) cheia(s) (104g)",
          "Grão de bico cozido - 1.5 colher(es) de arroz cheia (67.5g)",
          "Feijão verde cozido - 6 Colher(es) de sopa (150g)",
        ],
      },
      {
        food: "Filé de frango grelhado",
        qty: "2 bife(s) pequeno(s) (100g)",
        substitutions: [
          "Frango desfiado - 4 colher(es) de sopa cheia(s) (100g)",
          "Filet Mignon Suíno Assado - 1.3 Medalhão (130g)",
          "Contrafilé sem gordura grelhado - 2.4 bife(s) pequeno(s) (96g)",
          "Filé mignon grelhado - 1.8 bife(s) pequeno(s) (90g)",
          "Patinho grelhado - 2.2 bife(s) pequeno(s) (88g)",
          "Camarão grelhado - 12 unidade(s) média(s) (120g)",
          "Salmão sem pele grelhado - 0.65 filé(s) pequeno(s) (78g)",
          "Tilápia grelhada com sal - 2.2 filé(s) médio(s) (132g)",
        ],
      },
      {
        food: "Suco de laranja",
        qty: "1 Copo(s) americano(s) duplo(s) (240ml)",
        substitutions: [
          "Água de coco - 1 Copo(s) médio(s) (200ml)",
          "Suco natural de acerola (sem açúcar) - 1 Copo(s) americano(s) duplo(s) (240ml)",
        ],
      },
    ],
  },
  {
    time: "16:00",
    name: "Lanche da tarde",
    phase: "refeicao",
    items: [
      {
        food: "Castanha de caju",
        qty: "8 unidade(s) (20g)",
        substitutions: [
          "Amendoim - 1 colher(es) de sopa cheia(s) (19g)",
          "Castanha do Brasil (castanha do Pará, castanha da Amazônia) - 4 unidade(s) (16g)",
          "Chocolate amargo 70% cacau - 0.7 Barra(s) pequena(s) (21g)",
        ],
      },
      {
        food: "Leite de vaca integral em pó",
        qty: "2 colher(es) de sopa cheia(s) (20g)",
        substitutions: [
          "Leite de vaca desnatado UHT - 1 copo(s) americano(s) duplo(s) (240ml)",
          "Leite de vaca desnatado em pó - 2.5 colher(es) de sopa cheia(s) (25g)",
          "Leite de vaca integral UHT - 0.6 copo(s) americano(s) duplo(s) (144ml)",
        ],
      },
      { food: "Whey protein concentrado", qty: "1 Medidor(es) (30g)" },
    ],
  },
  {
    time: "20:00",
    name: "Jantar",
    phase: "refeicao",
    items: [
      { food: "Salada de legumes cozidos no vapor com sal", qty: "3 Colher(es) de servir cheia(s) (165g)" },
      {
        food: "Batata inglesa sauté",
        qty: "8 colher(es) de sopa rasa(s) (200g)",
        substitutions: [
          "Arroz integral cozido - 1.6 Colher(es) de servir cheia(s) (88g)",
          "Arroz branco cozido - 4.2 Colher(es) de sopa cheia(s) (105g)",
          "Macarrão cozido - 2 Colher(es) de servir cheia(s) (100g)",
          "Macarrão integral cozido - 2 Colher(es) de servir cheia(s) (100g)",
          "Cuscuz de milho cozido - 1.4 Pedaço(s) pequeno(s) (119g)",
          "Batata doce cozida - 3 Colher(es) de sopa cheia(s) (126g)",
          "Inhame (cará) cozido com sal - 2.5 Colher(es) de servir cheia(s) (155g)",
        ],
      },
      {
        food: "Filé de frango grelhado",
        qty: "1.5 bife(s) pequeno(s) (75g)",
        substitutions: [
          "Frango desfiado - 3 colher(es) de sopa cheia(s) (75g)",
          "Contrafilé sem gordura grelhado - 1.8 bife(s) pequeno(s) (72g)",
          "Filé mignon grelhado - 1.4 bife(s) pequeno(s) (67.5g)",
          "Patinho grelhado - 1.7 bife(s) pequeno(s) (66g)",
          "Camarão grelhdao - 9 unidade(s) média(s) (90g)",
          "Salmão sem pele grelhado - 0.5 filé(s) pequeno(s) (58.5g)",
          "Tilápia grelhada com sal - 1.7 filé(s) médio(s) (99g)",
          "Ovo de galinha mexido com sal - 2 Unidade(s) média(s) (100g)",
        ],
      },
      {
        food: "Requeijão light 30% menos gordura (betania)",
        qty: "1 colher de sopa (30g)",
        substitutions: [
          "Creme de ricota - 1 Colher(es) de sopa (20g)",
          "Queijo minas - 1 Fatia(s) média(s) (30g)",
          "Queijo muçarela/mussarela - 1 Fatia(s) média(s) (20g)",
        ],
      },
    ],
  },
]
