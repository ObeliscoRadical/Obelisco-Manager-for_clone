import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, ClipboardList, HardHat, CalendarDays, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_5fce1f4d-80cf-4626-b6e9-65e04d47c472/artifacts/h167wiyk_Captura%20de%20Tela%202026-03-12%20a%CC%80s%2021.48.12.png";

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/orcamentos', label: 'Orcamentos', icon: FileText },
  { path: '/propostas', label: 'Propostas', icon: ClipboardList },
  { path: '/obras', label: 'Obras', icon: HardHat },
  { path: '/agenda', label: 'Agenda', icon: CalendarDays },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();

  return (
    <aside data-testid="sidebar" className="fixed left-0 top-0 h-screen w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col z-50">
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <img src={LOGO_URL} alt="Obelisco Radical" className="h-12 w-auto object-contain" />
          <div>
            <p className="text-lg font-black uppercase tracking-tight text-white">Obelisco</p>
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Manager</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
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
