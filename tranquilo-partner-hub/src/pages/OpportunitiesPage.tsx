import { ArrowLeft, ArrowRight, BriefcaseBusiness, Compass, Music2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, DemoBadge, PageHeading } from '../components/ui';

export function OpportunitiesPage() {
  return (
    <div className="page-stack">
      <PageHeading eyebrow="ESPAÇO RESERVADO · FASE FUTURA" title="Oportunidades artísticas." description="A navegação já prevê um lugar para esta jornada. Não há oportunidades, candidaturas ou dados de artistas conectados neste protótipo." actions={<DemoBadge>SEM DADOS DE ARTISTAS</DemoBadge>} />
      <Card className="opportunity-empty-card"><div className="opportunity-orbit"><span className="orbit-dot orbit-dot--one" /><span className="orbit-dot orbit-dot--two" /><span className="orbit-dot orbit-dot--three" /><div><Music2 size={24} /></div></div><div className="eyebrow">PRÓXIMA CAMADA, NO MOMENTO CERTO</div><h3>Mais encontros começam com boas conexões.</h3><p>Esta área está apenas preparada na navegação. Quando houver escopo, critérios e fonte oficial, a equipe poderá desenhar a experiência de oportunidades sem misturar o fluxo operacional do franqueado.</p><div className="opportunity-empty-actions"><Link className="button button--secondary button--md" to="/"><ArrowLeft size={15} />Voltar à praça</Link><Link className="button button--primary button--md" to="/eventos/preparar"><ArrowRight size={15} />Preparar evento</Link></div><div className="opportunity-foot"><span><Compass size={14} /> Somente espaço reservado</span><span><BriefcaseBusiness size={14} /> Sem integração</span></div></Card>
    </div>
  );
}
