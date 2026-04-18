import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, CalendarCheck2 } from 'lucide-react';
import { toast } from 'sonner';

const DAY_TYPES = [
  { value: 'normal', label: 'Normal', color: 'bg-zinc-700' },
  { value: 'sabado', label: 'Sabado', color: 'bg-blue-500/30' },
  { value: 'domingo', label: 'Domingo', color: 'bg-purple-500/30' },
  { value: 'feriado', label: 'Feriado', color: 'bg-purple-500/30' },
  { value: 'meio_dia', label: 'Meio dia', color: 'bg-zinc-600' },
  { value: 'ferias', label: 'Ferias', color: 'bg-green-500/30' },
  { value: 'falta_j', label: 'Falta justif.', color: 'bg-yellow-500/30' },
  { value: 'falta_i', label: 'Falta injust.', color: 'bg-red-500/30' },
  { value: 'baixa', label: 'Baixa', color: 'bg-orange-500/30' },
  { value: 'formacao', label: 'Formacao', color: 'bg-cyan-500/30' },
  { value: 'folga', label: 'Folga', color: 'bg-zinc-700' },
];

const dayTypeMeta = (v) => DAY_TYPES.find(d => d.value === v) || DAY_TYPES[0];

const today = () => new Date().toISOString().slice(0, 10);

