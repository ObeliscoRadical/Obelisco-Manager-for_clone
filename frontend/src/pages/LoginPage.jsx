import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/branding/BrandLogo';
import { Eye, EyeOff, Sparkles, UserPlus, Zap } from 'lucide-react';

const BG_URL = "https://images.unsplash.com/photo-1760043186309-69c11f4c08ca?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzN8MHwxfHNlYXJjaHwxfHxlbGVjdHJpY2FsJTIwZW5naW5lZXJpbmclMjBkYXJrJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3NzY0MTAzMDJ8MA&ixlib=rb-4.1.0&q=85";

const formatApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(item => item?.msg || JSON.stringify(item)).join(' ');
  if (!err?.response) {
    const backendUrl = process.env.REACT_APP_BACKEND_URL || '(não definido)';
    return `Não foi possível contactar o servidor (${backendUrl}). Se guardaste esta app no Dock/Desktop, provavelmente a URL está desactualizada — abre a versão mais recente no browser.`;
  }
  return `Erro no pedido (HTTP ${err.response.status})`;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const { branding } = useBranding();
  const [mode, setMode] = useState('login');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', companyName: '' });
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegisterPass, setShowRegisterPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const heroCopy = useMemo(() => (
    mode === 'login'
      ? {
          eyebrow: branding?.company_info?.name || 'Obelisco Radical',
          title: 'Entra na tua operação e continua a gestão sem perder contexto.',
          body: 'Orçamentos, propostas, obras, equipas e finanças numa única plataforma multiempresa.',
        }
      : {
          eyebrow: 'Nova conta multiempresa',
          title: 'Cria uma nova gestão do zero com empresa própria e dados separados.',
          body: 'Ao criar conta, nasce logo um novo tenant com o teu primeiro utilizador administrador e login automático.',
        }
  ), [branding, mode]);

  const activeTabStyle = {
    background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)',
    color: 'var(--brand-on-primary)',
    boxShadow: '0 12px 24px rgba(var(--brand-primary-rgb), 0.18)',
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(loginForm.email, loginForm.password);
      navigate(user?.__kind === 'tech' ? '/tech' : '/', { replace: true });
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(registerForm);
      navigate('/', { replace: true });
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="login-page" className="min-h-screen flex bg-zinc-950">
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-xl">
          <BrandLogo
            branding={branding}
            size="lg"
            showText
            className="mb-8"
            logoTestId="login-brand-logo"
            titleTestId="login-brand-title"
            subtitleTestId="login-brand-subtitle"
            title={branding?.company_info?.name || 'Obelisco Radical'}
            subtitle="Manager"
          />
          <h1 className="text-4xl font-black uppercase tracking-tight text-white mb-2 sm:text-5xl">
            {branding?.company_info?.name || 'Obelisco Manager'}
          </h1>
          <p className="text-zinc-400 mb-8 font-medium">Login e criação de nova gestão multiempresa</p>

          <div className="mb-8 rounded-[2rem] border border-zinc-800 bg-zinc-900/80 p-2 flex gap-2" data-testid="auth-mode-tabs" style={{ borderColor: 'rgba(var(--brand-primary-rgb), 0.16)' }}>
            <button
              type="button"
              data-testid="auth-tab-login"
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 rounded-[1.25rem] px-4 py-3 text-sm font-semibold transition ${mode === 'login' ? '' : 'text-zinc-300 hover:bg-zinc-800'}`}
              style={mode === 'login' ? activeTabStyle : undefined}
            >
              Entrar
            </button>
            <button
              type="button"
              data-testid="auth-tab-register"
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 rounded-[1.25rem] px-4 py-3 text-sm font-semibold transition ${mode === 'register' ? '' : 'text-zinc-300 hover:bg-zinc-800'}`}
              style={mode === 'register' ? activeTabStyle : undefined}
            >
              Criar conta
            </button>
          </div>

          <div className="rounded-[2rem] border border-zinc-800 bg-zinc-900/70 p-6 sm:p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)]" style={{ borderColor: 'rgba(var(--brand-primary-rgb), 0.16)' }}>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p data-testid="auth-panel-eyebrow" className="text-[11px] uppercase tracking-[0.24em]" style={{ color: 'var(--brand-primary)' }}>
                  {mode === 'login' ? 'Acesso rápido' : 'Nova operação'}
                </p>
                <h2 data-testid="auth-panel-title" className="mt-2 text-2xl font-black text-white">
                  {mode === 'login' ? 'Entrar com a tua conta' : 'Criar nova conta e nova empresa'}
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  {mode === 'login'
                    ? 'Usa os teus dados atuais para entrar na tua empresa ou no portal técnico.'
                    : 'Este registo cria automaticamente uma nova empresa, um novo administrador e uma gestão totalmente separada.'}
                </p>
              </div>
              <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'rgba(var(--brand-primary-rgb), 0.12)', color: 'var(--brand-primary)' }}>
                {mode === 'login' ? <Sparkles size={20} /> : <UserPlus size={20} />}
              </div>
            </div>

            {error && (
              <div data-testid="auth-error" className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-5" data-testid="login-form">
                <div>
                  <Label className="text-zinc-300 text-sm font-medium">Email</Label>
                  <Input
                    data-testid="login-email-input"
                    type="email"
                    value={loginForm.email}
                    onChange={(event) => setLoginForm(prev => ({ ...prev, email: event.target.value }))}
                    className="mt-1.5 bg-zinc-950 border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 h-12 brand-field"
                    placeholder="admin@obelisco.pt"
                    required
                  />
                </div>
                <div>
                  <Label className="text-zinc-300 text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input
                      data-testid="login-password-input"
                      type={showLoginPass ? 'text' : 'password'}
                      value={loginForm.password}
                      onChange={(event) => setLoginForm(prev => ({ ...prev, password: event.target.value }))}
                      className="mt-1.5 bg-zinc-950 border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 h-12 pr-12 brand-field"
                      required
                    />
                    <button
                      type="button"
                      data-testid="login-toggle-password"
                      onClick={() => setShowLoginPass(!showLoginPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 mt-0.5"
                    >
                      {showLoginPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <Button
                  data-testid="login-submit-button"
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full font-semibold h-12 text-base transition-all duration-300 brand-primary-button"
                >
                  {loading ? 'A entrar...' : 'Entrar'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-5" data-testid="register-form">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label className="text-zinc-300 text-sm font-medium">Nome do responsável</Label>
                    <Input
                      data-testid="register-name-input"
                      type="text"
                      value={registerForm.name}
                      onChange={(event) => setRegisterForm(prev => ({ ...prev, name: event.target.value }))}
                      className="mt-1.5 bg-zinc-950 border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 h-12 brand-field"
                      placeholder="João Silva"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-300 text-sm font-medium">Nome da empresa</Label>
                    <Input
                      data-testid="register-company-name-input"
                      type="text"
                      value={registerForm.companyName}
                      onChange={(event) => setRegisterForm(prev => ({ ...prev, companyName: event.target.value }))}
                      className="mt-1.5 bg-zinc-950 border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 h-12 brand-field"
                      placeholder="Nova Gestão Lda"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-zinc-300 text-sm font-medium">Email</Label>
                  <Input
                    data-testid="register-email-input"
                    type="email"
                    value={registerForm.email}
                    onChange={(event) => setRegisterForm(prev => ({ ...prev, email: event.target.value }))}
                    className="mt-1.5 bg-zinc-950 border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 h-12 brand-field"
                    placeholder="gestor@empresa.pt"
                    required
                  />
                </div>

                <div>
                  <Label className="text-zinc-300 text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input
                      data-testid="register-password-input"
                      type={showRegisterPass ? 'text' : 'password'}
                      value={registerForm.password}
                      onChange={(event) => setRegisterForm(prev => ({ ...prev, password: event.target.value }))}
                      className="mt-1.5 bg-zinc-950 border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 h-12 pr-12 brand-field"
                      placeholder="mínimo 6 caracteres"
                      required
                    />
                    <button
                      type="button"
                      data-testid="register-toggle-password"
                      onClick={() => setShowRegisterPass(!showRegisterPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 mt-0.5"
                    >
                      {showRegisterPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div data-testid="register-info-box" className="rounded-2xl p-4 text-sm text-zinc-300" style={{ border: '1px solid rgba(var(--brand-primary-rgb), 0.2)', background: 'rgba(var(--brand-primary-rgb), 0.06)' }}>
                  <p className="font-semibold" style={{ color: 'var(--brand-primary)' }}>O que acontece ao criar conta?</p>
                  <ul className="mt-2 space-y-1 text-zinc-400">
                    <li>• nasce uma nova empresa/tenant com dados separados</li>
                    <li>• este utilizador entra como primeiro administrador</li>
                    <li>• o login é automático logo após o registo</li>
                  </ul>
                </div>

                <Button
                  data-testid="register-submit-button"
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full font-semibold h-12 text-base transition-all duration-300 brand-primary-button"
                >
                  {loading ? 'A criar conta...' : 'Criar conta e entrar'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="hidden lg:block flex-1 relative overflow-hidden">
        <img src={BG_URL} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at top left, rgba(var(--brand-primary-rgb), 0.2), transparent 28%), linear-gradient(180deg, rgba(9,9,11,0.56), rgba(9,9,11,0.92))' }} />
        <div className="absolute inset-0 bg-zinc-950/55" />
        <div className="absolute bottom-12 left-12 right-12 max-w-xl">
          <div className="flex items-center gap-2 mb-4" style={{ color: 'var(--brand-primary)' }}>
            <Zap size={20} />
            <span data-testid="login-hero-eyebrow" className="text-sm font-medium uppercase tracking-widest">{heroCopy.eyebrow}</span>
          </div>
          <h2 data-testid="login-hero-title" className="text-4xl font-black uppercase tracking-tight text-white leading-tight">
            {heroCopy.title}
          </h2>
          <p data-testid="login-hero-body" className="text-zinc-300 mt-4 text-lg leading-relaxed">
            {heroCopy.body}
          </p>
        </div>
      </div>
    </div>
  );
}