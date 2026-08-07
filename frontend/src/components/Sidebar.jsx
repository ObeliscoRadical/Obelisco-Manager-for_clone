import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, ClipboardList, HardHat, CalendarDays, LogOut, Package, Users, Timer, Settings, LayoutGrid, UserCog, BookOpen, Wallet, CalendarCheck2, CalendarCheck, Calculator, Coins, Receipt, FileCheck, LineChart, Inbox, ExternalLink, PiggyBank, Repeat, FileBarChart, Truck, GitBranch, Target, BrainCircuit, Wrench, MessageSquare, Ruler, Zap, Clock, BarChart3, UserCircle, Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUnreadAdminMessages } from '../hooks/useUnreadAdminMessages';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_5fce1f4d-80cf-4626-b6e9-65e04d47c472/artifacts/h167wiyk_Captura%20de%20Tela%202026-03-12%20a%CC%80s%2021.48.12.png";

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
  const unreadAdmin = useUnreadAdminMessages();

  return (
    <aside data-testid="sidebar" className="fixed left-0 top-0 h-screen w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col z-50">
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-16 flex items-center justify-center overflow-hidden rounded-md">
            {/* Soft radial fade behind logo to hide edge seam against dark background */}
            <div className="absolute inset-0 bg-gradient-radial from-zinc-900/0 via-zinc-900/60 to-zinc-900 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(24,24,27,0) 40%, rgba(24,24,27,1) 100%)' }} />
            <img
              src={LOGO_URL}
              alt="Obelisco Radical"
              className="h-12 w-auto object-contain relative"
              style={{
                mixBlendMode: 'screen',
                filter: 'drop-shadow(0 0 8px rgba(250,204,21,0.35)) drop-shadow(0 0 3px rgba(0,0,0,0.9))',
              }}
            />
          </div>
          <div>
            <p className="text-lg font-black uppercase tracking-tight text-white">Obelisco</p>
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Manager</p>
          </div>
        </div>
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
                  ? 'bg-yellow-400 text-zinc-950 font-semibold'
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
                  ? 'bg-yellow-400 text-zinc-950 font-semibold'
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
                  ? 'bg-yellow-400 text-zinc-950 font-semibold'
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
                  ? 'bg-yellow-400 text-zinc-950 font-semibold'
                  : 'text-zinc-500 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <item.icon size={18} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            data-testid="logout-button"
            className="text-zinc-500 hover:text-red-400 transition-colors duration-300 p-2 rounded-lg hover:bg-zinc-800"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
