import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, Zap, Package, User } from 'lucide-react';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_5fce1f4d-80cf-4626-b6e9-65e04d47c472/artifacts/h167wiyk_Captura%20de%20Tela%202026-03-12%20a%CC%80s%2021.48.12.png";

export default function TechLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col" data-testid="tech-layout">
      {/* Header mobile-first */}
      <header className="sticky top-0 z-30 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <Link to="/tech" className="flex items-center gap-2" data-testid="tech-home-link">
            <img src={LOGO_URL} alt="Obelisco" className="h-8 object-contain" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-yellow-400 font-bold leading-none">Portal Técnico</p>
              <p className="text-xs text-zinc-400 leading-none mt-0.5">Obelisco Radical</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 px-2">
              <User className="h-3.5 w-3.5" />
              <span data-testid="tech-user-name">{user?.name || user?.email}</span>
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
      </header>

      {/* Bottom nav (mobile-first) — só há dashboard por agora, mas fica preparado */}
      <main className="flex-1 max-w-3xl mx-auto w-full p-4 pb-24 md:pb-4">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 md:hidden" data-testid="tech-bottom-nav">
        <div className="flex items-center justify-around max-w-3xl mx-auto py-2">
          <Link
            to="/tech"
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${location.pathname === '/tech' ? 'text-yellow-400' : 'text-zinc-500'}`}
            data-testid="tech-nav-guias"
          >
            <Package className="h-5 w-5" />
            <span className="text-[10px] font-medium uppercase tracking-wide">Guias</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
