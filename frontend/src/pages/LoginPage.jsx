import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
      navigate("/");
    } catch {
      setError("Invalid username or password");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleSubmit} className="panel p-8 rounded-xl w-80 space-y-4 shadow-2xl shadow-black/60">
        <h1 className="text-2xl font-bold text-center text-(--color-silver) tracking-wide">Poker Login</h1>
        {error && <p className="text-red-300 text-sm">{error}</p>}
        <input
          className="input-field w-full px-3 py-2 rounded transition-colors"
          placeholder="Username" value={username}
          onChange={(e) => setUsername(e.target.value)} required
        />
        <input
          className="input-field w-full px-3 py-2 rounded transition-colors"
          type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} required
        />
        <button className="btn-accent w-full py-2 rounded font-semibold transition-colors">
          Log In
        </button>
        <p className="text-center text-sm text-(--color-text-muted)">
          No account? <Link to="/register" className="link-accent">Register</Link>
        </p>
      </form>
    </div>
  );
}
