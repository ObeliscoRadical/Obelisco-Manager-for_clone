// Máscara / Capa de Calha DIN — Obelisco Radical
// Gera tiras em ESCALA REAL 1:1 (1 módulo DIN = 18 mm).
// Suporta fusão de N módulos (aparelhos multipolares).
// A4 PAISAGEM (mais espaço horizontal: 297 mm).
// Filas mais largas do que o útil da folha são divididas em SEGMENTOS,
// cada um com marca de continuação ("continua ↦" / "↤ continua") para colar.
// IMPORTANTE: imprimir a 100% (sem "ajustar à página").

import jsPDF from 'jspdf';

const MODULE_MM = 18;
const PW = 297;                 // A4 landscape width
const PH = 210;
const MARGIN_X = 8;
const MARGIN_TOP = 4;
const HEADER_H_FIRST = 14;
const GAP_BETWEEN_STRIPS = 6;
const FOOTER_H = 6;

const BLACK = [10, 10, 12];
const YELLOW = [250, 204, 21];
const GREY = [110, 110, 110];
const GREY_LIGHT = [190, 190, 190];

// Paleta (deve espelhar COLOR_PALETTE de MascaraDinPage.jsx)
const COLOR_MAP = {
  R:  { rgb: [239, 68, 68],  fg: [255, 255, 255], label: 'Fase R' },
  S:  { rgb: [120, 53, 15],  fg: [255, 255, 255], label: 'Fase S' },
  T:  { rgb: [82, 82, 82],   fg: [255, 255, 255], label: 'Fase T' },
  N:  { rgb: [59, 130, 246], fg: [255, 255, 255], label: 'Neutro' },
  PE: { rgb: [22, 163, 74],  fg: [255, 255, 255], label: 'Terra (PE)' },
  ID: { rgb: [250, 204, 21], fg: [10, 10, 12],    label: 'Diferencial' },
  CG: { rgb: [249, 115, 22], fg: [255, 255, 255], label: 'Corte Geral' },
  MT: { rgb: [139, 92, 246], fg: [255, 255, 255], label: 'Motor/Bomba' },
  LZ: { rgb: [14, 165, 233], fg: [255, 255, 255], label: 'Iluminação' },
  TC: { rgb: [13, 148, 136], fg: [255, 255, 255], label: 'Tomadas' },
  AC: { rgb: [6, 182, 212],  fg: [255, 255, 255], label: 'AC/Clima' },
};

// Largura útil por página (dá para desenhar cortes/rótulos fora sem sair da folha).
const USABLE_W = PW - MARGIN_X * 2 - 4; // ~281 mm
const MAX_MODULES_PER_SEGMENT = Math.floor(USABLE_W / MODULE_MM); // 15 módulos → 270 mm

// Divide uma fila em segmentos que caibam na folha
function segmentRow(row, rowIndex) {
  const segments = [];
  let modulesConsumed = 0;
  const totalMods = row.cells.reduce((a, c) => a + c.span, 0);

  let segCells = [];
  let segMods = 0;
  row.cells.forEach((cell) => {
    if (segMods + cell.span > MAX_MODULES_PER_SEGMENT) {
      // fecha segmento (a célula corrente vai inteira para o próximo segmento
      // desde que ela sozinha caiba; se span > max, tem de ser partida)
      if (cell.span > MAX_MODULES_PER_SEGMENT) {
        // Célula gigante: preenche o resto do segmento actual com uma parte
        // e continua no próximo. Mantém texto/descrição na parte inicial.
        let remaining = cell.span;
        // parte 1: cabe no segmento actual
        const fit1 = MAX_MODULES_PER_SEGMENT - segMods;
        if (fit1 > 0) {
          segCells.push({ ...cell, span: fit1, _cont: 'end' });
          modulesConsumed += fit1;
          remaining -= fit1;
          segments.push({ cells: segCells, modules: segMods + fit1, startMod: modulesConsumed - (segMods + fit1) });
        } else {
          segments.push({ cells: segCells, modules: segMods, startMod: modulesConsumed - segMods });
        }
        // parte(s) intermédias/final
        while (remaining > 0) {
          const take = Math.min(remaining, MAX_MODULES_PER_SEGMENT);
          const isFinal = remaining - take === 0;
          const contFlag = isFinal ? 'start' : 'both';
          const newCell = { ...cell, span: take, _cont: contFlag, text: isFinal ? cell.text : '↩', desc: isFinal ? cell.desc : '' };
          if (isFinal) {
            segCells = [newCell];
            segMods = take;
            modulesConsumed += take;
          } else {
            segments.push({ cells: [newCell], modules: take, startMod: modulesConsumed });
            modulesConsumed += take;
            segCells = [];
            segMods = 0;
          }
          remaining -= take;
        }
      } else {
        // fecha e começa novo com a célula
        segments.push({ cells: segCells, modules: segMods, startMod: modulesConsumed - segMods });
        segCells = [cell];
        segMods = cell.span;
        modulesConsumed += cell.span;
      }
    } else {
      segCells.push(cell);
      segMods += cell.span;
      modulesConsumed += cell.span;
    }
  });
  if (segCells.length) segments.push({ cells: segCells, modules: segMods, startMod: modulesConsumed - segMods });

  return segments.map((s, i) => ({
    ...s,
    rowIndex,
    segIndex: i + 1,
    segTotal: segments.length,
    widthMm: s.modules * MODULE_MM,
    totalRowMods: totalMods,
  }));
}

