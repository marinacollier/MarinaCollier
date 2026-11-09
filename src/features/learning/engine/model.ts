/**
 * Aprendizagem — shared vocabulary: domains, skills, tools, defaults. Pure, no store access.
 * Study is multidisciplinary; 'idiomas' is one domain among others and the only one with a split.
 */
import type {
  DB,
  ID,
  LanguageSkill,
  LearningDomain,
  LearningMode,
  LearningPlan,
  LearningResourceType,
  LearningTemplate,
  LearningTool,
  LibraryStatus,
  StudySession,
  StudyTrack,
} from '@/data/types'

export const TRACK_EN = 'track-ingles'
export const TRACK_ES = 'marina:os2:track-espanhol'
export const LANG_DOMAIN = 'idiomas'

export const DEFAULT_DOMAINS: LearningDomain[] = [
  { id: 'idiomas', label: 'Idiomas', emoji: '🗣️' },
  { id: 'ia', label: 'IA', emoji: '🤖' },
  { id: 'tecnologia', label: 'Tecnologia', emoji: '💻' },
  { id: 'produto_negocios', label: 'Produto e negócios', emoji: '📈' },
  { id: 'moda_fashiontech', label: 'Moda e fashiontech', emoji: '👗' },
  { id: 'cristianismo_teologia', label: 'Cristianismo e teologia', emoji: '✝️' },
  { id: 'politica_sociedade', label: 'Política e sociedade', emoji: '🌍' },
  { id: 'psicologia_comportamento', label: 'Psicologia e comportamento', emoji: '🧠' },
  { id: 'literatura_escrita_cultura', label: 'Literatura, escrita e cultura', emoji: '📚' },
  { id: 'outros', label: 'Outros', emoji: '✨' },
]

export const DEFAULT_PLAN: LearningPlan = { split: { [TRACK_EN]: 0.7, [TRACK_ES]: 0.3 }, maxReviewsPerDay: 8 }

export const DEFAULT_TEMPLATES: LearningTemplate[] = [
  {
    id: 'tpl-ingles-60',
    name: 'Inglês 60',
    trackId: TRACK_EN,
    domain: LANG_DOMAIN,
    steps: [
      { label: 'Revisão', minutes: 15, skills: ['review'] },
      { label: 'Leitura / gramática', minutes: 20, skills: ['reading', 'grammar'] },
      { label: 'Produção (fala ou escrita)', minutes: 20, skills: ['speaking', 'writing'] },
      { label: 'Registro', minutes: 5 },
    ],
  },
  {
    id: 'tpl-espanhol-60',
    name: 'Espanhol 60',
    trackId: TRACK_ES,
    domain: LANG_DOMAIN,
    steps: [
      { label: 'Revisão', minutes: 10, skills: ['review'] },
      { label: 'Leitura / gramática', minutes: 25, skills: ['reading', 'grammar'] },
      { label: 'Produção (fala ou escrita)', minutes: 20, skills: ['speaking', 'writing'] },
      { label: 'Registro', minutes: 5 },
    ],
  },
  {
    id: 'tpl-curta-15',
    name: 'Curta 15',
    steps: [
      { label: 'Aquecer / revisar', minutes: 3, skills: ['review'] },
      { label: 'Estudo', minutes: 10 },
      { label: 'Registro', minutes: 2 },
    ],
  },
]

export const LANGUAGE_SKILLS: LanguageSkill[] = ['speaking', 'listening', 'reading', 'writing', 'grammar', 'vocabulary', 'pronunciation', 'review']
export const SKILL_LABEL: Record<LanguageSkill, string> = {
  grammar: 'Gramática',
  reading: 'Leitura',
  writing: 'Escrita',
  listening: 'Listening',
  speaking: 'Speaking',
  pronunciation: 'Pronúncia',
  vocabulary: 'Vocabulário',
  review: 'Revisão',
}
/** Theory vs practice (language skills only). */
export const THEORY_SKILLS: ReadonlySet<string> = new Set(['grammar', 'reading', 'vocabulary', 'review'])
export const PRACTICE_SKILLS: ReadonlySet<string> = new Set(['speaking', 'writing', 'listening', 'pronunciation'])

export const ALL_TOOLS: LearningTool[] = ['cambly', 'flexcil', 'chatgpt', 'curso', 'livro', 'podcast', 'video', 'aula', 'conversa', 'outro']
export const TOOL_LABEL: Record<LearningTool, string> = {
  cambly: 'Cambly',
  flexcil: 'Flexcil',
  chatgpt: 'ChatGPT',
  curso: 'Curso',
  livro: 'Livro',
  podcast: 'Podcast',
  video: 'Vídeo',
  aula: 'Aula',
  conversa: 'Conversa',
  outro: 'Outro',
}

export const RESOURCE_LABEL: Record<LearningResourceType, string> = {
  livro: 'Livro',
  podcast: 'Podcast',
  video: 'Vídeo',
  artigo: 'Artigo',
  curso: 'Curso',
  aula: 'Aula',
  pratica: 'Prática',
  exercicio: 'Exercício',
  projeto: 'Projeto',
  documentario: 'Documentário',
  estudo_biblico: 'Estudo bíblico',
  anotacao: 'Anotação',
  newsletter: 'Newsletter',
}

