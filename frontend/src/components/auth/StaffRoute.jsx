import { Navigate } from "react-router-dom";
import useAuthStore from "../../store/authStore";
import { runsThePlace } from "./runsThePlace";

/** Signed in and staff, matching what the server means by staff elsewhere.
 *
 * There is nothing privileged behind this — the layout sandbox invents its own
 * table and never asks the server for anything — so this is about keeping a
 * developer tool out of players' way, not about protecting data.
 */
export default function StaffRoute({ children }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!runsThePlace(user)) return <Navigate to="/" replace />;
  return children;
}
