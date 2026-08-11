// Relatório Financeiro Anual — Obelisco Radical
// Multi-page A4 retrato. Identidade preto/amarelo/branco. Gráficos vetoriais + donuts via canvas.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getPdfBranding } from './pdfBranding';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;

const PALETTE = [
  [250, 204, 21],   // yellow
  [37, 99, 235],    // blue
  [22, 163, 74],    // green
  [220, 38, 38],    // red
  [168, 85, 247],   // purple
  [249, 115, 22],   // orange
  [14, 165, 233],   // sky
  [236, 72, 153],   // pink
  [132, 204, 22],   // lime
  [115, 115, 115],  // gray
];

const fmtEuro = (v) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const fmtNum = (v, d = 0) =>
  new Intl.NumberFormat('pt-PT', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v || 0);
const fmtPct = (v) => `${(v ?? 0).toFixed(1).replace('.', ',')}%`;
const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-PT'); } catch { return iso; }
};

const getThemeFromDoc = (doc, meta = null) => meta?.theme || doc?.__reportMeta?.theme || getPdfBranding();

/* =============================================================
   HELPERS
   ============================================================= */

function ensurePage(doc, y, needed = 30) {
  if (y + needed > PAGE_H - 14) {
    doc.addPage();
    return drawPageHeader(doc, doc.__reportMeta);
  }
  return y;
}

function drawCoverHeader(doc, meta) {
  const theme = getThemeFromDoc(doc, meta);
  const BLACK = theme.dark;
  const YELLOW = theme.primary;
  const WHITE = theme.light;
  const GREY_MED = theme.mutedMid;
  const { year, scope_label, generated_at, logoBase64, companyName } = meta;
  // Full black background top
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

  // Yellow accent stripes
  doc.setFillColor(...YELLOW);
  doc.rect(0, 50, PAGE_W, 3, 'F');
  doc.rect(0, PAGE_H - 50, PAGE_W, 3, 'F');

  // Decorative dashes
  for (let x = 0; x < PAGE_W; x += 12) {
    doc.rect(x, 56, 6, 1.2, 'F');
    doc.rect(x, PAGE_H - 57, 6, 1.2, 'F');
  }

  // Logo center top
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', PAGE_W / 2 - 14, 18, 28, 28); } catch { /* ignore */ }
  }

  // Big yellow title
  doc.setTextColor(...YELLOW);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text((companyName || 'Obelisco Radical').toUpperCase(), PAGE_W / 2, 80, { align: 'center' });

  doc.setTextColor(...WHITE);
  doc.setFontSize(38);
  doc.text('RELATÓRIO', PAGE_W / 2, 120, { align: 'center' });
  doc.text('FINANCEIRO', PAGE_W / 2, 138, { align: 'center' });

  doc.setTextColor(...YELLOW);
  doc.setFontSize(72);
  doc.text(String(year), PAGE_W / 2, 192, { align: 'center' });

  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  doc.text(scope_label || `Ano ${year}`, PAGE_W / 2, 210, { align: 'center' });

  doc.setTextColor(...GREY_MED);
  doc.setFontSize(8);
  doc.text(`Emitido em ${new Date(generated_at || Date.now()).toLocaleString('pt-PT')}`, PAGE_W / 2, PAGE_H - 30, { align: 'center' });
  doc.text(companyName || 'Documento interno · Confidencial', PAGE_W / 2, PAGE_H - 24, { align: 'center' });
}

function drawPageHeader(doc, meta) {
  const theme = getThemeFromDoc(doc, meta);
  const BLACK = theme.dark;
  const YELLOW = theme.primary;
  const WHITE = theme.light;
  // top black strip
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, PAGE_W, 16, 'F');
  doc.setFillColor(...YELLOW);
  doc.rect(0, 15, PAGE_W, 1.5, 'F');

  if (meta?.logoBase64) {
    try { doc.addImage(meta.logoBase64, 'PNG', 6, 2, 12, 12); } catch { /* ignore */ }
  }
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('RELATÓRIO FINANCEIRO ANUAL', 22, 10);
  doc.setTextColor(...YELLOW);
  doc.setFontSize(8);
  doc.text(meta?.scope_label || '', PAGE_W - MARGIN, 10, { align: 'right' });
  return 24;
}

