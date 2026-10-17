import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ClipboardCheck, Download, ExternalLink, FileText, MapPin, MessageSquareText, Music2, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePartnerHub } from '../App';
import { TaskRow } from '../components/TaskRow';
import { DemoEventSelector } from '../components/DemoEventSelector';
import { Button, Card, DemoBadge, PageHeading, ProgressBar, useToast } from '../components/ui';
import { copyText, formatDate } from '../services/formatters';
import { getPrepProgress } from '../services/partnerHubService';
import type { EventPrepState } from '../types';

const steps = [
  { title: 'Contexto', subtitle: 'O encontro e seu propósito', number: '01' },
  { title: 'Operação', subtitle: 'O que precisa acontecer', number: '02' },
  { title: 'Divulgação', subtitle: 'Como convidar a comunidade', number: '03' },
  { title: 'Revisão', subtitle: 'Seu plano de ação', number: '04' },
];

export function PrepareEventPage() {
  const { prepTasks, eventPrep: draft, saveEventPrep } = usePartnerHub();
  const { showToast } = useToast();
  const [storageMessage, setStorageMessage] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const progress = getPrepProgress(draft);
  const orderedTasks = prepTasks;
  const operationTasks = orderedTasks.filter((task) => task.group !== 'Marketing');
  const marketingTasks = orderedTasks.filter((task) => task.group === 'Marketing');

  const updateDraft = (changes: Partial<EventPrepState>) => {
    const next = { ...draft, ...changes };
    setFormErrors([]);
    const result = saveEventPrep(next);
    if (!result.ok) setStorageMessage(result.message);
    else setStorageMessage('');
  };

  const toggleTask = (id: string) => {
    const nextIds = draft.checkedTaskIds.includes(id)
      ? draft.checkedTaskIds.filter((taskId) => taskId !== id)
      : [...draft.checkedTaskIds, id];
    updateDraft({ checkedTaskIds: nextIds });
  };

  const goToStep = (index: number) => {
    const target = Math.max(0, Math.min(steps.length - 1, index));
    const missing = target > 0 ? [!draft.title.trim() ? 'title' : '', !draft.date ? 'date' : ''].filter(Boolean) : [];
    if (missing.length) {
      setFormErrors(missing);
      showToast('Informe o nome de referência e a data do encontro antes de avançar.', 'error');
      return;
    }
    updateDraft({ activeStep: target });
  };

  const isStepComplete = (index: number) => {
    if (index === 0) return Boolean(draft.title.trim() && draft.date);
    if (index === 1) return operationTasks.length > 0 && operationTasks.every((task) => draft.checkedTaskIds.includes(task.id));
    if (index === 2) return draft.channels.length > 0 && marketingTasks.length > 0 && marketingTasks.every((task) => draft.checkedTaskIds.includes(task.id));
    return false;
  };

  const copyPlan = async () => {
    const plan = [
      `PLANO DO EVENTO · ${draft.title || 'Encontro demonstrativo'}`,
      `Cidade do evento: ${draft.city}`,
      `Data: ${formatDate(draft.date, { day: 'numeric', month: 'long', year: 'numeric' })}`,
      `Local: ${draft.venue || 'A definir'}`,
      `Formato: ${draft.format}`,
      `Objetivo: ${draft.objective || 'A definir'}`,
      `Público: ${draft.audience || 'A definir'}`,
      `Canais: ${draft.channels.join(', ') || 'A definir'}`,
      `Checklist: ${draft.checkedTaskIds.length}/${orderedTasks.length} itens concluídos`,
    ].join('\n');
    const success = await copyText(plan);
    showToast(success ? 'Plano copiado para a área de transferência.' : 'Não foi possível copiar neste navegador.', success ? 'success' : 'error');
  };

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="FLUXO GUIADO · DADOS DEMONSTRATIVOS"
        title="Prepare seu próximo encontro."
        description="Organize o essencial, veja quem conduz cada tarefa, abra o playbook relacionado e siga para marketing e briefing com o mesmo contexto."
        actions={<div className="page-heading-actions-row"><DemoEventSelector /><DemoBadge>PROGRESSO LOCAL</DemoBadge><Link to="/conhecimento" className="subtle-link">Ver playbooks <ArrowRight size={14} /></Link></div>}
      />

      <Card className="prep-progress-card">
        <div className="prep-progress-top"><div><span className="eyebrow">SEU PLANO DE EVENTO</span><h3>{draft.title || 'Encontro demonstrativo'}</h3></div><span className="prep-progress-number">{progress}<small>%</small></span></div>
        <ProgressBar value={progress} />
        <div className="prep-progress-caption"><span>Cidade do evento · {draft.city} · {draft.date ? formatDate(draft.date, { day: 'numeric', month: 'long' }) : 'data a definir'}</span><span>{draft.checkedTaskIds.length} de {orderedTasks.length} ações marcadas</span></div>
      </Card>

      <div className="prep-layout">
        <aside className="prep-step-list" aria-label="Etapas da preparação">
          {steps.map((step, index) => {
            const complete = isStepComplete(index);
            return (
              <button className={`prep-step-button ${draft.activeStep === index ? 'prep-step-button--active' : ''} ${complete ? 'prep-step-button--past' : ''}`} key={step.number} onClick={() => goToStep(index)}>
                <span className="prep-step-index">{complete ? <Check size={14} /> : step.number}</span><span className="prep-step-copy"><strong>{step.title}</strong><small>{step.subtitle}</small></span><span className="prep-step-side">{draft.activeStep === index ? 'AGORA' : complete ? 'CONCLUÍDA' : ''}</span>
              </button>
            );
          })}
          <div className="prep-help-box"><strong>Precisa de uma referência?</strong><span>Playbooks e checklists ajudam a conduzir cada etapa.</span><Link to="/conhecimento">Explorar conhecimento <ArrowRight size={13} /></Link></div>
        </aside>

        <section className="prep-stage">
          {draft.activeStep === 0 && (
            <Card className="prep-step-card">
              <div className="prep-stage-heading"><span className="step-icon"><Music2 size={17} /></span><div><span className="eyebrow">ETAPA 01 · ALINHAMENTO</span><h3>O que vamos preparar?</h3><p>Comece pelo contexto para que as próximas decisões façam sentido.</p></div></div>
              <div className="form-grid">
                <label className="form-field form-field--full"><span>Nome de referência <em>*</em></span><input required aria-invalid={formErrors.includes('title')} value={draft.title} maxLength={80} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="Ex.: Encontro de novembro" />{formErrors.includes('title') && <small className="field-error">Informe um nome para o evento.</small>}</label>
                <label className="form-field"><span>Cidade do evento</span><input value={draft.city} onChange={(event) => updateDraft({ city: event.target.value })} /></label>
                <label className="form-field"><span>Data do encontro <em>*</em></span><input required aria-invalid={formErrors.includes('date')} type="date" value={draft.date} onChange={(event) => updateDraft({ date: event.target.value })} />{formErrors.includes('date') && <small className="field-error">Informe a data do encontro.</small>}</label>
                <label className="form-field"><span>Formato</span><select value={draft.format} onChange={(event) => updateDraft({ format: event.target.value })}><option>Encontro ao vivo</option><option>Show intimista</option><option>Descubra · edição local</option><option>Outro formato</option></select></label>
                <label className="form-field"><span>Local ou espaço de referência</span><div className="input-icon-wrap"><MapPin size={15} /><input value={draft.venue} onChange={(event) => updateDraft({ venue: event.target.value })} placeholder="A definir" /></div></label>
                <label className="form-field form-field--full"><span>O que queremos que aconteça?</span><textarea rows={3} value={draft.objective} maxLength={220} onChange={(event) => updateDraft({ objective: event.target.value })} placeholder="Descreva em uma frase o objetivo deste encontro." /></label>
                <label className="form-field form-field--full"><span>Para quem estamos preparando?</span><textarea rows={2} value={draft.audience} maxLength={180} onChange={(event) => updateDraft({ audience: event.target.value })} placeholder="Descreva a comunidade que queremos receber." /></label>
              </div>
              <div className="form-hint"><UsersRound size={15} /><span>Prefira combinar o público com a proposta do encontro; os exemplos não representam segmentação oficial.</span></div>
            </Card>
          )}

          {draft.activeStep === 1 && (
            <Card className="prep-step-card">
              <div className="prep-stage-heading"><span className="step-icon step-icon--orange"><ClipboardCheck size={17} /></span><div><span className="eyebrow">ETAPA 02 · ORGANIZAÇÃO</span><h3>Deixe a operação visível.</h3><p>Marque cada item quando estiver encaminhado. As responsabilidades são papéis de exemplo.</p></div></div>
              <div className="prep-task-list">
                {orderedTasks.filter((task) => task.group !== 'Marketing').map((task) => <TaskRow key={task.id} task={task} checked={draft.checkedTaskIds.includes(task.id)} onToggle={() => toggleTask(task.id)} />)}
              </div>
              <div className="prep-inline-resource"><div className="resource-icon"><ClipboardCheck size={17} /></div><div><strong>Checklist de espaço e produção</strong><span>Use o playbook demonstrativo para checar acesso, circulação e infraestrutura.</span></div><Link to="/conhecimento?playbook=venue-checklist">Abrir <ArrowRight size={14} /></Link></div>
            </Card>
          )}

          {draft.activeStep === 2 && (
            <Card className="prep-step-card">
              <div className="prep-stage-heading"><span className="step-icon step-icon--pink"><MessageSquareText size={17} /></span><div><span className="eyebrow">ETAPA 03 · DIVULGAÇÃO</span><h3>Convide com clareza.</h3><p>Defina os canais prioritários e deixe pronto o contexto para a equipe de marketing.</p></div></div>
              <div className="form-grid">
                <label className="form-field form-field--full"><span>Canais que vamos priorizar</span><div className="choice-chips">
                  {['Instagram', 'WhatsApp', 'Comunidade local', 'Outro canal'].map((channel) => {
                    const selected = draft.channels.includes(channel);
                    return <button type="button" key={channel} className={`choice-chip ${selected ? 'choice-chip--selected' : ''}`} aria-pressed={selected} onClick={() => updateDraft({ channels: selected ? draft.channels.filter((item) => item !== channel) : [...draft.channels, channel] })}><span>{selected && <Check size={12} />}</span>{channel}</button>;
                  })}
                </div></label>
                <label className="form-field form-field--full"><span>Detalhe que a equipe deve conhecer</span><textarea rows={3} value={draft.notes} maxLength={280} onChange={(event) => updateDraft({ notes: event.target.value })} placeholder="Ex.: informação local, tom de voz ou ponto de atenção." /><small className="field-count">{draft.notes.length}/280</small></label>
              </div>
              <div className="prep-resource-grid">
                <div className="prep-inline-resource"><div className="resource-icon resource-icon--blue"><ExternalLink size={17} /></div><div><strong>Escolher referência visual</strong><span>Pré-visualizações e links para recursos públicos.</span></div><Link to="/marketing">Ver modelos <ArrowRight size={14} /></Link></div>
                <div className="prep-inline-resource"><div className="resource-icon resource-icon--pink"><FileText size={17} /></div><div><strong>Montar briefing local</strong><span>Formulário estruturado com o contexto salvo; sem IA generativa.</span></div><Link to="/briefings?context=event">Criar <ArrowRight size={14} /></Link></div>
              </div>
              {orderedTasks.filter((task) => task.group === 'Marketing').map((task) => <TaskRow key={task.id} task={task} checked={draft.checkedTaskIds.includes(task.id)} onToggle={() => toggleTask(task.id)} />)}
            </Card>
          )}

          {draft.activeStep === 3 && (
            <Card className="prep-step-card">
              <div className="prep-stage-heading"><span className="step-icon step-icon--green"><CheckCircle2 size={17} /></span><div><span className="eyebrow">ETAPA 04 · REVISÃO</span><h3>Seu plano, em um só lugar.</h3><p>Revise as decisões e leve o resumo para sua conversa com a equipe.</p></div></div>
              <div className="review-overview">
                <div className="review-event-card"><span className="eyebrow">ENCONTRO DEMONSTRATIVO</span><h4>{draft.title || 'Nome a definir'}</h4><div><CalendarDays size={14} />{formatDate(draft.date, { day: 'numeric', month: 'long', year: 'numeric' })}</div><div><MapPin size={14} />{draft.city} · {draft.venue || 'local a definir'}</div></div>
                <div className="review-check-card"><strong>{draft.checkedTaskIds.length}<span>/{orderedTasks.length}</span></strong><p>ações marcadas</p><ProgressBar value={progress} /></div>
              </div>
              <div className="review-info-grid">
                <div><span>FORMATO</span><strong>{draft.format || 'A definir'}</strong></div>
                <div><span>CANAIS</span><strong>{draft.channels.join(', ') || 'A definir'}</strong></div>
                <div className="review-info-wide"><span>OBJETIVO</span><p>{draft.objective || 'A definir'}</p></div>
                <div className="review-info-wide"><span>PÚBLICO</span><p>{draft.audience || 'A definir'}</p></div>
                {draft.notes && <div className="review-info-wide"><span>DETALHE PARA A EQUIPE</span><p>{draft.notes}</p></div>}
              </div>
              <div className="review-actions"><Button variant="secondary" icon={<Download size={15} />} onClick={copyPlan}>Copiar resumo</Button><Link className="button button--outline button--md" to="/briefings?context=event"><FileText size={15} />Abrir briefing</Link></div>
            </Card>
          )}

          {storageMessage && <div className="storage-warning" role="alert">{storageMessage}</div>}
          <div className="prep-stage-footer"><Button variant="ghost" disabled={draft.activeStep === 0} icon={<ArrowLeft size={16} />} onClick={() => goToStep(draft.activeStep - 1)}>Voltar</Button><span><CheckCircle2 size={14} /> As alterações ficam salvas neste navegador.</span><Button icon={draft.activeStep === steps.length - 1 ? <Check size={16} /> : <ArrowRight size={16} />} onClick={() => draft.activeStep < steps.length - 1 ? goToStep(draft.activeStep + 1) : showToast('Plano revisado. O resumo permanece salvo neste navegador.', 'success')}>{draft.activeStep === steps.length - 1 ? 'Concluir revisão' : 'Continuar'}</Button></div>
        </section>
      </div>
    </div>
  );
}
