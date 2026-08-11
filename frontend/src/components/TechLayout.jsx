import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Package, User, Calendar, Clock, MessageSquare, ArrowLeft, Shield, ListChecks, Zap } from 'lucide-react';
import { useUnreadTechMessages } from '../hooks/useUnreadTechMessages';
import NotificationsBell from './NotificationsBell';
import { CompanySwitcher } from './CompanySwitcher';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_5fce1f4d-80cf-4626-b6e9-65e04d47c472/artifacts/h167wiyk_Captura%20de%20Tela%202026-03-12%20a%CC%80s%2021.48.12.png";

const NAV_ITEMS = [
  { path: '/tech',          label: 'Guias',    icon: Package,       testid: 'tech-nav-guias' },
  { path: '/tech/pedidos',  label: 'Pedidos',  icon: Zap,           testid: 'tech-nav-pedidos' },
  { path: '/tech/execucao', label: 'Execução', icon: ListChecks,    testid: 'tech-nav-execucao' },
  { path: '/tech/agenda',   label: 'Agenda',   icon: Calendar,      testid: 'tech-nav-agenda' },
  { path: '/tech/ponto',    label: 'Ponto',    icon: Clock,         testid: 'tech-nav-ponto' },
  { path: '/tech/chat',     label: 'Chat',     icon: MessageSquare, testid: 'tech-nav-chat' },
  { path: '/tech/perfil',   label: 'Perfil',   icon: User,          testid: 'tech-nav-perfil' },
];

export default function TechLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminViewing = user?.role === 'admin';
  const unread = useUnreadTechMessages();

  const handleLogout = async () => {
    if (isAdminViewing) {
      navigate('/', { replace: true });
      return;
    }
    await logout();
    navigate('/login', { replace: true });
  };

  const isActive = (path) => {
    if (path === '/tech') return location.pathname === '/tech' || location.pathname.startsWith('/tech/guias');
    if (path === '/tech/pedidos') return location.pathname.startsWith('/tech/pedidos');
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col" data-testid="tech-layout">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <Link to="/tech" className="flex items-center gap-2" data-testid="tech-home-link">
            <img src={LOGO_URL} alt="Obelisco" className="h-8 object-contain" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-yellow-400 font-bold leading-none">Portal Técnico</p>
              <p data-testid="tech-current-company-name" className="text-xs text-zinc-400 leading-none mt-0.5">{user?.company_name || 'Empresa activa'}</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationsBell isTech={true} />
            {isAdminViewing && (
              <button
                onClick={() => navigate('/')}
                data-testid="tech-back-to-admin"
                className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 hover:bg-yellow-500/30 text-xs font-semibold"
              >
                <ArrowLeft className="h-3 w-3" /> Voltar ao Admin
              </button>
            )}
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 px-2">
              <User className="h-3.5 w-3.5" />
              <span data-testid="tech-user-name">{user?.name || user?.email}</span>
              {isAdminViewing && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500 text-zinc-900 font-bold flex items-center gap-1" data-testid="tech-admin-badge">
                  <Shield className="h-2.5 w-2.5" /> ADMIN
                </span>
              )}
            </div>
            <button
              onClick={handleLogout}
              data-testid="tech-logout-btn"
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-red-400 transition-colors"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 max-w-3xl mx-auto">
          <CompanySwitcher compact />
        </div>
      </header>

      {/* Desktop side-tabs (visible ≥md) */}
      <div className="hidden md:block sticky top-[57px] z-20 bg-zinc-900/60 border-b border-zinc-800">
        <div className="max-w-3xl mx-auto flex">
          {NAV_ITEMS.map(it => {
            const Icon = it.icon;
            const active = isActive(it.path);
            const showBadge = it.path === '/tech/chat' && unread > 0;
            return (
              <Link
                key={it.path}
                to={it.path}
                data-testid={it.testid}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                  active
                    ? 'border-yellow-500 text-yellow-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {it.label}
                {showBadge && (
                  <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center" data-testid="chat-unread-badge">
                    {unread}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <main className="flex-1 max-w-3xl mx-auto w-full p-4 pb-24 md:pb-6">
        {children}
      </main>

      {/* Bottom nav (mobile only) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 md:hidden" data-testid="tech-bottom-nav">
        <div className="grid grid-cols-6 max-w-3xl mx-auto py-1">
          {NAV_ITEMS.map(it => {
            const Icon = it.icon;
            const active = isActive(it.path);
            const showBadge = it.path === '/tech/chat' && unread > 0;
            return (
              <Link
                key={it.path}
                to={it.path}
                data-testid={`${it.testid}-mobile`}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-lg transition-colors relative ${
                  active ? 'text-yellow-400' : 'text-zinc-500'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[9px] font-medium uppercase tracking-wide">{it.label}</span>
                {showBadge && (
                  <span className="absolute top-0 right-3 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
