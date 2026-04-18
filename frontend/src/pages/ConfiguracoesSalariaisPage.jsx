import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ConfiguracoesSalariaisPage() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/payroll/settings');
      setS(data);
    } catch { toast.error('Erro ao carregar configurações'); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/payroll/settings', s);
      toast.success('Configurações guardadas');
    } catch { toast.error('Erro ao guardar'); }
    finally { setSaving(false); }
  };

  const setField = (k, v) => setS({ ...s, [k]: v });

  const updateBracket = (i, key, val) => {
    const next = [...s.irs_brackets];
    next[i] = { ...next[i], [key]: parseFloat(val) || 0 };
    setS({ ...s, irs_brackets: next });
  };
  const addBracket = () => setS({ ...s, irs_brackets: [...(s.irs_brackets || []), { limit: 0, rate: 0 }] });
  const removeBracket = (i) => setS({ ...s, irs_brackets: s.irs_brackets.filter((_, idx) => idx !== i) });

  if (!s) return <div className="text-zinc-400 text-sm">A carregar...</div>;

  return (
    <div data-testid="config-salariais-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Configurações Salariais</h1>
          <p className="text-zinc-400 mt-1 font-medium">Tabelas legais PT (editaveis). Defaults 2026.</p>
        </div>
        <Button data-testid="save-config-btn" onClick={save} disabled={saving} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          {saving ? 'A guardar...' : 'Guardar Alteracoes'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800">
          <h3 className="text-lg font-bold text-white mb-3">Seguranca Social</h3>
          <div className="space-y-3">
            <div><Label className="text-zinc-400 text-xs">SS Trabalhador (%)</Label><Input data-testid="ss-worker" type="number" step="0.01" value={s.ss_worker_pct} onChange={e => setField('ss_worker_pct', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">SS Entidade Patronal (%)</Label><Input type="number" step="0.01" value={s.ss_employer_pct} onChange={e => setField('ss_employer_pct', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800">
          <h3 className="text-lg font-bold text-white mb-3">Subsidio Alimentacao & Horarios</h3>
          <div className="space-y-3">
            <div><Label className="text-zinc-400 text-xs">Subsidio alimentacao/dia (EUR)</Label><Input type="number" step="0.01" value={s.meal_allowance_day} onChange={e => setField('meal_allowance_day', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Horas semanais padrao</Label><Input type="number" step="0.5" value={s.standard_weekly_hours} onChange={e => setField('standard_weekly_hours', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Dias uteis/mes</Label><Input type="number" value={s.standard_work_days_month} onChange={e => setField('standard_work_days_month', parseInt(e.target.value) || 22)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 md:col-span-2">
          <h3 className="text-lg font-bold text-white mb-3">Multiplicadores de Horas Extra</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label className="text-zinc-400 text-xs">1a hora diurna (%)</Label><Input type="number" step="0.1" value={s.overtime_first_hour_pct} onChange={e => setField('overtime_first_hour_pct', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Restantes diurnas (%)</Label><Input type="number" step="0.1" value={s.overtime_extra_hour_pct} onChange={e => setField('overtime_extra_hour_pct', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Noturno / Sabado (%)</Label><Input type="number" step="0.1" value={s.overtime_night_weekend_pct} onChange={e => setField('overtime_night_weekend_pct', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Domingo / Feriado (%)</Label><Input type="number" step="0.1" value={s.overtime_holiday_pct} onChange={e => setField('overtime_holiday_pct', parseFloat(e.target.value) || 0)} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-white">Escaloes IRS (Retencao na fonte simplificada)</h3>
            <Button size="sm" onClick={addBracket} className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-full text-xs"><Plus size={12} className="mr-1" /> Escalao</Button>
          </div>
          <p className="text-xs text-zinc-500 mb-3">Defina os limites brutos mensais (EUR) e a taxa aplicada. Para conformidade exata, valide com contabilista.</p>
          <div className="space-y-2">
            {(s.irs_brackets || []).map((b, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_40px] gap-2">
                <Input type="number" value={b.limit} onChange={e => updateBracket(i, 'limit', e.target.value)} placeholder="Limite EUR" className="bg-zinc-900 border-zinc-700 text-white" />
                <Input type="number" step="0.01" value={b.rate} onChange={e => updateBracket(i, 'rate', e.target.value)} placeholder="Taxa %" className="bg-zinc-900 border-zinc-700 text-white" />
                <button onClick={() => removeBracket(i)} className="text-zinc-400 hover:text-red-400 flex items-center justify-center"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
