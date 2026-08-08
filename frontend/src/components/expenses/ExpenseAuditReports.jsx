import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, Loader2, Download } from 'lucide-react';

export const ExpenseAuditReports = ({ auditReports, monthName, downloadingReportId, onDownload }) => {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5" data-testid="expense-reconciliation-audit-section">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-white font-black uppercase tracking-wide text-sm">
            <History size={16} className="text-yellow-400" /> Auditoria de Reconciliações
          </div>
          <p className="mt-1 text-sm text-zinc-500">Relatórios Excel persistidos após cada verificação, com utilizador, data/hora, totais e regras aplicadas.</p>
        </div>
        <div className="text-xs text-zinc-500">{auditReports.length} relatório(s) recentes</div>
      </div>

      <div className="mt-4 space-y-3">
        {auditReports.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-6 text-sm text-zinc-500 text-center">
            Ainda não existem relatórios de reconciliação gravados.
          </div>
        ) : auditReports.map((report) => (
          <div key={report.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-4 flex items-center justify-between gap-4 flex-wrap" data-testid={`expense-audit-report-${report.id}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-white truncate">{report.file_name}</p>
                <Badge className="bg-blue-500/15 text-blue-400 border-0 text-[10px]">{report.scope?.month ? `${monthName(report.scope.month)} ${report.scope.year}` : 'Auditoria'}</Badge>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{new Date(report.created_at).toLocaleString('pt-PT')} · por {report.created_by_name || report.created_by_email || 'admin'}</p>
              <div className="mt-2 flex gap-3 flex-wrap text-[11px] text-zinc-400">
                <span>Registos analisados: <span className="text-white font-semibold">{report.summary?.records_scanned || 0}</span></span>
                <span>Reconciliadas: <span className="text-blue-400 font-semibold">{report.result?.reconciled || 0}</span></span>
                <span>Duplicados removidos: <span className="text-orange-400 font-semibold">{report.result?.duplicates_removed || 0}</span></span>
              </div>
            </div>
            <Button type="button" onClick={() => onDownload(report)} disabled={downloadingReportId === report.id} className="rounded-full bg-yellow-400 text-zinc-950 hover:bg-yellow-500 font-semibold" data-testid={`expense-audit-download-${report.id}`}>
              {downloadingReportId === report.id ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Download size={16} className="mr-2" />}
              Descarregar Excel
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};