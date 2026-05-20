// Gerador de Relatório de Obra (Previsto vs Real) — Obelisco Radical
// A4 retrato. Estilo: preto + amarelo eléctrico + branco.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const YELLOW = [250, 204, 21];
const BLACK = [10, 10, 12];
const WHITE = [255, 255, 255];
const GREY_LIGHT = [235, 235, 235];
const GREY_DARK = [70, 70, 70];
const RED = [220, 38, 38];
const GREEN = [34, 197, 94];

const fmtEuro = (v) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

const fmtPct = (v) =>
  `${(v ?? 0).toFixed(1).replace('.', ',')}%`;

const fmtDate = (iso) => {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleDateString('pt-PT'); }
  catch { return iso; }
};

/**
 * Gera o PDF do Relatório de Obra.
 * @param {Object} payload — Resposta de /api/works/{id}/full
 *   { work, items, expenses, kpis }
 * @param {Object} settings — definições da empresa (logo, contactos)
 * @param {String} logoBase64 — PNG base64 do logo
 */
export async function generateWorkReportPDF(payload, settings = {}, logoBase64 = null) {
  const { work, items = [], expenses = [], kpis = {} } = payload || {};
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;

  // ============ HEADER PRETO ============
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, pageW, 36, 'F');
  doc.setFillColor(...YELLOW);
  for (let x = 8; x < pageW - 8; x += 12) {
    doc.rect(x, 34.4, 6, 1.6, 'F');
  }

  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', 10, 5, 26, 26); } catch { /* ignore */ }
  }

  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('RELATÓRIO DE OBRA', pageW / 2, 15, { align: 'center' });
  doc.setTextColor(...YELLOW);
  doc.setFontSize(10);
  doc.text('PREVISTO vs REAL · OBELISCO RADICAL', pageW / 2, 22, { align: 'center' });
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-PT')}`, pageW - 12, 30, { align: 'right' });

  let y = 44;

  // ============ INFO DA OBRA ============
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(work?.title || 'Obra sem título', 12, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY_DARK);
  doc.text(`Cliente: ${work?.client_name || '-'}`, 12, y);
  doc.text(`Estado: ${work?.status || '-'}`, 90, y);
  doc.text(`Início: ${fmtDate(work?.start_date)}`, 140, y);
  y += 5;
  doc.text(`Telefone: ${work?.client_phone || '-'}`, 12, y);
  doc.text(`Fim: ${fmtDate(work?.end_date)}`, 140, y);
  y += 6;

  // ============ ALERTA OVERRUN ============
  if (kpis.is_overrun) {
    doc.setFillColor(...RED);
    doc.rect(12, y, pageW - 24, 8, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`ATENÇÃO: OBRA ACIMA DO ORÇAMENTO (+${fmtPct(kpis.overrun_pct)})`, pageW / 2, y + 5.6, { align: 'center' });
    y += 12;
  }

  // ============ KPIs CARDS ============
  const cards = [
    { label: 'Venda Total', value: fmtEuro(kpis.sale_total), color: BLACK },
    { label: 'Custo Previsto', value: fmtEuro(kpis.predicted_total), color: BLACK },
    { label: 'Custo Real', value: fmtEuro(kpis.real_total), color: kpis.is_overrun ? RED : BLACK },
    { label: 'Lucro Real', value: fmtEuro(kpis.real_profit), color: kpis.real_profit < 0 ? RED : GREEN },
  ];
  const cardW = (pageW - 24 - 9) / 4;
  cards.forEach((c, i) => {
    const x = 12 + i * (cardW + 3);
    doc.setFillColor(...GREY_LIGHT);
    doc.roundedRect(x, y, cardW, 16, 2, 2, 'F');
    doc.setTextColor(...GREY_DARK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(c.label.toUpperCase(), x + 3, y + 5);
    doc.setTextColor(...c.color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(c.value, x + 3, y + 12);
  });
  y += 22;

  // ============ MARGEM ============
  doc.setFillColor(...BLACK);
  doc.roundedRect(12, y, pageW - 24, 14, 2, 2, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('MARGEM PREVISTA', 18, y + 5);
  doc.text('MARGEM REAL', 80, y + 5);
  doc.text('DESVIO', 140, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...YELLOW);
  doc.text(fmtPct(kpis.margin_predicted_pct), 18, y + 11);
  doc.setTextColor(kpis.margin_real_pct < 0 ? 252 : 250, kpis.margin_real_pct < 0 ? 165 : 204, kpis.margin_real_pct < 0 ? 165 : 21);
  doc.text(fmtPct(kpis.margin_real_pct), 80, y + 11);
  doc.setTextColor(kpis.is_overrun ? 252 : 250, kpis.is_overrun ? 165 : 204, kpis.is_overrun ? 165 : 21);
  doc.text(`${kpis.overrun_pct > 0 ? '+' : ''}${fmtPct(kpis.overrun_pct)}`, 140, y + 11);
  y += 20;

  // ============ TABELA DE ITENS ============
  doc.setTextColor(...BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Items', 12, y);
  y += 4;

  const rows = items.map((it) => {
    const realUC = Number(it.real_unit_cost || 0);
    const predUC = Number(it.predicted_unit_cost || 0);
    const qty = Number(it.quantity || 0);
    const realQty = it.real_quantity != null ? Number(it.real_quantity) : qty;
    const delta = realUC > 0 ? (realUC * realQty - predUC * qty) : 0;
    return [
      (it.is_extra ? '[E] ' : '') + (it.name || ''),
      it.unit || '',
      qty.toString().replace('.', ','),
      fmtEuro(predUC),
      fmtEuro(predUC * qty),
      realUC > 0 ? fmtEuro(realUC) : '-',
      realUC > 0 ? fmtEuro(realUC * realQty) : '-',
      realUC > 0 ? fmtEuro(delta) : '-',
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Descrição', 'Un.', 'Qtd', 'C.U. Prev.', 'Total Prev.', 'C.U. Real', 'Total Real', 'Desvio']],
    body: rows.length ? rows : [['(sem items)', '', '', '', '', '', '', '']],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: BLACK, lineColor: GREY_LIGHT },
    headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 12, halign: 'right' },
      3: { cellWidth: 19, halign: 'right' },
      4: { cellWidth: 21, halign: 'right' },
      5: { cellWidth: 19, halign: 'right' },
      6: { cellWidth: 21, halign: 'right' },
      7: { cellWidth: 26, halign: 'right' },
    },
    margin: { left: 12, right: 12 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 7) {
        const raw = data.cell.raw;
        if (raw && raw !== '-') {
          const n = parseFloat(String(raw).replace(/[^\d,-]/g, '').replace(',', '.'));
          if (n > 0) data.cell.styles.textColor = RED;
          else if (n < 0) data.cell.styles.textColor = GREEN;
        }
      }
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  // ============ DESPESAS VINCULADAS ============
  if (expenses.length > 0) {
    if (y > pageH - 50) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...BLACK);
    doc.text(`Despesas Vinculadas (${expenses.length})`, 12, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['Data', 'Fornecedor', 'Categoria', 'Nº Fatura', 'Valor c/IVA']],
      body: expenses.map((e) => [
        fmtDate(e.date),
        e.supplier || '-',
        e.category || '-',
        e.invoice_number || '-',
        fmtEuro(e.value_gross),
      ]),
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.5, textColor: BLACK },
      headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 24 }, 1: { cellWidth: 60 }, 2: { cellWidth: 36 },
        3: { cellWidth: 32 }, 4: { cellWidth: 34, halign: 'right' },
      },
      margin: { left: 12, right: 12 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ============ HISTÓRICO ============
  const historyEntries = [];
  items.forEach((it) => {
    (it.history || []).forEach((h) => {
      historyEntries.push({ item: it.name, ...h });
    });
  });
  if (historyEntries.length > 0) {
    if (y > pageH - 40) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...BLACK);
    doc.text(`Histórico de Alterações (${historyEntries.length})`, 12, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['Data/Hora', 'Item', 'Utilizador', 'De', 'Para']],
      body: historyEntries.map((h) => [
        new Date(h.at).toLocaleString('pt-PT'),
        h.item,
        h.by || '-',
        fmtEuro(h.from),
        fmtEuro(h.to),
      ]),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5, textColor: BLACK },
      headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 36 }, 1: { cellWidth: 70 }, 2: { cellWidth: 32 },
        3: { cellWidth: 24, halign: 'right' }, 4: { cellWidth: 24, halign: 'right' },
      },
      margin: { left: 12, right: 12 },
    });
  }

  // ============ FOOTER ============
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(...BLACK);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setTextColor(...YELLOW);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('OBELISCO RADICAL · Relatório interno · Confidencial', 12, pageH - 4);
    doc.text(`Página ${p}/${totalPages}`, pageW - 12, pageH - 4, { align: 'right' });
  }

  const safe = (work?.title || 'obra').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`relatorio-${safe}.pdf`);
}
