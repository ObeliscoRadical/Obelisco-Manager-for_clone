// Legenda de Quadro — Obelisco Radical
// Suporta 2 layouts para colagem física contínua:
//   - 'horizontal' (landscape A4): folhas colam lado-a-lado (para quadros compridos/largos)
//   - 'vertical'   (portrait A4):  folhas colam em cima/baixo (para quadros altos/estreitos)
// Em ambos os casos: cabeçalho SÓ na 1ª folha, rodapé SÓ na última folha.
// Colunas com larguras fixas e idênticas em todas as folhas → junção contínua.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const YELLOW = [250, 204, 21];
const BLACK = [10, 10, 12];
const WHITE = [255, 255, 255];
const GREY_LIGHT = [230, 230, 230];
const GREY = [110, 110, 110];

const MARGIN = 6;
const ROW_H = 8.5;
const HEAD_ROW_H = 8;
const HEADER_H = 42;   // usado na 1ª página
const FOOTER_H = 18;   // usado na última página

function dims(layout) {
  if (layout === 'vertical') {
    return { PW: 210, PH: 297, orientation: 'p' };
  }
  return { PW: 297, PH: 210, orientation: 'l' };
}

function capacities(PH) {
  return {
    first: Math.floor((PH - HEADER_H - HEAD_ROW_H - 6) / ROW_H),
    middle: Math.floor((PH - HEAD_ROW_H - 6) / ROW_H),
    last: Math.floor((PH - FOOTER_H - HEAD_ROW_H - 6) / ROW_H),
  };
}

function splitModules(modules, PH) {
  const cap = capacities(PH);
  const single = Math.floor((PH - HEADER_H - FOOTER_H - HEAD_ROW_H - 6) / ROW_H);
  const n = modules.length;
  if (n === 0) return [{ items: [], showHeader: true, showFooter: true, page: 1, total: 1 }];
  if (n <= single) {
    return [{ items: modules, showHeader: true, showFooter: true, page: 1, total: 1 }];
  }
  // Determina número mínimo de páginas que comportam n módulos
  let total = 2;
  while (cap.first + (total - 2) * cap.middle + cap.last < n) total++;

  // Distribuição EQUILIBRADA: garante que a última página fica com itens
  const avg = Math.ceil(n / total);
  const page1Take = Math.min(cap.first, avg);
  const pageNTake = Math.min(cap.last, avg);
  const middleCount = total - 2;
  const middleTotalItems = n - page1Take - pageNTake;
  const perMiddle = middleCount > 0 ? Math.ceil(middleTotalItems / middleCount) : 0;

  const pages = [];
  let idx = 0;
  for (let p = 0; p < total; p++) {
    const isFirst = p === 0;
    const isLast = p === total - 1;
    let take;
    if (isLast) {
      take = n - idx; // resto
    } else if (isFirst) {
      take = page1Take;
    } else {
      take = Math.min(perMiddle, cap.middle, n - idx);
    }
    pages.push({
      items: modules.slice(idx, idx + take),
      showHeader: isFirst,
      showFooter: isLast,
      page: p + 1,
      total,
    });
    idx += take;
  }
  return pages;
}

