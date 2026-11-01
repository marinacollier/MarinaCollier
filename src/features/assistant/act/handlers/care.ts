/**
 * Cuidar de Mim por conversa (só leitura: este handler nunca escreve):
 *   sinais de crise ("quero morrer", "me machucar"…) → ajuda humana PRIMEIRO (CVV 188, 112/10111). Vem antes
 *                                                    de qualquer outro handler (ver respond.ts e router.ts).
 *   "estou ansiosa" / "preciso me acalmar"           → 3 técnicas curtas + link para /cuidar
 *   "faz o 5-4-3-2-1"                                 → o passo a passo
 *   "preciso de uma mensagem para …"                 → link para o Modo Pausa (intenção/contexto quando dá)
 *   "quais técnicas favoritei"                        → as favoritas
 * Nunca rotula, nunca dá orientação sobre remédios.
 */
import { ROUTES } from '@/app/routes'
import { pauseLink, parsePauseRequest } from '@/features/care/pause'
import { quickTechniques } from '@/features/care/quick'
import { HELP_LINES, hasCrisisSignal } from '@/features/care/support'
import { GROUNDING_STEPS, techniqueById, type Technique } from '@/features/care/techniques'
import { normalize } from '@/lib/text'
import type { Handler, HandlerInput, LumosReply } from '../types'

const AREA = 'cuidar de mim'

export function crisisReply(): LumosReply {
  return {
    area: AREA,
    text: 'Obrigada por me contar. Você não precisa passar por isso sozinha: fale agora com uma pessoa.',
    sub: 'Se houver perigo imediato, ligue para a emergência ou peça a alguém por perto para ficar com você.',
    lines: HELP_LINES.map((h) => ({
      text: `${h.number} · ${h.name}`,
      emoji: h.country === 'Brasil' ? '🇧🇷' : '🇿🇦',
      sub: h.confirmLocally ? `${h.note} Confirme localmente.` : h.note,
    })),
    link: { label: 'Abrir meu plano de apoio', to: ROUTES.careTab('apoio') },
  }
}

const CALM = /\b(?:estou|to|tou|ta|me sinto|me sentindo|fiquei|bateu|batendo|com)\s+(?:muito\s+|super\s+|meio\s+|uma\s+)?(?:ansios[ao]|ansiedade|nervos[ao]|agitad[ao]|em panico|panico)\b(?!\s+(?:pra|para|pela|pelo|pelas|pelos)\b)|\bpreciso (?:me )?acalmar\b|\bme ajuda a (?:me )?acalmar\b|\bquero me acalmar\b/
const GROUNDING = /\b5\s*-?\s*4\s*-?\s*3\s*-?\s*2\s*-?\s*1\b|\b54321\b|\baterramento\b/
const MESSAGE = /^(?:lumos[,\s]+)?(?:preciso|quero|me ajuda a escrever|me ajuda com)\s+(?:de\s+)?(?:escrever\s+)?uma\s+mensagem\s+(?:pra|para|pro|pros|pras)\s+(.+)$/
const FAVORITES = /\btecnicas?\b.*\bfavorit|\bfavorit\w*\b.*\btecnicas?\b/

const shortLine = (t: Technique) => ({ text: t.name, sub: t.shortVersion })

function calm(): LumosReply {
  return {
    area: AREA,
    text: 'Estou aqui. Vamos com calma, um passo de cada vez. Escolha uma destas:',
    lines: quickTechniques('ansiosa').map(shortLine),
    options: [{ label: 'Faz o 5-4-3-2-1 comigo', ask: 'faz o 5-4-3-2-1' }],
    link: { label: 'Abrir Cuidar de Mim', to: ROUTES.careTab('acalmar') },
  }
}

function grounding(): LumosReply {
  return {
    area: AREA,
    text: 'Vamos juntas. Sem pressa, um sentido de cada vez:',
    lines: GROUNDING_STEPS.map((s) => ({ text: s.prompt, emoji: `${s.count}` })),
    sub: 'No fim, respire uma vez devagar e repare no que mudou, mesmo que pouco.',
    link: { label: 'Fazer passo a passo', to: ROUTES.careTab('acalmar') },
  }
}

function message(input: HandlerInput, rest: string): LumosReply | undefined {
  // "preciso de uma mensagem para a Nomad" é abordagem de marca (UGC), não pausa.
  const r = normalize(rest)
  if ((input.db.brands ?? []).some((b) => b.name && new RegExp(`\\b${normalize(b.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(r))) return undefined
  const pre = parsePauseRequest(r)
  return {
    area: AREA,
    text: 'Posso te ajudar a ganhar tempo com uma mensagem de pausa. Você revisa, edita e envia quando quiser — eu não envio nada.',
    link: { label: 'Abrir o Modo Pausa', to: pauseLink(pre) },
  }
}

function favorites(input: HandlerInput): LumosReply {
  const favs = (input.db.careTechniquePrefs ?? [])
    .filter((p) => p.favorite)
    .map((p) => techniqueById(p.techniqueId))
    .filter((t): t is Technique => !!t)
  if (!favs.length)
    return {
      area: AREA,
      text: 'Você ainda não favoritou nenhuma técnica. Na biblioteca, toque na estrela das que fizerem sentido para você.',
      link: { label: 'Abrir a biblioteca', to: ROUTES.careTab('tecnicas') },
    }
  return {
    area: AREA,
    text: favs.length === 1 ? 'Sua técnica favorita:' : `Suas ${favs.length} técnicas favoritas:`,
    lines: favs.map(shortLine),
    link: { label: 'Abrir a biblioteca', to: ROUTES.careTab('tecnicas') },
  }
}

function care(input: HandlerInput): LumosReply | undefined {
  const { text, n } = input
  if (hasCrisisSignal(text)) return crisisReply()
  if (GROUNDING.test(n)) return grounding()
  if (FAVORITES.test(n)) return favorites(input)
  const m = MESSAGE.exec(n)
  if (m) return message(input, m[1])
  if (CALM.test(n)) return calm()
  return undefined
}

export const careHandler: Handler = { id: 'care', run: care }
