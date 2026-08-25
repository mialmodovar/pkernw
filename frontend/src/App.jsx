import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import useAuthStore from "./store/authStore";
import { connect as connectPresence, disconnect as disconnectPresence } from "./api/presence";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RecoverPage from "./pages/RecoverPage";
import LobbyPage from "./pages/LobbyPage";
import CreateTournamentPage from "./pages/CreateTournamentPage";
import EditTournamentPage from "./pages/EditTournamentPage";
import ClubsPage from "./pages/ClubsPage";
import ClubPage from "./pages/ClubPage";
import TournamentSetupPage from "./pages/TournamentSetupPage";
import GamePage from "./pages/GamePage";
import DevTablePage from "./pages/DevTablePage";
import StaffRoute from "./components/auth/StaffRoute";
import BuildStamp from "./components/BuildStamp";
import AppHeader from "./components/AppHeader";
import TableShortcut from "./components/lobby/TableShortcut";
import GameStartAlert from "./components/GameStartAlert";
import CashTablePage from "./pages/CashTablePage";
import ErrorBoundary from "./errors/ErrorBoundary";
import CrashNotice from "./errors/CrashNotice";

export default function App() {
  const { init, loading, user } = useAuthStore();
  // Identity, not the object: the profile is rewritten whenever an avatar or a
  // display name changes, and that must not cycle the socket.
  const userId = user?.id ?? null;

  useEffect(() => { init(); }, [init]);

  // Held open for as long as somebody is logged in, from whatever page they
  // are on: this is what everyone else's watch list reads as "online".
  useEffect(() => {
    if (!userId) return undefined;
    connectPresence();
    return disconnectPresence;
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg text-(--color-text-muted)">Loading...</p>
      </div>
    );
  }

  return (
    // A column: the header, then whatever page fills the rest of the screen.
    // The table needs to know exactly how much room it has — the felt is sized
    // from it — so the page gets a box rather than the viewport.
    <div className="min-h-dvh h-dvh flex flex-col">
      <BuildStamp />
      {/* Above the pages rather than inside any of them: a header that scrolls
          away with the column it lives in is not a header. */}
      <AppHeader />
      {/* Only after a tab that was killed at a table, and only once. The reload
          is the first moment anybody can be told what happened, and the only
          one where the reading taken before the crash is still to hand. */}
      <CrashNotice />
      <div className="flex-1 min-h-0 overflow-y-auto">
      {/* Around the pages rather than around the whole app: a page that throws
          while it draws used to take the header and everything else with it and
          leave a white screen — the "crash" most of the reports are about. This
          catches it, keeps the app on screen and offers the reload. */}
      <ErrorBoundary label="page">
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/recover" element={<RecoverPage />} />
      {/* Public and linked from nowhere. They exist because Google's consent
          screen asks for the two URLs, and whoever fetches one is either a
          reviewer with no account or a player who went looking — so neither can
          be behind a login. */}
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
      <Route path="/tournaments/new" element={<ProtectedRoute><CreateTournamentPage /></ProtectedRoute>} />
      <Route path="/tournaments/:id/edit" element={<ProtectedRoute><EditTournamentPage /></ProtectedRoute>} />
      <Route path="/clubs" element={<ProtectedRoute><ClubsPage /></ProtectedRoute>} />
      <Route path="/clubs/:slug" element={<ProtectedRoute><ClubPage /></ProtectedRoute>} />
      <Route path="/tournament/:id" element={<ProtectedRoute><TournamentSetupPage /></ProtectedRoute>} />
      <Route path="/tournament/:id/play" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
      <Route path="/tournament/:id/watch/:watchTable" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
      {/* A room rather than an event, so it has its own path rather than a
          tournament's with a flag on it. */}
      <Route path="/cash/:id" element={<ProtectedRoute><CashTablePage /></ProtectedRoute>} />
      <Route path="/dev/table" element={<StaffRoute><DevTablePage /></StaffRoute>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </ErrorBoundary>
      </div>
      {/* Outside the routes on purpose: a seat being dealt to is a fact about
          the whole app, not about the page you happen to be reading. It hides
          itself at the table and on the login pages. */}
      <TableShortcut />
      {/* Out here for the same reason, and one step more so: this one has to
          reach somebody who is at a different table entirely. */}
      <GameStartAlert />
    </div>
  );
}
