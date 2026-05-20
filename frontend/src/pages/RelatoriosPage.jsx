import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { generateAnnualReportPDF } from '../lib/annualReportPdf';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FileBarChart, Download, RefreshCw, Loader2, Filter } from 'lucide-react';
import { toast } from 'sonner';

const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const formatPct = (v) => `${(v ?? 0).toFixed(1).replace('.', ',')}%`;

const EXPENSE_CATEGORIES = [
  'Todas',
  'Material Eléctrico',
  'Material Telecomunicações',
  'Ferramentas',
  'Combustível',
  'Subcontratação',
  'Renda',
  'Comunicações',
  'Software',
  'Marketing',
  'Viatura',
  'Alimentação',
  'Imposto/Taxa',
  'Outros',
];

export default function RelatoriosPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [client, setClient] = useState('all');
  const [category, setCategory] = useState('Todas');
  const [data, setData] = useState(null);
  const [clientsList, setClientsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const years = useMemo(() => {
    const arr = [];
    for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 5; y--) arr.push(y);
    return arr;
  }, [now]);

  const fetchClients = useCallback(async () => {
    try {
      const { data } = await api.get('/invoices/clients');
      setClientsList(Array.isArray(data) ? data : []);
    } catch {
      setClientsList([]);
    }
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = { year };
      if (client && client !== 'all') params.client = client;
      if (category && category !== 'Todas') params.category = category;
      const { data } = await api.get('/reports/annual', { params });
      setData(data);
    } catch (err) {
      console.error('Annual report fetch error:', err.message);
      toast.error('Erro a carregar relatório');
    } finally {
      setLoading(false);
    }
  }, [year, client, category]);

  useEffect(() => { fetchClients(); }, [fetchClients]);
  useEffect(() => { fetchReport(); }, [fetchReport]);

  const onGeneratePDF = async () => {
    if (!data) return;
    setGenerating(true);
    // Cede o ciclo ao React para renderizar o estado "A gerar…" antes de bloquear com jsPDF
    await new Promise((r) => setTimeout(r, 50));
    try {
      const { data: settings } = await api.get('/proposal-settings').catch(() => ({ data: {} }));
      const logo = settings?.logo_base64 || settings?.logo || null;
      await generateAnnualReportPDF(data, settings, logo);
      toast.success('PDF gerado com sucesso');
    } catch (e) {
      console.error('PDF generation error:', e);
      toast.error('Erro a gerar PDF: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setGenerating(false);
    }
  };

  const onReset = () => {
    setClient('all');
    setCategory('Todas');
  };

  const k = data?.kpis;

  return (
    <div data-testid="relatorios-page" className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl">Relatórios</h1>
          <p className="text-zinc-400 mt-1 font-medium">Exportação de relatórios financeiros anuais</p>
        </div>
        <Button
          data-testid="generate-pdf-btn"
          onClick={onGeneratePDF}
          disabled={!data || generating}
          translate="no"
          className="bg-yellow-400 text-zinc-950 hover:bg-yellow-500 rounded-full font-semibold h-12 px-6 notranslate"
        >
          <span className="inline-flex items-center" translate="no">
            {generating ? (
              <Loader2 className="animate-spin mr-2" size={18} />
            ) : (
              <Download size={18} className="mr-2" />
            )}
            <span translate="no">{generating ? 'A gerar PDF…' : 'Exportar PDF Anual'}</span>
          </span>
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-yellow-400" />
          <h3 className="text-white font-bold uppercase tracking-wide text-sm">Filtros do Relatório</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-zinc-400 text-xs uppercase">Ano</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger data-testid="year-select" className="mt-1 bg-zinc-950 border-zinc-800 text-white rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)} className="text-white hover:bg-zinc-800">{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-zinc-400 text-xs uppercase">Cliente</Label>
            <Select value={client} onValueChange={setClient}>
              <SelectTrigger data-testid="client-select" className="mt-1 bg-zinc-950 border-zinc-800 text-white rounded-xl">
                <SelectValue placeholder="Todos os clientes" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 max-h-64">
                <SelectItem value="all" className="text-white hover:bg-zinc-800">Todos os clientes</SelectItem>
                {clientsList.map((c) => (
                  <SelectItem key={c} value={c} className="text-white hover:bg-zinc-800">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-zinc-400 text-xs uppercase">Categoria de despesa</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="category-select" className="mt-1 bg-zinc-950 border-zinc-800 text-white rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 max-h-64">
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-white hover:bg-zinc-800">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              data-testid="reset-filters-btn"
              variant="outline"
              onClick={onReset}
              className="rounded-full bg-zinc-950 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Limpar
            </Button>
            <Button
              data-testid="refresh-btn"
              onClick={fetchReport}
              className="rounded-full bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 border border-yellow-400/30 font-semibold"
            >
              <RefreshCw size={14} className="mr-2" /> Atualizar
            </Button>
          </div>
        </div>
        {(client !== 'all' || category !== 'Todas') && (
          <div className="mt-3 flex items-center gap-2 text-xs text-yellow-400">
            <Badge className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/30">{data?.scope_label || ''}</Badge>
            {client !== 'all' && (
              <span className="text-zinc-500">Ao filtrar por cliente, despesas e salários (que não são associados a cliente) não aparecem.</span>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPI preview cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <PreviewKpi label="Entradas (Faturas pagas)" value={formatEuro(k.total_in)} accent="text-green-400" sub={`${k.invoices_count} fatura(s) emitidas`} testid="kpi-entradas" />
            <PreviewKpi label="Saídas Totais" value={formatEuro(k.total_out)} accent="text-red-400" sub={`${k.expenses_count} despesa(s) + salários`} testid="kpi-saidas" />
            <PreviewKpi label="Resultado Líquido" value={formatEuro(k.result)} accent={k.result < 0 ? 'text-red-400' : 'text-yellow-400'} sub={`Margem ${formatPct(k.margin_pct)}`} testid="kpi-resultado" />
            <PreviewKpi label="A Receber" value={formatEuro(k.pending_total)} accent="text-blue-400" sub="Saldo de faturas em aberto" testid="kpi-receber" />
          </div>

          {/* Quebra das saídas */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <PreviewKpi compact label="Despesas Variáveis" value={formatEuro(k.total_out_variable)} accent="text-white" />
            <PreviewKpi compact label="Despesas Fixas" value={formatEuro(k.total_out_fixed)} accent="text-white" />
            <PreviewKpi compact label="Despesas Obra" value={formatEuro(k.total_out_obra)} accent="text-white" />
            <PreviewKpi compact label="Salários (Custo Total)" value={formatEuro(k.total_payroll)} accent="text-white" />
          </div>

          {/* IVA */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <h3 className="text-white font-bold uppercase tracking-wide text-sm mb-4">IVA do Ano</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-zinc-500 uppercase">IVA Liquidado</div>
                <div className="text-2xl font-black text-white">{formatEuro(k.vat_charged)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase">IVA Suportado</div>
                <div className="text-2xl font-black text-white">{formatEuro(k.vat_paid)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase">{k.vat_balance >= 0 ? 'IVA a Entregar' : 'IVA a Recuperar'}</div>
                <div className={`text-2xl font-black ${k.vat_balance >= 0 ? 'text-red-400' : 'text-green-400'}`}>{formatEuro(Math.abs(k.vat_balance))}</div>
              </div>
            </div>
          </div>

          {/* Resumo Mensal */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
            <div className="p-5 border-b border-zinc-800">
              <h3 className="text-white font-bold uppercase tracking-wide text-sm">Movimento Mensal {year}</h3>
              <p className="text-xs text-zinc-500 mt-1">Pré-visualização compacta. O PDF inclui todos os movimentos linha-a-linha.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="monthly-table">
                <thead className="bg-zinc-950/80 text-zinc-500 uppercase text-xs">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Mês</th>
                    <th className="text-right px-2 py-3 font-semibold">Entradas</th>
                    <th className="text-right px-2 py-3 font-semibold">Variáveis</th>
                    <th className="text-right px-2 py-3 font-semibold">Fixas</th>
                    <th className="text-right px-2 py-3 font-semibold">Obra</th>
                    <th className="text-right px-2 py-3 font-semibold">Salários</th>
                    <th className="text-right px-2 py-3 font-semibold">Saídas</th>
                    <th className="text-right px-2 py-3 font-semibold">Resultado</th>
                    <th className="text-right px-2 py-3 font-semibold">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.map((m) => (
                    <tr key={m.month} className="border-t border-zinc-800 hover:bg-zinc-950/40">
                      <td className="px-4 py-2 text-white font-medium">{m.month_label}</td>
                      <td className="px-2 py-2 text-right text-green-400">{formatEuro(m.entries)}</td>
                      <td className="px-2 py-2 text-right text-zinc-400">{formatEuro(m.expenses_variable)}</td>
                      <td className="px-2 py-2 text-right text-zinc-400">{formatEuro(m.expenses_fixed)}</td>
                      <td className="px-2 py-2 text-right text-zinc-400">{formatEuro(m.expenses_obra)}</td>
                      <td className="px-2 py-2 text-right text-zinc-400">{formatEuro(m.payroll)}</td>
                      <td className="px-2 py-2 text-right text-red-400">{formatEuro(m.total_out)}</td>
                      <td className={`px-2 py-2 text-right font-bold ${m.net < 0 ? 'text-red-400' : 'text-yellow-400'}`}>{formatEuro(m.net)}</td>
                      <td className={`px-2 py-2 text-right font-bold ${m.accumulated < 0 ? 'text-red-400' : 'text-white'}`}>{formatEuro(m.accumulated)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-yellow-400 text-zinc-950 font-black">
                  <tr>
                    <td className="px-4 py-2">TOTAL</td>
                    <td className="px-2 py-2 text-right">{formatEuro(k.total_in)}</td>
                    <td className="px-2 py-2 text-right">{formatEuro(k.total_out_variable)}</td>
                    <td className="px-2 py-2 text-right">{formatEuro(k.total_out_fixed)}</td>
                    <td className="px-2 py-2 text-right">{formatEuro(k.total_out_obra)}</td>
                    <td className="px-2 py-2 text-right">{formatEuro(k.total_payroll)}</td>
                    <td className="px-2 py-2 text-right">{formatEuro(k.total_out)}</td>
                    <td className="px-2 py-2 text-right">{formatEuro(k.result)}</td>
                    <td className="px-2 py-2 text-right">{formatEuro(k.result)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Top Categorias + Top Clientes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
              <h3 className="text-white font-bold uppercase tracking-wide text-sm mb-4">Top Categorias de Despesa</h3>
              {data.categories_expense.length === 0 && <p className="text-zinc-500 text-sm">Sem dados.</p>}
              <div className="space-y-2">
                {data.categories_expense.slice(0, 8).map((c) => (
                  <div key={c.category}>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-300">{c.category}</span>
                      <span className="text-white font-semibold">{formatEuro(c.total)} <span className="text-zinc-500 text-xs">({formatPct(c.pct)})</span></span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-yellow-400" style={{ width: `${Math.min(c.pct, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
              <h3 className="text-white font-bold uppercase tracking-wide text-sm mb-4">Top Clientes por Faturação</h3>
              {data.clients_revenue.length === 0 && <p className="text-zinc-500 text-sm">Sem dados.</p>}
              <div className="space-y-2">
                {data.clients_revenue.slice(0, 8).map((c) => (
                  <div key={c.client}>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-300 truncate">{c.client}</span>
                      <span className="text-white font-semibold">{formatEuro(c.total)} <span className="text-zinc-500 text-xs">({formatPct(c.pct)})</span></span>
                    </div>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-green-400" style={{ width: `${Math.min(c.pct, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Resumo do que vai estar no PDF */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
            <h3 className="text-white font-bold uppercase tracking-wide text-sm mb-4 flex items-center gap-2">
              <FileBarChart size={16} className="text-yellow-400" /> O que vai estar no PDF
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
              <PdfSummaryItem label="Capa anual" value="1 pág" />
              <PdfSummaryItem label="KPIs + Mensal" value="1 pág" />
              <PdfSummaryItem label="Gráficos" value="2 pág" />
              <PdfSummaryItem label="Faturas" value={`${data.invoices.length} linhas`} />
              <PdfSummaryItem label="Despesas" value={`${data.expenses.length} linhas`} />
              <PdfSummaryItem label="Salários" value={`${data.payroll_runs.length} runs`} />
              <PdfSummaryItem label="Obras" value={`${data.works.length} (${k.works_in_progress_count} em curso)`} />
              <PdfSummaryItem label="IVA detalhe" value="✓ incluído" />
              <PdfSummaryItem label="Top categorias" value={`${data.categories_expense.length}`} />
              <PdfSummaryItem label="Top clientes" value={`${data.clients_revenue.length}`} />
              <PdfSummaryItem label="Cashflow acum." value="Linha 12m" />
              <PdfSummaryItem label="Donuts" value="Despesas + Clientes" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PreviewKpi({ label, value, accent, sub, testid, compact }) {
  return (
    <div data-testid={testid} className={`bg-zinc-900 border border-zinc-800 rounded-${compact ? '2xl' : '3xl'} ${compact ? 'px-4 py-3' : 'p-5'}`}>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{label}</div>
      <div className={`${compact ? 'text-xl' : 'text-3xl'} font-black mt-1 ${accent}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-1 truncate">{sub}</div>}
    </div>
  );
}

function PdfSummaryItem({ label, value }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-sm text-white font-bold mt-0.5">{value}</div>
    </div>
  );
}
