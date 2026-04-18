import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Settings, Save, Building2, Percent, Shield, AlertTriangle } from 'lucide-react';

const formatPct = (v) => `${v}%`;

export default function DefinicoesPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/system-settings');
      setSettings(data);
    } catch (err) { console.error(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const save = async () => {
    try {
      const { data } = await api.put('/system-settings', settings);
      setSettings(data);
      toast.success('Definições guardadas');
    } catch { toast.error('Erro ao guardar'); }
  };

  const updateField = (key, val) => setSettings({ ...settings, [key]: val });
  const updateIndirect = (key, val) => setSettings({ ...settings, indirect_costs: { ...settings.indirect_costs, [key]: parseFloat(val) || 0 } });
  const updateRisk = (key, val) => setSettings({ ...settings, risk_levels: { ...settings.risk_levels, [key]: parseFloat(val) || 0 } });
  const updateCompany = (key, val) => setSettings({ ...settings, company_info: { ...settings.company_info, [key]: val } });

  if (loading || !settings) return <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>;

  const indirects = settings.indirect_costs || {};
  const totalIndirect = Object.values(indirects).reduce((s, v) => s + v, 0);

  return (
    <div data-testid="definições-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Definições</h1>
          <p className="text-zinc-400 mt-1 font-medium">Configurações do motor de orcamentacao</p>
        </div>
        <Button data-testid="save-settings" onClick={save} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Save size={16} className="mr-2" /> Guardar
        </Button>
      </div>

      <Tabs defaultValue="geral">
        <TabsList className="bg-zinc-900 border border-zinc-800 rounded-full p-1">
          <TabsTrigger value="geral" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm"><Settings size={14} className="mr-1" /> Geral</TabsTrigger>
          <TabsTrigger value="indiretos" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm"><Percent size={14} className="mr-1" /> Indiretos</TabsTrigger>
          <TabsTrigger value="risco" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm"><Shield size={14} className="mr-1" /> Risco</TabsTrigger>
          <TabsTrigger value="empresa" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm"><Building2 size={14} className="mr-1" /> Empresa</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-6">
          <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
            <CardContent className="p-6 space-y-6">
              <h3 className="text-lg font-bold text-white">Parametros Gerais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <Label className="text-zinc-300 text-sm">Taxa IVA (%)</Label>
                  <Input data-testid="iva-rate" type="number" value={settings.iva_rate || 23} onChange={e => updateField('iva_rate', parseFloat(e.target.value) || 0)} className="mt-1 bg-zinc-800 border-zinc-700 text-white rounded-xl" />
                </div>
                <div>
                  <Label className="text-zinc-300 text-sm">Margem Minima (%)</Label>
                  <Input data-testid="min-margin" type="number" value={settings.min_margin || 15} onChange={e => updateField('min_margin', parseFloat(e.target.value) || 0)} className="mt-1 bg-zinc-800 border-zinc-700 text-white rounded-xl" />
                  <p className="text-xs text-red-400 mt-1">Alerta abaixo deste valor</p>
                </div>
                <div>
                  <Label className="text-zinc-300 text-sm">Margem Alvo (%)</Label>
                  <Input data-testid="target-margin" type="number" value={settings.target_margin || 30} onChange={e => updateField('target_margin', parseFloat(e.target.value) || 0)} className="mt-1 bg-zinc-800 border-zinc-700 text-white rounded-xl" />
                </div>
              </div>
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <h4 className="text-sm font-semibold text-yellow-400 mb-2">Modos de Proposta</h4>
                <div className="grid grid-cols-3 gap-3 text-sm text-zinc-300">
                  <div className="p-3 rounded-lg bg-zinc-800 border border-zinc-700">
                    <p className="font-bold text-white">Basico</p>
                    <p>Margem reduzida (x0.85)</p>
                    <p>Risco baixo</p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800 border border-yellow-400/30">
                    <p className="font-bold text-yellow-400">Profissional</p>
                    <p>Margem equilibrada (x1.0)</p>
                    <p>Risco medio</p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800 border border-green-400/30">
                    <p className="font-bold text-green-400">Premium</p>
                    <p>Margem alta (x1.20)</p>
                    <p>Risco alto + protecao</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="indiretos" className="mt-6">
          <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Custos Indiretos</h3>
                <div className="bg-yellow-400/20 text-yellow-400 rounded-full px-3 py-1 text-sm font-bold">Total: {formatPct(totalIndirect.toFixed(1))}</div>
              </div>
              <p className="text-zinc-400 text-sm">Percentagem aplicada sobre o custo direto (material + mão de obra)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(indirects).map(([key, val]) => (
                  <div key={key}>
                    <Label className="text-zinc-400 text-xs capitalize">{key.replace(/_/g, ' ')}</Label>
                    <div className="flex items-center gap-1 mt-1">
                      <Input type="number" step="0.1" value={val} onChange={e => updateIndirect(key, e.target.value)} className="bg-zinc-800 border-zinc-700 text-white rounded-xl text-sm" />
                      <span className="text-zinc-500 text-sm">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risco" className="mt-6">
          <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><AlertTriangle size={18} className="text-yellow-400" /> Niveis de Risco</h3>
              <p className="text-zinc-400 text-sm">Percentagem aplicada sobre (custo direto + indiretos) como provisao para imprevistos</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(settings.risk_levels || {}).map(([key, val]) => (
                  <div key={key} className="p-4 rounded-xl bg-zinc-800 border border-zinc-700">
                    <Label className="text-zinc-300 text-sm capitalize font-semibold">{key.replace(/_/g, ' ')}</Label>
                    <div className="flex items-center gap-1 mt-2">
                      <Input type="number" step="0.5" value={val} onChange={e => updateRisk(key, e.target.value)} className="bg-zinc-900 border-zinc-700 text-white rounded-xl text-lg font-bold" />
                      <span className="text-zinc-500 text-lg">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="empresa" className="mt-6">
          <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-bold text-white">Dados da Empresa</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {['name', 'subtitle', 'phone', 'email', 'website', 'address', 'nif'].map(field => (
                  <div key={field}>
                    <Label className="text-zinc-400 text-xs capitalize">{field === 'nif' ? 'NIF' : field}</Label>
                    <Input value={settings.company_info?.[field] || ''} onChange={e => updateCompany(field, e.target.value)} className="mt-1 bg-zinc-800 border-zinc-700 text-white rounded-xl" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