function drawFooter(doc, totalPages, meta) {
  const theme = getThemeFromDoc(doc, meta);
  const BLACK = theme.dark;
  const YELLOW = theme.primary;
  const WHITE = theme.light;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p === 1) continue; // cover skips classic footer
    doc.setFillColor(...BLACK);
    doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');
    doc.setTextColor(...YELLOW);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${String(meta?.companyName || 'OBELISCO RADICAL').toUpperCase()} · Relatório Financeiro Anual · Confidencial`, MARGIN, PAGE_H - 4);
    doc.setTextColor(...WHITE);
    doc.text(`${p}/${totalPages}`, PAGE_W - MARGIN, PAGE_H - 4, { align: 'right' });
  }
}

/* =============================================================
   CHARTS — desenhados directamente em jsPDF (vetoriais)
   ============================================================= */

function drawBarChartMonthly(doc, x, y, w, h, monthly) {
  const theme = getThemeFromDoc(doc);
  const GREEN = theme.green;
  const RED = theme.red;
  const YELLOW = theme.primary;
  const BLACK = theme.dark;
  const GREY_DARK = theme.mutedDark;
  // 3 séries por mês: entries, total_out, net (net pode ser negativo)
  const labels = monthly.map((m) => m.month_label);
  const series = [
    { name: 'Entradas', values: monthly.map((m) => m.entries), color: GREEN },
    { name: 'Saídas', values: monthly.map((m) => m.total_out), color: RED },
    { name: 'Resultado', values: monthly.map((m) => m.net), color: YELLOW },
  ];

  const allVals = series.flatMap((s) => s.values);
  const maxV = Math.max(0, ...allVals, 1);
  const minV = Math.min(0, ...allVals);
  const range = maxV - minV || 1;

  const padTop = 8;
  const padBottom = 14;
  const padLeft = 18;
  const padRight = 4;
  const chartX = x + padLeft;
  const chartY = y + padTop;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const zeroY = chartY + chartH - ((0 - minV) / range) * chartH;

  // background
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');

  // gridlines (5 horizontal)
  doc.setDrawColor(225, 225, 225);
  doc.setLineWidth(0.15);
  for (let g = 0; g <= 4; g++) {
    const gy = chartY + (chartH * g) / 4;
    doc.line(chartX, gy, chartX + chartW, gy);
    const v = maxV - (range * g) / 4;
    doc.setTextColor(...GREY_DARK);
    doc.setFontSize(6);
    doc.text(fmtNum(Math.round(v / 100) * 100, 0), chartX - 2, gy + 1.4, { align: 'right' });
  }

  // axis baseline (zero line)
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.4);
  doc.line(chartX, zeroY, chartX + chartW, zeroY);

  const slotW = chartW / labels.length;
  const groupGap = slotW * 0.18;
  const barsInGroup = series.length;
  const barW = (slotW - groupGap) / barsInGroup;

  series.forEach((s, si) => {
    doc.setFillColor(...s.color);
    s.values.forEach((val, i) => {
      const cx = chartX + slotW * i + groupGap / 2 + si * barW;
      if (val >= 0) {
        const bh = (val / range) * chartH;
        doc.rect(cx, zeroY - bh, barW - 0.4, bh, 'F');
      } else {
        const bh = (Math.abs(val) / range) * chartH;
        doc.rect(cx, zeroY, barW - 0.4, bh, 'F');
      }
    });
  });

  // x labels
  doc.setTextColor(...BLACK);
  doc.setFontSize(7);
  labels.forEach((lab, i) => {
    const cx = chartX + slotW * i + slotW / 2;
    doc.text(lab, cx, y + h - 6, { align: 'center' });
  });

  // legend
  let lx = x + 4;
  const ly = y + h - 2;
  doc.setFontSize(6.5);
  series.forEach((s) => {
    doc.setFillColor(...s.color);
    doc.rect(lx, ly - 1.8, 2.2, 2.2, 'F');
    doc.setTextColor(...BLACK);
    doc.text(s.name, lx + 3, ly, { align: 'left' });
    lx += 22;
  });
}

function drawLineCashflow(doc, x, y, w, h, monthly) {
  const theme = getThemeFromDoc(doc);
  const YELLOW = theme.primary;
  const BLACK = theme.dark;
  const GREY_DARK = theme.mutedDark;
  const labels = monthly.map((m) => m.month_label);
  const vals = monthly.map((m) => m.accumulated);
  const maxV = Math.max(0, ...vals, 1);
  const minV = Math.min(0, ...vals);
  const range = (maxV - minV) || 1;

  const padTop = 8;
  const padBottom = 14;
  const padLeft = 18;
  const padRight = 4;
  const chartX = x + padLeft;
  const chartY = y + padTop;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const zeroY = chartY + chartH - ((0 - minV) / range) * chartH;

  doc.setFillColor(248, 248, 248);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');

  doc.setDrawColor(225, 225, 225);
  doc.setLineWidth(0.15);
  for (let g = 0; g <= 4; g++) {
    const gy = chartY + (chartH * g) / 4;
    doc.line(chartX, gy, chartX + chartW, gy);
    const v = maxV - (range * g) / 4;
    doc.setTextColor(...GREY_DARK);
    doc.setFontSize(6);
    doc.text(fmtNum(Math.round(v / 100) * 100, 0), chartX - 2, gy + 1.4, { align: 'right' });
  }

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.4);
  doc.line(chartX, zeroY, chartX + chartW, zeroY);

  const stepX = chartW / Math.max(labels.length - 1, 1);
  // fill area under line
  doc.setFillColor(250, 204, 21, 0.25);
  // jsPDF doesn't do alpha fills easily; use shaded color
  doc.setFillColor(254, 240, 138);
  let pathPoints = [];
  vals.forEach((val, i) => {
    const px = chartX + stepX * i;
    const py = chartY + chartH - ((val - minV) / range) * chartH;
    pathPoints.push([px, py]);
  });
  // polygon for area
  if (pathPoints.length > 1) {
    doc.setDrawColor(254, 240, 138);
    doc.setLineWidth(0.01);
    const poly = [...pathPoints, [pathPoints[pathPoints.length - 1][0], zeroY], [pathPoints[0][0], zeroY]];
    // approximate area fill with rectangles between consecutive points (skip — keep simple)
    // Simpler: draw rectangles vertically at each step
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const [x1, y1] = pathPoints[i];
      const [x2, y2] = pathPoints[i + 1];
      // trapezoid -> draw filled triangle + rect approximation skipped; just draw line
      doc.line(x1, y1, x2, y2);
    }
  }

  // line on top
  doc.setDrawColor(...YELLOW);
  doc.setLineWidth(1.2);
  for (let i = 0; i < pathPoints.length - 1; i++) {
    doc.line(pathPoints[i][0], pathPoints[i][1], pathPoints[i + 1][0], pathPoints[i + 1][1]);
  }
  // markers
  doc.setFillColor(...BLACK);
  pathPoints.forEach(([px, py]) => {
    doc.circle(px, py, 0.8, 'F');
  });

  doc.setTextColor(...BLACK);
  doc.setFontSize(7);
  labels.forEach((lab, i) => {
    const px = chartX + stepX * i;
    doc.text(lab, px, y + h - 6, { align: 'center' });
  });

  doc.setFontSize(6.5);
  doc.setTextColor(...GREY_DARK);
  doc.text('Cashflow Acumulado (€)', x + w / 2, y + 6, { align: 'center' });
}

/**
 * Donut chart via hidden canvas → PNG → addImage.
 * Returns nothing (draws into doc).
 */
async function drawDonutViaCanvas(doc, x, y, size, slices, title) {
  const theme = getThemeFromDoc(doc);
  // slices: [{label, value, color: [r,g,b]}]
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total <= 0) {
    doc.setFontSize(8);
    doc.setTextColor(...theme.mutedDark);
    doc.text('Sem dados', x + size / 2, y + size / 2, { align: 'center' });
    return;
  }
  const px = 480; // canvas pixel size for clarity
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, px, px);
  const cx = px / 2, cy = px / 2;
  const outer = px * 0.45;
  const inner = px * 0.28;

  let a0 = -Math.PI / 2;
  slices.forEach((s) => {
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * inner, cy + Math.sin(a0) * inner);
    ctx.arc(cx, cy, outer, a0, a1, false);
    ctx.lineTo(cx + Math.cos(a1) * inner, cy + Math.sin(a1) * inner);
    ctx.arc(cx, cy, inner, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = `rgb(${s.color[0]}, ${s.color[1]}, ${s.color[2]})`;
    ctx.fill();
    a0 = a1;
  });

  // Inner cap
  ctx.fillStyle = `rgb(${theme.light[0]}, ${theme.light[1]}, ${theme.light[2]})`;
  ctx.beginPath();
  ctx.arc(cx, cy, inner - 1, 0, Math.PI * 2);
  ctx.fill();

  // Center total
  ctx.fillStyle = `rgb(${theme.dark[0]}, ${theme.dark[1]}, ${theme.dark[2]})`;
  ctx.font = `bold ${Math.floor(px * 0.07)}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tot = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(total);
  ctx.fillText(tot, cx, cy - 6);
  ctx.fillStyle = `rgb(${theme.mutedDark[0]}, ${theme.mutedDark[1]}, ${theme.mutedDark[2]})`;
  ctx.font = `${Math.floor(px * 0.04)}px Helvetica, Arial, sans-serif`;
  ctx.fillText(title || '', cx, cy + Math.floor(px * 0.06));

  const dataUrl = canvas.toDataURL('image/png');
  doc.addImage(dataUrl, 'PNG', x, y, size, size);
}

