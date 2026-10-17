import { useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, CircleHelp, Clock3, Music2, Sparkles, Ticket, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePartnerHub } from '../App';
import { MetricCard } from '../components/MetricCard';
import { DemoEventSelector } from '../components/DemoEventSelector';
import { TaskRow } from '../components/TaskRow';
import { Card, DemoBadge, PageHeading, ProgressBar, SectionTitle } from '../components/ui';
import { getDashboardSalesIndicators, getPrepProgress } from '../services/partnerHubService';
import { formatDate } from '../services/formatters';

export function DashboardPage() {
  const { plaza, event, prepTasks, salesDemo, eventPrep: prep, saveEventPrep } = usePartnerHub();
  const [feedback, setFeedback] = useState('');
  const progress = getPrepProgress(prep);
  const dueTasks = useMemo(() => prepTasks.filter((task) => !prep.checkedTaskIds.includes(task.id)).slice(0, 4), [prep.checkedTaskIds, prepTasks]);
  const { attendance, sellThrough, score } = getDashboardSalesIndicators(salesDemo);
  const eventDay = event.date ? new Date(`${event.date}T12:00:00`).getDate() : '—';

  const toggleTask = (id: string) => {
    const checkedTaskIds = prep.checkedTaskIds.includes(id)
      ? prep.checkedTaskIds.filter((taskId) => taskId !== id)
      : [...prep.checkedTaskIds, id];
    const next = { ...prep, checkedTaskIds };
    const result = saveEventPrep(next);
    if (!result.ok) setFeedback(result.message);
    else setFeedback('');
  };

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow={`PRAÇA · ${plaza.shortName}`}
        title={`O próximo encontro começa por aqui, ${plaza.name}.`}
        description="Uma visão prática do que está acontecendo e do próximo passo para sua equipe."
        actions={<div className="dashboard-heading-actions"><DemoEventSelector /><Link className="button button--primary button--md" to="/eventos/preparar"><ArrowRight size={16} />Preparar evento</Link></div>}
      />

      <section className="dashboard-hero-grid">
        <Card className="event-hero-card">
          <div className="event-hero-top"><span className="event-overline"><span className="live-dot" /> PRÓXIMO ENCONTRO</span><DemoBadge>EVENTO DEMONSTRATIVO</DemoBadge></div>
          <div className="event-hero-content">
            <div className="event-date-tile"><span>{event.date ? formatDate(event.date, { weekday: 'short', day: undefined, month: undefined }).toUpperCase().replace('.', '') : 'DATA'}</span><strong>{eventDay}</strong><span>{event.date ? formatDate(event.date, { day: undefined, month: 'short' }).toUpperCase().replace('.', '') : 'A DEFINIR'}</span></div>
            <div className="event-hero-copy">
              <span className="eyebrow">{event.city} · {event.format}</span>
              <h3>{event.title}</h3>
              <p><CalendarDays size={14} /> {formatDate(event.date, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p><Music2 size={14} /> {event.venue}</p>
            </div>
          </div>
          <div className="event-hero-footer">
            <div><span className="muted-label">PREPARAÇÃO DA PRAÇA</span><div className="hero-progress-line"><strong>{progress}%</strong><ProgressBar value={progress} /></div></div>
            <Link to="/eventos/preparar" className="hero-text-link">Continuar <ArrowRight size={15} /></Link>
          </div>
          {feedback && <p className="inline-error" role="alert">{feedback}</p>}
        </Card>

        <Card className="next-step-card">
          <div className="next-step-icon"><Sparkles size={18} /></div>
          <span className="eyebrow">SEU PRÓXIMO PASSO</span>
          <h3>{dueTasks[0]?.title ?? 'A preparação está completa.'}</h3>
          <p>{dueTasks[0] ? `Responsável: ${dueTasks[0].owner} · ${dueTasks[0].dueLabel}` : 'Revise o plano e compartilhe com sua equipe.'}</p>
          <div className="next-step-bottom">
            <span><Clock3 size={14} /> {dueTasks[0]?.dueLabel ?? 'Concluído'}</span>
            <Link to="/eventos/preparar" aria-label="Ir para preparação do evento"><ArrowRight size={17} /></Link>
          </div>
          <div className="step-orbit step-orbit--one" /><div className="step-orbit step-orbit--two" />
        </Card>
      </section>

      <Card className="dashboard-note-card">
        <div className="dashboard-note-icon"><Music2 size={18} /></div>
        <div className="dashboard-note-copy"><span className="eyebrow">MAIS AUTONOMIA PARA A PRAÇA</span><strong>Prepare o encontro sem depender de um briefing individual do Bruno.</strong><p>Encontre o próximo passo, quem conduz, o playbook e os materiais no mesmo fluxo. Os exemplos abaixo demonstram a jornada; não são orientações oficiais.</p>
          <nav className="dashboard-note-journey" aria-label="Caminho autoguiado de preparação">
            <Link to="/eventos/preparar">1. Evento</Link>
            <Link to="/conhecimento">2. Responsáveis e playbooks</Link>
            <Link to="/marketing">3. Marketing</Link>
            <Link to="/briefings?context=event">4. Briefing</Link>
          </nav>
        </div>
      </Card>

      <section className="metric-grid" aria-label="Indicadores demonstrativos da praça">
        <MetricCard label="Tarefas concluídas" value={`${prep.checkedTaskIds.length}/${prepTasks.length}`} hint="Lista demonstrativa do evento" trend="up" icon={<CheckCircle2 size={17} />} />
        <MetricCard label="Presença estimada" value={attendance?.value === null || !attendance ? '—' : `${attendance.value}%`} hint={attendance?.note ?? 'Amostra fictícia · sem integração'} trend="up" icon={<UsersRound size={17} />} />
        <MetricCard label="Ritmo de ingressos" value={sellThrough?.value === null || !sellThrough ? '—' : `${sellThrough.value}%`} hint={sellThrough?.note ?? 'Amostra fictícia · sem integração'} trend="flat" icon={<Ticket size={17} />} />
        <Link to="/vendas" className="metric-link-card"><MetricCard label="Score da praça" value={score === null ? '—' : `${score}/100`} hint={score === null ? 'Sem score · faltam métricas' : `Semáforo demonstrativo · ${salesDemo.band}`} demoLabel="SIMULADO" trend="flat" icon={<Sparkles size={17} />} /></Link>
      </section>

      <section className="dashboard-lower-grid">
        <Card className="tasks-card">
          <SectionTitle title="O que merece atenção" description="Uma checklist compartilhada com a preparação do evento." action={<Link className="subtle-link" to="/eventos/preparar">Ver tudo <ArrowRight size={14} /></Link>} />
          <div className="task-list">
            {dueTasks.length === 0 ? (
              <div className="task-complete-state"><CheckCircle2 size={20} /><div><strong>Checklist concluída</strong><span>Revise o plano antes de fechar o encontro.</span></div></div>
            ) : dueTasks.map((task) => <TaskRow key={task.id} task={task} checked={false} onToggle={() => toggleTask(task.id)} />)}
          </div>
          <div className="tasks-card-foot"><span><CircleHelp size={14} /> Responsáveis são papéis demonstrativos.</span><Link to="/conhecimento">Abrir playbooks <ArrowUpRight size={13} /></Link></div>
        </Card>

        <Card className="progress-card">
          <SectionTitle title="Ritmo de preparação" description="Acompanhe o que já está encaminhado." />
          <div className="progress-ring-block"><div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{progress}%</strong><span>pronto</span></div></div><div><DemoBadge>PROGRESSO LOCAL</DemoBadge><p>O estado fica salvo somente neste navegador.</p></div></div>
          <div className="progress-detail-row"><span>Itens finalizados</span><strong>{prep.checkedTaskIds.length} de {prepTasks.length}</strong></div>
          <ProgressBar value={progress} />
          <Link className="full-width-link" to="/eventos/preparar">Abrir plano do evento <ArrowRight size={15} /></Link>
        </Card>
      </section>

    </div>
  );
}
