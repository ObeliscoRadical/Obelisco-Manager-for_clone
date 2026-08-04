import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Ruler, FileDown, Plus, Trash2, Merge, Split, Download, Rows3 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { generateMascaraDinPDF } from '../lib/mascaraDinPdf';

const POSITIONS_OPTIONS = [12, 18, 24, 36];
const MODULE_MM = 18;

const uid = () => Math.random().toString(36).slice(2, 10);

const emptyCell = (span = 1) => ({ id: uid(), span, text: '', desc: '' });

function buildEmptyRow(positions) {
  return { id: uid(), cells: Array.from({ length: positions }, () => emptyCell(1)) };
}

// Total span numa fila
const rowSpan = (row) => row.cells.reduce((a, c) => a + c.span, 0);

export default function MascaraDinPage() {
  const today = new Date().toISOString().slice(0, 10);
  const CFG_KEY = 'mascara_din_config';

  const [config, setConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || { positionsPerRow: 18, stripHeightMm: 12 }; }
    catch { return { positionsPerRow: 18, stripHeightMm: 12 }; }
  });

  useEffect(() => {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(config)); } catch { /* ignore */ }
  }, [config]);

  const [header, setHeader] = useState({
    client_name: '', panel_name: 'Quadro Geral', work_date: today, technician: '',
  });
  const [rows, setRows] = useState(() => [buildEmptyRow(18)]);
  const [logoBase64, setLogoBase64] = useState(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [cellEditor, setCellEditor] = useState(null); // { rowIdx, cellIdx }

  useEffect(() => {
    api.get('/settings/logo').then(res => res.data?.logo && setLogoBase64(res.data.logo)).catch(() => {});
  }, []);

  // === Configuração ===
  const setPositionsPerRow = (n) => {
    if (!POSITIONS_OPTIONS.includes(n) && (n < 4 || n > 60)) return;
    setConfig(c => ({ ...c, positionsPerRow: n }));
    // Ajusta cada fila para o novo tamanho
    setRows(prev => prev.map(r => adjustRowToSize(r, n)));
  };
  const setStripHeightMm = (mm) => {
    const v = Math.max(8, Math.min(18, Number(mm) || 12));
    setConfig(c => ({ ...c, stripHeightMm: v }));
  };

  function adjustRowToSize(row, newPositions) {
    let total = rowSpan(row);
    const cells = [...row.cells];
    if (total < newPositions) {
      while (total < newPositions) { cells.push(emptyCell(1)); total++; }
    } else if (total > newPositions) {
      // Remove do fim, dividindo se necessário
      while (total > newPositions) {
        const last = cells[cells.length - 1];
        if (last.span > 1) {
          last.span -= 1; total -= 1;
        } else {
          cells.pop(); total -= 1;
        }
      }
    }
    return { ...row, cells };
  }

  // === Manipulação de filas ===
  const addRow = () => setRows(prev => [...prev, buildEmptyRow(config.positionsPerRow)]);
  const removeRow = (idx) => setRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  const duplicateRow = (idx) => setRows(prev => {
    const copy = { ...prev[idx], id: uid(), cells: prev[idx].cells.map(c => ({ ...c, id: uid() })) };
    return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
  });

  // === Manipulação de células ===
  const updateCell = (rowIdx, cellIdx, patch) => setRows(prev => {
    const rows2 = [...prev];
    const row = { ...rows2[rowIdx], cells: [...rows2[rowIdx].cells] };
    row.cells[cellIdx] = { ...row.cells[cellIdx], ...patch };
    rows2[rowIdx] = row;
    return rows2;
  });

  // Funde a célula "cellIdx" com a próxima (aumenta span, absorve a seguinte)
  const mergeCellRight = (rowIdx, cellIdx) => setRows(prev => {
    const rows2 = [...prev];
    const row = { ...rows2[rowIdx], cells: [...rows2[rowIdx].cells] };
    if (cellIdx >= row.cells.length - 1) return prev;
    const merged = { ...row.cells[cellIdx], span: row.cells[cellIdx].span + row.cells[cellIdx + 1].span };
    row.cells.splice(cellIdx, 2, merged);
    rows2[rowIdx] = row;
    return rows2;
  });

  // Divide 1 módulo à direita da célula
  const splitCell = (rowIdx, cellIdx) => setRows(prev => {
    const rows2 = [...prev];
    const row = { ...rows2[rowIdx], cells: [...rows2[rowIdx].cells] };
    const cur = row.cells[cellIdx];
    if (cur.span <= 1) return prev;
    row.cells[cellIdx] = { ...cur, span: cur.span - 1 };
    row.cells.splice(cellIdx + 1, 0, emptyCell(1));
    rows2[rowIdx] = row;
    return rows2;
  });

  // === Importar da Legenda ===
  const openImport = () => {
    try {
      const raw = JSON.parse(localStorage.getItem('legenda_quadro_last') || 'null');
      if (!raw || !Array.isArray(raw.modules) || raw.modules.length === 0) {
        toast.error('Não há dados na Legenda. Vá primeiro a "Legenda de Quadro".');
        return;
      }
      setImportPreview(raw);
      setImportDialogOpen(true);
    } catch {
      toast.error('Erro a ler dados da Legenda.');
    }
  };

  const confirmImport = () => {
    if (!importPreview) return;
    // Herda cliente/quadro/data se estiverem vazios
    setHeader(h => ({
      client_name: h.client_name || importPreview.header?.client_name || '',
      panel_name: importPreview.header?.panel_name || h.panel_name,
      work_date: importPreview.header?.work_date || h.work_date,
      technician: importPreview.header?.technician || h.technician,
    }));
    // Divide os módulos por filas segundo positionsPerRow
    const pos = config.positionsPerRow;
    const newRows = [];
    for (let i = 0; i < importPreview.modules.length; i += pos) {
      const slice = importPreview.modules.slice(i, i + pos);
      const cells = slice.map(m => ({
        id: uid(),
        span: 1,
        text: String(m.number ?? ''),
        desc: (m.description || '').trim() || (m.amperage || ''),
      }));
      // Completa a fila até ao tamanho configurado com células vazias
      while (cells.length < pos) cells.push(emptyCell(1));
      newRows.push({ id: uid(), cells });
    }
    setRows(newRows.length ? newRows : [buildEmptyRow(pos)]);
    setImportDialogOpen(false);
    toast.success(`Importados ${importPreview.modules.length} módulos em ${newRows.length} fila(s).`);
  };

  // === Preview scale ===
  // Escala visual: quantos px por mm (ajustável)
  const [pxPerMm, setPxPerMm] = useState(2.6);
  const scaledCell = (span) => span * MODULE_MM * pxPerMm;
  const rowWidthPx = config.positionsPerRow * MODULE_MM * pxPerMm;

  const totalRealWidthMm = config.positionsPerRow * MODULE_MM;

  const handleGenerate = () => {
    if (!header.client_name.trim()) { toast.error('Preencha o Cliente/Obra.'); return; }
    const badRow = rows.findIndex(r => rowSpan(r) !== config.positionsPerRow);
    if (badRow >= 0) {
      toast.error(`Fila ${badRow + 1} não completa os ${config.positionsPerRow} módulos.`);
      return;
    }
    try {
      generateMascaraDinPDF({ header, rows, config, logoBase64 });
      toast.success(`Máscara gerada — ${rows.length} fila(s) a ${totalRealWidthMm} mm cada.`);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF.');
    }
  };

  const totalPositions = useMemo(() => rows.reduce((a, r) => a + rowSpan(r), 0), [rows]);

  return (
    <div className="space-y-5" data-testid="mascara-din-page">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white flex items-center gap-3">
            <Ruler className="h-8 w-8 text-yellow-400" /> Máscara DIN
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Tira em escala real <span className="text-yellow-400 font-semibold">1:1</span> (1 módulo = 18 mm) para colar na capa do quadro. Une módulos consecutivos para aparelhos multipolares.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-zinc-900 border-zinc-800 text-zinc-300">
            {rows.length} fila{rows.length === 1 ? '' : 's'} · {totalPositions} módulos · {totalRealWidthMm} mm
          </Badge>
          <Button data-testid="mascara-import-legenda" onClick={openImport} variant="outline" className="rounded-full border-zinc-700 text-zinc-200 hover:text-white hover:border-yellow-400 h-9 text-xs">
            <Download className="h-4 w-4 mr-2" /> Importar da Legenda
          </Button>
          <Button data-testid="mascara-generate-pdf" onClick={handleGenerate} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold rounded-full">
            <FileDown className="h-4 w-4 mr-2" /> Gerar PDF (100%)
          </Button>
        </div>
      </div>

      {/* CONFIG */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Configuração da Fila</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-zinc-400">Módulos por fila</Label>
            <div className="flex items-center gap-1 mt-1 flex-wrap" data-testid="mascara-positions-toggle">
              {POSITIONS_OPTIONS.map(n => (
                <button
                  key={n}
                  data-testid={`mascara-positions-${n}`}
                  onClick={() => setPositionsPerRow(n)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${config.positionsPerRow === n ? 'bg-yellow-400 text-zinc-950 border-yellow-400' : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-600'}`}
                >{n}</button>
              ))}
              <Input
                type="number"
                data-testid="mascara-positions-custom"
                min={4}
                max={60}
                value={config.positionsPerRow}
                onChange={e => setPositionsPerRow(Math.max(4, Math.min(60, Number(e.target.value) || 4)))}
                className="w-16 h-8 bg-zinc-950 border-zinc-800 text-white text-xs text-center"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Altura da tira (mm)</Label>
            <Input
              type="number"
              data-testid="mascara-strip-height"
              min={8}
              max={18}
              step={0.5}
              value={config.stripHeightMm}
              onChange={e => setStripHeightMm(e.target.value)}
              className="h-9 bg-zinc-950 border-zinc-800 text-white text-xs mt-1"
            />
            <p className="text-[10px] text-zinc-500 mt-1">Padrão: 12 mm. Aceita 8-18 mm.</p>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Zoom do editor</Label>
            <input
              type="range"
              min="1.5"
              max="4"
              step="0.1"
              value={pxPerMm}
              onChange={e => setPxPerMm(Number(e.target.value))}
              className="w-full mt-3 accent-yellow-400"
              data-testid="mascara-zoom"
            />
            <p className="text-[10px] text-zinc-500 mt-1">{pxPerMm.toFixed(1)} px/mm (só visual)</p>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Largura real da fila</Label>
            <div className="h-9 mt-1 px-3 rounded-md bg-zinc-950 border border-zinc-800 flex items-center text-yellow-400 font-mono text-sm">
              {totalRealWidthMm} mm
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CABEÇALHO DO PDF */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-white">Identificação (só no PDF)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-zinc-400">Cliente / Obra *</Label>
            <Input data-testid="mascara-client" value={header.client_name} onChange={e => setHeader({ ...header, client_name: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" placeholder="Ex.: Sr. Silva, Lisboa" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Quadro</Label>
            <Input data-testid="mascara-panel" value={header.panel_name} onChange={e => setHeader({ ...header, panel_name: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Data</Label>
            <Input type="date" data-testid="mascara-date" value={header.work_date} onChange={e => setHeader({ ...header, work_date: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Técnico</Label>
            <Input data-testid="mascara-tech" value={header.technician} onChange={e => setHeader({ ...header, technician: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" />
          </div>
        </CardContent>
      </Card>

      {/* EDITOR VISUAL */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm text-white flex items-center gap-2">
            <Rows3 className="h-4 w-4 text-yellow-400" /> Editor Visual (escala {pxPerMm.toFixed(1)}×)
          </CardTitle>
          <Button size="sm" onClick={addRow} data-testid="mascara-add-row" className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 rounded-full text-xs h-8">
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Fila
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          <div className="flex items-center gap-3 text-[10px] text-zinc-500 uppercase tracking-wider">
            <span>Clique numa célula para editar</span>
            <span className="text-zinc-700">·</span>
            <span>Merge/Split faz o &laquo;aparelho multipolar&raquo;</span>
          </div>
          {rows.map((row, ri) => (
            <div key={row.id} data-testid={`mascara-row-${ri}`} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-400 font-semibold">Fila {ri + 1} — {rowSpan(row) * MODULE_MM} mm ({rowSpan(row)} mods)
                  {rowSpan(row) !== config.positionsPerRow && (
                    <span className="ml-2 text-red-400 normal-case font-normal">⚠ deve totalizar {config.positionsPerRow}</span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => duplicateRow(ri)} title="Duplicar fila" className="text-zinc-500 hover:text-yellow-400 text-[10px] px-2 py-1">Duplicar</button>
                  <button onClick={() => removeRow(ri)} disabled={rows.length <= 1} title="Remover fila" className="text-zinc-500 hover:text-red-400 disabled:opacity-30 p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div
                className="flex items-stretch border-2 border-zinc-700 bg-zinc-950 rounded"
                style={{ width: `${rowWidthPx}px`, height: `${config.stripHeightMm * pxPerMm * 3.4}px` }}
                data-testid={`mascara-row-strip-${ri}`}
              >
                {row.cells.map((cell, ci) => (
                  <button
                    key={cell.id}
                    data-testid={`mascara-cell-${ri}-${ci}`}
                    onClick={() => setCellEditor({ rowIdx: ri, cellIdx: ci })}
                    className="relative border-r border-zinc-800 last:border-r-0 flex flex-col items-center justify-center text-center hover:bg-zinc-800/40 transition group"
                    style={{ width: `${scaledCell(cell.span)}px` }}
                  >
                    {/* faixa preta topo com nº */}
                    <div className="w-full bg-zinc-950 border-b border-yellow-400/40 py-0.5">
                      <span className="text-yellow-400 font-bold text-[10px] leading-none">{cell.text || '—'}</span>
                    </div>
                    {/* descrição */}
                    <div className="flex-1 flex items-center px-1">
                      <span className="text-white text-[9px] leading-tight break-words">
                        {cell.desc || <span className="text-zinc-600">(vazio)</span>}
                      </span>
                    </div>
                    {cell.span > 1 && (
                      <span className="absolute top-0.5 right-0.5 text-[8px] font-bold text-yellow-400 bg-zinc-900/80 px-1 rounded">×{cell.span}</span>
                    )}
                    {/* ticks 18mm */}
                    {cell.span > 1 && Array.from({ length: cell.span - 1 }).map((_, k) => (
                      <div key={k} className="absolute top-0 bottom-0 border-l border-dashed border-zinc-700" style={{ left: `${((k + 1) / cell.span) * 100}%` }} />
                    ))}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/30 text-xs text-yellow-200" data-testid="mascara-print-hint">
        ℹ️ Ao imprimir, escolha <strong>&laquo;Tamanho real&raquo;</strong> ou <strong>&laquo;100%&raquo;</strong> — <span className="uppercase font-semibold">nunca &laquo;ajustar à página&raquo;</span>. Assim garante que 1 módulo = 18 mm no papel.
        {config.positionsPerRow * MODULE_MM > 270 && (
          <div className="mt-1 text-yellow-300/90">
            Fila com {config.positionsPerRow * MODULE_MM} mm excede a largura útil de A4 paisagem (270 mm) — o PDF vai dividir automaticamente em <strong>{Math.ceil((config.positionsPerRow * MODULE_MM) / 270)} segmentos</strong> por fila, com marcas de junção <span className="font-mono">↦ / ↤</span>.
          </div>
        )}
      </div>

      {/* CELL EDITOR DIALOG */}
      <Dialog open={!!cellEditor} onOpenChange={(o) => { if (!o) setCellEditor(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md" data-testid="mascara-cell-editor">
          {cellEditor && (() => {
            const cell = rows[cellEditor.rowIdx].cells[cellEditor.cellIdx];
            const canMerge = cellEditor.cellIdx < rows[cellEditor.rowIdx].cells.length - 1;
            const canSplit = cell.span > 1;
            return (
              <>
                <DialogHeader><DialogTitle>Editar Célula — Fila {cellEditor.rowIdx + 1}, Posição {cellEditor.cellIdx + 1}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-zinc-400">Identificador (grande, faixa preta)</Label>
                    <Input
                      data-testid="mascara-editor-text"
                      value={cell.text}
                      onChange={e => updateCell(cellEditor.rowIdx, cellEditor.cellIdx, { text: e.target.value })}
                      placeholder="Ex.: Q1, 3, ID1"
                      className="bg-zinc-900 border-zinc-800 text-white"
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400">Descrição (linha pequena)</Label>
                    <Input
                      data-testid="mascara-editor-desc"
                      value={cell.desc}
                      onChange={e => updateCell(cellEditor.rowIdx, cellEditor.cellIdx, { desc: e.target.value })}
                      placeholder="Ex.: Iluminação, Tomadas Cozinha"
                      className="bg-zinc-900 border-zinc-800 text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-xs text-zinc-400">Ocupa <strong className="text-yellow-400">{cell.span}</strong> módulo{cell.span === 1 ? '' : 's'} ({cell.span * MODULE_MM} mm)</span>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="mascara-editor-merge"
                      disabled={!canMerge}
                      onClick={() => mergeCellRight(cellEditor.rowIdx, cellEditor.cellIdx)}
                      className="rounded-full border-zinc-700 text-zinc-200 hover:text-white hover:border-yellow-400 h-8 text-xs"
                    >
                      <Merge className="h-3 w-3 mr-1" /> Fundir com direita
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="mascara-editor-split"
                      disabled={!canSplit}
                      onClick={() => splitCell(cellEditor.rowIdx, cellEditor.cellIdx)}
                      className="rounded-full border-zinc-700 text-zinc-200 hover:text-white hover:border-yellow-400 h-8 text-xs"
                    >
                      <Split className="h-3 w-3 mr-1" /> Dividir
                    </Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button data-testid="mascara-editor-close" onClick={() => setCellEditor(null)} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 rounded-full">Fechar</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* IMPORT DIALOG */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md" data-testid="mascara-import-dialog">
          <DialogHeader><DialogTitle>Importar da Legenda de Quadro</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-zinc-400">Encontrámos <strong className="text-yellow-400">{importPreview?.modules?.length || 0} módulos</strong> na tua última sessão da Legenda.</p>
            <p className="text-zinc-500 text-xs">Vão ser divididos em filas de {config.positionsPerRow} módulos e podes depois fundir aparelhos multipolares. Isto substitui as filas actuais.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)} className="rounded-full border-zinc-700 text-zinc-200">Cancelar</Button>
            <Button data-testid="mascara-import-confirm" onClick={confirmImport} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 rounded-full">Importar e substituir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