function paginate(strips, stripHeightMm) {
  const pages = [];
  let cur = { strips: [], usedH: 0, isFirst: true };
  const y0First = MARGIN_TOP + HEADER_H_FIRST + 3;
  const y0Rest = MARGIN_TOP + 3;
  const bottom = PH - FOOTER_H - 3;

  strips.forEach((s) => {
    const startY = cur.isFirst ? y0First : y0Rest;
    const needed = stripHeightMm + GAP_BETWEEN_STRIPS + 3; // + rótulo abaixo/acima
    if (startY + cur.usedH + stripHeightMm > bottom) {
      pages.push(cur);
      cur = { strips: [], usedH: 0, isFirst: false };
    }
    const y = (cur.isFirst ? y0First : y0Rest) + cur.usedH;
    cur.strips.push({ ...s, y });
    cur.usedH += needed;
  });
  if (cur.strips.length) pages.push(cur);
  return pages;
}

export function generateMascaraDinPDF({ header, rows, config, logoBase64 }) {
  const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });

  // Prepara todos os segmentos preservando a ordem (linha 1 seg1, linha1 seg2, linha2 seg1, ...)
  const strips = [];
  rows.forEach((row, i) => {
    const segs = segmentRow(row, i + 1);
    segs.forEach(s => strips.push({ ...s, heightMm: config.stripHeightMm }));
  });

  const pages = paginate(strips, config.stripHeightMm);

  // Cores efectivamente usadas (para legenda)
  const usedColors = new Set();
  rows.forEach(r => r.cells.forEach(c => { if (c.color) usedColors.add(c.color); }));

  pages.forEach((pg, pi) => {
    if (pi > 0) doc.addPage('a4', 'l');
    if (pg.isFirst) {
      drawHeader(doc, header, logoBase64);
      if (usedColors.size > 0) drawColorLegend(doc, Array.from(usedColors));
    }
    else drawMiniHeader(doc);
    drawScaleWarning(doc);

    pg.strips.forEach((s) => {
      drawStrip(doc, s, config);
    });

    drawFooter(doc, pi + 1, pages.length);
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const safe = (s) => (s || '').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  doc.save(`MascaraDIN_${safe(header.panel_name || 'quadro')}_${stamp}.pdf`);
}

function drawHeader(doc, header, logoBase64) {
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, PW, HEADER_H_FIRST + MARGIN_TOP, 'F');
  doc.setFillColor(...YELLOW);
  doc.rect(0, HEADER_H_FIRST + MARGIN_TOP - 0.8, PW, 0.8, 'F');

  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', MARGIN_X, 2, 12, 12); } catch { /* ignore */ }
  }
  doc.setTextColor(...YELLOW);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('MÁSCARA / CAPA DE CALHA DIN', 22, 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(200, 200, 200);
  doc.text('ESCALA 1:1  ·  1 MÓDULO = 18 mm', 22, 13);

  const infoX = 168;
  doc.setTextColor(200, 200, 200);
  doc.setFontSize(5.5);
  doc.text('CLIENTE / OBRA', infoX, 3.5);
  doc.text('QUADRO', infoX + 60, 3.5);
  doc.text('DATA', infoX + 60, 11);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text((header.client_name || '—').slice(0, 40), infoX, 8);
  doc.text((header.panel_name || '—').slice(0, 22), infoX + 60, 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(header.work_date || '—', infoX + 60, 15);
}

function drawMiniHeader(doc) {
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, PW, 2.6, 'F');
  doc.setFillColor(...YELLOW);
  doc.rect(0, 2.6, PW, 0.5, 'F');
}

