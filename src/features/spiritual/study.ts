/**
 * "Estudar com IA": the `bible-study` Edge Function (Claude, key on the server) prepares the 10-part study;
 * the app saves it on the device (spiritualStudies, contentSource 'lumos').
 * Without the server (not configured, or not signed in) the button says so — no fake content, ever.
 * Generating a study never marks the session as done.
 */
import { callBackend, BackendError, isBackendConfigured } from '@/integrations/backend'
import { authAvailable } from '@/integrations/auth'
import type { BibleStudyContent, SpiritualSession } from '@/data/types'
import { saveStudy } from '@/data/spiritual/ops'

export type StudyAvailability = 'ready' | 'no_server' | 'signed_out'

export function studyAvailability(signedIn: boolean): StudyAvailability {
  if (!isBackendConfigured() || !authAvailable()) return 'no_server'
  return signedIn ? 'ready' : 'signed_out'
}

export const AVAILABILITY_TEXT: Record<Exclude<StudyAvailability, 'ready'>, string> = {
  no_server: 'Estudar com IA — pendente de conexão com o servidor.',
  signed_out: 'Estudar com IA — entre na sua conta (Ajustes → Integrações) para usar.',
}

export interface StudyRequest {
  reference: string
  title?: string
  plan?: string
  notes?: string
}

export function studyPayload(s: SpiritualSession, planTitle?: string, notes?: string): StudyRequest {
  return { reference: s.scriptureReference, title: s.title, plan: planTitle, notes: notes?.trim() ? notes.trim().slice(0, 8000) : undefined }
}

const FIELDS: (keyof BibleStudyContent)[] = ['temaCentral', 'contextoHistorico', 'explicacao', 'contextoTeologico', 'olharProgressista', 'leituraContemplativa', 'aplicacaoPessoal', 'oracao', 'fraseDoDia']

/** The server's answer, re-checked here (never saved half-empty). */
export function parseStudy(raw: unknown): BibleStudyContent | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  for (const f of FIELDS) if (typeof r[f] !== 'string' || !(r[f] as string).trim()) return undefined
  const q = r.perguntas
  if (!Array.isArray(q) || q.length !== 3 || q.some((x) => typeof x !== 'string' || !x.trim())) return undefined
  const out = {} as BibleStudyContent
  for (const f of FIELDS) (out as unknown as Record<string, string>)[f] = (r[f] as string).trim()
  out.perguntas = (q as string[]).map((x) => x.trim())
  return out
}

type Call = (body: StudyRequest) => Promise<unknown>
const serverCall: Call = (body) => callBackend('bible-study', { method: 'POST', body })

export type StudyResult = { ok: true; id: string } | { ok: false; message: string }

export async function generateStudy(s: SpiritualSession, planTitle: string | undefined, notes: string | undefined, call: Call = serverCall): Promise<StudyResult> {
  let raw: unknown
  try {
    raw = await call(studyPayload(s, planTitle, notes))
  } catch (err) {
    if (err instanceof BackendError) {
      if (err.code === 'not_configured') return { ok: false, message: AVAILABILITY_TEXT.no_server }
      if (err.code === 'unauthorized' || err.code === 'needs_auth') return { ok: false, message: AVAILABILITY_TEXT.signed_out }
      if (err.code === 'network') return { ok: false, message: 'Sem conexão agora — tenta de novo quando a internet voltar.' }
      return { ok: false, message: err.message || 'Não consegui preparar o estudo agora.' }
    }
    return { ok: false, message: 'Não consegui preparar o estudo agora.' }
  }
  const content = parseStudy(raw)
  if (!content) return { ok: false, message: 'O estudo veio incompleto — nada foi salvo. Tenta de novo.' }
  const study = saveStudy(s.id, content, notes)
  return { ok: true, id: study.id }
}

export const STUDY_SECTIONS: { key: Exclude<keyof BibleStudyContent, 'perguntas'>; label: string }[] = [
  { key: 'temaCentral', label: 'Tema central' },
  { key: 'contextoHistorico', label: 'Contexto histórico e cultural' },
  { key: 'explicacao', label: 'Explicação' },
  { key: 'contextoTeologico', label: 'Contexto teológico' },
  { key: 'olharProgressista', label: 'Olhar progressista e libertador' },
  { key: 'leituraContemplativa', label: 'Leitura contemplativa e psicológica' },
  { key: 'aplicacaoPessoal', label: 'Aplicação pessoal' },
]
