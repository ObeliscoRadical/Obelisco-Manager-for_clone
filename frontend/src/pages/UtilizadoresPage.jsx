import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Shield, Users, Settings2, Key } from 'lucide-react';
import { toast } from 'sonner';

const ROLE_LABELS = { admin: 'Administrador', orcamentista: 'Orçamentista', comercial: 'Comercial', tecnico: 'Técnico', consulta: 'Consulta' };
const ROLE_COLORS = { admin: 'bg-red-500/20 text-red-400', orcamentista: 'bg-yellow-400/20 text-yellow-400', comercial: 'bg-blue-400/20 text-blue-400', tecnico: 'bg-green-500/20 text-green-400', consulta: 'bg-zinc-700 text-zinc-300' };
const ROLES = ['admin', 'orcamentista', 'comercial', 'tecnico', 'consulta'];

// Grupos de módulos para UI mais legível
const MODULE_GROUPS = [
  {
    label: 'Operacional',
    modules: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'orcamentos', label: 'Orçamentos' },
      { key: 'propostas', label: 'Propostas' },
      { key: 'obras', label: 'Obras' },
      { key: 'agenda', label: 'Agenda' },
      { key: 'transporte_guias', label: 'Guias de Transporte' },
    ],
  },
  {
    label: 'Financeiro',
    modules: [
      { key: 'faturas', label: 'Faturas' },
      { key: 'despesas', label: 'Despesas' },
      { key: 'custos_fixos', label: 'Custos Fixos' },
      { key: 'financeiro', label: 'Dashboard Financeiro' },
      { key: 'ponto_equilibrio', label: 'Ponto de Equilíbrio' },
      { key: 'contabilista', label: 'Contabilista IA' },
    ],
  },
  {
    label: 'RH & Salários',
    modules: [
      { key: 'funcionarios', label: 'Funcionários' },
      { key: 'assiduidade', label: 'Assiduidade' },
      { key: 'salarios', label: 'Processamento Salarial' },
    ],
  },
  {
    label: 'Materiais & Biblioteca',
    modules: [
      { key: 'materiais', label: 'Materiais / Mão de Obra' },
      { key: 'biblioteca', label: 'Biblioteca' },
      { key: 'relatorios', label: 'Relatórios' },
    ],
  },
  {
    label: 'Portal Técnico',
    modules: [
      { key: 'tech_portal', label: 'Aceder ao Portal Técnico' },
    ],
  },
  {
    label: 'Admin (sensível)',
    modules: [
      { key: 'configuracoes', label: 'Configurações' },
      { key: 'utilizadores', label: 'Gestão de Utilizadores' },
    ],
  },
];

const emptyForm = { email: '', password: '', name: '', role: 'consulta', module_permissions: {} };

