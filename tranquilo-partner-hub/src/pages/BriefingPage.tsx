import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, CalendarDays, CheckCircle2, Clipboard, FileText, RotateCcw, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePartnerHub } from '../App';
import { Button, Card, DemoBadge, PageHeading, useToast } from '../components/ui';
import { copyText, downloadMarkdown, formatDate } from '../services/formatters';
import { partnerHubService } from '../services/partnerHubService';
import type { BriefingDraft, BriefingStatus, DemoArtist, DemoCampaign, MarketingTemplate, Plaza, SavedBriefing } from '../types';

const requiredFields: (keyof BriefingDraft)[] = ['eventName', 'city', 'objective', 'audience'];
const labels: Record<keyof BriefingDraft, string> = {
  plazaId: 'Praça relacionada',
  eventId: 'Evento relacionado',
  artistId: 'Artista · placeholder',
  campaignId: 'Campanha demonstrativa',
  eventName: 'Nome de referência',
  city: 'Cidade do evento',
  venue: 'Local ou espaço',
  format: 'Formato do encontro',
  date: 'Data prevista',
  objective: 'Objetivo da comunicação',
  audience: 'Público',
  channel: 'Canal prioritário',
  keyMessage: 'Mensagem principal',
  callToAction: 'Chamada para ação',
  tone: 'Tom de voz · exemplo não oficial',
};

const statusLabels: Record<BriefingStatus, string> = {
  draft: 'RASCUNHO',
  in_review: 'EM REVISÃO · DEMO',
  approved_demo: 'APROVADO · DEMO',
};

function fillTemplate(template: MarketingTemplate, draft: BriefingDraft, artist: DemoArtist): string {
  const date = draft.date ? formatDate(draft.date, { day: 'numeric', month: 'long', year: 'numeric' }) : 'data a confirmar';
  return template.copy
    .replaceAll('[DATA]', date)
    .replaceAll('[CIDADE]', draft.city || 'cidade a confirmar')
    .replaceAll('[LOCAL]', draft.venue || draft.city || 'local a confirmar')
    .replaceAll('[ARTISTA / PROPOSTA]', artist.displayName);
}

function makeBriefing(
  draft: BriefingDraft,
  plaza: Plaza,
  artist: DemoArtist,
  campaign: DemoCampaign,
  templates: MarketingTemplate[],
): string {
  const date = draft.date ? formatDate(draft.date, { day: 'numeric', month: 'long', year: 'numeric' }) : 'A definir';
  const selectedTemplates = campaign.templateIds
    .map((id) => templates.find((template) => template.id === id))
    .filter((template): template is MarketingTemplate => Boolean(template));

  return [
    `# Briefing de marketing · ${draft.eventName}`,
    '',
    `**Praça relacionada:** ${plaza.name}`,
    `**Evento:** ${draft.eventName}`,
    `**Artista:** ${artist.displayName}`,
    `**Campanha:** ${campaign.title}`,
    `**Cidade do evento:** ${draft.city}`,
    `**Local ou espaço:** ${draft.venue || 'A definir'}`,
    `**Formato:** ${draft.format || 'A definir'}`,
    `**Data prevista:** ${date}`,
    `**Canal prioritário:** ${draft.channel}`,
    '',
    '## Objetivo',
    draft.objective,
    '',
    '## Público',
    draft.audience,
    '',
    '## Mensagem principal',
    draft.keyMessage || 'A definir pela equipe responsável.',
    '',
    '## Chamada para ação',
    draft.callToAction || 'A definir pela equipe responsável.',
    '',
    `**Tom de voz · exemplo não oficial:** ${draft.tone}`,
    '',
    '## Sugestões demonstrativas por canal',
    ...selectedTemplates.flatMap((template) => [
      '',
      `### ${template.channel} · ${template.title}`,
      fillTemplate(template, draft, artist),
    ]),
    '',
    '> Rascunho demonstrativo gerado localmente por regras fixas a partir de templates de exemplo. Não representa copy, tom, artista, campanha ou aprovação oficiais. Revise todas as informações antes de qualquer uso.',
  ].join('\n');
}

