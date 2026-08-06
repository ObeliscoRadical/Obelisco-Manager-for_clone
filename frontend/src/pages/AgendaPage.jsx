import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Clock, CalendarDays, Users, MapPin, Pencil, HardHat, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const emptyForm = { title: '', client_name: '', date: '', time_start: '09:00', time_end: '10:00', notes: '', employee_ids: [], location: '', work_id: '' };

export default function AgendaPage() {
  const [appointments, setAppointments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [calendarCheck, setCalendarCheck] = useState(null); // null | 'checking' | {available, conflicts, suggested_times}
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [apts, emps, ws] = await Promise.all([
        api.get('/appointments'),
        api.get('/payroll/employees').catch(() => ({ data: [] })),
        api.get('/works').catch(() => ({ data: [] })),
      ]);
      setAppointments(apts.data);
      setEmployees((emps.data || []).filter(e => e.active !== false));
      setWorks(ws.data || []);
    } catch (err) { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayAppointments = appointments.filter(a => a.date === selectedDateStr)
    .sort((a, b) => (a.time_start || '').localeCompare(b.time_start || ''));

  const appointmentDates = [...new Set(appointments.map(a => a.date))];
  const calendarModifiers = useMemo(() => ({
    hasAppointment: appointmentDates.map(d => new Date(d + 'T00:00:00')),
  }), [appointmentDates]);
  const calendarModifiersStyles = useMemo(() => ({
    hasAppointment: { fontWeight: 'bold', textDecoration: 'underline', textDecorationColor: '#FACC15' },
  }), []);

  const empName = (id) => employees.find(e => e.id === id)?.name || 'Funcionário';
  const workById = (id) => works.find(w => w.id === id);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm, date: selectedDateStr });
    setCalendarCheck(null);
    setDialogOpen(true);
  };

  const openEdit = (a) => {
    setEditingId(a.id);
    setForm({
      title: a.title || '',
      client_name: a.client_name || '',
      date: a.date,
      time_start: a.time_start || '09:00',
      time_end: a.time_end || '10:00',
      notes: a.notes || '',
      employee_ids: a.employee_ids || [],
      location: a.location || '',
      work_id: a.work_id || '',
    });
    setCalendarCheck(null);
    setDialogOpen(true);
  };

  const onWorkSelected = (workId) => {
    if (!workId) {
      setForm(prev => ({ ...prev, work_id: '' }));
      return;
    }
    const w = workById(workId);
    if (!w) return;
    // Auto-preencher campos vazios com dados da obra
    setForm(prev => ({
      ...prev,
      work_id: workId,
      title: prev.title || w.title || '',
      client_name: prev.client_name || w.client_name || '',
    }));
  };

  const toggleEmp = (id) => {
    setForm(prev => ({
      ...prev,
      employee_ids: prev.employee_ids.includes(id)
        ? prev.employee_ids.filter(x => x !== id)
        : [...prev.employee_ids, id],
    }));
  };

  const checkCalendar = async () => {
    if (!form.date || !form.time_start || !form.time_end) return;
    setCalendarCheck('checking');
    try {
      const res = await api.get('/appointments/check-calendar', { params: { date: form.date, time_start: form.time_start, time_end: form.time_end } });
      setCalendarCheck(res.data);
    } catch {
      setCalendarCheck({ available: true, conflicts: [], suggested_times: [] }); // Fallback: assume available
    }
  };

  const applySuggestion = (s) => {
    // Parse suggestion datetime to set date and time_start
    try {
      const dt = new Date(s.datetime);
      const date = dt.toISOString().split('T')[0];
      const hours = String(dt.getHours()).padStart(2, '0');
      const mins = String(dt.getMinutes()).padStart(2, '0');
      // Calculate duration from current form
      const [sh, sm] = form.time_start.split(':').map(Number);
      const [eh, em] = form.time_end.split(':').map(Number);
      const durMins = (eh * 60 + em) - (sh * 60 + sm);
      const endH = dt.getHours() + Math.floor(durMins / 60);
      const endM = dt.getMinutes() + (durMins % 60);
      const newEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      setForm(prev => ({ ...prev, date, time_start: `${hours}:${mins}`, time_end: newEnd }));
      setCalendarCheck(null);
      toast.success(`Horário alterado para ${s.display}`);
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    if (!form.title || !form.date || !form.time_start || !form.time_end) {
      toast.error('Preencha título, data e horas');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/appointments/${editingId}`, form);
        toast.success('Agendamento actualizado');
      } else {
        await api.post('/appointments', form);
        toast.success('Agendamento criado + evento Google Calendar');
      }
      setDialogOpen(false);
      setCalendarCheck(null);
      fetchAll();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Erro ao guardar agendamento');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar este agendamento?')) return;
    try { await api.delete(`/appointments/${id}`); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Erro ao eliminar'); }
  };

  return (
    <div data-testid="agenda-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Agenda</h1>
          <p className="text-zinc-400 mt-1 font-medium">Marcações da equipa. Os técnicos vêem os seus compromissos no Portal Técnico → Agenda.</p>
        </div>
        <Button data-testid="new-appointment-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={18} className="mr-2" /> Novo Agendamento
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
          <CardContent className="p-4">
            <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)}
              className="rounded-2xl" modifiers={calendarModifiers} modifiersStyles={calendarModifiersStyles} />
          </CardContent>
        </Card>

        <div>
          <div className="flex items-center gap-3 mb-4">
            <CalendarDays size={20} className="text-yellow-400" />
            <h2 className="text-xl font-black uppercase tracking-tight text-white">{format(selectedDate, 'dd/MM/yyyy')}</h2>
            <span className="text-zinc-500 text-sm">({dayAppointments.length} agendamento{dayAppointments.length !== 1 ? 's' : ''})</span>
          </div>

          {loading && <div className="flex justify-center py-8"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>}
          {!loading && dayAppointments.length === 0 && (
            <div className="text-center py-12 text-zinc-500 bg-zinc-900 rounded-3xl border border-zinc-800">
              <Clock size={36} className="mx-auto mb-3 text-zinc-700" />
              <p>Sem agendamentos neste dia</p>
            </div>
          )}
          {!loading && dayAppointments.length > 0 && (
            <div className="space-y-3">
              {dayAppointments.map(a => (
                <Card key={a.id} className="bg-zinc-900 border-zinc-800 rounded-2xl hover:shadow-[0_0_15px_rgba(250,204,21,0.1)] transition-all" data-testid={`appt-card-${a.id}`}>
                  <CardContent className="p-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="bg-yellow-400/10 text-yellow-400 rounded-xl px-3 py-2 text-center flex-shrink-0">
                        <p className="text-sm font-bold">{a.time_start}</p>
                        <p className="text-xs text-zinc-500">{a.time_end}</p>
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-white">{a.title}</p>
                        {a.client_name && <p className="text-sm text-zinc-400">{a.client_name}</p>}
                        {a.work_id && workById(a.work_id) && (
                          <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/40 text-[10px] mt-1">
                            <HardHat size={9} className="mr-1" /> Obra: {workById(a.work_id).title}
                          </Badge>
                        )}
                        {a.location && <p className="text-xs text-zinc-500 flex items-center gap-1 mt-1"><MapPin size={11} /> {a.location}</p>}
                        {a.notes && <p className="text-xs text-zinc-600 mt-1">{a.notes}</p>}
                        {(a.employee_ids || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(a.employee_ids || []).map(id => (
                              <Badge key={id} className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 text-[10px]">
                                <Users size={9} className="mr-1" /> {empName(id)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => openEdit(a)} data-testid={`edit-appt-${a.id}`} className="text-zinc-500 hover:text-yellow-400 p-1.5 rounded hover:bg-zinc-800"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(a.id)} data-testid={`delete-appointment-${a.id}`} className="text-zinc-500 hover:text-red-400 p-1.5 rounded hover:bg-zinc-800"><Trash2 size={14} /></button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">
              {editingId ? 'Editar Agendamento' : 'Novo Agendamento'}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              Atribua o compromisso a um ou mais técnicos — vai aparecer no Portal Técnico deles.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-zinc-300 text-sm flex items-center gap-1"><HardHat size={14} className="text-yellow-400" /> Obra (opcional)</Label>
              <select
                data-testid="appointment-work-select"
                value={form.work_id || ''}
                onChange={e => onWorkSelected(e.target.value)}
                className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl h-10 px-3 text-white text-sm"
              >
                <option value="">— Sem obra associada —</option>
                {works
                  .filter(w => !['finalizado', 'concluida', 'cancelada'].includes((w.status || '').toLowerCase()))
                  .map(w => <option key={w.id} value={w.id}>{w.title} · {w.client_name || 's/ cliente'}</option>)}
              </select>
              {form.work_id && <p className="text-[10px] text-yellow-400 mt-1">✓ Técnico poderá ver a lista de itens desta obra no portal.</p>}
            </div>
            <div>
              <Label className="text-zinc-300 text-sm">Título *</Label>
              <Input data-testid="appointment-title-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Ex: Visita técnica" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300 text-sm">Cliente</Label>
                <Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Local</Label>
                <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Morada ou obra" className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-zinc-300 text-sm">Data *</Label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Início *</Label>
                <Input data-testid="appointment-start-time" type="time" value={form.time_start} onChange={e => setForm({ ...form, time_start: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Fim *</Label>
                <Input data-testid="appointment-end-time" type="time" value={form.time_end} onChange={e => setForm({ ...form, time_end: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
            </div>

            {/* Atribuir a Técnicos */}
            <div className="pt-2">
              <Label className="text-zinc-300 text-sm flex items-center gap-2 mb-2">
                <Users size={14} className="text-yellow-400" /> Atribuir a técnico(s) *
              </Label>
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 max-h-40 overflow-y-auto">
                {employees.length === 0 && <p className="text-xs text-zinc-500 italic">Sem funcionários activos. Crie primeiro em Funcionários.</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {employees.map(emp => (
                    <label key={emp.id} data-testid={`assign-emp-${emp.id}`}
                      className="flex items-center gap-2 p-2 rounded hover:bg-zinc-800/50 cursor-pointer">
                      <Checkbox checked={form.employee_ids.includes(emp.id)} onCheckedChange={() => toggleEmp(emp.id)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 truncate">{emp.name}</p>
                        <p className="text-[10px] text-zinc-500 truncate">{emp.role || 'Técnico'}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {form.employee_ids.length > 0 && (
                <p className="text-[11px] text-yellow-400 mt-1">{form.employee_ids.length} técnico(s) seleccionado(s)</p>
              )}
            </div>

            <div>
              <Label className="text-zinc-300 text-sm">Notas</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Observações…" className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
            </div>

            {/* Calendar Availability Check */}
            <div className="space-y-2">
              <Button
                type="button"
                data-testid="check-calendar-btn"
                onClick={checkCalendar}
                disabled={!form.date || !form.time_start || !form.time_end || calendarCheck === 'checking'}
                variant="outline"
                className="w-full border-zinc-700 text-zinc-300 hover:text-yellow-400 hover:border-yellow-400/50 rounded-full h-10"
              >
                {calendarCheck === 'checking' ? (
                  <><Loader2 size={16} className="mr-2 animate-spin" /> A verificar Google Calendar...</>
                ) : (
                  <><CalendarDays size={16} className="mr-2" /> Verificar Disponibilidade no Google Calendar</>
                )}
              </Button>

              {calendarCheck && calendarCheck !== 'checking' && calendarCheck.available && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm" data-testid="calendar-available-msg">
                  <CheckCircle2 size={16} /> Horário livre no Google Calendar
                </div>
              )}

              {calendarCheck && calendarCheck !== 'checking' && !calendarCheck.available && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl space-y-2" data-testid="calendar-conflict-msg">
                  <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
                    <AlertTriangle size={16} /> Conflito no Google Calendar
                  </div>
                  {calendarCheck.conflicts?.map((c, i) => (
                    <p key={c.summary + i} className="text-xs text-zinc-400 ml-6">
                      {c.summary} ({new Date(c.start).toLocaleTimeString('pt-PT', {hour:'2-digit',minute:'2-digit'})} — {new Date(c.end).toLocaleTimeString('pt-PT', {hour:'2-digit',minute:'2-digit'})})
                    </p>
                  ))}
                  {calendarCheck.suggested_times?.length > 0 && (
                    <div className="mt-2 ml-6">
                      <p className="text-xs text-zinc-500 mb-1">Horários alternativos sugeridos:</p>
                      <div className="flex flex-wrap gap-1">
                        {calendarCheck.suggested_times.map((s, i) => (
                          <button key={s.datetime || i} type="button" onClick={() => applySuggestion(s)}
                            className="px-2 py-1 text-xs bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 rounded-lg hover:bg-yellow-400/20"
                            data-testid={`suggestion-${i}`}>
                            {s.display}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-zinc-500 ml-6 mt-1">Pode criar mesmo assim — o conflito é apenas no Google Calendar.</p>
                </div>
              )}
            </div>

            <Button data-testid="save-appointment-btn" onClick={handleSave} disabled={saving} className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">
              {saving ? <><Loader2 size={16} className="mr-2 animate-spin" /> A guardar...</> : editingId ? 'Guardar Alterações' : 'Criar Agendamento'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