export default function UtilizadoresPage() {
  const [users, setUsers] = useState([]);
  const [defaultsPerRole, setDefaultsPerRole] = useState({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const fetchUsers = useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([api.get('/users'), api.get('/roles')]);
      setUsers(usersRes.data);
      setDefaultsPerRole(rolesRes.data.default_modules_per_role || {});
    } catch (err) { toast.error('Erro ao carregar utilizadores'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, module_permissions: defaultsPerRole['consulta'] || {} });
    setDialogOpen(true);
  };

  const openEdit = (u) => {
    setEditingId(u.id);
    setForm({
      email: u.email,
      password: '',
      name: u.name,
      role: u.role,
      module_permissions: u.module_permissions || defaultsPerRole[u.role] || {},
    });
    setDialogOpen(true);
  };

  const onRoleChange = (newRole) => {
    // Pré-carrega os defaults do role escolhido (utilizador pode depois ajustar)
    setForm(prev => ({ ...prev, role: newRole, module_permissions: defaultsPerRole[newRole] || {} }));
  };

  const toggleModule = (modKey) => {
    setForm(prev => ({
      ...prev,
      module_permissions: { ...prev.module_permissions, [modKey]: !prev.module_permissions[modKey] },
    }));
  };

  const setGroupAll = (group, value) => {
    setForm(prev => {
      const next = { ...prev.module_permissions };
      group.modules.forEach(m => { next[m.key] = value; });
      return { ...prev, module_permissions: next };
    });
  };

  const handleSubmit = async () => {
    if (!form.email || !form.name) { toast.error('Nome e email obrigatórios'); return; }
    if (!editingId && !form.password) { toast.error('Password obrigatória'); return; }
    try {
      if (editingId) {
        const payload = { name: form.name, role: form.role, module_permissions: form.module_permissions };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editingId}`, payload);
        toast.success('Utilizador atualizado');
      } else {
        await api.post('/users', form);
        toast.success('Utilizador criado');
      }
      setDialogOpen(false);
      setForm(emptyForm);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro');
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Eliminar este utilizador?')) return;
    try { await api.delete(`/users/${userId}`); toast.success('Eliminado'); fetchUsers(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const countActiveModules = (perms) => Object.values(perms || {}).filter(Boolean).length;

  return (
    <div data-testid="utilizadores-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Utilizadores</h1>
          <p className="text-zinc-400 mt-1 font-medium">Gestão de acessos e permissões granulares por módulo</p>
        </div>
        <Button data-testid="new-user-btn" onClick={openCreate} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={16} className="mr-2" /> Novo Utilizador
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-zinc-500"><Users size={48} className="mx-auto mb-4 text-zinc-700" /><p>Sem utilizadores</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map(u => (
            <Card key={u.id} className="bg-zinc-900 border-zinc-800 rounded-3xl" data-testid={`user-card-${u.id}`}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge className={ROLE_COLORS[u.role] || 'bg-zinc-700 text-zinc-300'}>{ROLE_LABELS[u.role] || u.role}</Badge>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`} className="text-zinc-500 hover:text-yellow-400 transition p-1.5 rounded hover:bg-zinc-800"><Settings2 size={14} /></button>
                    <button onClick={() => handleDelete(u.id)} data-testid={`delete-user-${u.id}`} className="text-zinc-500 hover:text-red-400 transition p-1.5 rounded hover:bg-zinc-800"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div>
                  <p className="text-white font-semibold">{u.name}</p>
                  <p className="text-zinc-500 text-sm">{u.email}</p>
                </div>
                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs">
                  <span className="text-zinc-500 flex items-center gap-1"><Key size={12} /> Módulos activos</span>
                  <span className="font-mono text-yellow-400 font-semibold">{countActiveModules(u.module_permissions)} / {MODULE_GROUPS.reduce((n, g) => n + g.modules.length, 0)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">
              {editingId ? 'Editar Utilizador' : 'Novo Utilizador'}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              {editingId ? 'Ajuste permissões e dados. Deixe password vazia para manter a actual.' : 'Cria acessos granulares — escolha exactamente o que este utilizador pode ver.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300 text-sm">Nome *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  data-testid="form-name" className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Email *</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  disabled={!!editingId}
                  data-testid="form-email" className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl disabled:opacity-60" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300 text-sm">{editingId ? 'Nova password (opcional)' : 'Password *'}</Label>
                <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  data-testid="form-password" className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" />
              </div>
              <div>
                <Label className="text-zinc-300 text-sm">Perfil base</Label>
                <select value={form.role} onChange={e => onRoleChange(e.target.value)}
                  data-testid="form-role"
                  className="mt-1 w-full h-10 bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 text-sm">
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-yellow-400" />
                <Label className="text-zinc-200 font-semibold">Permissões — o que este utilizador pode ver</Label>
              </div>
              <p className="text-xs text-zinc-500 mb-3">Marque os módulos que quer permitir. Ao mudar o perfil base, as permissões pré-populam-se automaticamente.</p>
              {form.role === 'admin' && (
                <div className="mb-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/40 text-xs text-yellow-200">
                  ⚠️ Perfil <strong>Administrador</strong> tem acesso total, independentemente destas caixas.
                </div>
              )}
              <div className="space-y-4">
                {MODULE_GROUPS.map(grp => (
                  <div key={grp.label} className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs uppercase tracking-widest text-yellow-400 font-semibold">{grp.label}</p>
                      <div className="flex gap-1 text-[10px]">
                        <button type="button" onClick={() => setGroupAll(grp, true)}
                          data-testid={`grp-all-${grp.label}`}
                          className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">Todos</button>
                        <button type="button" onClick={() => setGroupAll(grp, false)}
                          data-testid={`grp-none-${grp.label}`}
                          className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30">Nenhum</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {grp.modules.map(m => (
                        <label key={m.key} className="flex items-center gap-2 p-2 rounded hover:bg-zinc-800/50 cursor-pointer" data-testid={`perm-${m.key}`}>
                          <Checkbox
                            checked={form.module_permissions[m.key] === true}
                            onCheckedChange={() => toggleModule(m.key)}
                          />
                          <span className="text-sm text-zinc-200">{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button
              data-testid="submit-user-btn"
              onClick={handleSubmit}
              className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">
              {editingId ? 'Guardar Alterações' : 'Criar Utilizador'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
