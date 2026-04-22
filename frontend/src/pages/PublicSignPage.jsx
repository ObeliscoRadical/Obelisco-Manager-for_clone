import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast, Toaster } from 'sonner';
import { CheckCircle2, PenLine, Loader2, XCircle } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;
const formatEuro = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

function SignaturePad({ onChange, disabled }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    const pt = e.touches ? e.touches[0] : e;
    return { x: (pt.clientX - rect.left) * scaleX, y: (pt.clientY - rect.top) * scaleY };
  };

  const start = (e) => {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = getPos(e);
  };
  const move = (e) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = getPos(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (!hasDrawn) setHasDrawn(true);
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (hasDrawn) onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
    onChange('');
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border-2 border-dashed border-zinc-300 bg-white overflow-hidden" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={260}
          className="w-full h-[180px] sm:h-[220px] cursor-crosshair"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
          data-testid="signature-canvas"
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-zinc-400 text-sm">
            <PenLine className="mr-2" size={18} /> Assine aqui com o dedo ou rato
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        disabled={disabled || !hasDrawn}
        data-testid="signature-clear"
        className="text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-40"
      >
        Limpar assinatura
      </button>
    </div>
  );
}

export default function PublicSignPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const fetchProposal = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/public/proposal/${token}`);
      setProposal(data.proposal);
      if (data.proposal.sign_status === 'signed') {
        setDone(true);
      }
      if (data.proposal.client_name) setName(data.proposal.client_name);
    } catch (err) {
      setError(err.response?.data?.detail || 'Link inválido ou expirado');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchProposal(); }, [fetchProposal]);

  const handleSubmit = async () => {
    if (!signature) { toast.error('Por favor desenhe a sua assinatura'); return; }
    if (!name || name.trim().length < 3) { toast.error('Por favor indique o seu nome completo'); return; }
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/public/proposal/${token}/sign`, {
        signature_data: signature,
        signed_by_name: name.trim(),
        signed_by_email: email.trim(),
      });
      setDone(true);
      toast.success('Proposta assinada com sucesso!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao submeter assinatura');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="animate-spin text-yellow-500" size={48} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <XCircle className="mx-auto text-red-500 mb-4" size={56} />
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">Link inválido</h1>
          <p className="text-zinc-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Toaster position="top-center" richColors />
      {/* Header */}
      <div className="bg-zinc-950 text-white px-4 py-5 border-b-2 border-yellow-400">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight">Obelisco Radical</h1>
            <p className="text-xs text-zinc-400 uppercase tracking-[0.2em]">Eletricidade & Telecomunicações</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        {done ? (
          <div className="bg-white rounded-2xl shadow-md p-8 text-center" data-testid="signed-confirmation">
            <CheckCircle2 className="mx-auto text-green-500 mb-4" size={72} />
            <h2 className="text-3xl font-black text-zinc-900 mb-2">Proposta Assinada!</h2>
            <p className="text-zinc-600 mb-6">Obrigado{proposal?.signed_by_name ? `, ${proposal.signed_by_name}` : ''}. A sua assinatura foi registada e a Obelisco Radical foi notificada.</p>
            {proposal?.signature_data && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wider text-zinc-400 mb-2">Assinatura registada</p>
                <img src={proposal.signature_data} alt="Assinatura" className="mx-auto h-28 object-contain border border-zinc-200 rounded-lg bg-white" />
                {proposal.signed_at && (
                  <p className="text-xs text-zinc-400 mt-2">{new Date(proposal.signed_at).toLocaleString('pt-PT')}</p>
                )}
              </div>
            )}
            <p className="text-xs text-zinc-400 mt-8">Receberá em breve confirmação por email/WhatsApp.</p>
          </div>
        ) : (
          <>
            {/* Proposal summary */}
            <div className="bg-white rounded-2xl shadow-md p-6 sm:p-8">
              <p className="text-xs uppercase tracking-widest text-yellow-600 font-semibold mb-1">Proposta</p>
              <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-4">{proposal.title}</h2>
              <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div>
                  <p className="text-xs uppercase text-zinc-400 font-medium">Cliente</p>
                  <p className="text-zinc-900 font-semibold">{proposal.client_name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-zinc-400 font-medium">Valor final</p>
                  <p className="text-2xl font-black text-yellow-600">{formatEuro(proposal.final_value)}</p>
                </div>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                {proposal.description || 'Proposta de serviços elétricos e de telecomunicações. Garantia de 2 anos sobre mão de obra e materiais fornecidos. Valores em euros, IVA não incluído.'}
              </p>

              {proposal.items && proposal.items.length > 0 && (
                <details className="mt-4">
                  <summary className="text-sm text-zinc-600 cursor-pointer hover:text-zinc-900 font-medium">Ver detalhe dos itens ({proposal.items.length})</summary>
                  <div className="mt-3 max-h-64 overflow-y-auto border border-zinc-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-100 text-zinc-600 uppercase tracking-wider">
                        <tr>
                          <th className="text-left p-2">Descrição</th>
                          <th className="text-right p-2 w-16">Qtd</th>
                        </tr>
                      </thead>
                      <tbody>
                        {proposal.items.map((it, i) => (
                          <tr key={it.id || `${it.name}-${i}`} className="border-t border-zinc-100">
                            <td className="p-2 text-zinc-700">{it.name}</td>
                            <td className="p-2 text-right text-zinc-600">{it.quantity} {it.unit || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>

            {/* Signature block */}
            <div className="bg-white rounded-2xl shadow-md p-6 sm:p-8">
              <h3 className="text-lg font-bold text-zinc-900 mb-1">Aceitar e Assinar</h3>
              <p className="text-xs text-zinc-500 mb-5">Ao assinar confirma a aceitação dos termos, valores e condições desta proposta.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">Nome completo *</label>
                  <input
                    data-testid="sign-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Escreva o seu nome"
                    className="w-full h-11 px-4 bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">Email <span className="text-zinc-400 font-normal normal-case">(opcional)</span></label>
                  <input
                    data-testid="sign-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full h-11 px-4 bg-white border border-zinc-300 rounded-lg text-zinc-900 focus:outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">Assinatura *</label>
                  <SignaturePad onChange={setSignature} disabled={submitting} />
                </div>
              </div>

              <button
                data-testid="sign-submit-btn"
                onClick={handleSubmit}
                disabled={submitting || !signature || !name}
                className="w-full mt-6 h-14 bg-yellow-400 hover:bg-yellow-500 text-zinc-950 font-black uppercase tracking-wider rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader2 className="animate-spin" size={20} /> A submeter...</> : <><CheckCircle2 size={20} /> Aceitar e Assinar Proposta</>}
              </button>

              <p className="text-[10px] text-zinc-400 text-center mt-4">
                Ao assinar, está a aceitar os termos desta proposta. A assinatura será registada com data, hora e IP.
              </p>
            </div>
          </>
        )}

        <p className="text-center text-xs text-zinc-400 pt-4">Obelisco Radical | Eletricidade & Telecomunicações | Grande Lisboa</p>
      </div>
    </div>
  );
}
