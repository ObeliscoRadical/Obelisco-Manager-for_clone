const normalize = (value, min, max) => {
  const span = max - min;
  if (!Number.isFinite(value) || !Number.isFinite(span) || span === 0) return 50;
  return ((value - min) / span) * 100;
};

export const TeamGeoMap = ({ positions = [], selectedTechnicianId, onSelectTechnician }) => {
  if (!positions.length) {
    return (
      <div data-testid="team-geo-map-empty" className="flex h-[320px] items-center justify-center rounded-[28px] border border-zinc-800 bg-zinc-900/60 text-sm text-zinc-500">
        Ainda não existem coordenadas suficientes para desenhar o mapa da equipa.
      </div>
    );
  }

  const lats = positions.map(item => Number(item.latitude || 0));
  const lons = positions.map(item => Number(item.longitude || 0));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  return (
    <div data-testid="team-geo-map" className="relative h-[320px] overflow-hidden rounded-[28px] border border-zinc-800 bg-[radial-gradient(circle_at_top_left,_rgba(250,204,21,0.18),_transparent_35%),linear-gradient(180deg,_rgba(24,24,27,0.96),_rgba(9,9,11,1))]">
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      <div className="absolute left-4 top-4 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-yellow-400">
        Mapa relativo da equipa
      </div>

      {positions.map((item, index) => {
        const left = normalize(Number(item.longitude || 0), minLon, maxLon);
        const top = 100 - normalize(Number(item.latitude || 0), minLat, maxLat);
        const isSelected = selectedTechnicianId === item.technician_id;
        return (
          <button
            key={item.technician_id}
            data-testid={`team-map-marker-${item.technician_id}`}
            onClick={() => onSelectTechnician?.(item.technician_id)}
            className="group absolute"
            style={{ left: `calc(${left}% - 14px)`, top: `calc(${top}% - 14px)` }}
            title={`${item.technician_name} · ${item.address || `${item.latitude}, ${item.longitude}`}`}
          >
            <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-black transition-all ${isSelected ? 'border-yellow-300 bg-yellow-400 text-zinc-950 scale-110' : item.is_clocked_in ? 'border-emerald-400/40 bg-emerald-400 text-zinc-950' : 'border-zinc-600 bg-zinc-800 text-white'}`}>
              {index + 1}
            </span>
            <span className={`pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold transition-all ${isSelected ? 'border-yellow-400/40 bg-zinc-950 text-yellow-300 opacity-100' : 'border-zinc-700 bg-zinc-950/90 text-zinc-400 opacity-0 group-hover:opacity-100'}`}>
              {item.technician_name}
            </span>
          </button>
        );
      })}

      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
        <span className="rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-1">Longitude {minLon.toFixed(4)} → {maxLon.toFixed(4)}</span>
        <span className="rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-1">Latitude {minLat.toFixed(4)} → {maxLat.toFixed(4)}</span>
      </div>
    </div>
  );
};