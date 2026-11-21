import { useId } from 'react';

/** Fleet / shipment temperature line with the safe band, styled after the Figma “Temperature monitoring” card. */
export function TempAreaChart({
  points,
  min,
  max,
  height = 220,
  label,
}: {
  points: { t: string; v: number }[];
  min: number;
  max: number;
  height?: number;
  label: string;
}) {
  const gid = useId().replace(/:/g, '');
  if (points.length < 2) return <p className="p-8 text-center text-[13px] text-muted">Not enough readings yet.</p>;
  const W = 720;
  const H = height;
  const L = 36;
  const R = 12;
  const T = 14;
  const B = 26;
  const vals = points.map((p) => p.v);
  const lo = Math.floor(Math.min(min - 1, ...vals));
  const hi = Math.ceil(Math.max(max + 2, ...vals));
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += 2) ticks.push(v);
  const xTicks = 6;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label}. Latest ${last.v.toFixed(1)}°C, safe range ${min}–${max}°C.`}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0D9488" stopOpacity="0.18" />
          <stop offset="1" stopColor="#0D9488" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={L} y={y(max)} width={W - L - R} height={y(min) - y(max)} fill="#0D9488" opacity="0.05" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#EDF0F4" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#8C98A8">{v}°</text>
        </g>
      ))}
      {[max, min].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#D39B34" strokeDasharray="4 4" opacity="0.7" />
          <text x={W - R - 2} y={y(v) + (v === max ? -5 : 12)} textAnchor="end" fontSize="9" fontWeight="600" fill="#8F6110">
            {v === max ? 'MAX' : 'MIN'} {v}°C
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke="#0D9488" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) =>
        p.v < min || p.v > max ? <circle key={i} cx={x(i)} cy={y(p.v)} r="3" fill="#D75A5E" /> : null,
      )}
      <circle cx={x(points.length - 1)} cy={y(last.v)} r="4" fill="#0D9488" stroke="#fff" strokeWidth="2" />
      {Array.from({ length: xTicks }, (_, k) => {
        const i = Math.round((k / (xTicks - 1)) * (points.length - 1));
        return (
          <text key={k} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#8C98A8">
            {new Date(points[i].t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </text>
        );
      })}
    </svg>
  );
}

export function Donut({ value, size = 168 }: { value: number; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#F0C977" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="#0D9488"
        strokeWidth="9"
        strokeDasharray={`${pct * c} ${c}`}
        transform="rotate(-90 50 50)"
        strokeLinecap={pct > 0 && pct < 1 ? 'round' : 'butt'}
      />
    </svg>
  );
}
