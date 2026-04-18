import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';

const roleLabels = { admin: 'Administrador', orcamentista: 'Orcamentista', comercial: 'Comercial', tecnico: 'Tecnico', consulta: 'Consulta' };
const roleColors = { admin: 'bg-red-500/20 text-red-400', orcamentista: 'bg-yellow-400/20 text-yellow-400', comercial: 'bg-blue-400/20 text-blue-400', tecnico: 'bg-green-500/20 text-green-400', consulta: 'bg-zinc-700 text-zinc-300' };

const ROLES = ['admin', 'orcamentista', 'comercial', 'tecnico', 'consulta'];

export default function UtilizadoresPage() {
  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'consulta' });

  const fetchUsers = useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([api.get('/users'), api.get('/roles')]);
      setUsers(usersRes.data);
      setPermissions(rolesRes.data.permissions || {});
    } catch (err) { console.error(err.message); toast.error('Erro ao carregar utilizadores'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    if (!form.email || !form.password || !form.name) { toast.error('Preencha todos os campos'); return; }
    try {
      await api.post('/users', form);
      toast.success('Utilizador criado');
      setDialogOpen(false);
      setForm({ email: '', password: '', name: '', role: 'consulta' });
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao criar');
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    try {
      await api.put(`/users/${userId}`, { role: newRole });
      toast.success('Perfil atualizado');
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Eliminar este utilizador?')) return;
    try { await api.delete(`/users/${userId}`); toast.success('Eliminado'); fetchUsers(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Erro'); }
  };

  return (
    <div data-testid="utilizadores-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Utilizadores</h1>
          <p className="text-zinc-400 mt-1 font-medium">Gestao de acessos e perfis</p>
        </div>
        <Button data-testid="new-user-btn" onClick={() => setDialogOpen(true)} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold">
          <Plus size={16} className="mr-2" /> Novo Utilizador
        </Button>
      </div>

      {/* Role Permissions Matrix */}
      <Card className="bg-zinc-900 border-zinc-800 rounded-3xl">
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Shield size={18} className="text-yellow-400" /> Matriz de Permissoes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 text-xs uppercase py-2 px-3">Permissao</th>
                  {ROLES.map(r => <th key={r} className="text-center text-zinc-400 text-xs uppercase py-2 px-2">{roleLabels[r]}</th>)}
                </tr>
              </thead>
              <tbody>
                {['view_costs', 'view_margins', 'view_prices', 'edit_budgets', 'edit_settings', 'manage_users'].map(perm => (
                  <tr key={perm} className="border-b border-zinc-800/50">
                    <td className="text-zinc-300 py-2 px-3 capitalize text-xs">{perm.replace(/_/g, ' ')}</td>
                    {ROLES.map(r => (
                      <td key={r} className="text-center py-2 px-2">
                        {permissions[r]?.[perm] ? <span className="text-green-400 font-bold">S</span> : <span className="text-zinc-700">-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-zinc-500"><Users size={48} className="mx-auto mb-4 text-zinc-700" /><p>Sem utilizadores</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map(u => (
            <Card key={u.id} className="bg-zinc-900 border-zinc-800 rounded-3xl">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <Badge className={roleColors[u.role] || 'bg-zinc-700 text-zinc-300'}>{roleLabels[u.role] || u.role}</Badge>
                  <button onClick={() => handleDelete(u.id)} className="text-zinc-600 hover:text-red-400 transition"><Trash2 size={14} /></button>
                </div>
                <p className="text-white font-semibold">{u.name}</p>
                <p className="text-zinc-500 text-sm mb-3">{u.email}</p>
                <div>
                  <label className="text-xs text-zinc-500">Alterar perfil:</label>
                  <select
                    value={u.role}
                    onChange={e => handleChangeRole(u.id, e.target.value)}
                    className="w-full mt-1 h-9 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 text-sm"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
                  </select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight text-white">Novo Utilizador</DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">Crie um novo utilizador com perfil de acesso</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div><Label className="text-zinc-300 text-sm">Nome *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <div><Label className="text-zinc-300 text-sm">Email *</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <div><Label className="text-zinc-300 text-sm">Password *</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="mt-1 bg-zinc-900 border-zinc-800 text-white rounded-xl" /></div>
            <div>
              <Label className="text-zinc-300 text-sm">Perfil</Label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="mt-1 w-full h-10 bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 text-sm">
                {ROLES.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
              </select>
            </div>
            <Button data-testid="create-user-btn" onClick={handleCreate} className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12">Criar Utilizador</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
