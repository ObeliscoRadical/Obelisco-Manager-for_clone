import { useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function CompanySwitcher({ compact = false, className = '' }) {
  const { user, switchCompany } = useAuth();
  const [pending, setPending] = useState(false);

  const companies = user?.available_companies || [];
  const activeCompany = useMemo(
    () => companies.find((company) => company.id === user?.company_id) || null,
    [companies, user?.company_id],
  );

  if (!user?.company_id) return null;

  const handleChange = async (nextCompanyId) => {
    if (!nextCompanyId || nextCompanyId === user.company_id || pending) return;
    setPending(true);
    try {
      await switchCompany(nextCompanyId);
      toast.success('Empresa activa atualizada');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Não foi possível trocar de empresa');
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      data-testid={compact ? 'company-switcher-compact' : 'company-switcher'}
      className={cn(
        'rounded-2xl border border-yellow-400/15 bg-zinc-950/60',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        className,
      )}
    >
      <div className={cn('flex items-center gap-2', compact ? 'mb-2' : 'mb-3')}>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400/10 text-yellow-300">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p data-testid="active-company-summary" className={cn('truncate font-semibold text-white', compact ? 'text-sm' : 'text-sm')}>
            {activeCompany?.name || user.company_name || 'Empresa activa'}
          </p>
          <p data-testid="active-company-summary-slug" className="truncate text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            {activeCompany?.slug || user.company_slug || 'tenant-principal'}
          </p>
        </div>
      </div>

      <Select value={user.company_id} onValueChange={handleChange} disabled={pending || companies.length === 0}>
        <SelectTrigger
          data-testid="company-switcher-trigger"
          className={cn(
            'border-zinc-800 bg-zinc-900 text-left text-white focus:ring-yellow-400/40',
            compact ? 'h-9 rounded-xl text-xs' : 'h-10 rounded-xl text-sm',
          )}
        >
          <SelectValue placeholder="Selecionar empresa" />
        </SelectTrigger>
        <SelectContent className="border-zinc-800 bg-zinc-950 text-white">
          {companies.map((company) => (
            <SelectItem
              key={company.id}
              value={company.id}
              data-testid={`company-switcher-item-${company.id}`}
              className="focus:bg-zinc-800 focus:text-white"
            >
              {company.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}