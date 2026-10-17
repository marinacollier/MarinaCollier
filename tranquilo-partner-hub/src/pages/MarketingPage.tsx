import { useMemo, useState } from 'react';
import { ArrowUpRight, ExternalLink, Image, LayoutTemplate, Palette, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, DemoBadge, Modal, PageHeading, SearchInput } from '../components/ui';
import { usePartnerHub } from '../App';
import type { MarketingTemplate } from '../types';

const channels = ['Todos', 'Stories', 'Feed', 'WhatsApp', 'Kit oficial'] as const;

export function MarketingPage() {
  const { templates } = usePartnerHub();
  const [channel, setChannel] = useState<(typeof channels)[number]>('Todos');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MarketingTemplate | null>(null);

  const filtered = useMemo(() => templates.filter((template) => {
    const term = `${template.title} ${template.description} ${template.channel} ${template.format}`.toLowerCase();
    return (channel === 'Todos' || template.channel === channel) && term.includes(query.toLowerCase().trim());
  }), [channel, query, templates]);

  return (
    <div className="page-stack">
      <PageHeading eyebrow="REFERÊNCIAS VISUAIS · ARQUIVOS PÚBLICOS" title="Uma boa ideia merece uma boa forma." description="Visualize estruturas demonstrativas e acesse recursos públicos. Confirme sempre as informações e materiais oficiais antes de publicar." actions={<a className="button button--outline button--md" href="https://tranquilomusica.com.br/kit-de-marca" target="_blank" rel="noreferrer"><ArrowUpRight size={15} />Kit de marca oficial</a>} />

      <Card className="marketing-callout"><div className="marketing-callout-icon"><Palette size={17} /></div><div><strong>Feito para a praça. Pronto para adaptar.</strong><p>Os cards abaixo são prévias de estrutura, não arquivos de campanha aprovados. O link do Canva abre a área geral de modelos, sem apontar para um design específico.</p></div><DemoBadge>PRÉVIAS FICTÍCIAS</DemoBadge></Card>

      <div className="marketing-toolbar"><SearchInput value={query} onChange={setQuery} label="Buscar templates" placeholder="Buscar por canal, formato ou uso..." /><div className="filter-chips" role="group" aria-label="Filtrar biblioteca por canal">{channels.map((item) => <button className={`filter-chip ${channel === item ? 'filter-chip--active' : ''}`} key={item} onClick={() => setChannel(item)}>{item}</button>)}</div></div>

      <div className="template-grid">
        {filtered.map((template, index) => (
          <Card className="template-card" key={template.id}>
            <button className="template-preview-button" aria-label={`Visualizar ${template.title}`} onClick={() => setSelected(template)}>
              <div className={`template-preview template-preview--${index % 4}`} style={{ backgroundColor: template.accent }}>
                {template.official ? <div className="official-kit-preview"><span>TRANQUILO<span>.</span></span><small>ARQUIVO PÚBLICO</small></div> : <div className="sample-template-copy"><small>{template.channel === 'Stories' ? 'PRAÇA · MÚSICA AO VIVO' : template.channel.toUpperCase()}</small><strong>{template.copy.split('\n').map((line, lineIndex) => <span key={`${lineIndex}-${line}`}>{line}</span>)}</strong><span className="preview-foot">TRANQUILO<span>.</span></span></div>}
                <span className="preview-open-icon"><Image size={15} /></span>
              </div>
            </button>
            <div className="template-card-body">
              <div className="template-card-meta"><span className="template-channel">{template.channel}</span>{template.official ? <span className="official-tag">OFICIAL · PÚBLICO</span> : <DemoBadge>PRÉVIA</DemoBadge>}</div>
              <h3>{template.title}</h3><p>{template.description}</p>
              <div className="template-format"><LayoutTemplate size={14} /> {template.format}</div>
              <div className="template-actions">
                <button className="text-button" onClick={() => setSelected(template)}>Visualizar</button>
                <a className="external-template-link" href={template.resourceUrl} target="_blank" rel="noreferrer"><span>{template.resourceLabel}</span><ExternalLink size={14} /></a>
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <div className="template-empty"><Search size={20} /><strong>Nenhuma referência encontrada.</strong><span>Altere a busca ou os filtros para ver outros materiais.</span><button className="text-button" onClick={() => { setQuery(''); setChannel('Todos'); }}>Limpar filtros</button></div>}
      </div>

      <div className="canva-link-note"><span className="canva-mark">C</span><div><strong>Canva · acesso externo geral</strong><p>Os links abrem canva.com em uma nova aba. Nenhum design Tranquilo específico foi fornecido ou conectado.</p></div><a href="https://www.canva.com/templates/" target="_blank" rel="noreferrer">Explorar modelos <ArrowUpRight size={14} /></a></div>

      <div className="briefing-bottom-note"><span>Referência visual escolhida? Leve o contexto do evento adiante.</span><Link to="/briefings?context=event">Continuar para o briefing <ArrowUpRight size={14} /></Link></div>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title ?? 'Prévia do template'} description={selected?.official ? 'Arquivo oficial público do Kit de Marca Tranquilo.' : 'Prévia demonstrativa, não é um material aprovado para publicação.'} footer={selected && <a className="button button--primary button--md" href={selected.resourceUrl} target="_blank" rel="noreferrer"><span>{selected.resourceLabel}</span><ExternalLink size={15} /></a>}>
        {selected && <div className="template-modal-content"><div className="template-preview template-preview--modal" style={{ backgroundColor: selected.accent }}>{selected.official ? <div className="official-kit-preview"><span>TRANQUILO<span>.</span></span><small>ARQUIVO PÚBLICO · A4</small></div> : <div className="sample-template-copy"><small>{selected.channel.toUpperCase()} · PRÉVIA DEMONSTRATIVA</small><strong>{selected.copy.split('\n').map((line, lineIndex) => <span key={`${lineIndex}-${line}`}>{line}</span>)}</strong><span className="preview-foot">TRANQUILO<span>.</span></span></div>}</div><div className="template-modal-details"><div><span>CANAL / CATEGORIA</span><strong>{selected.channel}</strong></div><div><span>FORMATO</span><strong>{selected.format}</strong></div></div>{!selected.official && <p className="external-disclaimer"><ExternalLink size={14} /> O botão abre a página geral de modelos do Canva, não este card. Para incluir designs específicos, adicione os links aprovados pela equipe.</p>}</div>}
      </Modal>
    </div>
  );
}
