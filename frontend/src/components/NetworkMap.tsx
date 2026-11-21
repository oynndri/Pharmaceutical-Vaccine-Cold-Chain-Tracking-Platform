import clsx from 'clsx';
import { Home, Minus, Plus } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AlertLevel, Shipment } from '../types';

/**
 * Schematic network map: warehouses, clinics, and each in-transit truck placed along its route by trip progress.
 * TODO(backend-sync): once telemetry carries GPS (lat/lng), position trucks from real coordinates
 * (or swap this for a Leaflet/MapLibre map).
 */

const W = 1000;
const H = 520;

const places: Record<string, [number, number]> = {
  'Central Warehouse, Dhaka': [520, 300],
  'Chattogram Hub': [880, 430],
  'Khulna Depot': [150, 440],
  'Rural Health Clinic, Gazipur': [500, 70],
  'District Hospital, Tangail': [180, 90],
  'Community Clinic, Savar': [300, 250],
  'City Health Center, Dhaka': [640, 250],
  'Upazila Health Center, Manikganj': [90, 260],
  'General Hospital, Narayanganj': [690, 420],
  'Community Clinic, Tongi': [590, 150],
  'Upazila Health Complex, Narsingdi': [860, 170],
  'Rural Health Post, Keraniganj': [430, 430],
};
const warehouses = new Set(['Central Warehouse, Dhaka', 'Chattogram Hub', 'Khulna Depot']);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function positionOf(s: Shipment): [number, number] | null {
  const a = places[s.origin];
  const b = places[s.destination];
  if (!a || !b) return null;
  const start = new Date(s.createdAtIso).getTime();
  const end = s.etaIso ? new Date(s.etaIso).getTime() : start + 4 * 3600_000;
  const p = Math.min(0.95, Math.max(0.05, (Date.now() - start) / Math.max(1, end - start)));
  // Small perpendicular jitter so trucks on the same route don't stack.
  const j = (hash(s.id) - 0.5) * 28;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [a[0] + dx * p + (-dy / len) * j, a[1] + dy * p + (dx / len) * j];
}

const levelFill: Record<AlertLevel, string> = { ok: '#0D9488', warning: '#D39B34', critical: '#D75A5E' };

