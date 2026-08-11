import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Crown, PencilLine, Plus, Users2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

const emptyCompanyForm = { name: '', subtitle: '', phone: '', email: '', website: '', address: '', nif: '' };

export default function EmpresasPage() {
  const { user, refreshAuth } = useAuth();
  const [companiesData, setCompaniesData] = useState({ current_company_id: '', primary_company_id: '', companies: [] });
  const [loading, setLoading] = useState(true);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [accessDialog, setAccessDialog] = useState({ open: false, company: null, users: [], loading: false });

  const companies = companiesData?.companies || [];

  const fetchCompanies = useCallback(async () => {
    try {
      const { data } = await api.get('/companies');
      setCompaniesData(data || { current_company_id: '', primary_company_id: '', companies: [] });
    } catch (err) {
      toast.error('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const openCreateCompany = () => {
    setEditingCompany(null);
    setCompanyForm(emptyCompanyForm);
    setCompanyDialogOpen(true);
  };

  const openEditCompany = (company) => {
    setEditingCompany(company);
    setCompanyForm({
      name: company.name || '',
      subtitle: company.subtitle || '',
      phone: company.phone || '',
      email: company.email || '',
      website: company.website || '',
      address: company.address || '',
      nif: company.nif || '',
    });
    setCompanyDialogOpen(true);
  };

  const submitCompany = async () => {
    if (!companyForm.name.trim()) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }
    try {
      if (editingCompany) {
        await api.put(`/companies/${editingCompany.id}`, companyForm);
        toast.success('Empresa atualizada');
      } else {
        await api.post('/companies', companyForm);
        toast.success('Empresa criada');
      }
      setCompanyDialogOpen(false);
      setEditingCompany(null);
      setCompanyForm(emptyCompanyForm);
      await Promise.all([fetchCompanies(), refreshAuth()]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao guardar empresa');
    }
  };

  const fetchCompanyUsers = useCallback(async (company) => {
    setAccessDialog({ open: true, company, users: [], loading: true });
    try {
      const { data } = await api.get(`/companies/${company.id}/users`);
      setAccessDialog({ open: true, company: data.company || company, users: data.users || [], loading: false });
    } catch (err) {
      toast.error('Erro ao carregar acessos da empresa');
      setAccessDialog({ open: false, company: null, users: [], loading: false });
    }
  }, []);

  const refreshAccessDialog = useCallback(async () => {
    if (!accessDialog.company?.id) return;
    const { data } = await api.get(`/companies/${accessDialog.company.id}/users`);
    setAccessDialog({ open: true, company: data.company || accessDialog.company, users: data.users || [], loading: false });
  }, [accessDialog.company]);

  const updateUserAccess = async (targetUser, nextAccessIds, nextPrimaryCompanyId) => {
    try {
      await api.put(`/users/${targetUser.id}`, {
        company_access_ids: nextAccessIds,
        company_id: nextPrimaryCompanyId,
      });
      if (targetUser.id === user?.id) await refreshAuth();
      await Promise.all([refreshAccessDialog(), fetchCompanies()]);
      toast.success('Acesso multiempresa atualizado');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao atualizar acessos');
    }
  };

  const handleToggleAccess = async (targetUser) => {
    const companyId = accessDialog.company?.id;
    if (!companyId) return;
    const currentAccessIds = targetUser.company_access_ids || [];
    const hasAccess = currentAccessIds.includes(companyId);
    if (hasAccess && currentAccessIds.length === 1) {
      toast.error('O utilizador precisa de pelo menos uma empresa');
      return;
    }
    const nextAccessIds = hasAccess
      ? currentAccessIds.filter(id => id !== companyId)
      : [...currentAccessIds, companyId];
    const nextPrimaryCompanyId = hasAccess && targetUser.company_id === companyId
      ? nextAccessIds[0]
      : (targetUser.company_id || nextAccessIds[0]);
    await updateUserAccess(targetUser, nextAccessIds, nextPrimaryCompanyId);
  };

  const handleSetPrimary = async (targetUser) => {
    const companyId = accessDialog.company?.id;
    if (!companyId) return;
    const nextAccessIds = targetUser.company_access_ids?.includes(companyId)
      ? targetUser.company_access_ids
      : [...(targetUser.company_access_ids || []), companyId];
    await updateUserAccess(targetUser, nextAccessIds, companyId);
  };

  const activeCompany = useMemo(() => companies.find(company => company.id === companiesData.current_company_id), [companies, companiesData.current_company_id]);

  return (
    <div data-testid="empresas-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Empresas</h1>
          <p className="mt-1 text-zinc-400 font-medium">Gestão visual de tenants, contexto activo e acessos multiempresa.</p>
        </div>
        <Button data-testid="new-company-btn" onClick={openCreateCompany} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={16} className="mr-2" /> Nova Empresa
        </Button>
      </div>

      <Card className="bg-zinc-900 border-zinc-800 rounded-3xl" data-testid="companies-overview-card">
        <CardContent className="p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-yellow-300">
              <Building2 size={14} /> Tenant activo
            </div>
            <p data-testid="companies-active-name" className="mt-3 text-2xl font-black text-white">{activeCompany?.name || user?.company_name || 'Empresa activa'}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{activeCompany?.slug || user?.company_slug || 'tenant-principal'}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3" data-testid="companies-count-card">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Tenants</p>
              <p className="mt-1 text-lg font-black text-white">{companies.length}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Principal</p>
              <p className="mt-1 text-sm font-semibold text-white truncate">{companies.find(company => company.id === companiesData.primary_company_id)?.name || '—'}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Utilizadores</p>
              <p className="mt-1 text-lg font-black text-white">{companies.reduce((total, company) => total + (company.stats?.users_count || 0), 0)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Obras</p>
              <p className="mt-1 text-lg font-black text-white">{companies.reduce((total, company) => total + (company.stats?.works_count || 0), 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {companies.map(company => (
            <Card key={company.id} className="bg-zinc-900 border-zinc-800 rounded-3xl" data-testid={`company-card-${company.id}`}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-black text-white">{company.name}</p>
                      {company.is_active && <Badge className="bg-yellow-400/15 text-yellow-300 border border-yellow-400/20">Ativa agora</Badge>}
                      {company.is_primary && <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">Principal</Badge>}
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{company.slug}</p>
                    <p className="mt-2 text-sm text-zinc-400">{company.subtitle || 'Sem subtítulo definido'}</p>
                  </div>

                  <Button variant="outline" data-testid={`edit-company-${company.id}`} onClick={() => openEditCompany(company)} className="rounded-full border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-800 hover:text-white">
                    <PencilLine size={16} className="mr-2" /> Editar
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ['Utilizadores', company.stats?.users_count || 0],
                    ['Orçamentos', company.stats?.budgets_count || 0],
                    ['Obras', company.stats?.works_count || 0],
                    ['Faturas', company.stats?.invoices_count || 0],
                  ].map(([label, value]) => (
                    <div key={`${company.id}-${label}`} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
                      <p className="mt-1 text-lg font-black text-white">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-zinc-300">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3" data-testid={`company-contact-${company.id}`}>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Contacto</p>
                    <p className="mt-1 truncate">{company.email || company.phone || 'Sem contacto'}</p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3" data-testid={`company-nif-${company.id}`}>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">NIF / Website</p>
                    <p className="mt-1 truncate">{company.nif || company.website || 'Sem dados'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button data-testid={`manage-company-access-${company.id}`} onClick={() => fetchCompanyUsers(company)} className="rounded-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold">
                    <Users2 size={16} className="mr-2" /> Gerir acessos
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">{editingCompany ? 'Editar empresa' : 'Nova empresa'}</DialogTitle>
            <DialogDescription className="text-zinc-500">Define os dados principais do tenant. Os restantes acessos multiempresa ficam disponíveis também em Utilizadores.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {[
              ['name', 'Nome *'],
              ['subtitle', 'Subtítulo'],
              ['phone', 'Telefone'],
              ['email', 'Email'],
              ['website', 'Website'],
              ['address', 'Morada'],
              ['nif', 'NIF'],
            ].map(([field, label]) => (
              <div key={field} className={field === 'address' ? 'sm:col-span-2' : ''}>
                <Label className="text-zinc-300 text-sm">{label}</Label>
                <Input
                  data-testid={`company-form-${field}`}
                  value={companyForm[field] || ''}
                  onChange={(event) => setCompanyForm(prev => ({ ...prev, [field]: event.target.value }))}
                  className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl"
                />
              </div>
            ))}
          </div>

          <Button data-testid="submit-company-btn" onClick={submitCompany} className="mt-6 w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">
            {editingCompany ? 'Guardar Empresa' : 'Criar Empresa'}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={accessDialog.open} onOpenChange={(open) => setAccessDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">Acessos multiempresa</DialogTitle>
            <DialogDescription className="text-zinc-500">Gerir quem entra neste tenant e qual é a empresa principal de cada utilizador.</DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-4 mb-4">
            <p data-testid="access-dialog-company-name" className="text-lg font-black text-white">{accessDialog.company?.name || 'Empresa'}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{accessDialog.company?.slug || 'tenant'}</p>
          </div>

          {accessDialog.loading ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {accessDialog.users.map(targetUser => (
                <div key={targetUser.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between" data-testid={`company-access-user-${targetUser.id}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{targetUser.name}</p>
                      {targetUser.is_primary_for_company && (
                        <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                          <Crown size={12} className="mr-1" /> Principal aqui
                        </Badge>
                      )}
                      {targetUser.has_access_to_company ? (
                        <Badge className="bg-yellow-400/15 text-yellow-300 border border-yellow-400/20">Tem acesso</Badge>
                      ) : (
                        <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-700">Sem acesso</Badge>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500 truncate">{targetUser.email}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-600">Empresa principal atual: {targetUser.company_name || '—'}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <label className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200" data-testid={`toggle-company-user-${targetUser.id}`}>
                      <Checkbox checked={targetUser.has_access_to_company} onCheckedChange={() => handleToggleAccess(targetUser)} />
                      Acesso
                    </label>
                    <Button
                      variant="outline"
                      data-testid={`set-primary-company-user-${targetUser.id}`}
                      onClick={() => handleSetPrimary(targetUser)}
                      className="rounded-full border-zinc-700 bg-zinc-950 text-zinc-200 hover:bg-zinc-800 hover:text-white"
                    >
                      <Crown size={14} className="mr-2" /> Tornar principal
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}