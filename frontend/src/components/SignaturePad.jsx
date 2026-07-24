import { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Eraser } from 'lucide-react';

/**
 * Componente de assinatura por toque/rato.
 * Chama onChange(dataURL) sempre que a assinatura muda (data URL PNG base64).
 */
export default function SignaturePad({ onChange, height = 160, className = '' }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [empty, setEmpty] = useState(true);

  const getCtx = () => canvasRef.current?.getContext('2d');

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fbbf24'; // yellow-400
  }, [height]);

  useEffect(() => { setup(); }, [setup]);

  const getPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const isTouch = e.touches?.length > 0;
    const x = (isTouch ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (isTouch ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x, y };
  };

  const start = (e) => {
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setIsDrawing(true);
  };

  const move = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = getCtx();
    const p = getPoint(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setEmpty(false);
  };

  const end = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (onChange && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    if (onChange) onChange('');
  };

  return (
    <div className={className}>
      <div className="relative bg-zinc-950 border border-zinc-700 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          data-testid="signature-canvas"
          style={{ width: '100%', height, touchAction: 'none', cursor: 'crosshair' }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs text-zinc-600">Assine aqui usando o dedo ou o rato</p>
          </div>
        )}
      </div>
      <div className="flex justify-end mt-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={clear}
          disabled={empty}
          data-testid="signature-clear-btn"
          className="text-xs text-zinc-400 hover:text-red-400 h-7"
        >
          <Eraser className="h-3 w-3 mr-1" /> Limpar
        </Button>
      </div>
    </div>
  );
}
