import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ShipmentStatusBadge, TempReading } from '../../components/ui';
import { tableHeadClass } from '../../components/ui/styles';
import { fmtTime } from '../../lib/format';
import type { Shipment } from '../../types';

/** Small, non-virtualized shipments table (used on Overview for a handful of rows). */
export function ShipmentRowsPreview({ shipments }: { shipments: Shipment[] }) {
  const navigate = useNavigate();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-[13px]">
        <thead className={tableHeadClass}>
          <tr className="border-y border-line-soft">
            <th className="px-5 py-2.5 font-medium">Shipment / Product</th>
            <th className="px-3 py-2.5 font-medium">Destination</th>
            <th className="px-3 py-2.5 font-medium">Vehicle / Driver</th>
            <th className="px-3 py-2.5 font-medium">Temperature</th>
            <th className="px-3 py-2.5 font-medium">ETA</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => (
            <tr
              key={s.id}
              tabIndex={0}
              onClick={() => navigate(`/shipments/${s.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/shipments/${s.id}`)}
              className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-canvas focus:bg-canvas focus:outline-none"
            >
              <td className="px-5 py-3">
                <div className="font-semibold text-code">{s.code}</div>
                <div className="text-[11px] text-faint">{s.product}</div>
              </td>
              <td className="px-3 py-3">
                <div className="text-body">{s.destination}</div>
                <div className="text-[11px] text-faint">{s.origin} →</div>
              </td>
              <td className="px-3 py-3">
                <div className="text-body">{s.vehiclePlate}</div>
                <div className="text-[11px] text-faint">{s.driverName}</div>
              </td>
              <td className="px-3 py-3"><TempReading tempC={s.currentTempC} level={s.alertLevel} /></td>
              <td className="px-3 py-3 text-body tabular">{fmtTime(s.etaIso)}</td>
              <td className="px-3 py-3"><ShipmentStatusBadge status={s.status} level={s.alertLevel} /></td>
              <td className="pr-4 text-faint"><ChevronRight className="h-4 w-4" aria-hidden /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
