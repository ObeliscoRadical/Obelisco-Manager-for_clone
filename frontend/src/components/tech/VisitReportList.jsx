import { FileText, Clock3, CheckCircle2, ChevronRight } from 'lucide-react';

const STATUS_META = {
  rascunho: { label: 'Rascunho', icon: Clock3, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20' },
  final: { label: 'Final', icon: CheckCircle2, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' },
};

export const VisitReportList = ({ reports, selectedId, onSelect }) => {
  if (!reports.length) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/50 p-5 text-center" data-testid="visit-report-empty-state">
        <FileText className="mx-auto mb-3 h-10 w-10 text-zinc-700" />
        <p className="text-sm font-medium text-white">Ainda sem relações de visita</p>
        <p className="mt-1 text-xs text-zinc-500">Crie a primeira diretamente no portal do técnico.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="visit-report-list">
      {reports.map((report) => {
        const status = STATUS_META[report.status] || STATUS_META.rascunho;
        const StatusIcon = status.icon;
        const active = selectedId === report.id;
        return (
          <button
            key={report.id}
            type="button"
            onClick={() => onSelect(report)}
            data-testid={`visit-report-card-${report.id}`}
            className={`w-full rounded-3xl border px-4 py-4 text-left transition-all ${active ? 'border-yellow-400 bg-yellow-500/10' : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{report.header?.work_reference || 'Sem referência'}</p>
                <p className="mt-1 truncate text-sm font-semibold text-white" data-testid={`visit-report-card-client-${report.id}`}>{report.header?.client_name || 'Cliente / obra'}</p>
                <p className="mt-1 text-xs text-zinc-500">{report.scope?.title || 'Sem escopo definido'}</p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-600" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.tone}`} data-testid={`visit-report-card-status-${report.id}`}>
                <StatusIcon className="h-3.5 w-3.5" /> {status.label}
              </span>
              <span className="text-[11px] text-zinc-500">{new Date(report.updated_at || report.created_at).toLocaleDateString('pt-PT')}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};