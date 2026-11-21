import clsx from 'clsx';
import type { AlertLevel } from '../../types';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'xl';

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return clsx(
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50',
    {
      primary: 'bg-brand text-white shadow-sm hover:bg-brand-hover focus-visible:ring-brand/25',
      secondary: 'border border-line bg-white text-body shadow-sm hover:bg-canvas focus-visible:ring-brand/20',
      danger: 'bg-crit text-white hover:bg-crit-text focus-visible:ring-crit/25',
      ghost: 'text-muted hover:bg-canvas hover:text-ink focus-visible:ring-brand/20',
      link: 'px-0 text-brand-link hover:underline focus-visible:ring-brand/20',
    }[variant],
    variant !== 'link' &&
      {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4 text-[13px]',
        // Driver flows: ≥56px targets, usable with gloves.
        xl: 'min-h-14 px-6 text-base',
      }[size],
    className,
  );
}

export const levelTextColor: Record<AlertLevel, string> = { ok: 'text-ok-text', warning: 'text-warn-text', critical: 'text-crit-text' };

export const inputClass =
  'block h-10 w-full rounded-lg border border-line bg-white px-3 text-[13px] text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15';

export const tableHeadClass = 'bg-[#F9FAFC] text-[11px] font-medium text-faint';