export function BriefingPage() {
  const {
    plaza,
    plazas,
    events,
    artists,
    campaigns,
    templates,
    initialBriefing,
    eventPrep,
    selectActiveEvent,
  } = usePartnerHub();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const eventContext = searchParams.get('context') === 'event';
  const [draft, setDraft] = useState<BriefingDraft>(() => partnerHubService.getBriefingContextFromEvent(eventPrep));
  const [generated, setGenerated] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedBriefing[]>(() => partnerHubService.getBriefings().data);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [storageMessage, setStorageMessage] = useState('');

  useEffect(() => {
    if (!eventContext && draft.eventId === eventPrep.eventId) return;
    setDraft(partnerHubService.getBriefingContextFromEvent(eventPrep));
    setGenerated('');
    setActiveSavedId(null);
    setErrors([]);
    if (eventContext) showToast('Contexto do evento carregado localmente. Revise antes de gerar.', 'info');
  }, [draft.eventId, eventContext, eventPrep, showToast]);

  const selectedPlaza = plazas.find((item) => item.id === draft.plazaId) ?? plaza;
  const selectedEvent = events.find((item) => item.id === draft.eventId) ?? events[0];
  const selectedArtist = artists.find((item) => item.id === draft.artistId) ?? artists[0];
  const selectedCampaign = campaigns.find((item) => item.id === draft.campaignId) ?? campaigns[0];
  const activeSaved = saved.find((item) => item.id === activeSavedId);
  const hasBriefingToReview = Boolean(activeSavedId || generated);

  const updateDraft = (key: keyof BriefingDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setGenerated('');
    setActiveSavedId(null);
    setStorageMessage('');
    setErrors((current) => current.filter((item) => item !== key));
  };

  const changeEvent = (eventId: string) => {
    const result = selectActiveEvent(eventId);
    setDraft(partnerHubService.getBriefingContextFromEvent(result.data));
    setGenerated('');
    setActiveSavedId(null);
    setErrors([]);
    if (!result.ok) showToast(result.message, 'error');
  };

  const changePlaza = (plazaId: string) => {
    const firstEventInPlaza = events.find((item) => item.plazaId === plazaId);
    if (!firstEventInPlaza) {
      showToast('Não há um evento demonstrativo associado a essa praça.', 'error');
      return;
    }
    changeEvent(firstEventInPlaza.id);
  };

  const generate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const missing = requiredFields.filter((key) => !draft[key].trim());
    setErrors(missing);
    if (missing.length) {
      showToast('Preencha os campos obrigatórios para montar o briefing.', 'error');
      return;
    }
    const content = makeBriefing(draft, selectedPlaza, selectedArtist, selectedCampaign, templates);
    setGenerated(content);
    const result = partnerHubService.saveBriefing(draft, content);
    if (result.ok) {
      setSaved(result.data);
      setActiveSavedId(result.data[0]?.id ?? null);
      setStorageMessage('');
      showToast('Briefing gerado e salvo neste navegador.', 'success');
    } else {
      setActiveSavedId(null);
      setStorageMessage(result.message);
      showToast('Briefing montado, mas não foi possível salvá-lo.', 'error');
    }
  };

  const updateStatus = (status: BriefingStatus) => {
    if (!activeSavedId) return;
    const result = partnerHubService.updateBriefingStatus(activeSavedId, status);
    setSaved(result.data);
    if (result.ok) showToast(`Status local atualizado: ${statusLabels[status].toLowerCase()}.`, 'success');
    else showToast(result.message, 'error');
  };

  const updateGenerated = (content: string) => {
    setGenerated(content);
    if (!activeSavedId) return;
    const result = partnerHubService.updateBriefingContent(activeSavedId, content);
    setSaved(result.data);
    setStorageMessage(result.ok ? '' : result.message);
  };

  const copyBriefing = async () => {
    const success = await copyText(generated);
    showToast(success ? 'Briefing copiado.' : 'Não foi possível copiar neste navegador.', success ? 'success' : 'error');
  };

  const loadSaved = (entry: SavedBriefing) => {
    selectActiveEvent(entry.draft.eventId);
    setDraft(entry.draft);
    const entryPlaza = plazas.find((item) => item.id === entry.draft.plazaId) ?? plaza;
    const entryArtist = artists.find((item) => item.id === entry.draft.artistId) ?? artists[0];
    const entryCampaign = campaigns.find((item) => item.id === entry.draft.campaignId) ?? campaigns[0];
    setGenerated(entry.content || makeBriefing(entry.draft, entryPlaza, entryArtist, entryCampaign, templates));
    setActiveSavedId(entry.id);
    setErrors([]);
    if (eventContext) {
      const next = new URLSearchParams(searchParams);
      next.delete('context');
      setSearchParams(next, { replace: true });
    }
    showToast('Briefing carregado para revisão.', 'info');
  };

  const resetDemo = () => {
    const currentPlan = partnerHubService.getBriefingContextFromEvent(eventPrep);
    setDraft({ ...currentPlan, ...initialBriefing, plazaId: currentPlan.plazaId, eventId: currentPlan.eventId, eventName: currentPlan.eventName, city: currentPlan.city, venue: currentPlan.venue, format: currentPlan.format, date: currentPlan.date, objective: currentPlan.objective, audience: currentPlan.audience });
    setGenerated('');
    setActiveSavedId(null);
    setErrors([]);
    setStorageMessage('');
    if (eventContext) {
      const next = new URLSearchParams(searchParams);
      next.delete('context');
      setSearchParams(next, { replace: true });
    }
    showToast('Exemplo demonstrativo restaurado para o evento ativo.', 'info');
  };

  return (
    <div className="page-stack">
      <PageHeading eyebrow="BRIEFING LOCAL · SEM IA GENERATIVA" title="Do contexto a um briefing claro." description="Escolha as referências demonstrativas, recupere o plano do evento e revise sugestões estruturadas antes de exportar." actions={<DemoBadge>GERAÇÃO POR REGRAS FIXAS</DemoBadge>} />

      {eventContext && <div className="briefing-context-note" role="status"><CalendarDays size={15} /><span><strong>Contexto do evento carregado.</strong> Praça, evento, data, objetivo, público e canal vêm do plano selecionado. Notas, se registradas, são recuperadas como mensagem principal. Revise todos os campos antes de gerar.</span></div>}
      <div className="briefing-selection-note"><span><strong>{selectedPlaza.name}</strong> · {draft.eventName || selectedEvent?.title || 'Evento demonstrativo'}</span><DemoBadge>TODAS AS ESCOLHAS SÃO FICTÍCIAS</DemoBadge></div>

      <div className="briefing-layout">
        <div className="briefing-form-column">
          <Card className="briefing-form-card">
            <div className="briefing-card-heading"><span className="briefing-heading-icon"><FileText size={17} /></span><div><span className="eyebrow">01 · CONTEXTO</span><h3>Conte o essencial.</h3><p>As escolhas com selo demo servem para validar o fluxo, não representam cadastros ou contratos reais.</p></div></div>
            <form onSubmit={generate} noValidate>
              <div className="form-grid">
                {(Object.keys(labels) as (keyof BriefingDraft)[]).map((key) => {
                  const full = ['eventName', 'objective', 'audience', 'keyMessage', 'callToAction'].includes(key);
                  const isLong = ['objective', 'audience', 'keyMessage', 'callToAction'].includes(key);
                  const isRequired = requiredFields.includes(key);
                  return <label key={key} className={`form-field ${full ? 'form-field--full' : ''}`}><span>{labels[key]} {isRequired && <em>*</em>}</span>
                    {key === 'plazaId' ? <select value={draft.plazaId} onChange={(event) => changePlaza(event.target.value)}>{plazas.map((item) => <option key={item.id} value={item.id}>{item.name} · fictícia</option>)}</select>
                      : key === 'eventId' ? <select value={draft.eventId} onChange={(event) => changeEvent(event.target.value)}>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
                        : key === 'artistId' ? <select value={draft.artistId} onChange={(event) => updateDraft(key, event.target.value)}>{artists.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select>
                          : key === 'campaignId' ? <select value={draft.campaignId} onChange={(event) => updateDraft(key, event.target.value)}>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
                            : key === 'channel' ? <select value={draft.channel} onChange={(event) => updateDraft(key, event.target.value)}><option>Instagram</option><option>WhatsApp</option><option>Comunidade local</option><option>Outro canal</option></select>
                              : key === 'tone' ? <select value={draft[key]} onChange={(event) => updateDraft(key, event.target.value)}><option>Próximo e acolhedor · exemplo</option><option>Leve e espontâneo · exemplo</option><option>Informativo e direto · exemplo</option></select>
                                : key === 'date' ? <input type="date" value={draft[key]} onChange={(event) => updateDraft(key, event.target.value)} />
                                  : isLong ? <textarea rows={key === 'objective' || key === 'audience' ? 2 : 3} value={draft[key]} maxLength={220} aria-invalid={errors.includes(key)} onChange={(event) => updateDraft(key, event.target.value)} placeholder={`Descreva ${labels[key].toLowerCase()}.`} />
                                    : <input value={draft[key]} maxLength={80} aria-invalid={errors.includes(key)} onChange={(event) => updateDraft(key, event.target.value)} placeholder={key === 'city' ? selectedPlaza.name : 'Ex.: Encontro de novembro'} />}
                    {errors.includes(key) && <small className="field-error">Preencha este campo para continuar.</small>}
                  </label>;
                })}
              </div>
              <div className="briefing-no-ai-note"><Sparkles size={15} /><span>O texto é montado localmente com regras fixas e os templates demonstrativos da campanha. Nenhuma IA generativa, publicação ou serviço externo é chamado.</span></div>
              <div className="briefing-form-actions"><Button type="button" variant="ghost" icon={<RotateCcw size={15} />} onClick={resetDemo}>Restaurar exemplo</Button><Button type="submit" icon={<ArrowRight size={16} />}>Gerar briefing</Button></div>
            </form>
          </Card>
          {storageMessage && <div className="storage-warning" role="alert">{storageMessage}</div>}
        </div>

        <div className="briefing-result-column">
          <Card className={`briefing-result-card ${hasBriefingToReview ? 'briefing-result-card--ready' : ''}`}>
            <div className="briefing-card-heading"><span className="briefing-heading-icon briefing-heading-icon--result"><CheckCircle2 size={17} /></span><div><span className="eyebrow">02 · REVISÃO</span><h3>Sua primeira versão</h3><p>Revise e edite o texto, registre o status local, copie ou baixe em Markdown.</p></div></div>
            {hasBriefingToReview ? <>
              <div className="briefing-result-preview"><div className="briefing-result-label"><span><CheckCircle2 size={14} /> MONTADO LOCALMENTE</span><DemoBadge>{activeSaved ? statusLabels[activeSaved.status] : 'NÃO SALVO'}</DemoBadge></div><textarea className="briefing-result-editor" aria-label="Texto do briefing para revisar e editar" value={generated} rows={18} spellCheck onChange={(event) => updateGenerated(event.target.value)} /></div>
              <div className="briefing-status-actions"><Button variant="outline" disabled={!activeSavedId} onClick={() => updateStatus('in_review')}>Marcar em revisão</Button><Button variant="secondary" disabled={!activeSavedId} onClick={() => updateStatus('approved_demo')}>Marcar aprovado · demo</Button></div>
              <p className="briefing-status-note">Status editorial de demonstração, salvo somente neste navegador; não representa aprovação da equipe Tranquilo.</p>
              <div className="briefing-result-actions"><Button variant="secondary" disabled={!generated.trim()} icon={<Clipboard size={15} />} onClick={copyBriefing}>Copiar texto</Button><Button variant="outline" disabled={!generated.trim()} icon={<ArrowDownToLine size={15} />} onClick={() => downloadMarkdown('briefing-tranquilo-demo.md', generated)}>Baixar .md</Button></div>
            </> : <div className="briefing-placeholder"><div className="briefing-placeholder-icon"><FileText size={22} /></div><strong>O briefing aparece aqui.</strong><span>Complete o contexto e selecione “Gerar briefing”. Você poderá revisar, marcar um status demonstrativo, copiar ou baixar.</span><div className="placeholder-preview-lines"><i /><i /><i /><i /></div></div>}
            <div className="briefing-result-foot"><span>Salvo apenas no navegador atual</span><span>·</span><span>Máximo de 20 rascunhos</span></div>
          </Card>

          <Card className="recent-briefings-card"><div className="recent-heading"><div><span className="eyebrow">RASCUNHOS LOCAIS</span><h3>Briefings recentes</h3></div><span>{saved.length}</span></div>{saved.length ? <div className="recent-list">{saved.slice(0, 3).map((item) => <button className="recent-briefing-row" key={item.id} onClick={() => loadSaved(item)}><span className="recent-briefing-icon"><FileText size={15} /></span><span><strong>{item.draft.eventName}</strong><small>{item.draft.city} · {formatDate(item.createdAt.slice(0, 10))} · {statusLabels[item.status]}</small></span><ArrowRight size={15} /></button>)}</div> : <p className="recent-empty">Os briefings que você gerar nesta sessão aparecem aqui.</p>}</Card>
        </div>
      </div>
      <div className="briefing-bottom-note"><span>Próxima etapa sugerida</span><Link to="/marketing">Escolher referência visual <ArrowRight size={14} /></Link></div>
    </div>
  );
}
