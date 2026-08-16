import { Navigate, useLocation } from "react-router-dom";
import useAuthStore from "../../store/authStore";

/**
 * Signed in, or sent to the login page — with a note of where you were going.
 *
 * The note matters: a link to a tournament is how a game gets a full table, and
 * anybody who follows one without being signed in used to land on the login
 * page and then, having signed in, on the home list — with the tournament they
 * were invited to somewhere in it, if they could remember its name.
 */
export default function ProtectedRoute({ children }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}
