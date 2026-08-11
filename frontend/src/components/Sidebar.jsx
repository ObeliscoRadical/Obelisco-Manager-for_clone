import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, ClipboardList, HardHat, CalendarDays, LogOut, Package, Users, Timer, Settings, LayoutGrid, UserCog, BookOpen, Wallet, CalendarCheck2, CalendarCheck, Calculator, Coins, Receipt, FileCheck, LineChart, ExternalLink, PiggyBank, Repeat, FileBarChart, Truck, GitBranch, Target, BrainCircuit, Wrench, MessageSquare, Ruler, Zap, Clock, BarChart3, UserCircle, Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { useUnreadAdminMessages } from '../hooks/useUnreadAdminMessages';
import { CompanySwitcher } from './CompanySwitcher';
import { BrandLogo } from './branding/BrandLogo';

// module_key mapeia para a chave em user.module_permissions
const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, mod: 'dashboard' },
  { path: '/orcamentos', label: 'Orçamentos', icon: FileText, mod: 'orcamentos' },
  { path: '/propostas', label: 'Propostas', icon: ClipboardList, mod: 'propostas' },
  { path: '/legenda-quadro', label: 'Legenda de Quadro', icon: LayoutGrid, mod: 'propostas' },
  { path: '/mascara-din', label: 'Máscara DIN', icon: Ruler, mod: 'propostas' },
  { path: '/obras', label: 'Obras', icon: HardHat, mod: 'obras' },
  { path: '/caixa-obra', label: 'Caixa da Obra', icon: Wallet, mod: 'obras' },
  { path: '/agenda', label: 'Agenda', icon: CalendarDays, mod: 'agenda' },
  { path: '/despesas', label: 'Despesas', icon: Receipt, mod: 'despesas' },
  { path: '/custos-fixos', label: 'Custos Fixos', icon: Repeat, mod: 'custos_fixos' },
  { path: '/faturas', label: 'Faturas', icon: FileCheck, mod: 'faturas' },
  { path: '/financeiro', label: 'Financeiro', icon: LineChart, mod: 'financeiro' },
  { path: '/analise-bancaria', label: 'Análise Bancária', icon: Building2, mod: 'financeiro' },
  { path: '/contas-previstas', label: 'Contas Previstas', icon: CalendarCheck, mod: 'financeiro' },
  { path: '/custos-recorrentes', label: 'Custos Recorrentes', icon: Repeat, mod: 'financeiro' },
  { path: '/cfo-virtual', label: 'CFO Virtual', icon: BrainCircuit, mod: 'financeiro' },
  { path: '/ponto-equilibrio', label: 'Ponto Equilíbrio', icon: Target, mod: 'ponto_equilibrio' },
  { path: '/contabilista', label: 'Contabilista IA', icon: BrainCircuit, mod: 'contabilista' },
  { path: '/relatorios', label: 'Relatórios', icon: FileBarChart, mod: 'relatorios' },
  { path: '/guias', label: 'Guias Transporte', icon: Truck, mod: 'transporte_guias' },
  { path: '/pipeline', label: 'Pipeline', icon: GitBranch, mod: 'obras' },
  { path: '/perfil-cliente', label: 'Perfil Cliente', icon: UserCircle, mod: 'obras' },
  { path: '/tech', label: 'Portal Técnico', icon: Wrench, mod: 'tech_portal' },
];

const pedidosServicoItems = [
  { path: '/pedidos-servico', label: 'Pedidos de Serviço', icon: Zap, mod: 'obras' },
  { path: '/ponto-gps', label: 'Ponto GPS', icon: Clock, mod: 'assiduidade' },
  { path: '/relatorios-ponto', label: 'Relatórios Ponto', icon: BarChart3, mod: 'assiduidade' },
];

const externalItems = [];

const salariosItems = [
  { path: '/funcionarios', label: 'Funcionários', icon: Wallet, mod: 'funcionarios' },
  { path: '/mensagens-tecnicos', label: 'Mensagens Técnicos', icon: MessageSquare, mod: 'funcionarios' },
  { path: '/assiduidade', label: 'Assiduidade', icon: CalendarCheck2, mod: 'assiduidade' },
  { path: '/processamento-salarial', label: 'Processamento', icon: Calculator, mod: 'salarios' },
  { path: '/creditos', label: 'Créditos', icon: PiggyBank, mod: 'salarios' },
  { path: '/config-salariais', label: 'Config. Salariais', icon: Coins, mod: 'salarios' },
];

