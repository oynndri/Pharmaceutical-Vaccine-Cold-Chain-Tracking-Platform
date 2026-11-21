import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { can, homeFor } from './permissions';
import type { Permission } from './permissions';

/** Guards a route subtree: must be signed in, and (optionally) hold a permission. */
export function RequireAuth({ permission }: { permission?: Permission }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (permission && !can(user.role, permission)) return <Navigate to={homeFor[user.role]} replace />;
  return <Outlet />;
}
