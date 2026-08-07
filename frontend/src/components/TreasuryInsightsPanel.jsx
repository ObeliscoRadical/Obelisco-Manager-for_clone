import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, ChevronRight, ShieldAlert, TrendingDown, Wallet } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const fmtEuro = (value) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value || 0);
const fmtPct = (value) => `${(value || 0).toFixed(1)}%`;
const fmtDate = (value) => {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }); } catch { return value; }
};

const statusStyles = {
  ok: 'bg-green-500/10 text-green-300 border-green-500/20',
  attention: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  critical: 'bg-red-500/10 text-red-300 border-red-500/20',
};

function SummaryCard({ label, value, subValue, accent = 'text-white', testId }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">{label}</div>
      <div className={`mt-2 text-2xl font-black ${accent}`}>{value}</div>
      {subValue && <div className="mt-1 text-xs text-zinc-500">{subValue}</div>}
    </div>
  );
}

function PressureDay({ day, maxOutflow }) {
  const intensity = maxOutflow > 0 ? Math.max(0.12, day.outflows / maxOutflow) : 0.08;
  const bg = day.outflows > 0 ? `rgba(250, 204, 21, ${Math.min(intensity, 0.9)})` : 'rgba(39,39,42,0.55)';
  const border = day.critical ? 'border-red-400/40' : 'border-zinc-800';

  return (
    <div
      className={`rounded-xl border p-2 transition-transform hover:-translate-y-0.5 ${border}`}
      style={{ background: bg }}
      data-testid={`pressure-day-${day.date}`}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-950/80">
        <span>{fmtDate(day.date)}</span>
        {day.critical && <span className="font-bold">!</span>}
      </div>
      <div className="mt-3 text-sm font-black text-zinc-950">{day.outflows > 0 ? fmtEuro(day.outflows) : '—'}</div>
      <div className="mt-1 text-[11px] text-zinc-900/80">Saldo: {fmtEuro(day.balance)}</div>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8" data-testid="treasury-panel-loading">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
      <p className="mt-4 text-center text-sm text-zinc-500">A calcular projeção e alertas de tesouraria…</p>
    </div>
  );
}

