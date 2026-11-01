/**
 * Plano de apoio — ajuda humana primeiro. Números fixos (com `tel:`), e sinais de crise que fazem a Lumos
 * responder com essa ajuda ANTES de qualquer outra coisa. Sem rótulos, sem orientação sobre remédios.
 */
import { normalize } from '@/lib/text'

export interface HelpLine {
  id: string
  country: 'Brasil' | 'África do Sul'
  name: string
  number: string
  /** Para o link tel: (só dígitos). */
  tel: string
  note: string
  /** Números de outro país: confirme localmente. */
  confirmLocally?: boolean
}

export const HELP_LINES: HelpLine[] = [
  { id: 'cvv', country: 'Brasil', name: 'CVV — Centro de Valorização da Vida', number: '188', tel: '188', note: '24h, gratuito, ligação sigilosa. Também há chat em cvv.org.br.' },
  { id: 'samu', country: 'Brasil', name: 'SAMU', number: '192', tel: '192', note: 'Emergência médica, 24h.' },
  { id: 'sa-112', country: 'África do Sul', name: 'Emergência pelo celular', number: '112', tel: '112', note: 'Discagem de emergência a partir do celular.', confirmLocally: true },
  { id: 'saps', country: 'África do Sul', name: 'SAPS (polícia)', number: '10111', tel: '10111', note: 'Polícia, emergência.', confirmLocally: true },
  {
    id: 'sadag',
    country: 'África do Sul',
    name: 'SADAG (South African Depression and Anxiety Group)',
    number: '0800 567 567',
    tel: '0800567567',
    note: 'Linha de apoio emocional e prevenção do suicídio, gratuita.',
    confirmLocally: true,
  },
]

export const CONFIRM_LOCALLY = 'Números da África do Sul: confirme localmente (no hotel, com o anfitrião ou no site oficial), porque podem mudar.'

/** Frases que pedem ajuda humana imediata. Texto já normalizado (sem acento, minúsculo). */
const CRISIS = [
  /\bquero morrer\b/,
  /\bvontade de morrer\b/,
  /\bpensando em morrer\b/,
  /\bme matar\b/,
  /\bme machucar\b/,
  /\bme ferir\b/,
  /\bme cortar\b/,
  /\bsuicid/,
  /\bnao aguento mais viver\b/,
  /\bnao quero mais viver\b/,
  /\bnao quero (mais )?estar viva\b/,
  /\btirar (a )?minha (propria )?vida\b/,
  /\bacabar com a minha vida\b/,
  /\bsumir (de vez|pra sempre|para sempre)\b/,
]

export function hasCrisisSignal(text: string): boolean {
  const n = normalize(text).replace(/\s+/g, ' ')
  return CRISIS.some((re) => re.test(n))
}
