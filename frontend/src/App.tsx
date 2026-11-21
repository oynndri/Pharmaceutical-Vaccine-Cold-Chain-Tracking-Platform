import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { homeFor } from './auth/permissions';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { MobileShell } from './components/MobileShell';
import { LoadingState } from './components/ui';
import { LoginPage } from './features/auth/LoginPage';
import { OverviewPage } from './features/overview/OverviewPage';
import { ShipmentDetailPage } from './features/shipments/ShipmentDetailPage';
import { ShipmentsPage } from './features/shipments/ShipmentsPage';

const lazyNamed = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const CreateShipmentPage = lazyNamed(() => import('./features/shipments/CreateShipmentPage'), 'CreateShipmentPage');
const TrackingPage = lazyNamed(() => import('./features/tracking/TrackingPage'), 'TrackingPage');
const AlertsPage = lazyNamed(() => import('./features/alerts/AlertsPage'), 'AlertsPage');
const FleetPage = lazyNamed(() => import('./features/fleet/FleetPage'), 'FleetPage');
const CompliancePage = lazyNamed(() => import('./features/compliance/CompliancePage'), 'CompliancePage');
const ComplianceReportPage = lazyNamed(() => import('./features/compliance/ComplianceReportPage'), 'ComplianceReportPage');
const SettingsPage = lazyNamed(() => import('./features/settings/SettingsPage'), 'SettingsPage');
const DriverHomePage = lazyNamed(() => import('./features/driver/DriverHomePage'), 'DriverHomePage');
const TempLogPage = lazyNamed(() => import('./features/driver/TempLogPage'), 'TempLogPage');
const HandoffPage = lazy(() => import('./features/driver/HandoffPage').then((m) => ({ default: m.HandoffPage })));

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route element={<RequireAuth permission="viewDispatch" />}>
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/shipments" element={<ShipmentsPage />} />
              <Route path="/shipments/:id" element={<ShipmentDetailPage />} />
              <Route path="/tracking" element={<TrackingPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/fleet" element={<FleetPage />} />
            </Route>
            <Route element={<RequireAuth permission="createShipment" />}>
              <Route path="/shipments/new" element={<CreateShipmentPage />} />
            </Route>
            <Route element={<RequireAuth permission="viewAudit" />}>
              <Route path="/compliance" element={<CompliancePage />} />
              <Route path="/compliance/:id" element={<ComplianceReportPage />} />
            </Route>
            <Route element={<RequireAuth permission="viewSettings" />}>
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>

        <Route element={<RequireAuth permission="driverApp" />}>
          <Route element={<MobileShell title="Driver" home="/driver" />}>
            <Route path="/driver" element={<DriverHomePage />} />
            <Route path="/driver/:id/pickup" element={<HandoffPage type="pickup" backTo="/driver" />} />
            <Route path="/driver/:id/deliver" element={<HandoffPage type="delivery" backTo="/driver" />} />
            <Route path="/driver/:id/log" element={<TempLogPage />} />
          </Route>
        </Route>

        <Route element={<RequireAuth permission="receiveDelivery" />}>
          <Route element={<MobileShell title="Clinic receiving" home="/receive" />}>
            <Route path="/receive" element={<HandoffPage type="delivery" backTo="/receive" />} />
          </Route>
        </Route>

        {/* Old URLs from the first build. */}
        <Route path="/dispatch" element={<Navigate to="/overview" replace />} />
        <Route path="/audit" element={<Navigate to="/compliance" replace />} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </Suspense>
  );
}
