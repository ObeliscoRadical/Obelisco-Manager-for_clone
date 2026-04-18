import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Zap, Eye, EyeOff } from 'lucide-react';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_5fce1f4d-80cf-4626-b6e9-65e04d47c472/artifacts/h167wiyk_Captura%20de%20Tela%202026-03-12%20a%CC%80s%2021.48.12.png";
const BG_URL = "https://images.unsplash.com/photo-1760043186309-69c11f4c08ca?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzN8MHwxfHNlYXJjaHwxfHxlbGVjdHJpY2FsJTIwZW5naW5lZXJpbmclMjBkYXJrJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3NzY0MTAzMDJ8MA&ixlib=rb-4.1.0&q=85";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') setError(detail);
      else if (Array.isArray(detail)) setError(detail.map(d => d.msg || JSON.stringify(d)).join(' '));
      else setError('Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="login-page" className="min-h-screen flex bg-zinc-950">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <img src={LOGO_URL} alt="Obelisco Radical" className="h-16 mb-8 object-contain" />
          <h1 className="text-4xl font-black uppercase tracking-tight text-white mb-2">
            Obelisco Manager
          </h1>
          <p className="text-zinc-400 mb-10 font-medium">Painel interno de gestao</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div data-testid="login-error" className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
                {error}
              </div>
            )}
            <div>
              <Label className="text-zinc-300 text-sm font-medium">Email</Label>
              <Input
                data-testid="login-email-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="mt-1.5 bg-zinc-900 border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 h-12"
                placeholder="admin@obelisco.pt"
                required
              />
            </div>
            <div>
              <Label className="text-zinc-300 text-sm font-medium">Password</Label>
              <div className="relative">
                <Input
                  data-testid="login-password-input"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="mt-1.5 bg-zinc-900 border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 h-12 pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 mt-0.5"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <Button
              data-testid="login-submit-button"
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12 text-base transition-all duration-300"
            >
              {loading ? 'A entrar...' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>

      <div className="hidden lg:block flex-1 relative">
        <img src={BG_URL} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-zinc-950/80" />
        <div className="absolute bottom-12 left-12 right-12">
          <div className="flex items-center gap-2 text-yellow-400 mb-4">
            <Zap size={20} />
            <span className="text-sm font-medium uppercase tracking-widest">Obelisco Radical</span>
          </div>
          <h2 className="text-4xl font-black uppercase tracking-tight text-white leading-tight">
            Gestao profissional dos seus serviços eletricos
          </h2>
          <p className="text-zinc-400 mt-4 text-lg">
            Orçamentos, propostas, obras e agenda num so lugar.
          </p>
        </div>
      </div>
    </div>
  );
}
