import { CheckCircle2, Phone, CalendarDays, FolderKanban } from 'lucide-react';
import { getVisitServiceMeta } from '../../lib/visitReportCatalog';

const formatDate = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('pt-PT');
  } catch {
    return value;
  }
};

export const VisitReportPreview = ({ report, companyName = 'Obelisco Radical', technicianName = 'Técnico' }) => {
  const circuits = report?.circuits || [];
  const board = report?.distribution_board || {};

  return (
    <section className="overflow-hidden rounded-[28px] border border-zinc-800 bg-[#f7f6f1] text-zinc-950 shadow-2xl shadow-black/20" data-testid="visit-report-preview">
      <div className="bg-[#111111] px-5 py-5 text-white sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#c59f25]">Relação de visita em obra</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl" data-testid="visit-report-preview-title">{companyName}</h2>
            <p className="mt-1 text-sm text-zinc-300">Relatório técnico de campo pronto para cliente e administração.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Técnico</p>
            <p className="mt-1 text-sm font-semibold text-white" data-testid="visit-report-preview-technician">{technicianName}</p>
          </div>
        </div>
      </div>

      <div className="border-b border-[#d7d1bf] bg-[#c59f25] px-5 py-3 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-[#111111] sm:px-7">
        Layout oficial de visita — cabeçalho escuro, tabela mostarda e rodapé técnico
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-7 sm:py-7">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-[#ddd6c4] bg-white px-4 py-4" data-testid="visit-report-preview-client-block">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Cliente / Obra</p>
            <p className="mt-2 text-lg font-black text-zinc-950" data-testid="visit-report-preview-client">{report?.header?.client_name || '—'}</p>
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#c59f25]" /> {formatDate(report?.header?.visit_date)}</div>
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-[#c59f25]" /> {report?.header?.client_phone || '—'}</div>
            </div>
          </div>
          <div className="rounded-3xl border border-[#ddd6c4] bg-white px-4 py-4" data-testid="visit-report-preview-reference-block">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Referência da obra</p>
            <p className="mt-2 text-lg font-black text-zinc-950" data-testid="visit-report-preview-reference">{report?.header?.work_reference || '—'}</p>
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
              <FolderKanban className="h-4 w-4 text-[#c59f25]" />
              <span>{report?.scope?.title || 'Escopo por definir'}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#ddd6c4] bg-white p-5" data-testid="visit-report-preview-scope">
          <div className="inline-flex rounded-full bg-[#111111] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#f4cf59]">Escopo</div>
          <h3 className="mt-3 text-xl font-black text-zinc-950" data-testid="visit-report-preview-scope-title">{report?.scope?.title || 'Sem título'}</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700" data-testid="visit-report-preview-scope-description">{report?.scope?.description || 'Sem descrição geral.'}</p>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-[#d5c08b] bg-white" data-testid="visit-report-preview-circuits">
          <div className="grid grid-cols-[1.5fr,0.6fr,1fr,1fr] gap-2 bg-[#c59f25] px-4 py-3 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-[#111111] max-sm:hidden">
            <div>Serviço</div>
            <div>Qtd</div>
            <div>Tipo</div>
            <div>Ponto</div>
          </div>
          <div className="divide-y divide-[#ece7da]">
            {circuits.length === 0 && <p className="px-4 py-5 text-sm text-zinc-500">Sem circuitos adicionados.</p>}
            {circuits.map((circuit, index) => {
              const service = getVisitServiceMeta(circuit.service_key);
              const Icon = service.icon;
              return (
                <div
                  key={circuit.id || `${circuit.description}-${index}`}
                  className={`grid gap-3 px-4 py-4 text-sm ${index % 2 === 0 ? 'bg-white' : 'bg-[#fbfaf6]'} sm:grid-cols-[1.5fr,0.6fr,1fr,1fr] sm:items-center`}
                  data-testid={`visit-report-preview-circuit-${index}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#111111] text-[#f4cf59]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-zinc-950">{circuit.description}</p>
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 sm:hidden">{service.label}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 sm:hidden">Qtd</p>
                    <p className="font-semibold text-zinc-900">{circuit.quantity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 sm:hidden">Tipo</p>
                    <p className="font-semibold text-zinc-900">{circuit.circuit_type || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 sm:hidden">Ponto</p>
                    <p className="font-semibold text-zinc-900">{circuit.usage_point || '—'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[30px] border border-[#d9d4c8] bg-[#ece9df] p-4 sm:p-5" data-testid="visit-report-preview-board">
          <div className="grid gap-4 sm:grid-cols-[1.05fr,1fr] sm:items-stretch">
            <div className="overflow-hidden rounded-[24px] border border-white/70 bg-white/80">
              {board.photo_data_url ? (
                <img src={board.photo_data_url} alt="Quadro de distribuição" className="aspect-[4/3] w-full object-cover" data-testid="visit-report-preview-board-image" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-zinc-200 text-center text-sm text-zinc-500" data-testid="visit-report-preview-board-placeholder">
                  Foto do quadro de distribuição
                </div>
              )}
            </div>
            <div className="rounded-[24px] bg-[#f8f6ef] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Quadro de distribuição</p>
              <div className="mt-4 space-y-3">
                {[
                  ['Módulos', board.modules],
                  ['Dimensões', board.dimensions],
                  ['Tipo de instalação', board.installation_type],
                  ['Finalidade', board.purpose],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start gap-3" data-testid={`visit-report-preview-board-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#c59f25]" />
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
                      <p className="text-sm font-semibold text-zinc-950">{value || '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};