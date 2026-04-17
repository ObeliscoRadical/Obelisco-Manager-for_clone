import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, Clock, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function AgendaPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', client_name: '', date: '', time_start: '09:00', time_end: '10:00', notes: '' });

  const fetchAppointments = async () => {
    try { const { data } = await api.get('/appointments'); setAppointments(data); }
    catch { toast.error('Erro ao carregar agenda'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAppointments(); }, []);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayAppointments = appointments.filter(a => a.date === selectedDateStr);

  // Dates that have appointments
  const appointmentDates = [...new Set(appointments.map(a => a.date))];

  const openNew = () => {
    setForm({ title: '', client_name: '', date: selectedDateStr, time_start: '09:00', time_end: '10:00', notes: '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.date || !form.time_start || !form.time_end) {
      toast.error('Preencha todos os campos obrigatorios');
      return;
    }
    try {
      await api.post('/appointments', form);
      toast.success('Agendamento criado');
      setDialogOpen(false);
      fetchAppointments();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Erro ao criar agendamento');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminar este agendamento?')) return;
    try { await api.delete(`/appointments/${id}`); toast.success('Agendamento eliminado'); fetchAppointments(); }
    catch { toast.error('Erro ao eliminar'); }
  };

  return (
    <div data-testid="agenda-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Agenda</h1>
          <p className="text-zinc-400 mt-1 font-medium">Gerencie os seus compromissos</p>
        </div>
        <Button data-testid="new-appointment-btn" onClick={openNew} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={18} className="mr-2" /> Novo Agendamento
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
          <CardContent className="p-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              className="rounded-2xl"
              modifiers={{
                hasAppointment: appointmentDates.map(d => new Date(d + 'T00:00:00')),
              }}
              modifiersStyles={{
                hasAppointment: { fontWeight: 'bold', textDecoration: 'underline', textDecorationColor: '#FACC15' },
              }}
            />
          </CardContent>
        </Card>

        <div>
          <div className="flex items-center gap-3 mb-4">
            <CalendarDays size={20} className="text-yellow-400" />
            <h2 className="text-xl font-black uppercase tracking-tight text-white">
              {format(selectedDate, 'dd/MM/yyyy')}
            </h2>
            <span className="text-zinc-500 text-sm">({dayAppointments.length} agendamento{dayAppointments.length !== 1 ? 's' : ''})</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : dayAppointments.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 bg-zinc-900 rounded-3xl border border-zinc-800">
              <Clock size={36} className="mx-auto mb-3 text-zinc-700" />
              <p>Sem agendamentos neste dia</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayAppointments.sort((a, b) => a.time_start.localeCompare(b.time_start)).map(a => (
                <Card key={a.id} className="bg-zinc-900 border-zinc-800 rounded-2xl hover:shadow-[0_0_15px_rgba(250,204,21,0.1)] transition-all duration-300">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-yellow-400/10 text-yellow-400 rounded-xl px-3 py-2 text-center">
                        <p className="text-sm font-bold">{a.time_start}</p>
                        <p className="text-xs text-zinc-500">{a.time_end}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-white">{a.title}</p>
                        {a.client_name && <p className="text-sm text-zinc-400">{a.client_name}</p>}
                        {a.notes && <p className="text-xs text-zinc-600 mt-1">{a.notes}</p>}
                      </div>
                    </div>
                    <button data-testid={`delete-appointment-${a.id}`} onClick={() => handleDelete(a.id)} className="text-zinc-600 hover:text-red-400 p-2 transition">
                      <Trash2 size={16} />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-zinc-300 text-sm">Titulo *</Label>
              <Input data-testid="appointment-title-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Ex: Visita tecnica" />
            </div>
            <div>
              <Label className="text-zinc-300 text-sm">Cliente</Label>
              <Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
            </div>
            <div>
              <Label className="text-zinc-300 text-sm">Data *</Label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-300 text-sm">Hora Inicio *</Label>
                <Input data-testid="appointment-start-time" type="time" value={form.time_start} onChange={e => setForm({ ...form, time_start: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Hora Fim *</Label>
                <Input data-testid="appointment-end-time" type="time" value={form.time_end} onChange={e => setForm({ ...form, time_end: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
            </div>
            <div>
              <Label className="text-zinc-300 text-sm">Notas</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" placeholder="Observacoes..." />
            </div>
            <Button data-testid="save-appointment-btn" onClick={handleSave} className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">
              Criar Agendamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
