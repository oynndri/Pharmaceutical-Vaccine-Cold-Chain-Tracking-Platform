import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Card, CardHeader, Field, PageHeader } from '../../components/ui';
import { inputClass } from '../../components/ui/styles';

const KEY = 'ccp.prefs';
interface Prefs {
  workspace: string;
  timeZone: string;
  unit: 'C' | 'F';
  emailAlerts: boolean;
}
const defaults: Prefs = { workspace: 'MedSwift Logistics Ltd.', timeZone: 'Asia/Dhaka', unit: 'C', emailAlerts: true };

function load(): Prefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

/**
 * Preferences are stored on this device for now.
 * TODO(backend-sync): persist workspace settings through the backend once an endpoint exists.
 */
export function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs>(load);
  const [saved, setSaved] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
    setSaved(true);
  }

  const update = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setSaved(false);
    setPrefs((p) => ({ ...p, [k]: v }));
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Configure how ColdChain Pulse works for you." />
      <Card>
        <CardHeader title="Workspace preferences" subtitle="Saved on this device. Time zone and unit are stored now and applied once the backend settings endpoint is ready." />
        <form onSubmit={onSubmit} className="space-y-5 px-5 pb-6">
          <Field label="Workspace name">
            <input className={inputClass} value={prefs.workspace} onChange={(e) => update('workspace', e.target.value)} />
          </Field>
          <Field label="Time zone">
            <select className={inputClass} value={prefs.timeZone} onChange={(e) => update('timeZone', e.target.value)}>
              <option value="Asia/Dhaka">Dhaka (UTC+6)</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
          <Field label="Temperature unit">
            <select className={inputClass} value={prefs.unit} onChange={(e) => update('unit', e.target.value as Prefs['unit'])}>
              <option value="C">Celsius (°C)</option>
              <option value="F">Fahrenheit (°F)</option>
            </select>
          </Field>
          <label className="flex items-start gap-4 border-t border-line-soft pt-5">
            <span className="flex-1">
              <span className="block text-[13px] font-semibold text-ink">Email alert notifications</span>
              <span className="text-[12px] text-muted">Notify the operational team about critical excursions.</span>
            </span>
            <input type="checkbox" className="mt-1 h-5 w-5 rounded accent-brand" checked={prefs.emailAlerts} onChange={(e) => update('emailAlerts', e.target.checked)} />
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit">Save preferences</Button>
            {saved && (
              <span role="status" className="flex items-center gap-1.5 text-[13px] text-ok-text">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