const adminItems = [
  { path: '/materiais', label: 'Materiais', icon: Package, mod: 'materiais' },
  { path: '/mao-de-obra', label: 'Mão de Obra', icon: Users, mod: 'materiais' },
  { path: '/produtividades', label: 'Produtividades', icon: Timer, mod: 'materiais' },
  { path: '/empresas', label: 'Empresas', icon: Building2, mod: 'utilizadores' },
  { path: '/utilizadores', label: 'Utilizadores', icon: UserCog, mod: 'utilizadores' },
  { path: '/biblioteca', label: 'Biblioteca', icon: BookOpen, mod: 'biblioteca' },
  { path: '/definicoes', label: 'Definições', icon: Settings, mod: 'configuracoes' },
];

function canSee(user, mod) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = user.module_permissions;
  if (!perms) return true; // legacy user without perms → mostra tudo (fallback)
  return perms[mod] === true;
}

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const unreadAdmin = useUnreadAdminMessages();

  return (
    <aside
      data-testid="sidebar"
      className="fixed left-0 top-0 h-screen w-72 flex flex-col z-50"
      style={{
        background: 'linear-gradient(180deg, var(--brand-surface) 0%, var(--brand-surface-alt) 100%)',
        borderRight: '1px solid rgba(var(--brand-primary-rgb), 0.12)',
      }}
    >
      <div className="p-6" style={{ borderBottom: '1px solid rgba(var(--brand-primary-rgb), 0.12)' }}>
        <BrandLogo
          branding={branding}
          size="md"
          showText
          className="items-center"
          logoTestId="sidebar-brand-logo"
          titleTestId="sidebar-brand-title"
          subtitleTestId="sidebar-brand-subtitle"
          title={branding?.company_info?.name || 'Obelisco Radical'}
          subtitle="Manager"
        />
        <CompanySwitcher className="mt-4" />
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.filter(it => canSee(user, it.mod)).map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.path.replace('/', '') || 'dashboard'}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                isActive
                  ? 'brand-active-nav font-semibold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <item.icon size={20} />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          );
        })}

        {externalItems.map(item => (
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`nav-external-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all duration-300 group"
          >
            <item.icon size={20} />
            <span className="text-sm font-medium flex-1">{item.label}</span>
            <ExternalLink size={14} className="text-zinc-600 group-hover:text-zinc-400" />
          </a>
        ))}

        {pedidosServicoItems.filter(it => canSee(user, it.mod)).length > 0 && (
          <div className="pt-3 mt-3 border-t border-zinc-800">
            <p className="px-4 py-1 text-xs uppercase tracking-[0.2em] text-zinc-600 font-medium">Serviço Técnico</p>
          </div>
        )}
        {pedidosServicoItems.filter(it => canSee(user, it.mod)).map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.path.replace('/', '')}`}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 ${
                isActive
                ? 'brand-active-nav font-semibold'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <item.icon size={18} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}

        {salariosItems.filter(it => canSee(user, it.mod)).length > 0 && (
          <div className="pt-3 mt-3 border-t border-zinc-800">
            <p className="px-4 py-1 text-xs uppercase tracking-[0.2em] text-zinc-600 font-medium">Salários</p>
          </div>
        )}
        {salariosItems.filter(it => canSee(user, it.mod)).map(item => {
          const isActive = location.pathname === item.path;
          const isMsgs = item.path === '/mensagens-tecnicos';
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.path.replace('/', '')}`}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 ${
                isActive
                ? 'brand-active-nav font-semibold'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <item.icon size={18} />
              <span className="text-xs font-medium flex-1">{item.label}</span>
              {isMsgs && unreadAdmin > 0 && (
                <span className="min-w-[18px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center" data-testid="sidebar-unread-badge">
                  {unreadAdmin}
                </span>
              )}
            </Link>
          );
        })}

        {adminItems.filter(it => canSee(user, it.mod)).length > 0 && (
          <div className="pt-3 mt-3 border-t border-zinc-800">
            <p className="px-4 py-1 text-xs uppercase tracking-[0.2em] text-zinc-600 font-medium">Admin</p>
          </div>
        )}
        {adminItems.filter(it => canSee(user, it.mod)).map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.path.replace('/', '')}`}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 ${
                isActive
                ? 'brand-active-nav font-semibold'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <item.icon size={18} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4" style={{ borderTop: '1px solid rgba(var(--brand-primary-rgb), 0.12)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
            {user?.company_slug && (
              <p data-testid="current-company-slug" className="mt-1 text-[10px] uppercase tracking-[0.16em] text-zinc-600 truncate">
                {user.company_slug}
              </p>
            )}
          </div>
          <button
            onClick={logout}
            data-testid="logout-button"
            className="text-zinc-500 hover:text-white transition-colors duration-300 p-2 rounded-lg hover:bg-zinc-800"
            style={{ border: '1px solid rgba(var(--brand-primary-rgb), 0.08)' }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
