import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Mail, Phone, MapPin, Building, Briefcase, Calendar, Euro, Clock, Sandwich, FileText, Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const Row = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 py-2 border-b border-zinc-800/60 last:border-0">
    <div className="mt-0.5 text-zinc-500"><Icon className="h-4 w-4" /></div>
    <div className="flex-1">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">{label}</p>
      <p className="text-sm text-white">{value || <span className="text-zinc-600 italic">—</span>}</p>
    </div>
  </div>
);

const fmt = (v) => v != null ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v) : '—';

export default function TechPerfilPage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const push = usePushNotifications(token);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/tech/profile');
        setProfile(data);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-24"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
  );

  if (!profile) return <p className="text-red-400">Erro ao carregar perfil.</p>;

  return (
    <div className="space-y-4" data-testid="tech-perfil-page">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
          <User className="h-6 w-6 text-yellow-400" /> O meu perfil
        </h1>
        <p className="text-zinc-400 text-sm mt-1">Dados pessoais e de contrato.</p>
      </div>

      {/* Nome + role */}
      <Card className="bg-gradient-to-br from-yellow-500/10 to-zinc-900 border-yellow-500/40">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-yellow-500 text-zinc-900 flex items-center justify-center text-2xl font-bold">
            {profile.name?.[0]?.toUpperCase() || 'T'}
          </div>
          <div className="flex-1">
            <p className="text-xl font-bold text-white" data-testid="profile-name">{profile.name}</p>
            <p className="text-sm text-yellow-400">{profile.role || 'Técnico'}</p>
            <Badge className={`mt-1 text-[10px] ${profile.active ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 border' : 'bg-red-500/20 text-red-300 border-red-500/40 border'}`}>
              {profile.active ? 'ACTIVO' : 'INACTIVO'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Dados de contacto */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Contactos</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Row icon={Mail} label="Email" value={profile.email} />
          <Row icon={Phone} label="Telefone" value={profile.phone} />
          <Row icon={MapPin} label="Morada" value={profile.address} />
        </CardContent>
      </Card>

      {/* Contrato */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Contrato & Categoria</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Row icon={Briefcase} label="Categoria" value={profile.category} />
          <Row icon={FileText} label="Tipo de contrato" value={profile.contract_type} />
          <Row icon={Calendar} label="Data de admissão" value={profile.admission_date} />
          <Row icon={Clock} label="Horas semanais" value={`${profile.weekly_hours || 40}h/semana · ${profile.work_days_per_week || 5} dias`} />
        </CardContent>
      </Card>

      {/* Salário */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Remuneração</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Row icon={Euro} label="Salário base" value={fmt(profile.base_salary)} />
          {profile.hourly_rate > 0 && <Row icon={Euro} label="Taxa horária" value={fmt(profile.hourly_rate)} />}
          <Row icon={Sandwich} label="Subsídio de alimentação/dia" value={fmt(profile.meal_allowance)} />
          <Row icon={Calendar} label="Frequência de pagamento" value={profile.payment_frequency || 'mensal'} />
          <Row icon={FileText} label="Duodécimos" value={profile.has_duodecimos ? 'Sim' : 'Não'} />
        </CardContent>
      </Card>

      {/* Fiscal */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Dados Fiscais</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Row icon={FileText} label="NIF" value={profile.nif} />
          <Row icon={FileText} label="NISS" value={profile.niss} />
          <Row icon={Building} label="IBAN" value={profile.iban} />
          <Row icon={FileText} label="Seguro de Acidentes" value={profile.accident_insurance} />
        </CardContent>
      </Card>

      {profile.notes && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Notas</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">{profile.notes}</p>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-zinc-500 text-center pt-2">Para alterar os seus dados, contacte o escritório.</p>

      {/* Push Notifications */}
      {push.supported && (
        <Card className="bg-zinc-900 border-zinc-800" data-testid="push-notifications-card">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-white flex items-center gap-2"><Bell className="h-4 w-4 text-yellow-400" /> Notificações Push</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-xs text-zinc-500">Receba alertas de agenda, pedidos e tarefas no telemóvel, relógio e desktop.</p>
            {push.isSubscribed ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <BellRing className="h-4 w-4" /> Notificações activas
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={async () => { await push.testPush(); toast.success('Push de teste enviada!'); }} className="text-xs" data-testid="test-push-btn">
                    Testar
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => { await push.unsubscribe(); toast.success('Notificações desactivadas'); }} className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10" data-testid="disable-push-btn">
                    <BellOff className="h-3 w-3 mr-1" /> Desactivar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                data-testid="enable-push-btn"
                onClick={async () => {
                  const ok = await push.subscribe();
                  if (ok) toast.success('Notificações push activadas!');
                  else toast.error('Não foi possível activar. Verifique as permissões do browser.');
                }}
                disabled={push.loading}
                className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold"
              >
                {push.loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
                Activar Notificações Push
              </Button>
            )}
            {push.permission === 'denied' && (
              <p className="text-xs text-red-400">Notificações bloqueadas pelo browser. Vá às definições do browser para permitir.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
