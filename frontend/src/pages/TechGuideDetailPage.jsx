import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Package, MapPin, Calendar, CheckCircle2, AlertTriangle, Save, Truck, Clock, FileText, Camera, X, Image } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePad from '../components/SignaturePad';

const STATUS_MAP = {
  emitida:        { label: 'Emitida',        color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  em_transito:    { label: 'Em trânsito',    color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  recebida:       { label: 'Recebida',       color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  recebida_com_diferencas: { label: 'Rec. com diferenças', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
};

export default function TechGuideDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveItems, setReceiveItems] = useState({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [signedByName, setSignedByName] = useState('');
  const [saving, setSaving] = useState(false);
  const [usageEdit, setUsageEdit] = useState({});
  const [usageNote, setUsageNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [signature, setSignature] = useState('');

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('guide_id', id);
        const { data } = await api.post('/tech/upload/photo', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setPhotos(prev => [data, ...prev]);
      }
      toast.success(`${files.length} foto(s) enviada(s)`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao enviar foto');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [guideRes, photoRes] = await Promise.all([
        api.get(`/tech/transport-guides/${id}`),
        api.get(`/tech/photos?guide_id=${id}`).catch(() => ({ data: [] })),
      ]);
      const data = guideRes.data;
      setGuide(data);
      setPhotos(photoRes.data || []);
      // pré-preencher formulários com valores actuais
      const initReceive = {};
      const initUsage = {};
      (data.items || []).forEach(it => {
        initReceive[it.id] = { qty_received: it.qty_received ?? it.qty_planned, damaged_qty: it.damaged_qty || 0, notes: it.notes || '' };
        initUsage[it.id] = { qty_used: it.qty_used || 0, notes: it.notes || '' };
      });
      setReceiveItems(initReceive);
      setUsageEdit(initUsage);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Guia não encontrada');
      nav('/tech');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const jaRecebida = useMemo(() => guide && ['recebida', 'recebida_com_diferencas'].includes(guide.status), [guide]);

  const handleReceive = async () => {
    if (!signedByName.trim()) { toast.error('Por favor indique o seu nome para assinar'); return; }
    setSaving(true);
    try {
      const payload = {
        items: (guide.items || []).map(it => ({
          ...it,
          qty_received: Number(receiveItems[it.id]?.qty_received ?? it.qty_planned),
          damaged_qty: Number(receiveItems[it.id]?.damaged_qty ?? 0),
          notes: receiveItems[it.id]?.notes || '',
        })),
        signed_by_name: signedByName,
        reception_notes: receiveNotes,
        photos: photos.map(p => p.url),
        signature_data: signature || '',
      };
      await api.post(`/tech/transport-guides/${id}/receive`, payload);
      toast.success('Guia recebida com sucesso!');
      setReceiveOpen(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao receber guia');
    } finally { setSaving(false); }
  };

  const handleSaveUsage = async () => {
    setSaving(true);
    try {
      const items = Object.entries(usageEdit).map(([itemId, v]) => ({
        id: itemId,
        qty_used: Number(v.qty_used) || 0,
        notes: v.notes || '',
      }));
      await api.post(`/tech/transport-guides/${id}/usage`, { items, note: usageNote });
      toast.success('Consumo actualizado');
      setUsageNote('');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao actualizar consumo');
    } finally { setSaving(false); }
  };

  if (loading || !guide) {
    return (
      <div className="flex items-center justify-center py-24" data-testid="tech-guide-loading">
        <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const st = STATUS_MAP[guide.status] || { label: guide.status, color: 'bg-zinc-800 text-zinc-300 border-zinc-700' };

  return (
    <div className="space-y-4" data-testid="tech-guide-detail">
      <Link to="/tech" className="inline-flex items-center gap-1 text-yellow-400 hover:text-yellow-300 text-sm" data-testid="tech-back-btn">
        <ArrowLeft className="h-4 w-4" /> Voltar às guias
      </Link>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Guia de Transporte</p>
              <p className="text-2xl font-bold text-white font-mono">{guide.number}</p>
            </div>
            <Badge className={`gap-1 border ${st.color}`} data-testid="tech-guide-status">{st.label}</Badge>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2 text-zinc-300">
              <MapPin className="h-4 w-4 text-zinc-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] text-zinc-500 uppercase">Destino</p>
                <p>{guide.destination || '—'}</p>
              </div>
            </div>
            {guide.expected_delivery_date && (
              <div className="flex items-center gap-2 text-zinc-300">
                <Calendar className="h-4 w-4 text-zinc-500" />
                <span>{new Date(guide.expected_delivery_date).toLocaleDateString('pt-PT')}</span>
              </div>
            )}
            {guide.notes && (
              <div className="flex items-start gap-2 text-zinc-300">
                <FileText className="h-4 w-4 text-zinc-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-zinc-400">{guide.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fotos da obra / material */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-sm text-white flex items-center gap-2">
            <Camera className="h-4 w-4 text-yellow-400" /> Fotos ({photos.length})
          </CardTitle>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={handlePhotoUpload}
              className="hidden"
              data-testid="photo-upload-input"
            />
            <span className="text-xs px-3 py-1.5 rounded-lg bg-yellow-500 text-zinc-900 font-semibold hover:bg-yellow-400 inline-flex items-center gap-1">
              <Camera className="h-3 w-3" />
              {uploading ? 'A carregar…' : 'Adicionar'}
            </span>
          </label>
        </CardHeader>
        <CardContent>
          {photos.length === 0 && (
            <p className="text-xs text-zinc-500 italic py-2">Nenhuma foto ainda. Use o botão "Adicionar" para tirar/enviar fotos da obra ou dos materiais.</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {photos.map(p => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block relative aspect-square rounded overflow-hidden bg-zinc-950 border border-zinc-800" data-testid={`photo-${p.id}`}>
                <img src={p.url} alt={p.caption || 'Foto'} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Botão principal — Receber */}
      {!jaRecebida && (
        <Button
          onClick={() => setReceiveOpen(true)}
          data-testid="tech-open-receive-btn"
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-zinc-900 font-semibold h-12"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" /> Confirmar Receção
        </Button>
      )}

      {/* Lista de materiais + consumo (após recebida) */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white flex items-center gap-2">
            <Package className="h-4 w-4 text-yellow-400" /> Materiais ({(guide.items || []).length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(guide.items || []).map(it => {
            const sobra = (it.qty_received ?? 0) - (it.qty_used ?? 0);
            return (
              <div key={it.id} className="p-3 rounded-lg bg-zinc-950 border border-zinc-800" data-testid={`tech-item-${it.id}`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-white">{it.name}</p>
                    <p className="text-[11px] text-zinc-500">{it.category || 'Sem categoria'} · {it.unit}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                  <div>
                    <p className="text-zinc-500 uppercase text-[10px]">Planeado</p>
                    <p className="text-white font-mono">{it.qty_planned}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 uppercase text-[10px]">Recebido</p>
                    <p className={`font-mono ${it.qty_received != null ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {it.qty_received ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500 uppercase text-[10px]">Sobra</p>
                    <p className="text-yellow-400 font-mono">{jaRecebida ? sobra.toFixed(2) : '—'}</p>
                  </div>
                </div>

                {jaRecebida && (
                  <div className="mt-2 pt-2 border-t border-zinc-800">
                    <Label className="text-[11px] text-zinc-400">Quantidade usada até agora</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={usageEdit[it.id]?.qty_used ?? 0}
                      onChange={e => setUsageEdit(prev => ({ ...prev, [it.id]: { ...prev[it.id], qty_used: e.target.value } }))}
                      data-testid={`tech-usage-${it.id}`}
                      className="mt-1 bg-zinc-950 border-zinc-700 h-9 text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {jaRecebida && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 space-y-3">
            <div>
              <Label className="text-xs text-zinc-400">Nota desta atualização (opcional)</Label>
              <Textarea
                value={usageNote}
                onChange={e => setUsageNote(e.target.value)}
                data-testid="tech-usage-note"
                placeholder="ex: fim do dia 3/abril — sobrou 5m de cabo"
                className="mt-1 bg-zinc-950 border-zinc-700 text-sm min-h-[70px]"
              />
            </div>
            <Button
              onClick={handleSaveUsage}
              disabled={saving}
              data-testid="tech-save-usage-btn"
              className="w-full bg-yellow-500 hover:bg-yellow-400 text-zinc-900 font-semibold h-11"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'A guardar...' : 'Guardar consumo'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Receção */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-md bg-zinc-900 border-zinc-800 text-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Confirmar Receção</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">Verifique quantidades recebidas. Diferenças ficarão registadas.</p>
            {(guide.items || []).map(it => (
              <div key={it.id} className="p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <p className="text-sm text-white font-medium mb-1">{it.name}</p>
                <p className="text-[11px] text-zinc-500 mb-2">Planeado: <span className="font-mono text-white">{it.qty_planned} {it.unit}</span></p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-zinc-400 uppercase">Recebido</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={receiveItems[it.id]?.qty_received ?? ''}
                      onChange={e => setReceiveItems(prev => ({ ...prev, [it.id]: { ...prev[it.id], qty_received: e.target.value } }))}
                      data-testid={`tech-receive-qty-${it.id}`}
                      className="mt-1 bg-zinc-900 border-zinc-700 h-9 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-zinc-400 uppercase">Danificado</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={receiveItems[it.id]?.damaged_qty ?? 0}
                      onChange={e => setReceiveItems(prev => ({ ...prev, [it.id]: { ...prev[it.id], damaged_qty: e.target.value } }))}
                      data-testid={`tech-receive-damaged-${it.id}`}
                      className="mt-1 bg-zinc-900 border-zinc-700 h-9 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
            <div>
              <Label className="text-xs text-zinc-400">Assinado por (o seu nome)</Label>
              <Input
                value={signedByName}
                onChange={e => setSignedByName(e.target.value)}
                data-testid="tech-signed-by"
                placeholder="Nome completo"
                className="mt-1 bg-zinc-950 border-zinc-700 h-10"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Assinatura digital *</Label>
              <SignaturePad onChange={setSignature} height={140} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Notas de receção</Label>
              <Textarea
                value={receiveNotes}
                onChange={e => setReceiveNotes(e.target.value)}
                data-testid="tech-receive-notes"
                placeholder="ex: cabo veio molhado, entregue pelo motorista X..."
                className="mt-1 bg-zinc-950 border-zinc-700 text-sm min-h-[70px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)} className="border-zinc-700">Cancelar</Button>
            <Button
              onClick={handleReceive}
              disabled={saving}
              data-testid="tech-confirm-receive-btn"
              className="bg-yellow-500 hover:bg-yellow-400 text-zinc-900 font-semibold"
            >
              {saving ? 'A registar...' : 'Confirmar Receção'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
