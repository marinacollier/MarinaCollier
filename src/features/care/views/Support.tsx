/**
 * Plano de apoio: ajuda humana primeiro (links tel:), depois o plano dela, voluntário e editável.
 * Sem orientação sobre remédios. O plano fica numa coleção privada (um único registro).
 */
import { useState } from 'react'
import { Phone, Plus, X } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { Button, Card, Field, SectionTitle, TextArea, TextInput } from '@/components/ui'
import { persist, useDB } from '@/data/store'
import type { CareSupportContact } from '@/data/types'
import { saveSupportPlan, supportPlan } from '../ops'
import { CONFIRM_LOCALLY, HELP_LINES } from '../support'

function HelpNow() {
  const countries = ['Brasil', 'África do Sul'] as const
  return (
    <section aria-label="Ajuda humana agora" className="space-y-3">
      <h2 className="font-display text-[24px] leading-tight">Ajuda humana, agora</h2>
      <p className="text-[14.5px] leading-relaxed">Se você estiver em perigo ou pensando em se machucar, fale agora com uma pessoa. Você não precisa passar por isso sozinha.</p>
      {countries.map((c) => (
        <Card key={c} padded={false} className="divide-y divide-line">
          <div className="px-4 pt-3 pb-2 eyebrow">{c}</div>
          {HELP_LINES.filter((h) => h.country === c).map((h) => (
            <a key={h.id} href={`tel:${h.tel}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
              <span className="h-10 w-10 shrink-0 rounded-full bg-accent-soft text-accent inline-flex items-center justify-center">
                <Phone size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] font-semibold">{h.number}</span>
                <span className="block text-[13.5px]">{h.name}</span>
                <span className="block text-[12.5px] text-muted">{h.note}</span>
              </span>
            </a>
          ))}
          {c === 'África do Sul' && <p className="px-4 py-3 text-[12.5px] text-muted">{CONFIRM_LOCALLY}</p>}
        </Card>
      ))}
    </section>
  )
}

function MyPlan() {
  const saved = useDB((db) => supportPlan(db))
  const [contacts, setContacts] = useState<CareSupportContact[]>(saved?.contacts ?? [])
  const [warningSigns, setWarningSigns] = useState(saved?.warningSigns ?? '')
  const [whatHelps, setWhatHelps] = useState(saved?.whatHelps ?? '')
  const [safePlaces, setSafePlaces] = useState(saved?.safePlaces ?? '')
  const [busy, setBusy] = useState(false)

  const setContact = (i: number, patch: Partial<CareSupportContact>) => setContacts(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  const save = async () => {
    setBusy(true)
    try {
      saveSupportPlan({
        contacts: contacts.filter((c) => c.name.trim() || c.phone?.trim()).map((c) => ({ name: c.name.trim(), phone: c.phone?.trim() || undefined, note: c.note?.trim() || undefined })),
        warningSigns: warningSigns.trim() || undefined,
        whatHelps: whatHelps.trim() || undefined,
        safePlaces: safePlaces.trim() || undefined,
      })
      const r = await persist()
      toast(r.ok ? 'Plano de apoio guardado neste aparelho.' : 'Não consegui gravar no aparelho agora. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Meu plano de apoio" className="space-y-4">
      <SectionTitle>Meu plano de apoio</SectionTitle>
      <p className="text-[13.5px] text-muted -mt-2">Voluntário: preencha só o que quiser, quando quiser.</p>

      <div className="space-y-2">
        <div className="text-[13px] font-medium">Pessoas para quem posso ligar</div>
        {contacts.map((c, i) => (
          <Card key={i} className="space-y-2">
            <div className="flex gap-2">
              <TextInput value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} placeholder="Nome" aria-label="Nome" />
              <button type="button" aria-label="Remover contato" onClick={() => setContacts(contacts.filter((_, j) => j !== i))} className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-full active:bg-surface-2">
                <X size={18} />
              </button>
            </div>
            <TextInput value={c.phone ?? ''} onChange={(e) => setContact(i, { phone: e.target.value })} placeholder="Telefone" inputMode="tel" aria-label="Telefone" />
            <TextInput value={c.note ?? ''} onChange={(e) => setContact(i, { note: e.target.value })} placeholder="Observação (opcional)" aria-label="Observação" />
            {c.phone?.trim() && (
              <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 text-[13.5px] text-accent h-9">
                <Phone size={15} /> Ligar para {c.name || 'este contato'}
              </a>
            )}
          </Card>
        ))}
        <Button variant="soft" size="sm" icon={<Plus size={16} />} onClick={() => setContacts([...contacts, { name: '' }])}>
          Adicionar pessoa
        </Button>
      </div>

      <Field label="Meus sinais de alerta">
        <TextArea rows={3} value={warningSigns} onChange={(e) => setWarningSigns(e.target.value)} placeholder="O que eu percebo em mim quando não estou bem" />
      </Field>
      <Field label="O que me ajuda">
        <TextArea rows={3} value={whatHelps} onChange={(e) => setWhatHelps(e.target.value)} placeholder="Coisas, pessoas e atividades que me fazem bem" />
      </Field>
      <Field label="Lugares onde me sinto segura">
        <TextArea rows={3} value={safePlaces} onChange={(e) => setSafePlaces(e.target.value)} placeholder="Onde posso ir ou estar" />
      </Field>
      <Button block onClick={() => void save()} disabled={busy}>
        Salvar plano
      </Button>
      <p className="text-[12px] text-muted">Fica no aparelho, na sua área privada da nuvem do Claude (se ligada) e no seu backup. Nunca vai para o Supabase nem para planilhas.</p>
    </section>
  )
}

export function Support() {
  return (
    <div className="space-y-8">
      <HelpNow />
      <MyPlan />
    </div>
  )
}
