import { ShieldCheck, Thermometer, Truck } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { homeFor } from '../../auth/permissions';
import { Logo } from '../../components/Logo';
import { Button, Field } from '../../components/ui';
import { inputClass } from '../../components/ui/styles';
import { config } from '../../config';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor[user.role]} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(username, password);
      navigate(from ?? homeFor[u.role], { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_minmax(420px,520px)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-12 text-sidebar-text lg:flex">
        <Logo />
        <div className="max-w-md">
          <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-accent">Your cold chain, connected</p>
          <h1 className="mt-3 text-[40px] font-bold leading-[1.1] tracking-tightest text-white">Every shipment. Every degree. In view.</h1>
          <ul className="mt-8 space-y-4 text-[14px]">
            <li className="flex items-center gap-3"><Thermometer className="h-5 w-5 text-accent" /> Live temperature telemetry with instant excursion alerts</li>
            <li className="flex items-center gap-3"><Truck className="h-5 w-5 text-accent" /> Offline-first driver app for rural routes</li>
            <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-accent" /> Tamper-evident custody and compliance records</li>
          </ul>
        </div>
        <p className="text-[12px]">MedSwift Logistics Ltd.</p>
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
      </aside>

      <main className="flex items-center justify-center bg-canvas p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden">
            <div className="inline-flex rounded-xl bg-navy-900 px-4 py-3"><Logo /></div>
          </div>
          <div>
            <h2 className="text-[26px] font-bold tracking-tightest text-ink">Sign in</h2>
            <p className="mt-1 text-[13px] text-muted">Use your MedSwift account.</p>
          </div>
          <Field label="Username">
            <input className={`${inputClass} h-11`} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </Field>
          <Field label="Password">
            <input className={`${inputClass} h-11`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && (
            <p role="alert" className="rounded-lg border border-crit-line bg-crit-bg p-3 text-[13px] text-crit-text">
              {error}
            </p>
          )}
          <Button type="submit" className="h-12 w-full text-[14px]" loading={busy}>
            Sign in
          </Button>
          {config.useMockApi && (
            <p className="rounded-lg border border-warn-line bg-warn-bg p-3 text-[12px] text-warn-text">
              Mock API: sign in as <b>admin</b>, <b>dispatcher</b>, <b>driver</b>, <b>clinic</b> or <b>auditor</b> with password <b>demo</b>.
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
