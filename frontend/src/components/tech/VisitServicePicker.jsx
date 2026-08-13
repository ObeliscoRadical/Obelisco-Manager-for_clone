import { useMemo, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { VISIT_SERVICE_OPTIONS, getVisitServiceMeta } from '../../lib/visitReportCatalog';

export const VisitServicePicker = ({ value, onSelect, testIdPrefix = 'visit-service-picker' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = getVisitServiceMeta(value);
  const grouped = useMemo(() => {
    const filtered = VISIT_SERVICE_OPTIONS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()) || item.category.toLowerCase().includes(query.toLowerCase()));
    return filtered.reduce((acc, item) => {
      acc[item.category] ||= [];
      acc[item.category].push(item);
      return acc;
    }, {});
  }, [query]);
  const SelectedIcon = selected.icon;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          data-testid={`${testIdPrefix}-trigger`}
          className="w-full rounded-2xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-left transition-colors hover:border-yellow-400/50"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow-500 text-zinc-950 shadow-lg shadow-yellow-500/20">
                <SelectedIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Serviço</p>
                <p className="truncate text-sm font-semibold text-white" data-testid={`${testIdPrefix}-value`}>{selected.label}</p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          </div>
        </button>
      </DrawerTrigger>

      <DrawerContent className="border-zinc-800 bg-zinc-950 text-white max-h-[88vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle data-testid={`${testIdPrefix}-title`}>Selecionar equipamento</DrawerTitle>
          <DrawerDescription className="text-zinc-400">Escolha rápida com ícones grandes para uso em obra.</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Procurar equipamento"
              data-testid={`${testIdPrefix}-search`}
              className="h-12 rounded-2xl border-zinc-800 bg-zinc-900 pl-10 text-white placeholder:text-zinc-500"
            />
          </div>
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{category}</p>
              <div className="grid grid-cols-2 gap-2">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      data-testid={`${testIdPrefix}-option-${item.key}`}
                      onClick={() => {
                        onSelect(item);
                        setOpen(false);
                        setQuery('');
                      }}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-yellow-400/40"
                    >
                      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow-500/15 text-yellow-400">
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-white leading-tight">{item.label}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.defaultCircuitType}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
};