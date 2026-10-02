/**
 * Provider catalogue + honest status computation.
 * Descriptions, scopes and docs links follow the official documentation researched in
 * docs/INTEGRATIONS.md (checked 2026-10-02).
 */
import type { FeatureFlags, IntegrationConnection, ProviderId } from '@/data/types'
import type { ProviderInfo, ProviderStatus } from './types'

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
] as const

export const MICROSOFT_SCOPES = {
  base: ['openid', 'profile', 'offline_access', 'User.Read'],
  calendar: ['Calendars.Read'],
  mail: ['Mail.ReadBasic'],
  teams: ['Chat.Read'],
} as const

export const PROVIDERS: Record<Exclude<ProviderId, 'local'>, ProviderInfo> = {
  ics: {
    id: 'ics',
    name: 'Arquivo .ics',
    kind: 'calendar',
    group: 'calendarios',
    flag: 'icsEnabled',
    requiresBackend: false,
    maturity: 'built',
    docsUrl: 'https://www.rfc-editor.org/rfc/rfc5545',
    description:
      'Importa e exporta agendas no formato iCalendar (o “.ics” que Google, Outlook e Apple exportam). Tudo acontece no seu aparelho.',
    stores: ['Título, data, horário, local e link de cada evento', 'UID do evento para não duplicar'],
    permissions: ['Nenhuma — você escolhe o arquivo'],
    guarantees: ['Funciona offline', 'Nada sai do seu aparelho'],
  },
  google: {
    id: 'google',
    name: 'Google Agenda',
    kind: 'calendar',
    group: 'calendarios',
    flag: 'googleCalendarEnabled',
    requiresBackend: true,
    maturity: 'built',
    docsUrl: 'https://developers.google.com/workspace/calendar/api/guides/overview',
    description:
      'Lê seus eventos do Google Agenda (Calendar API v3) e mostra junto da sua agenda. Somente leitura.',
    stores: [
      'Título, data, horário, local e link dos eventos',
      'ID do evento e iCalUID (para não duplicar com Toki/Outlook)',
      'Nenhuma descrição, convidado ou anexo',
    ],
    permissions: [...GOOGLE_SCOPES],
    guarantees: ['Somente leitura', 'Token fica só no servidor'],
  },
  microsoft: {
    id: 'microsoft',
    name: 'Agenda Microsoft 365',
    kind: 'calendar',
    group: 'trabalho',
    flag: 'microsoftCalendarEnabled',
    requiresBackend: true,
    maturity: 'built',
    docsUrl: 'https://learn.microsoft.com/en-us/graph/api/user-list-calendarview',
    description: 'Lê reuniões da agenda do trabalho via Microsoft Graph (calendarView). Somente leitura.',
    stores: ['Título, horário, local e link da reunião', 'ID e iCalUId (para não duplicar)', 'Nenhum corpo/descrição de convite'],
    permissions: [...MICROSOFT_SCOPES.base, ...MICROSOFT_SCOPES.calendar],
    guarantees: ['Somente leitura', 'Token fica só no servidor'],
  },
  outlook: {
    id: 'outlook',
    name: 'E-mail do trabalho (Outlook)',
    kind: 'mail',
    group: 'trabalho',
    flag: 'outlookMailEnabled',
    requiresBackend: true,
    maturity: 'built',
    docsUrl: 'https://learn.microsoft.com/en-us/graph/api/user-list-messages',
    description:
      'Sugere itens para o Work Inbox a partir de assunto, remetente e data dos e-mails. Você decide o que vira tarefa.',
    stores: ['Assunto, remetente, data e link para abrir no Outlook', 'Nunca o corpo do e-mail nem anexos'],
    permissions: [...MICROSOFT_SCOPES.base, ...MICROSOFT_SCOPES.mail],
    guarantees: ['Somente leitura', 'Nunca envia, apaga, move ou responde e-mails', 'Só metadados'],
  },
  teams: {
    id: 'teams',
    name: 'Microsoft Teams',
    kind: 'messaging',
    group: 'trabalho',
    flag: 'teamsEnabled',
    requiresBackend: true,
    maturity: 'built',
    docsUrl: 'https://learn.microsoft.com/en-us/graph/api/chat-list-messages',
    description:
      'Traz menções a você em chats (1:1 e grupo) como sugestões para o Work Inbox. Mensagens de canais exigem consentimento do admin e ficam de fora.',
    stores: ['Nome do chat, quem mencionou, horário e link', 'Nunca o texto da mensagem'],
    permissions: [...MICROSOFT_SCOPES.base, ...MICROSOFT_SCOPES.teams],
    guarantees: ['Somente leitura', 'Nunca envia mensagens', 'Só metadados'],
  },
  organizze: {
    id: 'organizze',
    name: 'Organizze',
    kind: 'finance',
    group: 'financas',
    flag: 'organizzeEnabled',
    requiresBackend: true,
    maturity: 'built',
    docsUrl: 'https://github.com/organizze/api-doc',
    description:
      'Importa gastos pagos da API oficial do Organizze (v2). Possíveis duplicados com gastos manuais ficam marcados para você decidir.',
    stores: ['Descrição, valor, data, categoria e conta de cada gasto', 'ID da transação no Organizze'],
    permissions: ['E-mail + token de API do Organizze, guardados como segredo no servidor'],
    guarantees: ['Somente leitura', 'Nunca junta gastos sozinho'],
  },
  toki: {
    id: 'toki',
    name: 'Toki',
    kind: 'calendar',
    group: 'calendarios',
    requiresBackend: false,
    maturity: 'planned',
    docsUrl: 'https://apps.apple.com/us/app/toki-the-ai-calendar/id6557056348',
    description:
      'O Toki não tem API pública. Ele grava nos seus calendários Google/Outlook/iCloud — então o MARINA OS lê essas fontes e usa o iCalUID para nunca mostrar o mesmo evento duas vezes.',
    stores: ['Nada direto do Toki'],
    permissions: ['Nenhuma'],
  },
  apple: {
    id: 'apple',
    name: 'Apple (Calendário, Lembretes, Saúde)',
    kind: 'health',
    group: 'apple',
    requiresBackend: false,
    maturity: 'planned',
    docsUrl: 'https://developer.apple.com/documentation/eventkit',
    description:
      'Calendário, Lembretes e Saúde só são acessíveis por app nativo (EventKit/HealthKit) — um app web não consegue. Por enquanto: exporte do iCloud em .ics, ou use um Atalho que abra o MARINA OS.',
    stores: ['Nada por enquanto'],
    permissions: ['Nenhuma'],
  },
}

