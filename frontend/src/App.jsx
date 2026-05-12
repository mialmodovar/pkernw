import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import useAuthStore from "./store/authStore";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import LobbyPage from "./pages/LobbyPage";
import CreateTournamentPage from "./pages/CreateTournamentPage";
import TournamentSetupPage from "./pages/TournamentSetupPage";
import GamePage from "./pages/GamePage";

export default function App() {
  const { init, loading } = useAuthStore();

  useEffect(() => { init(); }, [init]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
      <Route path="/tournaments/new" element={<ProtectedRoute><CreateTournamentPage /></ProtectedRoute>} />
      <Route path="/tournament/:id" element={<ProtectedRoute><TournamentSetupPage /></ProtectedRoute>} />
      <Route path="/tournament/:id/play" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
