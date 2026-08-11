import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Shield, Users, Settings2, Key, Building2, Layers3, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

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

const emptyForm = { email: '', password: '', name: '', role: 'consulta', module_permissions: {}, company_access_ids: [], company_id: '' };

export default function UtilizadoresPage() {
  const { user, refreshAuth } = useAuth();
  const [users, setUsers] = useState([]);
  const [defaultsPerRole, setDefaultsPerRole] = useState({});
  const [company, setCompany] = useState(null);
  const [companiesData, setCompaniesData] = useState({ current_company_id: '', companies: [] });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const fetchUsers = useCallback(async () => {
    try {
      const [usersRes, rolesRes, companiesRes, companyRes] = await Promise.all([api.get('/users'), api.get('/roles'), api.get('/companies'), api.get('/companies/current')]);
      setUsers(usersRes.data);
      setDefaultsPerRole(rolesRes.data.default_modules_per_role || {});
      setCompaniesData(companiesRes.data || { current_company_id: '', companies: [] });
      setCompany(companyRes.data);
    } catch (err) { toast.error('Erro ao carregar utilizadores'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const availableCompanies = companiesData?.companies || [];
  const currentCompanyId = companiesData?.current_company_id || user?.company_id || '';

  const normalisePrimaryCompany = (companyIds, preferredCompanyId = '') => {
    if (!companyIds.length) return '';
    return companyIds.includes(preferredCompanyId) ? preferredCompanyId : companyIds[0];
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      module_permissions: defaultsPerRole['consulta'] || {},
      company_access_ids: currentCompanyId ? [currentCompanyId] : [],
      company_id: currentCompanyId,
    });
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
      company_access_ids: u.company_access_ids || [u.company_id].filter(Boolean),
      company_id: u.company_id || '',
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

  const toggleCompanyAccess = (companyId) => {
    setForm(prev => {
      const exists = prev.company_access_ids.includes(companyId);
      if (exists && prev.company_access_ids.length === 1) {
        toast.error('Cada utilizador precisa de pelo menos uma empresa');
        return prev;
      }
      const nextAccess = exists
        ? prev.company_access_ids.filter(id => id !== companyId)
        : [...prev.company_access_ids, companyId];
      return {
        ...prev,
        company_access_ids: nextAccess,
        company_id: normalisePrimaryCompany(nextAccess, prev.company_id),
      };
    });
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
        const payload = {
          name: form.name,
          role: form.role,
          module_permissions: form.module_permissions,
          company_access_ids: form.company_access_ids,
          company_id: form.company_id,
        };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editingId}`, payload);
        toast.success('Utilizador atualizado');
      } else {
        await api.post('/users', form);
        toast.success('Utilizador criado');
      }
      setDialogOpen(false);
      setForm(emptyForm);
      if (editingId === user?.id) await refreshAuth();
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
  const primaryCompanyOptions = availableCompanies.filter(companyOption => form.company_access_ids.includes(companyOption.id));

  return (
    <div data-testid="utilizadores-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Utilizadores</h1>
          <p className="text-zinc-400 mt-1 font-medium">Gestão de acessos e permissões granulares por módulo, isolada por empresa</p>
        </div>
        <Button data-testid="new-user-btn" onClick={openCreate} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={16} className="mr-2" /> Novo Utilizador
        </Button>
      </div>

      <Card className="bg-zinc-900 border-zinc-800 rounded-3xl" data-testid="current-company-card">
        <CardContent className="p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-yellow-300">
              <Building2 size={14} /> Tenant actual
            </div>
            <div>
              <p data-testid="current-company-name" className="text-xl font-black text-white">{company?.name || user?.company_name || 'Empresa atual'}</p>
              <p data-testid="current-company-slug-text" className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                {(company?.slug || user?.company_slug || 'tenant-principal')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3" data-testid="company-users-count">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Utilizadores</p>
              <p className="mt-1 text-lg font-black text-white">{company?.stats?.users_count ?? users.length}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3" data-testid="company-budgets-count">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Orçamentos</p>
              <p className="mt-1 text-lg font-black text-white">{company?.stats?.budgets_count ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3" data-testid="company-works-count">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Obras</p>
              <p className="mt-1 text-lg font-black text-white">{company?.stats?.works_count ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3" data-testid="company-invoices-count">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Faturas</p>
              <p className="mt-1 text-lg font-black text-white">{company?.stats?.invoices_count ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  <p data-testid={`user-company-${u.id}`} className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-600">
                    Principal: {u.company_name || company?.name || user?.company_name || 'Empresa atual'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`user-company-access-list-${u.id}`}>
                    {(u.accessible_companies || []).slice(0, 3).map(companyOption => (
                      <Badge key={`${u.id}-${companyOption.id}`} className="bg-zinc-800 text-zinc-200 border border-zinc-700">
                        {companyOption.name}
                      </Badge>
                    ))}
                    {(u.accessible_companies || []).length > 3 && (
                      <Badge className="bg-yellow-400/10 text-yellow-300 border border-yellow-400/20">
                        +{(u.accessible_companies || []).length - 3} empresa(s)
                      </Badge>
                    )}
                  </div>
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

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-4" data-testid="user-company-access-panel">
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-yellow-400" />
                <div>
                  <p className="text-sm font-semibold text-white">Acesso multiempresa</p>
                  <p className="text-xs text-zinc-500">Escolhe as empresas disponíveis para este utilizador e define a empresa principal.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableCompanies.map(companyOption => {
                  const checked = form.company_access_ids.includes(companyOption.id);
                  return (
                    <label
                      key={companyOption.id}
                      className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-3 hover:border-yellow-400/30"
                      data-testid={`company-access-${companyOption.id}`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleCompanyAccess(companyOption.id)} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{companyOption.name}</p>
                        <p className="truncate text-[11px] uppercase tracking-[0.18em] text-zinc-500">{companyOption.slug}</p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div>
                <Label className="text-zinc-300 text-sm flex items-center gap-2"><Crown size={14} className="text-yellow-400" /> Empresa principal</Label>
                <Select value={form.company_id} onValueChange={(value) => setForm(prev => ({ ...prev, company_id: value }))}>
                  <SelectTrigger data-testid="user-primary-company-select" className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl">
                    <SelectValue placeholder="Selecionar empresa principal" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                    {primaryCompanyOptions.map(companyOption => (
                      <SelectItem key={companyOption.id} value={companyOption.id} data-testid={`user-primary-company-option-${companyOption.id}`}>
                        {companyOption.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