export const PROVIDER_ORDER: (keyof typeof PROVIDERS)[] = [
  'ics',
  'google',
  'toki',
  'microsoft',
  'outlook',
  'teams',
  'organizze',
  'apple',
]

export interface StatusEnv {
  /** VITE_MARINA_API_URL — Supabase Edge Functions base URL. */
  apiUrl?: string
  /** A Supabase Auth session provider is wired (see backend.setSessionTokenProvider). Default true. */
  signedIn?: boolean
}

/**
 * Pure: what status should the integrations screen show for a provider right now.
 * `connection` is the local IntegrationConnection row (last status the backend reported).
 */
export function providerStatus(
  provider: ProviderId,
  flags: FeatureFlags,
  env: StatusEnv,
  connection?: Pick<IntegrationConnection, 'status' | 'error'>,
): ProviderStatus {
  if (provider === 'local') return { status: 'connected', message: 'Agenda do MARINA OS' }
  const info = PROVIDERS[provider]

  if (provider === 'ics') {
    return flags.icsEnabled
      ? { status: 'connected', message: 'Funciona offline' }
      : { status: 'connected', message: 'Desligado · funciona offline quando ligar' }
  }
  if (info.maturity === 'planned') {
    return {
      status: 'coming_soon',
      message:
        provider === 'toki'
          ? 'Sem API pública — lemos os calendários de origem'
          : 'Precisa de app nativo — disponível em breve',
    }
  }

  const flagOn = info.flag ? flags[info.flag] : true
  if (!flagOn) return { status: 'needs_config', message: 'Desligada · precisa do servidor configurado' }
  if (!env.apiUrl) return { status: 'needs_config', message: 'Configuração necessária: falta o servidor (VITE_MARINA_API_URL)' }
  if (env.signedIn === false) return { status: 'needs_config', message: 'Configuração necessária: falta o login do servidor (Supabase Auth)' }

  switch (connection?.status) {
    case 'policy_blocked':
      return { status: 'policy_blocked', message: 'Indisponível pela política da organização' }
    case 'connected':
      return { status: 'connected', message: 'Conectado' }
    case 'error':
      return { status: 'error', message: connection.error ?? 'Algo deu errado na última sincronização' }
    default:
      return { status: 'needs_auth', message: 'Pronto para conectar' }
  }
}

/** Pill label for each status (pt-BR). ICS shows "Funciona offline" instead of "Conectado". */
export function statusLabel(provider: ProviderId, s: ProviderStatus): string {
  if (provider === 'ics') return 'Funciona offline'
  switch (s.status) {
    case 'connected':
      return 'Conectado'
    case 'needs_config':
      return 'Configuração necessária'
    case 'needs_auth':
      return 'Pronto para conectar'
    case 'coming_soon':
      return 'Disponível em breve'
    case 'policy_blocked':
      return 'Indisponível pela política da organização'
    case 'error':
      return 'Precisa de atenção'
  }
}

/**
 * Microsoft identity platform errors that mean "your tenant does not let you consent to this app".
 * AADSTS90094/90095: admin approval required (user consent disabled / admin consent workflow);
 * AADSTS65001: consent not granted. See docs/INTEGRATIONS.md.
 */
export function isAdminConsentError(error?: string | null, description?: string | null): boolean {
  const text = `${error ?? ''} ${description ?? ''}`
  if (/AADSTS(90094|90095|65001)\b/.test(text)) return true
  return error === 'consent_required' || error === 'admin_consent_required'
}