export const MODE_LABEL: Record<LearningMode, string> = {
  leitura: 'Leitura',
  listening: 'Listening',
  speaking: 'Speaking',
  escrita: 'Escrita',
  pratica: 'Prática',
  reflexao: 'Reflexão',
  pesquisa: 'Pesquisa',
  aplicacao: 'Aplicação',
}

export const LIBRARY_LABEL: Record<LibraryStatus, string> = {
  quero_conhecer: 'Quero conhecer',
  comecei: 'Comecei',
  conclui: 'Concluí',
  abandonei: 'Abandonei',
  anotei: 'Anotei',
  pratiquei: 'Pratiquei',
  apliquei: 'Apliquei',
}

/** Tracks whose domain is known without asking. Others: track.domain ?? 'outros'. */
const KNOWN_TRACK_DOMAIN: Record<string, string> = {
  [TRACK_EN]: LANG_DOMAIN,
  [TRACK_ES]: LANG_DOMAIN,
  'track-produto': 'produto_negocios',
  'marina:inv:track-moda': 'moda_fashiontech',
}

const FALLBACK_TRACK_NAME: Record<string, string> = { [TRACK_EN]: 'Inglês', [TRACK_ES]: 'Espanhol' }
const TRACK_LANG: Record<string, string> = { [TRACK_EN]: 'en', [TRACK_ES]: 'es' }

export function domainsOf(db: Pick<DB, 'profile'>): LearningDomain[] {
  const own = db.profile.learningDomains
  return own?.length ? own : DEFAULT_DOMAINS
}

export function domainLabel(db: Pick<DB, 'profile'>, id: string): string {
  return domainsOf(db).find((d) => d.id === id)?.label ?? DEFAULT_DOMAINS.find((d) => d.id === id)?.label ?? id
}

export function planOf(db: Pick<DB, 'profile'>): LearningPlan {
  const p = db.profile.learningPlan
  return { ...DEFAULT_PLAN, ...p, split: p?.split && Object.keys(p.split).length ? p.split : DEFAULT_PLAN.split }
}

export function templatesOf(db: Pick<DB, 'profile'>): LearningTemplate[] {
  return db.profile.learningTemplates?.length ? db.profile.learningTemplates : DEFAULT_TEMPLATES
}

export function toolsOf(db: Pick<DB, 'profile'>): LearningTool[] {
  return db.profile.learningTools?.length ? db.profile.learningTools : ALL_TOOLS
}

/** Language tracks = the keys of the split. */
export function languageTracks(db: Pick<DB, 'profile'>): ID[] {
  return Object.keys(planOf(db).split)
}

export function isLanguageTrack(db: Pick<DB, 'profile'>, trackId?: ID): boolean {
  return !!trackId && trackId in planOf(db).split
}

export function trackDomain(track: Pick<StudyTrack, 'id' | 'domain'> | undefined, db: Pick<DB, 'profile'>): string {
  if (!track) return 'outros'
  if (track.domain) return track.domain
  if (isLanguageTrack(db, track.id)) return LANG_DOMAIN
  return KNOWN_TRACK_DOMAIN[track.id] ?? 'outros'
}

export function domainOfTrackId(db: Pick<DB, 'profile' | 'studyTracks'>, trackId: ID): string {
  return trackDomain(db.studyTracks.find((t) => t.id === trackId) ?? { id: trackId }, db)
}

export function trackName(db: Pick<DB, 'studyTracks'>, id: ID | undefined): string {
  if (!id) return ''
  return db.studyTracks.find((t) => t.id === id)?.name ?? FALLBACK_TRACK_NAME[id] ?? id
}

export function trackLang(id: ID | undefined): string | undefined {
  return id ? TRACK_LANG[id] : undefined
}

/** "nível: a avaliar" unless she set it. Never inferred from hours. */
export function levelLabel(track: Pick<StudyTrack, 'level'> | undefined): string {
  return track?.level ? `nível ${track.level}` : 'nível: a avaliar'
}

/** Goal per language: her own goalLevel; Inglês defaults to C1; Espanhol "nível a diagnosticar". */
export function goalLabel(track: Pick<StudyTrack, 'goalLevel'> | undefined, id: ID): string {
  if (track?.goalLevel) return `meta ${track.goalLevel}`
  if (id === TRACK_EN) return 'meta C1'
  return 'nível a diagnosticar'
}

/** Sessions that count minutes (planned / abandoned do not). */
export function counts(s: Pick<StudySession, 'status'>): boolean {
  return !s.status || s.status === 'concluido' || s.status === 'iniciado'
}

export function isLanguageSkill(s: string): s is LanguageSkill {
  return (LANGUAGE_SKILLS as string[]).includes(s)
}

export function skillLabel(s: string): string {
  return isLanguageSkill(s) ? SKILL_LABEL[s] : s
}