export const TreasurySummaryStrip = ({ insights, loading, linkTo = '/analise-bancaria', title = 'Tesouraria preditiva' }) => {
  if (loading && !insights) {
    return <LoadingBlock />;
  }

  if (!insights) return null;

  const summary30 = insights.projection?.summary_30d || {};
  const anomalies = insights.anomalies?.count || 0;
  const nextCritical = insights.summary_badges?.next_critical_date;
  const criticalWindow = insights.summary_badges?.critical_window;
  const status = insights.summary_badges?.status || 'ok';

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5" data-testid="treasury-summary-strip">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.22em] text-white">
            <Wallet size={15} className="text-yellow-400" /> {title}
          </div>
          <p className="mt-1 text-sm text-zinc-500">Saídas previstas, desvios e dias de maior pressão financeira.</p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[status] || statusStyles.ok}`} data-testid="treasury-summary-status">
          {status === 'critical' ? 'Atenção imediata' : status === 'attention' ? 'Monitorizar' : 'Saudável'}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Saldo projetado 30d"
          value={fmtEuro(summary30.ending_balance)}
          subValue={summary30.lowest_balance !== undefined ? `Ponto mais baixo: ${fmtEuro(summary30.lowest_balance)}` : null}
          accent={summary30.ending_balance >= 0 ? 'text-green-400' : 'text-red-400'}
          testId="treasury-summary-ending-balance"
        />
        <SummaryCard
          label="Anomalias"
          value={`${anomalies}`}
          subValue={`Limiar: ${fmtPct(insights.anomalies?.threshold_pct || 0)}`}
          accent={anomalies > 0 ? 'text-orange-400' : 'text-zinc-100'}
          testId="treasury-summary-anomalies"
        />
        <SummaryCard
          label="Próximo dia crítico"
          value={nextCritical ? fmtDate(nextCritical.date) : '—'}
          subValue={nextCritical ? `${fmtEuro(nextCritical.total_outflow)} previstos` : 'Sem concentração forte nos próximos dias'}
          accent={nextCritical ? 'text-yellow-400' : 'text-zinc-100'}
          testId="treasury-summary-critical-day"
        />
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4" data-testid="treasury-summary-action-card">
          <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Janela crítica</div>
          <div className="mt-2 text-xl font-black text-white">
            {criticalWindow ? `${fmtDate(criticalWindow.start)} → ${fmtDate(criticalWindow.end)}` : 'Sem janela crítica'}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {criticalWindow ? `${fmtEuro(criticalWindow.total_outflow)} em ${criticalWindow.window_days} dias` : 'A pressão está mais distribuída.'}
          </div>
          <a
            href={linkTo}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-yellow-400 hover:text-yellow-300"
            data-testid="treasury-summary-link"
          >
            Abrir detalhe <ChevronRight size={14} />
          </a>
        </div>
      </div>
    </div>
  );
};

export const TreasuryInsightsPanel = ({
  insights,
  loading,
  balanceInput,
  onBalanceInputChange,
  onApplyBalance,
  onResetBalance,
}) => {
  const [selectedWindow, setSelectedWindow] = useState(30);

  const maxOutflow = useMemo(
    () => Math.max(...((insights?.projection?.daily || []).map(day => day.outflows || 0)), 0),
    [insights]
  );

  if (loading && !insights) return <LoadingBlock />;

  if (!insights) {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center" data-testid="treasury-panel-empty">
        <ShieldAlert className="mx-auto h-10 w-10 text-zinc-700" />
        <p className="mt-3 text-sm text-zinc-400">Ainda não há dados suficientes para a tesouraria preditiva.</p>
      </div>
    );
  }

  const summary = selectedWindow === 60 ? insights.projection?.summary_60d : insights.projection?.summary_30d;
  const anomalies = insights.anomalies?.items || [];
  const daily = insights.projection?.daily || [];
  const criticalWindows = insights.pressure_map?.critical_windows || [];
  const topDays = insights.pressure_map?.top_days || [];
  const upcomingItems = (insights.projection?.items || []).slice(0, 8);
  const autoSource = insights.opening_balance?.source_analysis;
  const status = insights.summary_badges?.status || 'ok';

  return (
    <div className="space-y-5" data-testid="treasury-insights-panel">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.22em] text-white">
              <Wallet size={16} className="text-yellow-400" /> Tesouraria preditiva
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Projeção de caixa com base em custos recorrentes e contas previstas já mapeadas.
            </p>
          </div>
          <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[status] || statusStyles.ok}`} data-testid="treasury-status-pill">
            {status === 'critical' ? 'Risco de tesouraria' : status === 'attention' ? 'Desvio sob vigilância' : 'Situação estável'}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Saldo de partida</div>
                <div className="mt-1 text-2xl font-black text-white" data-testid="treasury-opening-balance-effective">
                  {fmtEuro(insights.opening_balance?.effective)}
                </div>
                <div className="mt-1 text-xs text-zinc-500" data-testid="treasury-opening-balance-source">
                  Automático: {fmtEuro(insights.opening_balance?.automatic)}
                  {autoSource?.date_to ? ` · último extrato até ${fmtDate(autoSource.date_to)}` : ''}
                </div>
              </div>
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.24em] text-zinc-500">Ajuste manual</label>
                  <input
                    data-testid="treasury-opening-balance-input"
                    type="number"
                    step="0.01"
                    value={balanceInput}
                    onChange={(event) => onBalanceInputChange?.(event.target.value)}
                    className="mt-1 h-10 w-40 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-white focus:border-yellow-400/50 focus:outline-none"
                  />
                </div>
                <button
                  data-testid="treasury-apply-balance-btn"
                  onClick={onApplyBalance}
                  className="h-10 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 text-xs font-semibold text-yellow-400 hover:bg-yellow-400/20"
                >
                  Aplicar
                </button>
                <button
                  data-testid="treasury-reset-balance-btn"
                  onClick={onResetBalance}
                  className="h-10 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                >
                  Usar automático
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4" data-testid="treasury-horizon-toggle">
            <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Horizonte visual</div>
            <div className="mt-3 flex gap-2">
              {[30, 60].map(window => (
                <button
                  key={window}
                  onClick={() => setSelectedWindow(window)}
                  data-testid={`treasury-window-${window}`}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${selectedWindow === window ? 'bg-yellow-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                >
                  {window} dias
                </button>
              ))}
            </div>
            <div className="mt-3 text-xs text-zinc-500">
              Considera apenas saídas previstas. Entradas não entram nesta primeira versão.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryCard
          label={`Saldo final ${selectedWindow}d`}
          value={fmtEuro(summary?.ending_balance)}
          subValue={summary?.coverage_status === 'risk' ? 'Há risco de saldo insuficiente.' : 'Cobertura prevista dentro do horizonte.'}
          accent={summary?.ending_balance >= 0 ? 'text-green-400' : 'text-red-400'}
          testId="treasury-kpi-ending-balance"
        />
        <SummaryCard
          label="Ponto mais baixo"
          value={fmtEuro(summary?.lowest_balance)}
          subValue={summary?.next_shortfall_date ? `Primeiro défice: ${fmtDate(summary.next_shortfall_date)}` : 'Sem dias negativos previstos'}
          accent={summary?.lowest_balance >= 0 ? 'text-yellow-400' : 'text-red-400'}
          testId="treasury-kpi-lowest-balance"
        />
        <SummaryCard
          label="Anomalias detetadas"
          value={`${insights.anomalies?.count || 0}`}
          subValue={`Subida acima de ${fmtPct(insights.anomalies?.threshold_pct || 0)}`}
          accent={(insights.anomalies?.count || 0) > 0 ? 'text-orange-400' : 'text-zinc-100'}
          testId="treasury-kpi-anomalies"
        />
        <SummaryCard
          label="Saídas previstas"
          value={fmtEuro(summary?.total_outflows)}
          subValue={`${summary?.days_negative || 0} dia(s) com saldo negativo`}
          accent="text-white"
          testId="treasury-kpi-outflows"
        />
      </div>

      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5" data-testid="treasury-balance-chart-card">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.22em] text-white">
              <TrendingDown size={15} className="text-yellow-400" /> Projeção diária de saldo
            </div>
            <p className="mt-1 text-xs text-zinc-500">Saldo acumulado após cada conjunto de saídas previstas.</p>
          </div>
          <div className="text-xs text-zinc-500">{daily.length} dias analisados</div>
        </div>

        <div className="mt-4 h-[320px]" data-testid="treasury-balance-chart">
          <ResponsiveContainer>
            <AreaChart data={daily} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="treasuryBalanceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#facc15" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#facc15" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="treasuryOutflowGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.26} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="label" stroke="#71717a" fontSize={11} minTickGap={18} />
              <YAxis stroke="#71717a" fontSize={11} tickFormatter={(value) => `${Math.round((value || 0) / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 12 }}
                formatter={(value, name) => [fmtEuro(value), name === 'balance' ? 'Saldo' : 'Saídas do dia']}
                labelFormatter={(label, payload) => payload?.[0]?.payload?.date || label}
              />
              <Area type="monotone" dataKey="outflows" stroke="#ef4444" fill="url(#treasuryOutflowGradient)" strokeWidth={2} name="outflows" />
              <Area type="monotone" dataKey="balance" stroke="#facc15" fill="url(#treasuryBalanceGradient)" strokeWidth={2.2} name="balance" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-4">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5" data-testid="treasury-anomalies-panel">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.22em] text-white">
            <AlertTriangle size={15} className="text-orange-400" /> Detetor de anomalias
          </div>
          <p className="mt-1 text-xs text-zinc-500">Alerta quando um custo recorrente sobe acima do limiar definido.</p>

          {anomalies.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
              Sem desvios relevantes detetados neste momento.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {anomalies.map(item => (
                <div key={`${item.desc_key}-${item.last_date}`} className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4" data-testid={`treasury-anomaly-${item.desc_key}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{item.description}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {item.payment_type} · última cobrança {fmtDate(item.last_date)} · {item.occurrences} ocorrências analisadas
                      </div>
                    </div>
                    <div className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${item.severity === 'high' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-orange-500/30 bg-orange-500/10 text-orange-300'}`}>
                      +{fmtPct(item.increase_pct)}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Média anterior</div>
                      <div className="mt-1 font-black text-zinc-100">{fmtEuro(item.baseline_avg)}</div>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Último valor</div>
                      <div className="mt-1 font-black text-orange-400">{fmtEuro(item.last_amount)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5" data-testid="treasury-pressure-panel">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.22em] text-white">
            <CalendarRange size={15} className="text-yellow-400" /> Mapa de pressão financeira
          </div>
          <p className="mt-1 text-xs text-zinc-500">Dias com maior concentração de saídas previstas dentro do horizonte selecionado.</p>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" data-testid="treasury-pressure-calendar">
            {daily.slice(0, selectedWindow).map(day => (
              <PressureDay key={day.date} day={day} maxOutflow={maxOutflow} />
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4" data-testid="treasury-top-days-card">
              <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Dias do mês mais pressionados</div>
              <div className="mt-3 space-y-2">
                {topDays.slice(0, 5).map(day => (
                  <div key={day.day} className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <div className="font-semibold text-white">{day.label}</div>
                      <div className="text-[11px] text-zinc-500">{day.occurrences} compromisso(s)</div>
                    </div>
                    <div className="font-black text-yellow-400">{fmtEuro(day.total_outflow)}</div>
                  </div>
                ))}
                {topDays.length === 0 && <div className="text-sm text-zinc-500">Sem concentração relevante.</div>}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4" data-testid="treasury-critical-window-card">
              <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Janelas críticas</div>
              <div className="mt-3 space-y-2">
                {criticalWindows.slice(0, 4).map(window => (
                  <div key={`${window.start}-${window.end}`} className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{fmtDate(window.start)} → {fmtDate(window.end)}</div>
                      <div className="text-sm font-black text-red-400">{fmtEuro(window.total_outflow)}</div>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">Janela de {window.window_days} dias consecutivos</div>
                  </div>
                ))}
                {criticalWindows.length === 0 && <div className="text-sm text-zinc-500">Nenhuma janela crítica encontrada.</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5" data-testid="treasury-upcoming-items-panel">
        <div className="text-sm font-black uppercase tracking-[0.22em] text-white">Próximas saídas mapeadas</div>
        <p className="mt-1 text-xs text-zinc-500">Compromissos usados na projeção. Se ajustar o saldo de partida, a lista mantém-se e só o saldo final muda.</p>
        <div className="mt-4 space-y-2">
          {upcomingItems.map((item, index) => (
            <div key={`${item.date}-${item.description}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3" data-testid={`treasury-upcoming-item-${index}`}>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{item.description}</div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  {fmtDate(item.date)} · {item.payment_type} · {item.source === 'predicted_bill' ? 'compromisso previsto' : 'custo recorrente'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black text-red-400">{fmtEuro(item.amount)}</div>
                <div className="text-[11px] text-zinc-500">{item.frequency}</div>
              </div>
            </div>
          ))}
          {upcomingItems.length === 0 && <div className="text-sm text-zinc-500">Sem compromissos previstos dentro do horizonte.</div>}
        </div>
      </div>
    </div>
  );
};
