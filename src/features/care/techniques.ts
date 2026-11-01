/**
 * Cuidar de Mim — biblioteca de técnicas (conteúdo estático, NÃO é seed do banco).
 *
 * Regras do conteúdo (testadas em care.test.ts):
 * - Toda técnica tem fonte verificável (livro, autoria, ano). O 5-4-3-2-1 é um exercício de domínio comum:
 *   citado como técnica amplamente usada, sem inventar autoria.
 * - Sem rótulos clínicos, sem pontuação, sem orientação sobre remédios.
 * - Cuidados físicos explícitos onde importam (TIPP: água fresca, nada de esforço intenso, joelho).
 */

export type CareApproach = 'DBT' | 'TCC' | 'ACT' | 'mindfulness' | 'ativação comportamental'

export interface Technique {
  id: string
  name: string
  approach: CareApproach
  /** Para que serve, em uma frase. */
  purpose: string
  whenHelps: string
  whenAvoidOrAdapt: string
  /** "2–5 min". */
  duration: string
  steps: string[]
  /** O que fazer agora, em uma ou duas frases (aparece primeiro). */
  shortVersion: string
  /** Referência verificável. */
  source: string
}

const LINEHAN = 'Linehan, M. M. — DBT Skills Training Manual, 2ª ed. (Guilford Press, 2015)'
const BECK = 'Beck, J. S. — Cognitive Behavior Therapy: Basics and Beyond, 3ª ed. (Guilford Press, 2020)'
const HAYES = 'Hayes, S. C., Strosahl, K. D. & Wilson, K. G. — Acceptance and Commitment Therapy, 2ª ed. (Guilford Press, 2012)'
const MARTELL = 'Martell, C. R., Dimidjian, S. & Herman-Dunn, R. — Behavioral Activation for Depression: A Clinician’s Guide (Guilford Press, 2010)'