function drawDonutLegend(doc, x, y, w, slices) {
  const theme = getThemeFromDoc(doc);
  doc.setFontSize(7.5);
  let cy = y;
  slices.forEach((s) => {
    doc.setFillColor(...s.color);
    doc.rect(x, cy - 2, 3, 3, 'F');
    doc.setTextColor(...theme.dark);
    doc.setFont('helvetica', 'bold');
    const label = s.label.length > 28 ? s.label.slice(0, 27) + '…' : s.label;
    doc.text(label, x + 5, cy + 0.6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...theme.mutedDark);
    doc.text(`${fmtEuro(s.value)}  (${fmtPct(s.pct)})`, x + w, cy + 0.6, { align: 'right' });
    cy += 5;
  });
}

/* =============================================================
   PAGE BUILDERS
   ============================================================= */

function buildKPIsPage(doc, data, meta) {
  const theme = getThemeFromDoc(doc, meta);
  const BLACK = theme.dark;
  const GREY_MED = theme.mutedMid;
  const GREY_DARK = theme.mutedDark;
  const GREY_LIGHT = theme.mutedLight;
  const WHITE = theme.light;
  const GREEN = theme.green;
  const RED = theme.red;
  const YELLOW = theme.primary;
  const BLUE = theme.blue;
  const palette = meta?.chartPalette || theme.chartPalette || PALETTE;
  let y = drawPageHeader(doc, meta);
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Resumo do Ano ${data.year}`, MARGIN, y + 4);
  y += 10;

  const k = data.kpis;
  const cards = [
    { label: 'ENTRADAS (Faturas pagas)', value: fmtEuro(k.total_in), color: GREEN, sub: `${data.kpis.invoices_count} fatura(s) emitidas` },
    { label: 'SAÍDAS TOTAIS', value: fmtEuro(k.total_out), color: RED, sub: `${data.kpis.expenses_count} despesa(s) + salários` },
    { label: 'RESULTADO LÍQUIDO', value: fmtEuro(k.result), color: k.result < 0 ? RED : YELLOW, sub: `Margem ${fmtPct(k.margin_pct)}` },
    { label: 'A RECEBER (TOTAL)', value: fmtEuro(k.pending_total), color: BLUE, sub: 'Faturas em aberto (todos os anos)' },
  ];
  const cardW = (PAGE_W - MARGIN * 2 - 9) / 4;
  cards.forEach((c, i) => {
    const cx = MARGIN + i * (cardW + 3);
    doc.setFillColor(...BLACK);
    doc.roundedRect(cx, y, cardW, 26, 2, 2, 'F');
    doc.setFillColor(...c.color);
    doc.rect(cx, y, cardW, 2, 'F');
    doc.setTextColor(...GREY_MED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(c.label, cx + 3, y + 7);
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(c.value, cx + 3, y + 15);
    doc.setTextColor(...GREY_MED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(c.sub, cx + 3, y + 22);
  });
  y += 32;

  // Breakdown
  doc.setFillColor(...GREY_LIGHT);
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 30, 2, 2, 'F');
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('DECOMPOSIÇÃO DAS SAÍDAS', MARGIN + 4, y + 7);

  const breakdownCols = [
    { label: 'Variáveis', value: k.total_out_variable, color: palette[1] },
    { label: 'Fixas', value: k.total_out_fixed, color: palette[2] },
    { label: 'Obra', value: k.total_out_obra, color: palette[3] },
    { label: 'Salários', value: k.total_payroll, color: palette[4] },
  ];
  const bcw = (PAGE_W - MARGIN * 2 - 16) / 4;
  breakdownCols.forEach((b, i) => {
    const bx = MARGIN + 4 + i * (bcw + 4);
    doc.setFillColor(...b.color);
    doc.rect(bx, y + 11, 2, 14, 'F');
    doc.setTextColor(...GREY_DARK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(b.label, bx + 4, y + 16);
    doc.setTextColor(...BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(fmtEuro(b.value), bx + 4, y + 23);
  });
  y += 36;

  // IVA box
  doc.setFillColor(...BLACK);
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 22, 2, 2, 'F');
  doc.setTextColor(...YELLOW);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('IVA DO ANO', MARGIN + 4, y + 7);
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('IVA Liquidado (faturas)', MARGIN + 4, y + 14);
  doc.text('IVA Suportado (despesas)', PAGE_W / 3 + 5, y + 14);
  doc.text(k.vat_balance >= 0 ? 'IVA a Entregar' : 'IVA a Recuperar', (PAGE_W / 3) * 2 + 5, y + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text(fmtEuro(k.vat_charged), MARGIN + 4, y + 20);
  doc.text(fmtEuro(k.vat_paid), PAGE_W / 3 + 5, y + 20);
  doc.setTextColor(...(k.vat_balance >= 0 ? RED : GREEN));
  doc.text(fmtEuro(Math.abs(k.vat_balance)), (PAGE_W / 3) * 2 + 5, y + 20);
  y += 28;

  // Tabela mensal
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Movimento Mensal', MARGIN, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [['Mês', 'Entradas', 'Variáveis', 'Fixas', 'Obra', 'Salários', 'Total Saídas', 'Resultado', 'Acumulado']],
    body: data.monthly.map((m) => [
      m.month_label,
      fmtEuro(m.entries),
      fmtEuro(m.expenses_variable),
      fmtEuro(m.expenses_fixed),
      fmtEuro(m.expenses_obra),
      fmtEuro(m.payroll),
      fmtEuro(m.total_out),
      fmtEuro(m.net),
      fmtEuro(m.accumulated),
    ]),
    foot: [[
      'TOTAL',
      fmtEuro(k.total_in),
      fmtEuro(k.total_out_variable),
      fmtEuro(k.total_out_fixed),
      fmtEuro(k.total_out_obra),
      fmtEuro(k.total_payroll),
      fmtEuro(k.total_out),
      fmtEuro(k.result),
      fmtEuro(k.result),
    ]],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: BLACK },
    headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold' },
    footStyles: { fillColor: YELLOW, textColor: BLACK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
      4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
      7: { halign: 'right' }, 8: { halign: 'right' },
    },
    margin: { left: MARGIN, right: MARGIN },
    didParseCell: (d) => {
      if (d.section === 'body' && (d.column.index === 7 || d.column.index === 8)) {
        const raw = String(d.cell.raw || '');
        if (raw.includes('-')) d.cell.styles.textColor = RED;
      }
    },
  });
}

async function buildChartsPage(doc, data, meta) {
  const theme = getThemeFromDoc(doc, meta);
  const BLACK = theme.dark;
  const palette = meta?.chartPalette || theme.chartPalette || PALETTE;
  doc.addPage();
  let y = drawPageHeader(doc, meta);
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Análise Gráfica', MARGIN, y + 4);
  y += 12;

  // Bar chart mensal
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  doc.text('Entradas vs Saídas vs Resultado (Mensal)', MARGIN, y);
  y += 3;
  drawBarChartMonthly(doc, MARGIN, y, PAGE_W - MARGIN * 2, 70, data.monthly);
  y += 76;

  // Line cashflow acumulado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Cashflow Acumulado', MARGIN, y);
  y += 3;
  drawLineCashflow(doc, MARGIN, y, PAGE_W - MARGIN * 2, 60, data.monthly);
  y += 66;

  // Donuts: categorias despesa + clientes receita
  doc.addPage();
  y = drawPageHeader(doc, meta);
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Distribuição', MARGIN, y + 4);
  y += 10;

  // Donut despesa
  const catTop = data.categories_expense.slice(0, 8);
  const catSlices = catTop.map((c, i) => ({
    label: c.category, value: c.total, pct: c.pct, color: palette[i % palette.length],
  }));
  doc.setFontSize(10);
  doc.text('Despesas por Categoria', MARGIN, y);
  await drawDonutViaCanvas(doc, MARGIN, y + 4, 80, catSlices, 'Despesas');
  drawDonutLegend(doc, MARGIN + 86, y + 8, PAGE_W - MARGIN - MARGIN - 88, catSlices);
  y += 92;

  // Donut clientes
  const cliTop = data.clients_revenue.slice(0, 8);
  const cliSlices = cliTop.map((c, i) => ({
    label: c.client, value: c.total, pct: c.pct, color: palette[i % palette.length],
  }));
  doc.setFontSize(10);
  doc.text('Receita por Cliente', MARGIN, y);
  await drawDonutViaCanvas(doc, MARGIN, y + 4, 80, cliSlices, 'Faturação');
  drawDonutLegend(doc, MARGIN + 86, y + 8, PAGE_W - MARGIN - MARGIN - 88, cliSlices);
}

function buildInvoicesPages(doc, data, meta) {
  const theme = getThemeFromDoc(doc, meta);
  const BLACK = theme.dark;
  const YELLOW = theme.primary;
  const RED = theme.red;
  const GREEN = theme.green;
  doc.addPage();
  let y = drawPageHeader(doc, meta);
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Faturas Emitidas (${data.invoices.length})`, MARGIN, y + 4);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [['Nº', 'Data', 'Vencimento', 'Cliente', 'NIF', 'Líquido', 'IVA', 'Total', 'Pago', 'Saldo', 'Estado']],
    body: data.invoices.map((i) => [
      i.number,
      fmtDate(i.issue_date),
      fmtDate(i.due_date),
      i.client_name,
      i.client_nif || '—',
      fmtEuro(i.value_net),
      fmtEuro(i.vat_amount),
      fmtEuro(i.value_total),
      fmtEuro(i.paid),
      fmtEuro(i.balance),
      i.status,
    ]),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.3, textColor: BLACK },
    headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 18 }, 1: { cellWidth: 17 }, 2: { cellWidth: 17 },
      3: { cellWidth: 40 }, 4: { cellWidth: 16 },
      5: { halign: 'right' }, 6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'right' }, 9: { halign: 'right' },
      10: { cellWidth: 16, halign: 'center' },
    },
    margin: { left: MARGIN, right: MARGIN },
    didDrawPage: () => drawPageHeader(doc, meta),
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 10) {
        const v = String(d.cell.raw || '').toLowerCase();
        if (v.includes('vencid')) d.cell.styles.textColor = RED;
        else if (v.includes('paga')) d.cell.styles.textColor = GREEN;
      }
    },
  });
}

