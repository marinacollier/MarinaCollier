import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, Clock3, ExternalLink, ListChecks, Search, UsersRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Checkbox, DemoBadge, EmptyState, PageHeading, SearchInput, useToast } from '../components/ui';
import { usePartnerHub } from '../App';
import { partnerHubService } from '../services/partnerHubService';
import type { Playbook } from '../types';

type Checks = Record<string, string[]>;
const categories = ['Todos', 'Produção', 'Marketing', 'Vendas'] as const;
const stageLabels: Record<Playbook['eventStage'], string> = {
  context: 'Contexto',
  operations: 'Operação',
  promotion: 'Divulgação',
  review: 'Revisão',
  'event-day': 'Dia do evento',
  'post-event': 'Pós-evento',
};

export function KnowledgePage() {
  const { playbooks, plazas } = usePartnerHub();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]>('Todos');
  const [openId, setOpenId] = useState<string | null>(() => {
    const linkedPlaybook = searchParams.get('playbook');
    return playbooks.some((playbook) => playbook.id === linkedPlaybook) ? linkedPlaybook : playbooks[0]?.id ?? null;
  });
  const [checks, setChecks] = useState<Checks>(() => partnerHubService.getPlaybookChecks().data);

  const filtered = useMemo(() => playbooks.filter((playbook) => {
    const searchMatch = `${playbook.title} ${playbook.description} ${playbook.category} ${playbook.topic} ${playbook.owner} ${playbook.material} ${playbook.version} ${playbook.updatedAt} ${playbook.steps.join(' ')}`.toLowerCase().includes(query.toLowerCase().trim());
    return searchMatch && (category === 'Todos' || playbook.category === category);
  }), [category, playbooks, query]);

  const toggleCheck = (playbook: Playbook, index: number) => {
    const current = checks[playbook.id] ?? [];
    const id = `${playbook.id}-${index}`;
    const nextForPlaybook = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    const next = { ...checks, [playbook.id]: nextForPlaybook };
    setChecks(next);
    const result = partnerHubService.savePlaybookChecks(next);
    if (!result.ok) showToast(result.message, 'error');
  };

  return (
    <div className="page-stack">
      <PageHeading eyebrow="PLAYBOOKS · CHECKLISTS · MATERIAIS" title="O jeito de fazer, compartilhado." description="Encontre passos, responsáveis e materiais relacionados no próprio fluxo, antes de depender de um briefing individual. Conteúdo demonstrativo, não oficial." actions={<DemoBadge>CONTEÚDO DE EXEMPLO</DemoBadge>} />

      <div className="knowledge-toolbar">
        <SearchInput value={query} onChange={setQuery} label="Buscar playbooks" placeholder="Buscar tema, responsável ou material..." />
        <div className="filter-chips" role="group" aria-label="Filtrar por tema">
          {categories.map((item) => <button className={`filter-chip ${category === item ? 'filter-chip--active' : ''}`} key={item} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
      </div>

      <div className="knowledge-summary"><span><BookOpen size={16} /> {filtered.length} referências</span><span><UsersRound size={15} /> Responsáveis identificados por papel</span><span><ListChecks size={15} /> Checklists salvas localmente</span></div>

      {filtered.length === 0 ? (
        <EmptyState title="Não encontramos esse material" description="Tente outra palavra ou escolha outro tema." action={<button className="text-button" onClick={() => { setQuery(''); setCategory('Todos'); }}>Limpar busca</button>} />
      ) : (
        <div className="playbook-list">
          {filtered.map((playbook, index) => {
            const open = openId === playbook.id;
            const done = (checks[playbook.id] ?? []).length;
            const categoryClass = playbook.category.toLowerCase();
            return (
              <article className={`playbook-card ${open ? 'playbook-card--open' : ''}`} key={playbook.id}>
                <button className="playbook-card-head" aria-expanded={open} onClick={() => setOpenId(open ? null : playbook.id)}>
                  <span className={`playbook-index playbook-index--${categoryClass}`}>{String(index + 1).padStart(2, '0')}</span>
                  <span className="playbook-head-copy"><span className="playbook-category">{playbook.category.toUpperCase()} · PLAYBOOK {index + 1}</span><strong>{playbook.title}</strong><small>{playbook.description}</small></span>
                  <span className="playbook-head-meta"><span><Clock3 size={14} />{playbook.duration}</span><span className="playbook-done-count">{done}/{playbook.steps.length} <Check size={12} /></span></span>
                  <span className={`playbook-toggle ${open ? 'playbook-toggle--open' : ''}`}><ArrowRight size={17} /></span>
                </button>
                {open && (
                  <div className="playbook-content">
                    <div className="playbook-responsible"><span><UsersRound size={15} /> PAPEL RESPONSÁVEL</span><strong>{playbook.owner}</strong><DemoBadge>EXEMPLO</DemoBadge></div>
                    <div className="playbook-metadata-grid">
                      <span><strong>Tema</strong>{playbook.topic}</span>
                      <span><strong>Etapa</strong>{stageLabels[playbook.eventStage]}</span>
                      <span><strong>Escopo · exemplo</strong>{playbook.scope.visibility === 'global' ? 'Global' : playbook.scope.plazaIds.map((id) => plazas.find((plaza) => plaza.id === id)?.name ?? id).join(', ')}</span>
                      <span><strong>Versão · atualização</strong>{playbook.version} · {playbook.updatedAt}</span>
                    </div>
                    <div className="playbook-checklist"><div className="playbook-checklist-heading"><strong>Checklist de apoio</strong><span>{done} de {playbook.steps.length} concluídos</span></div>
                      {playbook.steps.map((step, stepIndex) => {
                        const id = `${playbook.id}-${stepIndex}`;
                        const checked = (checks[playbook.id] ?? []).includes(id);
                        return <div className={`playbook-check-row ${checked ? 'playbook-check-row--done' : ''}`} key={id}><Checkbox checked={checked} onChange={() => toggleCheck(playbook, stepIndex)} label={`${checked ? 'Desmarcar' : 'Marcar'}: ${step}`} /><span>{step}</span></div>;
                      })}
                    </div>
                    <div className="playbook-material"><span className="material-icon"><Search size={15} /></span><div><strong>Material de apoio</strong><p>{playbook.material}</p></div><Link to={playbook.category === 'Marketing' ? '/marketing' : playbook.category === 'Vendas' ? '/vendas' : '/eventos/preparar'} aria-label="Abrir material relacionado"><ExternalLink size={15} /></Link></div>
                    <div className="playbook-footer-note">Este conteúdo é um exemplo de fluxo e deve ser validado com os materiais oficiais antes do uso.</div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="knowledge-footer-callout"><div><span className="callout-small">MENOS PEDIDOS INDIVIDUAIS À EQUIPE CENTRAL</span><strong>Abra o material de marketing relacionado e leve o contexto ao briefing.</strong></div><div className="knowledge-footer-actions"><Link to="/marketing">Ver referências de marketing <ArrowRight size={15} /></Link><Link to="/eventos/preparar">Voltar à preparação <ArrowRight size={15} /></Link></div></div>
    </div>
  );
}