export const TECHNIQUES: Technique[] = [
  {
    id: 'aterramento-54321',
    name: '5-4-3-2-1 (aterramento pelos sentidos)',
    approach: 'mindfulness',
    purpose: 'Trazer a atenção de volta para o presente usando os cinco sentidos.',
    whenHelps: 'Quando a ansiedade acelera, quando a cabeça foi longe demais ou quando você se sente meio fora do corpo.',
    whenAvoidOrAdapt: 'Se algum sentido estiver difícil de usar (barulho demais, sem cheiro por perto), troque por outro ou faça menos itens. Não existe jeito errado.',
    duration: '2–5 min',
    steps: [
      'Olhe ao redor e diga (em voz alta ou por dentro) 5 coisas que você consegue ver.',
      'Perceba 4 coisas que você consegue tocar ou sentir: o tecido da roupa, os pés no chão, a temperatura do ar.',
      'Escute 3 sons, perto ou longe.',
      'Perceba 2 cheiros. Se não houver nenhum, lembre de dois cheiros de que você gosta.',
      'Perceba 1 sabor, ou diga uma coisa gentil sobre você agora.',
      'Respire uma vez devagar e repare: o que mudou, mesmo que pouco?',
    ],
    shortVersion: 'Nomeie 5 coisas que você vê, 4 que sente no corpo, 3 sons, 2 cheiros e 1 sabor.',
    source: 'Técnica de aterramento sensorial amplamente usada em contextos de saúde mental (domínio comum, sem autoria única).',
  },
  {
    id: 'stop',
    name: 'STOP',
    approach: 'DBT',
    purpose: 'Criar um intervalo entre o impulso e a ação.',
    whenHelps: 'Quando dá vontade de responder, decidir ou agir na hora, no calor da emoção.',
    whenAvoidOrAdapt: 'Se houver perigo real e imediato, priorize a sua segurança primeiro e use o STOP depois.',
    duration: '1–2 min',
    steps: [
      'S — Pare (Stop). Não reaja ainda. Fique imóvel por um instante; mãos longe do celular.',
      'T — Dê um passo atrás (Take a step back). Respire fundo uma ou duas vezes. Você pode se afastar fisicamente se precisar.',
      'O — Observe (Observe). O que está acontecendo fora e dentro de você? O que você está sentindo e pensando?',
      'P — Siga com consciência (Proceed mindfully). Pergunte: o que eu quero para mim nessa situação? Qual ação ajuda ou piora?',
    ],
    shortVersion: 'Pare, dê um passo atrás e respire, observe o que sente, e só então escolha o próximo passo.',
    source: LINEHAN,
  },
  {
    id: 'tipp',
    name: 'TIPP (baixar a intensidade pelo corpo)',
    approach: 'DBT',
    purpose: 'Diminuir rapidamente a ativação do corpo quando a emoção está muito alta.',
    whenHelps: 'Quando a emoção está tão intensa que fica difícil pensar com clareza.',
    whenAvoidOrAdapt:
      'Use água FRESCA no rosto, nunca gelo ou frio extremo. Se você tem alguma condição cardíaca ou de pressão, pule a parte da temperatura e converse antes com um profissional de saúde. Nada de esforço intenso: troque por movimento leve que não force o joelho (caminhar devagar, abrir e fechar as mãos, alongar os braços). Pare se sentir tontura ou dor.',
    duration: '5–10 min',
    steps: [
      'T — Temperatura: molhe o rosto com água fresca (não gelada) ou segure um pano úmido e fresco na testa e nos olhos por alguns segundos, respirando devagar.',
      'I — Movimento (adaptado): em vez de exercício intenso, faça alguns minutos de movimento leve e sem impacto, sem carregar o joelho: caminhar devagar, mexer os braços, apertar e soltar as mãos.',
      'P — Respiração compassada: solte o ar mais devagar do que puxa (por exemplo, puxe contando 4 e solte contando 6), por alguns minutos.',
      'P — Relaxamento pareado: ao soltar o ar, contraia de leve um grupo de músculos (mãos, ombros) e depois solte, percebendo a diferença. Evite contrair a perna do joelho sensível.',
    ],
    shortVersion: 'Água fresca no rosto, respiração com a saída do ar mais longa que a entrada, e movimento leve que não force o joelho.',
    source: LINEHAN,
  },
  {
    id: 'checar-fatos',
    name: 'Checar os fatos',
    approach: 'DBT',
    purpose: 'Ver se a intensidade da emoção combina com o que de fato aconteceu.',
    whenHelps: 'Quando você está tirando conclusões rápidas, interpretando o silêncio de alguém ou imaginando o pior.',
    whenAvoidOrAdapt: 'Não serve para provar que você "não deveria" sentir algo. Se a emoção estiver muito alta, use antes STOP ou TIPP e volte aqui depois.',
    duration: '5–10 min',
    steps: [
      'Qual emoção eu estou sentindo, e com que intensidade?',
      'O que aconteceu, só os fatos, como uma câmera veria?',
      'Que interpretações eu estou fazendo? Existem outras possíveis?',
      'Estou supondo uma ameaça? Qual, e qual a chance real de acontecer?',
      'Se acontecer, qual o pior cenário realista, e como eu lidaria com ele?',
      'A emoção e a intensidade combinam com os fatos? Se sim, o que posso fazer a respeito; se não, o que muda?',
    ],
    shortVersion: 'Separe o que aconteceu (fatos) do que você está interpretando, e veja se existem outras explicações possíveis.',
    source: LINEHAN,
  },
  {
    id: 'mente-sabia',
    name: 'Mente sábia',
    approach: 'DBT',
    purpose: 'Encontrar o ponto de equilíbrio entre o que você sente e o que você sabe.',
    whenHelps: 'Antes de uma decisão, quando a emoção puxa para um lado e a lógica para o outro.',
    whenAvoidOrAdapt: 'Não precisa vir uma resposta na hora. Se nada vier, tudo bem: a pausa já é parte do exercício.',
    duration: '3–5 min',
    steps: [
      'Sente-se de um jeito confortável e respire normalmente.',
      'Ao puxar o ar, pense "mente"; ao soltar, pense "sábia". Repita por algumas respirações.',
      'Pergunte por dentro: "o que é sábio fazer agora?" e espere, sem forçar.',
      'Repare no que surge com calma, como uma sensação de "isso faz sentido", e não como urgência.',
    ],
    shortVersion: 'Respire algumas vezes devagar e pergunte por dentro: "o que é sábio fazer agora?". Espere sem pressa.',
    source: LINEHAN,
  },
  {
    id: 'acao-oposta',
    name: 'Ação oposta',
    approach: 'DBT',
    purpose: 'Agir de um jeito oposto ao impulso da emoção quando ela não está ajudando.',
    whenHelps: 'Quando a emoção empurra para algo que piora a situação: isolar-se quando está triste, atacar quando está com raiva, evitar quando está com medo sem perigo real.',
    whenAvoidOrAdapt: 'Use só depois de checar os fatos: se a emoção combina com a situação (um perigo real, uma injustiça real), a ação oposta não é o caminho. Vá aos poucos.',
    duration: '5–20 min',
    steps: [
      'Nomeie a emoção e o impulso que vem com ela ("estou com raiva e quero mandar uma mensagem dura").',
      'Pergunte: seguir esse impulso me ajuda agora?',
      'Se não ajuda, escolha a ação oposta: com raiva, afastar-se com gentileza; triste, aproximar-se de algo ou alguém; com medo sem perigo real, chegar perto aos poucos.',
      'Faça a ação oposta por inteiro: postura, tom de voz e expressão também.',
      'Repita até perceber a intensidade baixar um pouco.',
    ],
    shortVersion: 'Perceba o impulso da emoção e, se segui-lo não ajuda, faça o contrário com gentileza e por inteiro.',
    source: LINEHAN,
  },
  {
    id: 'tolerancia-mal-estar',
    name: 'Atravessar o momento (ACCEPTS e autoacalmar)',
    approach: 'DBT',
    purpose: 'Passar por um momento difícil sem piorar as coisas, até a onda baixar.',
    whenHelps: 'Quando não dá para resolver nada agora e a ideia é só atravessar as próximas horas.',
    whenAvoidOrAdapt: 'É para momentos de pico, não para evitar o problema para sempre. Quando a onda passar, volte ao assunto com calma.',
    duration: '10–30 min',
    steps: [
      'Atividades: faça algo que ocupe a atenção (arrumar uma gaveta, uma série, um quebra-cabeça).',
      'Contribuir: faça algo pequeno por alguém.',
      'Comparações: lembre de outra fase difícil que você atravessou.',
      'Emoções diferentes: busque algo que traga outra emoção (um vídeo engraçado, uma música).',
      'Afastar: deixe o assunto de lado por um tempo combinado consigo mesma.',
      'Pensamentos: ocupe a cabeça (contar de trás pra frente, ler, palavras cruzadas).',
      'Sensações: algo intenso e seguro para os sentidos (um banho morno, um cheiro forte de que goste).',
      'Autoacalmar pelos cinco sentidos: algo bonito para ver, um som calmo, um cheiro bom, um sabor gostoso, uma textura confortável.',
    ],
    shortVersion: 'Escolha uma coisa para ocupar a atenção e uma coisa gostosa para os sentidos, e dê tempo para a onda passar.',
    source: LINEHAN,
  },
  {
    id: 'dear-man',
    name: 'DEAR MAN (pedir ou dizer não com clareza)',
    approach: 'DBT',
    purpose: 'Pedir algo ou dizer não de um jeito claro e respeitoso.',
    whenHelps: 'Quando você precisa pedir apoio, colocar um limite ou negociar algo importante.',
    whenAvoidOrAdapt: 'Se a emoção estiver muito alta, acalme o corpo primeiro. Você pode escrever antes e mandar depois (o Modo Pausa ajuda).',
    duration: '5–10 min para preparar',
    steps: [
      'D — Descreva a situação, só os fatos.',
      'E — Expresse o que você sente ou pensa ("eu me sinto…").',
      'A — Afirme o que você quer, com clareza (peça ou diga não).',
      'R — Reforce: diga o que de bom vem disso para a outra pessoa ou para a relação.',
      'M — Mantenha o foco (Mindful): volte ao ponto com calma se a conversa desviar.',
      'A — Aparente confiança: tom de voz firme e tranquilo, postura aberta.',
      'N — Negocie: esteja aberta a outras soluções que também funcionem para você.',
    ],
    shortVersion: 'Descreva os fatos, diga como se sente, peça com clareza e mostre o que de bom vem disso.',
    source: LINEHAN,
  },
  {
    id: 'give-fast',
    name: 'GIVE e FAST (cuidar da relação e de si)',
    approach: 'DBT',
    purpose: 'Conversar cuidando da relação (GIVE) sem abrir mão do seu respeito por si mesma (FAST).',
    whenHelps: 'Em conversas delicadas com quem você gosta, ou quando você costuma ceder demais e se arrepender.',
    whenAvoidOrAdapt: 'Gentileza não quer dizer aceitar desrespeito. Se a outra pessoa for agressiva, você pode encerrar a conversa.',
    duration: '5 min para preparar',
    steps: [
      'GIVE — Gentil: sem ataques, ameaças ou julgamentos.',
      'GIVE — Interessada: escute e deixe a outra pessoa falar.',
      'GIVE — Valide: mostre que entende o lado dela ("faz sentido você se sentir assim").',
      'GIVE — Leveza (Easy manner): um tom leve, um sorriso quando couber.',
      'FAST — Justa (Fair): com você e com a outra pessoa.',
      'FAST — Sem desculpas em excesso (no Apologies): não peça desculpas por ter uma opinião ou um pedido.',
      'FAST — Fiel aos seus valores (Stick to values).',
      'FAST — Sincera (Truthful): sem exagerar nem inventar.',
    ],
    shortVersion: 'Seja gentil, escute e valide o outro, sem pedir desculpas por existir e sem abrir mão dos seus valores.',
    source: LINEHAN,
  },
  {
    id: 'ativacao-comportamental',
    name: 'Ativação comportamental (um passo pequeno)',
    approach: 'ativação comportamental',
    purpose: 'Sair do ciclo de pouca energia com uma ação pequena e possível, sem esperar a vontade chegar.',
    whenHelps: 'Quando você está triste, sem energia ou adiando tudo, e ficar parada está deixando o dia mais pesado.',
    whenAvoidOrAdapt: 'Escolha algo pequeno de verdade, possível hoje. O objetivo não é produtividade nem cumprir uma lista: é se mover um pouco na direção do que importa para você.',
    duration: '5–20 min',
    steps: [
      'Repare no que você está evitando ou no que deixou de fazer e costumava fazer bem.',
      'Escolha UMA ação pequena ligada ao que importa para você (abrir a janela, tomar um banho, mandar um áudio para alguém querido, caminhar 5 minutos devagar).',
      'Defina quando: "depois do café, por 5 minutos".',
      'Faça sem esperar a vontade; a ação vem antes da motivação.',
      'Depois, repare: como estou agora, mesmo que só um pouco diferente?',
    ],
    shortVersion: 'Escolha uma ação pequena que importe para você, faça por 5 minutos sem esperar a vontade, e repare como ficou.',
    source: MARTELL,
  },
  {
    id: 'registro-pensamentos',
    name: 'Registro de pensamentos',
    approach: 'TCC',
    purpose: 'Olhar para um pensamento que dói e ver se existem formas mais equilibradas de enxergar a situação.',
    whenHelps: 'Quando um pensamento automático fica voltando ("vão me deixar", "eu estraguei tudo").',
    whenAvoidOrAdapt: 'Faça quando a intensidade baixar um pouco; no pico, comece por STOP ou 5-4-3-2-1. Não é sobre pensar "positivo", é sobre pensar de um jeito mais completo.',
    duration: '10–15 min',
    steps: [
      'Situação: o que aconteceu, onde, com quem.',
      'Pensamento automático: o que passou pela sua cabeça?',
      'Emoção: o que você sentiu, e quanto (pouco, médio, muito).',
      'O que apoia esse pensamento? O que não combina com ele?',
      'Uma resposta mais equilibrada: o que eu diria a uma amiga na mesma situação?',
      'Como estou agora? A emoção mudou de intensidade?',
    ],
    shortVersion: 'Escreva o pensamento que dói, olhe o que apoia e o que não combina com ele, e escreva o que diria a uma amiga.',
    source: BECK,
  },
  {
    id: 'desfusao',
    name: 'Desfusão (dar distância aos pensamentos)',
    approach: 'ACT',
    purpose: 'Ver um pensamento como um pensamento, não como uma verdade ou uma ordem.',
    whenHelps: 'Quando você está ruminando, presa no mesmo pensamento, ou quando a cabeça repete críticas.',
    whenAvoidOrAdapt: 'Não é para brigar com o pensamento nem para fazê-lo sumir. Se ficar estranho ou engraçado, tudo bem: é esse o efeito.',
    duration: '2–5 min',
    steps: [
      'Repare no pensamento que está grudado ("eu sou um problema").',
      'Diga: "estou tendo o pensamento de que eu sou um problema".',
      'Depois: "estou percebendo que estou tendo o pensamento de que…".',
      'Se ajudar, imagine o pensamento escrito numa folha que desce um rio, ou repita a frase bem devagar até virar só som.',
      'Volte a atenção para o que importa agora: o que você quer fazer nos próximos minutos?',
    ],
    shortVersion: 'Troque "eu sou…" por "estou tendo o pensamento de que eu sou…", e volte a atenção para o que você quer fazer agora.',
    source: HAYES,
  },
]

const BY_ID = new Map(TECHNIQUES.map((t) => [t.id, t]))

export function techniqueById(id: string): Technique | undefined {
  return BY_ID.get(id)
}

/** Steps of the guided 5-4-3-2-1 flow (tap through, no timers). */
export const GROUNDING_STEPS: { count: number; sense: string; prompt: string }[] = [
  { count: 5, sense: 'ver', prompt: 'Olhe ao redor. Diga 5 coisas que você consegue ver.' },
  { count: 4, sense: 'sentir', prompt: 'Perceba 4 coisas que você sente no corpo ou consegue tocar.' },
  { count: 3, sense: 'ouvir', prompt: 'Escute. Quais são 3 sons que você percebe?' },
  { count: 2, sense: 'cheirar', prompt: 'Perceba 2 cheiros. Se não houver, lembre de dois que você gosta.' },
  { count: 1, sense: 'saborear', prompt: 'Perceba 1 sabor, ou diga uma coisa gentil sobre você agora.' },
]
