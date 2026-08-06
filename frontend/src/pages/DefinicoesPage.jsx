import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Settings, Save, Building2, Percent, Shield, AlertTriangle, Brain, Trash2, Loader2 } from 'lucide-react';

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
          <TabsTrigger value="ia" className="rounded-full data-[state=active]:bg-yellow-400 data-[state=active]:text-zinc-950 text-zinc-400 text-sm"><Brain size={14} className="mr-1" /> Regras IA</TabsTrigger>
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

        <TabsContent value="ia" className="mt-6">
          <CategoryOverridesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}


const BANK_CAT_LABELS = {
  fixo: 'Custo Fixo', variavel: 'Custo Variável', obra: 'Custo de Obra',
  receita: 'Receita', imposto: 'Imposto', salario: 'Salário',
  financeiro: 'Financeiro', outro: 'Outro',
};
const BANK_CAT_COLORS = {
  fixo: '#3B82F6', variavel: '#F59E0B', obra: '#FACC15',
  receita: '#22C55E', imposto: '#EF4444', salario: '#8B5CF6',
  financeiro: '#64748B', outro: '#71717A',
};

function CategoryOverridesTab() {
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchOverrides = useCallback(async () => {
    try {
      const { data } = await api.get('/bank-analysis/category-overrides/list');
      setOverrides(data);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOverrides(); }, [fetchOverrides]);

  const handleDelete = async (descKey) => {
    setDeleting(descKey);
    try {
      await api.delete(`/bank-analysis/category-overrides/${encodeURIComponent(descKey)}`);
      setOverrides(prev => prev.filter(o => o.desc_key !== descKey));
      toast.success('Regra eliminada');
    } catch { toast.error('Erro ao eliminar'); }
    finally { setDeleting(null); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-yellow-400 animate-spin" /></div>;

  return (
    <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Brain size={18} className="text-purple-400" /> Regras de Categorização Aprendidas
            </h3>
            <p className="text-zinc-400 text-sm mt-1">
              Quando corrige a categoria de uma transação no extrato bancário, o sistema aprende e aplica automaticamente a mesma categoria a transações futuras com descrições semelhantes.
            </p>
          </div>
          <span className="text-xs text-zinc-500 bg-zinc-800 rounded-full px-3 py-1" data-testid="override-count">
            {overrides.length} {overrides.length === 1 ? 'regra' : 'regras'}
          </span>
        </div>

        {overrides.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">Nenhuma regra aprendida ainda</p>
            <p className="text-zinc-600 text-xs mt-1">Corrija categorias nas transações do extrato bancário e o sistema vai aprender automaticamente.</p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="overrides-list">
            <div className="grid grid-cols-[1fr_140px_140px_80px] gap-3 px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-wider">
              <span>Padrão de descrição</span>
              <span>Exemplo original</span>
              <span>Categoria atribuída</span>
              <span className="text-right">Ações</span>
            </div>
            {overrides.map(o => {
              const catLabel = BANK_CAT_LABELS[o.category] || o.category;
              const catColor = BANK_CAT_COLORS[o.category] || '#71717A';
              return (
                <div key={o.desc_key} className="grid grid-cols-[1fr_140px_140px_80px] gap-3 items-center px-3 py-3 bg-zinc-800/40 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors" data-testid={`override-${o.desc_key}`}>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-mono truncate">{o.desc_key}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-400 truncate" title={o.original_description}>{o.original_description?.slice(0, 30) || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: catColor, background: catColor + '20' }}>
                      {catLabel}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <button
                      data-testid={`delete-override-${o.desc_key}`}
                      onClick={() => handleDelete(o.desc_key)}
                      disabled={deleting === o.desc_key}
                      className="text-zinc-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      title="Eliminar regra"
                    >
                      {deleting === o.desc_key ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 p-4 rounded-xl bg-purple-500/5 border border-purple-500/20">
          <h4 className="text-xs text-purple-400 font-semibold mb-1">Como funciona?</h4>
          <ul className="text-xs text-zinc-400 space-y-1">
            <li>1. Carregue um extrato bancário na Análise Bancária</li>
            <li>2. Na tab Transações, altere a categoria de qualquer transação</li>
            <li>3. O sistema guarda a regra automaticamente</li>
            <li>4. Em futuros extratos, transações com descrições semelhantes serão categorizadas automaticamente</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