function buildExpensesPages(doc, data, meta) {
  const theme = getThemeFromDoc(doc, meta);
  const BLACK = theme.dark;
  const YELLOW = theme.primary;
  doc.addPage();
  let y = drawPageHeader(doc, meta);
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Despesas Registadas (${data.expenses.length})`, MARGIN, y + 4);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [['Data', 'Fornecedor', 'NIF', 'Nº Fatura', 'Categoria', 'Tipo', 'Obra', 'Líquido', 'IVA', 'Total']],
    body: data.expenses.map((e) => [
      fmtDate(e.date),
      e.supplier,
      e.nif || '—',
      e.invoice_number || '—',
      e.category,
      e.type,
      e.obra_name || '—',
      fmtEuro(e.value_net),
      fmtEuro(e.vat_amount),
      fmtEuro(e.value_gross),
    ]),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.3, textColor: BLACK },
    headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 17 }, 1: { cellWidth: 42 }, 2: { cellWidth: 16 },
      3: { cellWidth: 22 }, 4: { cellWidth: 22 }, 5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 22 },
      7: { halign: 'right' }, 8: { halign: 'right' },
      9: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: MARGIN, right: MARGIN },
    didDrawPage: () => drawPageHeader(doc, meta),
  });
}

function buildPayrollPage(doc, data, meta) {
  const theme = getThemeFromDoc(doc, meta);
  const BLACK = theme.dark;
  const YELLOW = theme.primary;
  if (!data.payroll_runs.length) return;
  doc.addPage();
  let y = drawPageHeader(doc, meta);
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Processamentos Salariais (${data.payroll_runs.length})`, MARGIN, y + 4);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [['Mês', 'Funcionários', 'Ilíquido', 'Líquido', 'SS Empresa', 'Custo Total', 'Estado']],
    body: data.payroll_runs.map((r) => [
      String(r.month).padStart(2, '0') + '/' + r.year,
      r.employees_count,
      fmtEuro(r.total_iliquido),
      fmtEuro(r.total_liquido),
      fmtEuro(r.total_ss_empresa),
      fmtEuro(r.total_custo_empresa),
      r.status,
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5, textColor: BLACK },
    headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { halign: 'center' }, 1: { halign: 'center' },
      2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' }, 6: { halign: 'center' },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
}

