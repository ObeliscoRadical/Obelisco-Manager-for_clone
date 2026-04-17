import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HardHat, TrendingUp, Clock, FileText, ClipboardList, CalendarDays } from 'lucide-react';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const statusLabels = {
  orcamento: 'Orcamento',
  em_execucao: 'Em Execucao',
  finalizado: 'Finalizado',
};
const statusColors = {
  orcamento: 'bg-zinc-700 text-zinc-300',
  em_execucao: 'bg-yellow-400/20 text-yellow-400',
  finalizado: 'bg-green-500/20 text-green-400',
};

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/dashboard/stats');
      setStats(data);
    } catch (err) {
      console.error('Dashboard stats error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const kpis = [
    { label: 'Total Obras', value: stats?.total_obras || 0, icon: HardHat, color: 'text-yellow-400' },
    { label: 'Lucro Estimado', value: formatEuro(stats?.lucro_estimado), icon: TrendingUp, color: 'text-green-400' },
    { label: 'Em Andamento', value: stats?.obras_em_andamento || 0, icon: Clock, color: 'text-blue-400' },
    { label: 'Orcamentos', value: stats?.total_orcamentos || 0, icon: FileText, color: 'text-orange-400' },
    { label: 'Propostas', value: stats?.total_propostas || 0, icon: ClipboardList, color: 'text-purple-400' },
    { label: 'Agenda Hoje', value: stats?.appointments_today || 0, icon: CalendarDays, color: 'text-cyan-400' },
  ];

  return (
    <div data-testid="dashboard-page" className="space-y-8">
      <div>
        <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Dashboard</h1>
        <p className="text-zinc-400 mt-2 font-medium">Visao geral do Obelisco Manager</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpis.map((kpi) => (
          <Card
            key={kpi.label}
            data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s/g, '-')}`}
            className="bg-zinc-900 border-zinc-800 rounded-3xl hover:shadow-[0_0_15px_rgba(250,204,21,0.15)] transition-all duration-300"
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`flex items-center justify-center h-12 w-12 rounded-2xl bg-zinc-800 ${kpi.color}`}>
                  <kpi.icon size={24} />
                </div>
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-medium">{kpi.label}</p>
              <p className={`text-3xl font-black mt-1 ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
          <CardContent className="p-6">
            <h3 className="text-xl font-black uppercase tracking-tight text-white mb-4">Obras Recentes</h3>
            {stats?.recent_works?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_works.map((w) => (
                  <div key={w.id || w.title} className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 border border-zinc-800">
                    <div>
                      <p className="text-sm font-medium text-white">{w.title}</p>
                      <p className="text-xs text-zinc-500">{w.client_name}</p>
                    </div>
                    <Badge className={statusColors[w.status] || 'bg-zinc-700 text-zinc-300'}>
                      {statusLabels[w.status] || w.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">Nenhuma obra registada</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
          <CardContent className="p-6">
            <h3 className="text-xl font-black uppercase tracking-tight text-white mb-4">Orcamentos Recentes</h3>
            {stats?.recent_budgets?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_budgets.map((b) => (
                  <div key={b.id || b.title} className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 border border-zinc-800">
                    <div>
                      <p className="text-sm font-medium text-white">{b.title}</p>
                      <p className="text-xs text-zinc-500">{b.client_name}</p>
                    </div>
                    <p className="text-sm font-semibold text-yellow-400">{formatEuro(b.total_price)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-500 text-sm">Nenhum orcamento criado</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