function drawScaleWarning(doc) {
  doc.setTextColor(...GREY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('IMPRIMIR A 100% (SEM AJUSTE À PÁGINA)', PW - MARGIN_X, PH - 2, { align: 'right' });
}

function drawFooter(doc, page, total) {
  doc.setTextColor(...GREY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('OBELISCO RADICAL · obeliscoradical.pt', MARGIN_X, PH - 2);
  doc.text(`Folha ${page}/${total}`, PW / 2, PH - 2, { align: 'center' });
}

// Legenda de cores — desenha uma linha compacta no fundo da 1ª folha
function drawColorLegend(doc, usedColorIds) {
  const items = usedColorIds.map(id => ({ id, def: COLOR_MAP[id] })).filter(x => x.def);
  if (!items.length) return;
  const y = PH - 9;
  const chip = 3;
  const gap = 2;
  const itemW = 30;
  const totalW = items.length * itemW;
  let x = Math.max(MARGIN_X, (PW - totalW) / 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...GREY);
  doc.text('LEGENDA', x - MARGIN_X + 2, y + chip / 2 + 0.7);

  items.forEach(({ id, def }) => {
    doc.setFillColor(...def.rgb);
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.2);
    doc.rect(x, y, chip, chip, 'FD');
    doc.setTextColor(...BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.text(id, x + chip + 1, y + chip / 2 + 0.7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.text(def.label, x + chip + 1 + 4, y + chip / 2 + 0.7);
    x += itemW + gap;
  });
}

function drawStrip(doc, strip, config) {
  const { y, heightMm, widthMm, cells, rowIndex, segIndex, segTotal, startMod, totalRowMods } = strip;
  const x0 = MARGIN_X + 2; // rótulo à esquerda cabe em 6-8 mm

  // Rótulo esquerdo (índice fila / segmento)
  doc.setTextColor(...GREY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  const rowLabel = segTotal > 1
    ? `F${rowIndex} · ${segIndex}/${segTotal}`
    : `FILA ${rowIndex}`;
  doc.text(rowLabel, MARGIN_X, y + heightMm / 2 + 1);

  // Rótulo direito (largura mm + posições iniciadas)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  const startPos = startMod + 1;
  const endPos = startMod + strip.modules;
  const posLabel = segTotal > 1 ? `pos ${startPos}-${endPos} · ${widthMm}mm` : `${widthMm}mm`;
  doc.text(posLabel, x0 + widthMm + 3, y + heightMm / 2 + 1);

  // Linhas de corte (dashed) acima/abaixo
  drawCutLine(doc, x0 - 2, y - 1.4, x0 + widthMm + 2);
  drawCutLine(doc, x0 - 2, y + heightMm + 1.4, x0 + widthMm + 2);
  drawCorners(doc, x0, y, widthMm, heightMm);

  // Setas de continuação (só para segmentos multi)
  if (segTotal > 1) {
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.4);
    if (segIndex < segTotal) {
      // seta à direita — continua
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(`↦ ${rowIndex}·${segIndex + 1}`, x0 + widthMm + 1.2, y + heightMm + 4);
    }
    if (segIndex > 1) {
      // seta à esquerda — vem de
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(`${rowIndex}·${segIndex - 1} ↤`, x0 - 1.5, y + heightMm + 4, { align: 'right' });
    }
  }

  // Desenha células
  let cx = x0;
  cells.forEach((cell) => {
    const cw = cell.span * MODULE_MM;
    drawCell(doc, cx, y, cw, heightMm, cell);
    cx += cw;
  });

  // Ticks de 18 mm entre células fundidas (guias visuais dentro da capa)
  if (config.showModuleTicks !== false) {
    doc.setDrawColor(...GREY_LIGHT);
    doc.setLineWidth(0.15);
    for (let i = 1; i < widthMm / MODULE_MM; i++) {
      const tx = x0 + i * MODULE_MM;
      doc.line(tx, y - 0.5, tx, y);
      doc.line(tx, y + heightMm, tx, y + heightMm + 0.5);
    }
  }
}

function drawCell(doc, x, y, w, h, cell) {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);
  const colorDef = cell.color ? COLOR_MAP[cell.color] : null;
  const bg = colorDef ? colorDef.rgb : [255, 255, 255];
  const fg = colorDef ? colorDef.fg : [10, 10, 12];
  doc.setFillColor(...bg);
  doc.rect(x, y, w, h, 'FD');

  // Faixa preta topo com identificador
  const topH = Math.min(4.2, h * 0.4);
  doc.setFillColor(...BLACK);
  doc.rect(x, y, w, topH, 'F');
  doc.setTextColor(...YELLOW);
  doc.setFont('helvetica', 'bold');
  const numText = (cell.text || '').slice(0, 14);
  const numSize = Math.min(9, Math.max(5.5, 5 + (w / MODULE_MM) * 0.5));
  doc.setFontSize(numSize);
  doc.text(numText, x + w / 2, y + topH - 1, { align: 'center' });

  // Chip de cor no canto direito da faixa preta (se aplicável)
  if (colorDef) {
    const chipSize = Math.min(2.4, topH - 1);
    const chipX = x + w - chipSize - 0.6;
    const chipY = y + (topH - chipSize) / 2;
    doc.setFillColor(...colorDef.rgb);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.15);
    doc.rect(chipX, chipY, chipSize, chipSize, 'FD');
    // Sigla no chip só se couber (>=2 mm)
    if (chipSize >= 2.2) {
      doc.setTextColor(...colorDef.fg);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(3.4);
      doc.text(cell.color, chipX + chipSize / 2, chipY + chipSize - 0.6, { align: 'center' });
    }
  }

  // Descrição — cor de contraste automática
  doc.setTextColor(...fg);
  doc.setFont('helvetica', 'normal');
  const descSize = Math.min(7, Math.max(4.2, 3.8 + (w / MODULE_MM) * 0.35));
  doc.setFontSize(descSize);
  const desc = (cell.desc || '').trim();
  if (desc) {
    const maxChars = Math.max(6, Math.floor((w / MODULE_MM) * 14));
    const lines = wrapText(desc, maxChars);
    const spaceForText = h - topH - 0.8;
    const lineH = descSize * 0.42;
    const maxLines = Math.max(1, Math.floor(spaceForText / lineH));
    const usedLines = lines.slice(0, maxLines);
    const startY = y + topH + lineH * 0.9;
    usedLines.forEach((ln, i) => {
      doc.text(ln, x + w / 2, startY + i * lineH, { align: 'center' });
    });
  }
}

function wrapText(text, maxCharsPerLine) {
  if (text.length <= maxCharsPerLine) return [text];
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  words.forEach(w => {
    if ((cur + ' ' + w).trim().length <= maxCharsPerLine) {
      cur = (cur + ' ' + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  });
  if (cur) lines.push(cur);
  return lines;
}

function drawCutLine(doc, x1, y, x2) {
  doc.setDrawColor(...GREY_LIGHT);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.line(x1, y, x2, y);
  doc.setLineDashPattern([], 0);
}

function drawCorners(doc, x, y, w, h) {
  doc.setDrawColor(...GREY);
  doc.setLineWidth(0.3);
  const s = 1.4;
  doc.line(x - 2, y, x - 2 + s, y);
  doc.line(x - 2, y, x - 2, y + s);
  doc.line(x + w + 2, y, x + w + 2 - s, y);
  doc.line(x + w + 2, y, x + w + 2, y + s);
  doc.line(x - 2, y + h, x - 2 + s, y + h);
  doc.line(x - 2, y + h, x - 2, y + h - s);
  doc.line(x + w + 2, y + h, x + w + 2 - s, y + h);
  doc.line(x + w + 2, y + h, x + w + 2, y + h - s);
}
