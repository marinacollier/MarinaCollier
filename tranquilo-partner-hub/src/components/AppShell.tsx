import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ClipboardCheck,
  FileText,
  House,
  Menu,
  Music2,
  X,
} from 'lucide-react';
import { usePartnerHub } from '../App';

const links = [
  { to: '/', label: 'Praça', icon: House, end: true },
  { to: '/eventos/preparar', label: 'Preparar evento', icon: ClipboardCheck },
  { to: '/conhecimento', label: 'Conhecimento', icon: BookOpen },
  { to: '/marketing', label: 'Marketing', icon: Music2 },
  { to: '/vendas', label: 'Vendas', icon: ChartNoAxesCombined },
  { to: '/briefings', label: 'Briefings', icon: FileText },
  { to: '/oportunidades', label: 'Oportunidades', icon: BriefcaseBusiness },
];

const pageNames: Record<string, string> = {
  '/': 'Visão da praça',
  '/eventos/preparar': 'Preparação do evento',
  '/conhecimento': 'Central de conhecimento',
  '/marketing': 'Biblioteca de marketing',
  '/vendas': 'Painel de vendas',
  '/briefings': 'Briefing de marketing',
  '/oportunidades': 'Oportunidades artísticas',
};

export function AppShell() {
  const { plaza, demoNotice } = usePartnerHub();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const pageName = pageNames[location.pathname] ?? 'Tranquilo Partner Hub';

  return (
    <div className="app-shell">
      {menuOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-label="Tranquilo">
            <img src={`${import.meta.env.BASE_URL}brand-mark.png`} alt="" />
          </div>
          <div className="brand-name">TRANQUILO<span>.</span><small>PARTNER HUB</small></div>
          <button className="icon-button sidebar-close" aria-label="Fechar navegação" onClick={() => setMenuOpen(false)}><X size={18} /></button>
        </div>

        <div className="sidebar-context">
          <span className="sidebar-context-label">SUA CENTRAL</span>
          <span className="sidebar-context-title"><span className="status-dot" /> Franqueado</span>
        </div>

        <nav className="primary-nav" aria-label="Navegação principal">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''} ${to === '/oportunidades' ? 'nav-link--future' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {to === '/oportunidades' && <span className="nav-soon">FUTURO</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-quote"><span>“</span> Ouvidos atentos.<br />Corações abertos.</div>
          <div className="sidebar-build">PROTÓTIPO · VERSÃO DEMO</div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu-toggle" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <div className="topbar-title-block">
            <span className="topbar-kicker">TRANQUILO PARTNER HUB</span>
            <h1>{pageName}</h1>
          </div>
          <div className="topbar-actions">
            <div className="plaza-picker" aria-label={`Praça demonstrativa: ${plaza.name}`}>
              <span className="plaza-picker-dot" style={{ backgroundColor: plaza.accent }} />
              <span className="plaza-picker-label">Praça · demo</span>
              <strong className="plaza-picker-current">{plaza.name}</strong>
            </div>
            <div className="account-chip"><span className="account-avatar">D</span><span className="account-name">Demo</span></div>
          </div>
        </header>

        <main className="main-content">
          <div className="demo-banner" role="note">
            <span className="demo-banner-icon">i</span>
            <span><strong>Modo demonstração.</strong> {demoNotice}</span>
            <a href="https://tranquilomusica.com.br/kit-de-marca" target="_blank" rel="noreferrer">Kit oficial <ArrowUpRight size={13} /></a>
          </div>
          <Outlet />
          <footer className="app-footer"><span>Tranquilo Partner Hub</span><span>Ambiente demonstrativo · sem conexão com sistemas internos</span></footer>
        </main>
      </div>
    </div>
  );
}