export function generateLegendaQuadroPDF(header, modules, logoBase64, options = {}) {
  const layout = options.layout === 'vertical' ? 'vertical' : 'horizontal';
  const { PW, PH, orientation } = dims(layout);
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pages = splitModules(modules, PH);

  pages.forEach((p, i) => {
    if (i > 0) doc.addPage('a4', orientation);
    drawPage(doc, header, p, logoBase64, { PW, PH, layout });
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const safe = (s) => (s || '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  const suffix = layout === 'vertical' ? 'vertical' : 'horizontal';
  doc.save(`LegendaQuadro_${safe(header.panel_name || 'quadro')}_${suffix}_${stamp}.pdf`);
}

function drawPage(doc, header, pageData, logoBase64, ctx) {
  const { PW, PH, layout } = ctx;
  const { items, showHeader, showFooter, page, total } = pageData;
  const isMulti = total > 1;

  let contentTop = MARGIN;

  // ====== HEADER (só na 1ª página) ======
  if (showHeader) {
    doc.setFillColor(...BLACK);
    doc.rect(0, 0, PW, HEADER_H, 'F');
    doc.setFillColor(...YELLOW);
    for (let x = 8; x < PW - 8; x += 12) doc.rect(x, HEADER_H - 1.6, 6, 1.6, 'F');

    if (logoBase64) {
      try { doc.addImage(logoBase64, 'PNG', 8, 6, 28, 28); } catch { /* ignore */ }
    }

    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('LEGENDA DE QUADRO', 42, 18);
    doc.setTextColor(...YELLOW);
    doc.setFontSize(9);
    doc.text('IDENTIFICAÇÃO DE CIRCUITOS ELÉCTRICOS', 42, 24);

    // Info cabeçalho (lado direito adaptativo)
    const infoX = layout === 'vertical' ? 120 : 165;
    const col2Dx = layout === 'vertical' ? 45 : 60;
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 200, 200);
    doc.text('CLIENTE / OBRA', infoX, 10);
    doc.text('QUADRO', infoX, 20);
    doc.text('TÉCNICO', infoX + col2Dx, 20);
    doc.text('DATA', infoX + col2Dx, 10);

    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    const maxClient = layout === 'vertical' ? 30 : 45;
    const maxPanel = layout === 'vertical' ? 18 : 25;
    doc.text((header.client_name || '—').slice(0, maxClient), infoX, 15);
    doc.text((header.panel_name || '—').slice(0, maxPanel), infoX, 25);
    doc.text((header.technician || '—').slice(0, maxPanel), infoX + col2Dx, 25);
    doc.text(header.work_date || '—', infoX + col2Dx, 15);

    contentTop = HEADER_H + 3;
  } else {
    doc.setFillColor(...BLACK);
    doc.rect(0, 0, PW, 4, 'F');
    doc.setFillColor(...YELLOW);
    doc.rect(0, 3, PW, 1, 'F');
    contentTop = 6;
  }

  // ====== TABELA ======
  const tableBody = items.map(m => [
    String(m.number || ''),
    (m.type || '').toUpperCase(),
    m.description || '',
    m.amperage || '',
  ]);

  // Larguras de coluna adaptadas — mas MANTIDAS iguais em todas as folhas do mesmo PDF.
  const isVertical = layout === 'vertical';
  const colWidths = isVertical
    ? { c0: 12, c1: 48, c2: 108, c3: 30 } // total = 198 (PW=210 - margens 12)
    : { c0: 14, c1: 60, c2: 175, c3: 36 }; // total = 285 (PW=297 - margens 12)

  autoTable(doc, {
    head: [['Nº', 'TIPO', 'CIRCUITO / IDENTIFICAÇÃO', 'A / mA']],
    body: tableBody,
    startY: contentTop,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: PW - MARGIN * 2,
    styles: { fontSize: 9, cellPadding: 2, lineColor: GREY_LIGHT, lineWidth: 0.3, textColor: BLACK, valign: 'middle', minCellHeight: ROW_H },
    headStyles: { fillColor: BLACK, textColor: YELLOW, fontStyle: 'bold', fontSize: 8.5, halign: 'left', cellPadding: 2.4, minCellHeight: HEAD_ROW_H },
    columnStyles: {
      0: { cellWidth: colWidths.c0, halign: 'center', fontStyle: 'bold', fillColor: [248, 248, 248] },
      1: { cellWidth: colWidths.c1, fontStyle: 'bold', fontSize: 8 },
      2: { cellWidth: colWidths.c2 },
      3: { cellWidth: colWidths.c3, halign: 'center', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    pageBreak: 'avoid',
  });

  // ====== FOOTER (só na última) ======
  if (showFooter) {
    doc.setFillColor(...BLACK);
    doc.rect(0, PH - FOOTER_H, PW, FOOTER_H, 'F');
    doc.setFillColor(...YELLOW);
    for (let x = 8; x < PW - 8; x += 12) doc.rect(x, PH - FOOTER_H + 0.6, 6, 1.4, 'F');

    doc.setTextColor(...YELLOW);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('OBELISCO RADICAL', PW / 2, PH - 11, { align: 'center' });
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('911 324 011    •    obeliscoradical@gmail.com    •    obeliscoradical.pt', PW / 2, PH - 5, { align: 'center' });
  } else {
    doc.setFillColor(...YELLOW);
    doc.rect(0, PH - 4, PW, 1, 'F');
    doc.setFillColor(...BLACK);
    doc.rect(0, PH - 3, PW, 3, 'F');
  }

  // ====== MARCAS DE COLAGEM (só quando multipágina) ======
  if (isMulti) {
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...GREY);

    if (!isVertical) {
      // HORIZONTAL: marcas nas laterais (direita = próxima, esquerda = anterior)
      if (page < total) {
        const rx = PW - 1.5;
        doc.line(rx - 4, 2, rx, 2);
        doc.line(rx, 0, rx, 4);
        doc.line(rx - 4, PH - 2, rx, PH - 2);
        doc.line(rx, PH - 4, rx, PH);
        doc.text(`↦ COLAR COM PARTE ${page + 1}`, PW - 3, PH / 2, { angle: 270 });
      }
      if (page > 1) {
        const lx = 1.5;
        doc.line(lx, 2, lx + 4, 2);
        doc.line(lx, 0, lx, 4);
        doc.line(lx, PH - 2, lx + 4, PH - 2);
        doc.line(lx, PH - 4, lx, PH);
        doc.text(`PARTE ${page - 1} ↤`, 3, PH / 2, { angle: 90 });
      }
      doc.setFont('helvetica', 'normal');
      doc.text(`PARTE ${page} / ${total}`, PW - 8, PH - (showFooter ? FOOTER_H + 1 : 6), { align: 'right' });
    } else {
      // VERTICAL: marcas em cima e em baixo (baixo = próxima, cima = anterior)
      if (page < total) {
        const by = PH - 1.5;
        doc.line(2, by - 4, 2, by);
        doc.line(0, by, 4, by);
        doc.line(PW - 2, by - 4, PW - 2, by);
        doc.line(PW - 4, by, PW, by);
        doc.text(`↧ COLAR COM PARTE ${page + 1}`, PW / 2, PH - 3, { align: 'center' });
      }
      if (page > 1) {
        const ty = 1.5;
        doc.line(2, ty, 2, ty + 4);
        doc.line(0, ty, 4, ty);
        doc.line(PW - 2, ty, PW - 2, ty + 4);
        doc.line(PW - 4, ty, PW, ty);
        doc.text(`↥ PARTE ${page - 1}`, PW / 2, 5, { align: 'center' });
      }
      doc.setFont('helvetica', 'normal');
      doc.text(`PARTE ${page} / ${total}`, PW - MARGIN, PH - (showFooter ? FOOTER_H + 1 : 6), { align: 'right' });
    }
  }
}
