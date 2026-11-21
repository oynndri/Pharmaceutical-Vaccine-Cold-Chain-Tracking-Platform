import clsx from 'clsx';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={clsx('text-accent', className ?? 'h-7 w-7')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3 6 7v7c0 6.4 4.3 11.5 10 13 5.7-1.5 10-6.6 10-13V7z" />
      <path d="M10 16h3.5l1.5-3.5 2 6.5 1.5-3H22" />
    </svg>
  );
}

export function Logo({ tagline = true, dark = true }: { tagline?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <div className={clsx('text-[17px] font-semibold tracking-tight', dark ? 'text-white' : 'text-ink')}>
          ColdChain <span className="font-normal text-accent">Pulse</span>
        </div>
        {tagline && <div className={clsx('text-[8px] font-medium uppercase tracking-eyebrow', dark ? 'text-sidebar-text' : 'text-faint')}>Precision in every degree</div>}
      </div>
    </div>
  );
}
