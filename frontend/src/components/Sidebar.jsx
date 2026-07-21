import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, ClipboardList, HardHat, CalendarDays, LogOut, Package, Users, Timer, Settings, HandCoins, UserCog, BookOpen, Wallet, CalendarCheck2, Calculator, Coins, Receipt, FileCheck, LineChart, Inbox, ExternalLink, PiggyBank, Repeat, FileBarChart, Truck, GitBranch, Target } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_5fce1f4d-80cf-4626-b6e9-65e04d47c472/artifacts/h167wiyk_Captura%20de%20Tela%202026-03-12%20a%CC%80s%2021.48.12.png";

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/orcamentos', label: 'Orçamentos', icon: FileText },
  { path: '/propostas', label: 'Propostas', icon: ClipboardList },
  { path: '/negociacao', label: 'Negociação', icon: HandCoins },
  { path: '/obras', label: 'Obras', icon: HardHat },
  { path: '/agenda', label: 'Agenda', icon: CalendarDays },
  { path: '/despesas', label: 'Despesas', icon: Receipt },
  { path: '/custos-fixos', label: 'Custos Fixos', icon: Repeat },
  { path: '/faturas', label: 'Faturas', icon: FileCheck },
  { path: '/financeiro', label: 'Financeiro', icon: LineChart },
  { path: '/ponto-equilibrio', label: 'Ponto Equilíbrio', icon: Target },
  { path: '/relatorios', label: 'Relatórios', icon: FileBarChart },
  { path: '/guias', label: 'Guias Transporte', icon: Truck },
  { path: '/pipeline', label: 'Pipeline', icon: GitBranch },
];

const externalItems = [
  { href: 'https://tech-app-obelisco.emergent.host/widget', label: 'Inserir Pedidos', icon: Inbox },
];

const salariosItems = [
  { path: '/funcionarios', label: 'Funcionários', icon: Wallet },
  { path: '/assiduidade', label: 'Assiduidade', icon: CalendarCheck2 },
  { path: '/processamento-salarial', label: 'Processamento', icon: Calculator },
  { path: '/creditos', label: 'Créditos', icon: PiggyBank },
  { path: '/config-salariais', label: 'Config. Salariais', icon: Coins },
];

const adminItems = [
  { path: '/materiais', label: 'Materiais', icon: Package },
  { path: '/mao-de-obra', label: 'Mão de Obra', icon: Users },
  { path: '/produtividades', label: 'Produtividades', icon: Timer },
  { path: '/utilizadores', label: 'Utilizadores', icon: UserCog },
  { path: '/biblioteca', label: 'Biblioteca', icon: BookOpen },
  { path: '/definicoes', label: 'Definições', icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();

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
        {navItems.map(item => {
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

        <div className="pt-3 mt-3 border-t border-zinc-800">
          <p className="px-4 py-1 text-xs uppercase tracking-[0.2em] text-zinc-600 font-medium">Salários</p>
        </div>
        {salariosItems.map(item => {
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

        <div className="pt-3 mt-3 border-t border-zinc-800">
          <p className="px-4 py-1 text-xs uppercase tracking-[0.2em] text-zinc-600 font-medium">Admin</p>
        </div>
        {adminItems.map(item => {
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