function buildWorksPage(doc, data, meta) {
  const theme = getThemeFromDoc(doc, meta);
  const BLACK = theme.dark;
  const YELLOW = theme.primary;
  const GREEN = theme.green;
  const RED = theme.red;
  const GREY_DARK = theme.mutedDark;
  if (!data.works.length) return;
  doc.addPage();
  let y = drawPageHeader(doc, meta);
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Obras (${data.works.length})`, MARGIN, y + 4);
  y += 10;

  if (data.works_in_progress.length) {
    doc.setFontSize(9);
    doc.setTextColor(...GREY_DARK);
    doc.text(`Em curso: ${data.works_in_progress.length}`, MARGIN, y);
    y += 2;
  }

  autoTable(doc, {
    startY: y,
    head: [['Obra', 'Cliente', 'Estado', 'Início', 'Fim', 'Custo Previsto', 'Custo Real', 'Desvio', 'Margem']],
    body: data.works.map((w) => {
      const dev = (w.predicted_cost > 0) ? w.real_cost - w.predicted_cost : 0;
      const mar = w.predicted_cost > 0 ? ((w.predicted_cost - w.real_cost) / w.predicted_cost * 100) : 0;
      return [
        w.title, w.client_name, w.status,
        fmtDate(w.start_date), fmtDate(w.end_date),
        fmtEuro(w.predicted_cost), fmtEuro(w.real_cost),
        fmtEuro(dev), fmtPct(mar),
      ];
    }),
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.4, textColor: BLACK },
    headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 50 }, 1: { cellWidth: 38 }, 2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 17 }, 4: { cellWidth: 17 },
      5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' },
    },
    margin: { left: MARGIN, right: MARGIN },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 7) {
        const raw = String(d.cell.raw || '');
        if (raw.startsWith('-€') || raw.includes('-€')) d.cell.styles.textColor = GREEN;
        else if (raw && !raw.includes('0,00')) d.cell.styles.textColor = RED;
      }
    },
  });
}

/* =============================================================
   ENTRY POINT
   ============================================================= */

export async function generateAnnualReportPDF(data, settings = {}, logoBase64 = null) {
  const theme = getPdfBranding(settings, logoBase64);
  const meta = {
    year: data.year,
    scope_label: data.scope_label,
    generated_at: data.generated_at,
    logoBase64: theme.logoBase64,
    companyName: theme.companyName,
    theme,
    chartPalette: theme.chartPalette,
  };
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  doc.__reportMeta = meta;

  // Cover
  drawCoverHeader(doc, meta);

  // KPIs + monthly table
  doc.addPage();
  buildKPIsPage(doc, data, meta);

  // Charts (bars + line + donuts)
  await buildChartsPage(doc, data, meta);

  // Invoices
  if (data.invoices.length) buildInvoicesPages(doc, data, meta);

  // Expenses
  if (data.expenses.length) buildExpensesPages(doc, data, meta);

  // Payroll
  buildPayrollPage(doc, data, meta);

  // Works
  buildWorksPage(doc, data, meta);

  // Footer pagination
  const totalPages = doc.internal.getNumberOfPages();
  drawFooter(doc, totalPages, meta);

  const safe = (data.scope_label || `relatorio-${data.year}`).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`relatorio-financeiro-${safe}.pdf`);
}
