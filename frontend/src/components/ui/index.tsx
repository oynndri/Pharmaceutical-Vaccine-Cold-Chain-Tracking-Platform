import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Thermometer } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { AlertLevel, ShipmentStatus } from '../../types';

/* ---------- Buttons ---------- */

import { buttonClass, levelTextColor } from './styles';
import type { ButtonSize, ButtonVariant } from './styles';

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button {...rest} disabled={disabled || loading} className={buttonClass(variant, size, className)}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}


export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className ?? 'h-5 w-5')}
    />
  );
}

/* ---------- Layout ---------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-faint">Your cold chain, connected</p>
        <h1 className="mt-1.5 text-[28px] font-bold leading-tight tracking-tightest text-ink sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('rounded-xl border border-line bg-white shadow-card', className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3 px-5 pb-3 pt-5">
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="tablist" className="flex gap-6 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            '-mb-px flex items-center gap-2 border-b-2 pb-3 text-[13px] font-medium transition',
            value === t.value ? 'border-brand text-brand-link' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={clsx('rounded px-1.5 text-[11px] tabular', value === t.value ? 'bg-brand-soft text-brand-link' : 'bg-canvas text-muted')}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------- States ---------- */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-10 text-muted">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="m-4 flex items-start gap-3 rounded-lg border border-crit-line bg-crit-bg p-4 text-crit-text">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">Couldn’t load data</p>
        <p className="text-[13px]">{message}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 p-10 text-center text-muted">
      <CheckCircle2 className="h-8 w-8 text-ok" aria-hidden />
      <p className="font-medium text-ink">{title}</p>
      {children}
    </div>
  );
}

/* ---------- Status ---------- */

type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral';
const toneClass: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok-text border-ok-line',
  warn: 'bg-warn-bg text-warn-text border-warn-line',
  crit: 'bg-crit-bg text-crit-text border-crit-line',
  info: 'bg-info-bg text-info-text border-info-line',
  neutral: 'bg-canvas text-muted border-line',
};
const dotClass: Record<Tone, string> = { ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit', info: 'bg-info', neutral: 'bg-faint' };

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium', toneClass[tone])}>
      <span aria-hidden className={clsx('h-1.5 w-1.5 rounded-full', dotClass[tone])} />
      {children}
    </span>
  );
}

const levelTone: Record<AlertLevel, Tone> = { ok: 'ok', warning: 'warn', critical: 'crit' };
const levelText: Record<AlertLevel, string> = { ok: 'Normal', warning: 'Warning', critical: 'Critical' };

export function LevelBadge({ level }: { level: AlertLevel }) {
  return <Badge tone={levelTone[level]}>{levelText[level]}</Badge>;
}

/** Combined trip status + live alert level, as in the design's “Status” column. */
export function ShipmentStatusBadge({ status, level }: { status: ShipmentStatus; level: AlertLevel }) {
  if (status === 'in_transit' && level !== 'ok') return <LevelBadge level={level} />;
  const map: Record<ShipmentStatus, [Tone, string]> = {
    in_transit: ['ok', 'In Transit'],
    delivered: ['info', 'Delivered'],
    scheduled: ['neutral', 'Scheduled'],
    cancelled: ['neutral', 'Cancelled'],
  };
  const [tone, text] = map[status];
  return <Badge tone={tone}>{text}</Badge>;
}


export function TempReading({ tempC, level, className }: { tempC: number | null; level: AlertLevel; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 font-medium tabular', levelTextColor[level], className)}>
      <Thermometer className="h-4 w-4" aria-hidden />
      {tempC === null ? '—' : `${tempC.toFixed(1)}°C`}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .replace(/^Dr\.\s*/, '')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span aria-hidden className={clsx('inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand-link', className ?? 'h-9 w-9 text-[12px]')}>
      {initials}
    </span>
  );
}

/* ---------- Forms ---------- */

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-body">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}