export default function AssiduidadePage() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [records, setRecords] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: '', date: today(), day_type: 'normal',
    time_in: '08:00', time_out: '17:00', break_minutes: 60,
    normal_hours: 8, overtime_hours: 0, night_hours: 0, worksite: '', notes: '',
  });

  const fetchEmployees = useCallback(async () => {
    try {
      const { data } = await api.get('/payroll/employees');
      setEmployees(data);
      if (data.length && !selectedEmp) setSelectedEmp(data[0].id);
    } catch { toast.error('Erro ao carregar funcionarios'); }
  }, [selectedEmp]);

  const fetchRecords = useCallback(async () => {
    if (!selectedEmp) return;
    try {
      const { data } = await api.get('/payroll/attendance', { params: { employee_id: selectedEmp, month, year } });
      setRecords(data);
    } catch { toast.error('Erro ao carregar registos'); }
  }, [selectedEmp, month, year]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const openNew = (date) => {
    setForm({
      employee_id: selectedEmp,
      date: date || today(),
      day_type: 'normal', time_in: '08:00', time_out: '17:00', break_minutes: 60,
      normal_hours: 8, overtime_hours: 0, night_hours: 0, worksite: '', notes: '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.employee_id || !form.date) { toast.error('Funcionario e data sao obrigatorios'); return; }
    try {
      await api.post('/payroll/attendance', form);
      toast.success('Registo criado');
      setDialogOpen(false);
      fetchRecords();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao guardar');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar este registo?')) return;
    try {
      await api.delete(`/payroll/attendance/${id}`);
      toast.success('Eliminado');
      fetchRecords();
    } catch { toast.error('Erro ao eliminar'); }
  };

  // Build calendar days
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const offset = (firstDay + 6) % 7; // Monday first

  const recordsByDate = {};
  records.forEach(r => { recordsByDate[r.date] = r; });

  const monthOptions = [
    '01 - Janeiro', '02 - Fevereiro', '03 - Marco', '04 - Abril',
    '05 - Maio', '06 - Junho', '07 - Julho', '08 - Agosto',
    '09 - Setembro', '10 - Outubro', '11 - Novembro', '12 - Dezembro',
  ];

  // Summary
  const summary = records.reduce((acc, r) => {
    acc[r.day_type] = (acc[r.day_type] || 0) + 1;
    acc.totalNormalHours += r.normal_hours || 0;
    acc.totalOvertime += r.overtime_hours || 0;
    return acc;
  }, { totalNormalHours: 0, totalOvertime: 0 });

  return (
    <div data-testid="assiduidade-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Assiduidade</h1>
          <p className="text-zinc-400 mt-1 font-medium">Registo diario de ponto por funcionario</p>
        </div>
        <Button data-testid="new-attendance-btn" onClick={() => openNew()} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold" disabled={!selectedEmp}>
          <Plus size={18} className="mr-2" /> Novo Registo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800">
        <div>
          <Label className="text-zinc-400 text-xs">Funcionario</Label>
          <select data-testid="att-employee-select" value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
            <option value="">Selecione...</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-zinc-400 text-xs">Mes</Label>
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
            {monthOptions.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-zinc-400 text-xs">Ano</Label>
          <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || year)} className="bg-zinc-900 border-zinc-700 text-white mt-1 h-10" />
        </div>
        <div className="flex flex-col justify-end gap-1 text-xs text-zinc-300">
          <div className="flex gap-2"><span className="text-zinc-500">Trabalhados:</span> <span className="font-semibold text-green-400">{(summary.normal || 0) + (summary.sabado || 0) + (summary.domingo || 0) + (summary.feriado || 0)}</span></div>
          <div className="flex gap-2"><span className="text-zinc-500">Horas extra:</span> <span className="font-semibold text-yellow-400">{summary.totalOvertime.toFixed(1)}h</span></div>
          <div className="flex gap-2"><span className="text-zinc-500">Faltas injust.:</span> <span className="font-semibold text-red-400">{summary.falta_i || 0}</span></div>
        </div>
      </div>

      {/* Calendar grid */}
      {selectedEmp ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map(d => (
              <div key={d} className="text-center text-xs uppercase tracking-wider text-zinc-500 font-medium py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const rec = recordsByDate[dateStr];
              const meta = rec ? dayTypeMeta(rec.day_type) : null;
              return (
                <button
                  key={d}
                  onClick={() => rec ? null : (setForm({ ...form, employee_id: selectedEmp, date: dateStr, day_type: 'normal', time_in: '08:00', time_out: '17:00', break_minutes: 60, normal_hours: 8, overtime_hours: 0, night_hours: 0, worksite: '', notes: '' }), setDialogOpen(true))}
                  className={`aspect-square rounded-xl border p-2 text-left transition relative ${rec ? `${meta.color} border-zinc-700` : 'bg-zinc-800/40 border-zinc-800 hover:bg-zinc-800 cursor-pointer'}`}
                  data-testid={`day-${d}`}
                >
                  <div className="text-white font-bold text-sm">{d}</div>
                  {rec && (
                    <div className="mt-1">
                      <div className="text-[10px] text-white font-medium truncate">{meta.label}</div>
                      {rec.normal_hours > 0 && <div className="text-[10px] text-white/80">{rec.normal_hours}h</div>}
                      {rec.overtime_hours > 0 && <div className="text-[10px] text-yellow-300 font-semibold">+{rec.overtime_hours}h</div>}
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(rec.id); }} className="absolute top-1 right-1 text-white/60 hover:text-red-300"><Trash2 size={10} /></button>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap gap-2 text-xs">
            {DAY_TYPES.map(d => (
              <span key={d.value} className={`px-2 py-1 rounded ${d.color} text-white/90`}>{d.label}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <CalendarCheck2 className="mx-auto text-zinc-600 mb-3" size={48} />
          <p className="text-zinc-400">Selecione um funcionario para ver a assiduidade</p>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-white">Novo Registo</DialogTitle>
            <DialogDescription className="text-zinc-500">Registo diario de ponto</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <div>
              <Label className="text-zinc-400 text-xs">Funcionario</Label>
              <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="w-full mt-1 h-10 bg-zinc-900 border border-zinc-700 text-white rounded-md px-3 text-sm">
                <option value="">Selecione...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div><Label className="text-zinc-400 text-xs">Data</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div className="md:col-span-2">
              <Label className="text-zinc-400 text-xs">Tipo de dia</Label>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5 mt-1">
                {DAY_TYPES.map(d => (
                  <button key={d.value} type="button" onClick={() => setForm({ ...form, day_type: d.value })}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition border ${form.day_type === d.value ? 'bg-yellow-400 text-zinc-950 border-yellow-400' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div><Label className="text-zinc-400 text-xs">Entrada</Label><Input type="time" value={form.time_in} onChange={e => setForm({ ...form, time_in: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Saida</Label><Input type="time" value={form.time_out} onChange={e => setForm({ ...form, time_out: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Pausa (min)</Label><Input type="number" min="0" value={form.break_minutes} onChange={e => setForm({ ...form, break_minutes: parseInt(e.target.value) || 0 })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Horas normais</Label><Input type="number" step="0.25" value={form.normal_hours} onChange={e => setForm({ ...form, normal_hours: parseFloat(e.target.value) || 0 })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Horas extra</Label><Input type="number" step="0.25" value={form.overtime_hours} onChange={e => setForm({ ...form, overtime_hours: parseFloat(e.target.value) || 0 })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div><Label className="text-zinc-400 text-xs">Horas noturnas</Label><Input type="number" step="0.25" value={form.night_hours} onChange={e => setForm({ ...form, night_hours: parseFloat(e.target.value) || 0 })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div className="md:col-span-2"><Label className="text-zinc-400 text-xs">Obra / Local</Label><Input value={form.worksite} onChange={e => setForm({ ...form, worksite: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
            <div className="md:col-span-2"><Label className="text-zinc-400 text-xs">Observacoes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-zinc-700 text-zinc-300">Cancelar</Button>
            <Button data-testid="save-attendance-btn" onClick={handleSave} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