export const NetworkMap = memo(function NetworkMap({ shipments, className }: { shipments: Shipment[]; className?: string }) {
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(1);
  const active = useMemo(() => shipments.filter((s) => s.status === 'in_transit'), [shipments]);
  const routes = useMemo(() => {
    const set = new Map<string, [string, string]>();
    for (const s of active) set.set(`${s.origin}|${s.destination}`, [s.origin, s.destination]);
    return [...set.values()];
  }, [active]);
  // Draw normal trucks first so warnings/criticals sit on top.
  const ordered = useMemo(() => {
    const rank: Record<AlertLevel, number> = { ok: 0, warning: 1, critical: 2 };
    return [...active].sort((a, b) => rank[a.alertLevel] - rank[b.alertLevel]);
  }, [active]);
  const vbW = W / zoom;
  const vbH = H / zoom;
  const vb = `${(W - vbW) / 2} ${(H - vbH) / 2} ${vbW} ${vbH}`;

  return (
    <div className={clsx('relative overflow-hidden bg-[#EEF3F0]', className)}>
      <svg viewBox={vb} className="h-full w-full" role="img" aria-label={`Network map with ${active.length} vehicles in transit`} preserveAspectRatio="xMidYMid slice">
        {/* terrain */}
        <rect x="-200" y="-200" width={W + 400} height={H + 400} fill="#EEF3F0" />
        <ellipse cx="240" cy="160" rx="150" ry="90" fill="#DCEBDD" />
        <ellipse cx="780" cy="300" rx="120" ry="80" fill="#DCEBDD" />
        <ellipse cx="420" cy="480" rx="160" ry="60" fill="#DCEBDD" />
        <path d="M-50 360 C 180 300, 330 400, 470 360 S 700 250, 760 330 S 900 480, 1050 470" fill="none" stroke="#BFDDE6" strokeWidth="22" strokeLinecap="round" />
        <path d="M640 -20 C 620 120, 700 200, 650 300 S 640 470, 720 560" fill="none" stroke="#BFDDE6" strokeWidth="12" strokeLinecap="round" />
        {/* road grid */}
        {[120, 220, 320, 420].map((yy) => (
          <line key={`h${yy}`} x1="-100" x2={W + 100} y1={yy} y2={yy + 30} stroke="#fff" strokeWidth="5" />
        ))}
        {[160, 340, 520, 700, 860].map((xx) => (
          <line key={`v${xx}`} x1={xx} x2={xx - 40} y1="-100" y2={H + 100} stroke="#fff" strokeWidth="5" />
        ))}
        {/* routes */}
        {routes.map(([o, d]) => {
          const a = places[o];
          const b = places[d];
          if (!a || !b) return null;
          return <line key={o + d} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#0D9488" strokeOpacity="0.25" strokeWidth="2.5" strokeDasharray="6 6" />;
        })}
        {/* places */}
        {Object.entries(places).map(([name, [px, py]]) =>
          warehouses.has(name) ? (
            <g key={name}>
              <circle cx={px} cy={py} r="16" fill="#102A43" />
              <foreignObject x={px - 8} y={py - 8} width="16" height="16">
                <Home className="h-4 w-4 text-white" aria-hidden />
              </foreignObject>
              <text x={px} y={py + 32} textAnchor="middle" fontSize="12" fontWeight="600" fill="#24364B">{name.split(',')[0]}</text>
            </g>
          ) : (
            <g key={name}>
              <circle cx={px} cy={py} r="6" fill="#fff" stroke="#102A43" strokeWidth="2" />
              <text x={px} y={py - 12} textAnchor="middle" fontSize="11" fill="#6A798B">{name.split(', ')[1] ?? name}</text>
            </g>
          ),
        )}
        {/* trucks */}
        {ordered.map((s) => {
          const pos = positionOf(s);
          if (!pos) return null;
          const big = s.alertLevel !== 'ok';
          return (
            <g
              key={s.id}
              transform={`translate(${pos[0]} ${pos[1]})`}
              className="cursor-pointer"
              onClick={() => navigate(`/shipments/${s.id}`)}
            >
              <title>{`${s.code} · ${s.vehiclePlate} · ${s.currentTempC?.toFixed(1) ?? '—'}°C → ${s.destination}`}</title>
              {big ? (
                <>
                  {s.alertLevel === 'critical' && <circle r="16" fill={levelFill.critical} opacity="0.2" className="animate-ping" style={{ transformOrigin: 'center', transformBox: 'fill-box' }} />}
                  <rect x="-11" y="-11" width="22" height="22" rx="6" fill={levelFill[s.alertLevel]} stroke="#fff" strokeWidth="2" />
                  <path d="M-6 -2h7v6h-7zM1 0h3l2 2v2h-5z" fill="#fff" />
                </>
              ) : (
                <circle r="4" fill={levelFill.ok} stroke="#fff" strokeWidth="1.5" />
              )}
            </g>
          );
        })}
      </svg>

      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-lg border border-line bg-white shadow-card">
        <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z * 1.4))} className="p-2 text-muted hover:bg-canvas"><Plus className="h-4 w-4" /></button>
        <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z / 1.4))} className="border-t border-line p-2 text-muted hover:bg-canvas"><Minus className="h-4 w-4" /></button>
      </div>

      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-white/95 px-3 py-2 text-[11px] text-muted shadow-card">
        <Legend color={levelFill.ok} label="In transit" />
        <Legend color={levelFill.warning} label="Warning" />
        <Legend color={levelFill.critical} label="Critical" />
        <Legend color="#102A43" label="Warehouse" />
        <span className="text-faint">Schematic · positions estimated from trip progress</span>
      </div>
    </div>
  );
});

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
