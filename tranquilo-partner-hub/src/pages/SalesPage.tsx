import { ArrowRight, ChartNoAxesCombined, CircleHelp, Info, Lightbulb } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, DemoBadge, PageHeading, ProgressBar, SectionTitle } from '../components/ui';
import { usePartnerHub } from '../App';
import { Sparkline } from '../components/Sparkline';
import { getWeightedSalesScore } from '../services/partnerHubService';

function getBand(score: number) {
  if (score >= 85) return { label: 'Ritmo consistente', className: 'green', short: 'SAUDÁVEL' };
  if (score >= 65) return { label: 'Atenção', className: 'amber', short: 'ATENÇÃO' };
  return { label: 'Apoio necessário', className: 'red', short: 'APOIO' };
}

export function SalesPage() {
  const { salesDemo } = usePartnerHub();
  const computedScore = getWeightedSalesScore(salesDemo.metrics);
  const band = computedScore === null ? { label: 'Dados incompletos', className: 'amber', short: 'SEM DADOS' } : getBand(computedScore);
  const importStatusLabel = salesDemo.importStatus === 'demo' ? 'demonstração local · não importado' : salesDemo.importStatus;

  return (
    <div className="page-stack">
      <PageHeading eyebrow="SIMULAÇÃO · NÃO SÃO NÚMEROS REAIS DE VENDAS" title="Vendas, com contexto." description="Todos os números nesta página foram inventados para demonstrar a interface; não são dados da rede, metas ou métricas oficiais." actions={<DemoBadge>SIMULAÇÃO · NÃO REAL</DemoBadge>} />

      <div className="sales-demo-warning" role="note"><Info size={17} /><span><strong>SIMULAÇÃO — NÃO SÃO NÚMEROS REAIS DE VENDAS.</strong> Score, curva, pesos e critérios são fictícios. Não use este painel para decisões, projeções ou avaliação de uma praça.</span></div>

      <section className="sales-overview-grid">
        <Card className={`sales-score-card sales-score-card--${band.className}`}>
          <div className="sales-score-top"><span className="eyebrow">SCORE DEMONSTRATIVO</span><DemoBadge>SEM INTEGRAÇÃO</DemoBadge></div>
          <div className="sales-score-main"><div className={`score-ring score-ring--${band.className}`}><div><strong>{computedScore ?? '—'}</strong><span>/100</span></div></div><div className="score-description"><span className={`traffic-light traffic-light--${band.className}`}><i />{band.short}</span><h3>{band.label}</h3><p>{computedScore === null ? 'Sem score: faltam métricas para calcular a faixa.' : 'Faixa ilustrativa. Não representa meta, avaliação oficial ou dado do sistema.'}</p></div></div>
          <div className="sales-score-footer"><span><CircleHelp size={14} /> Critérios abaixo são exemplos editáveis.</span><span>{salesDemo.updatedLabel}</span></div>
        </Card>
        <Card className="sales-trend-card"><div className="sales-trend-heading"><div><span className="eyebrow">EVOLUÇÃO ILUSTRATIVA</span><h3>Um sinal ao longo do tempo</h3></div><span className="trend-tag">6 períodos · demo</span></div><div className="sales-trend-value"><strong>{computedScore ?? '—'}</strong><span>score de exemplo</span></div><Sparkline values={salesDemo.trend} /><div className="trend-axis"><span>ANTERIOR</span><span>RECENTE</span></div><p>Curva inventada para demonstrar um padrão de visualização. Não derivada de eventos reais.</p>{salesDemo.missingFields.length > 0 && <p role="status">Campos sem dados: {salesDemo.missingFields.join(', ')}.</p>}</Card>
      </section>

      <div className="sales-provenance-note"><Info size={15} /><span><strong>Proveniência:</strong> {salesDemo.source.label} · <strong>estado:</strong> {importStatusLabel} · <strong>atualização:</strong> {salesDemo.updatedLabel}. Esta amostra não veio de um sistema comercial.</span></div>

      <section className="sales-metrics-section">
        <SectionTitle title="O que compõe o exemplo" description="Pesos arbitrários totalizando 100%. Confirmar metodologia com o negócio antes de qualquer integração." action={<DemoBadge>MODELO ILUSTRATIVO</DemoBadge>} />
        <div className="sales-criteria-grid">
          {salesDemo.metrics.map((metric) => { const value = metric.value ?? 0; return <Card className="sales-criterion-card" key={metric.id}><div className="criterion-top"><span>{metric.label}</span><DemoBadge>{metric.weight}% peso</DemoBadge></div><div className="criterion-value"><strong>{metric.value === null ? '—' : `${metric.value}%`}</strong><span>{metric.note}</span></div><ProgressBar value={value} color={value >= 80 ? '#9bc9a0' : value >= 65 ? '#ffc14e' : '#ee7f6c'} /></Card>; })}
        </div>
      </section>

      <div className="sales-explain-grid">
        <Card className="score-method-card"><div className="score-method-icon"><ChartNoAxesCombined size={17} /></div><div><h3>Como ler este score</h3><p>Para esta demonstração, cada critério recebe um peso e uma faixa de cor. O score é a média ponderada dos quatro valores fictícios.</p><div className="band-legend"><span><i className="legend-dot legend-dot--green" /> 85–100 · Saudável</span><span><i className="legend-dot legend-dot--amber" /> 65–84 · Atenção</span><span><i className="legend-dot legend-dot--red" /> 0–64 · Apoio</span></div></div></Card>
        <Card className="sales-next-card"><div className="sales-next-icon"><Lightbulb size={17} /></div><div><span className="eyebrow">PRÓXIMO PASSO</span><h3>Use o dado para abrir uma conversa.</h3><p>Escolha uma rotina operacional para revisar em conjunto, sem tratar o score como avaliação da praça.</p><div className="sales-action-links"><Link to="/conhecimento">Revisar playbooks <ArrowRight size={13} /></Link><Link to="/eventos/preparar">Voltar à preparação <ArrowRight size={13} /></Link></div></div></Card>
      </div>
      <div className="sales-safety-note"><Info size={15} /><span><strong>Sem dados internos.</strong> Todas as cifras, curvas, critérios e pesos desta página são inventados para testar a interface. Eles não podem ser usados como metas, projeções ou registro comercial.</span></div>
    </div>
  );
}
