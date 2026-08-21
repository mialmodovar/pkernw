import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import UserChip from "./UserChip";
import useAuthStore from "../store/authStore";
import useWalletStore from "../store/walletStore";
import { HomeIcon } from "./game/icons";

// Nobody is signed in on these, so there is nothing to put in it.
const HIDDEN_ON = [/^\/(login|register|recover)\b/];

/**
 * The one bar at the top of every page.
 *
 * Modelled on the table's header, which is the one people liked: who you are
 * and what you are holding on the right, the way back home on the left, and
 * nothing that moves as you navigate. Before this, every page invented its own
 * — the lobby put your account at the bottom of a phone screen, under six
 * panels, because it lived inside the scrolling column rather than above it.
 *
 * What it shows adapts to the page; where it sits does not.
 */
export default function AppHeader() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const balance = useWalletStore((s) => s.balance);
  const canClaim = useWalletStore((s) => s.canClaim);
  const dailyAmount = useWalletStore((s) => s.dailyAmount);
  const claim = useWalletStore((s) => s.claim);
  const fetchWallet = useWalletStore((s) => s.fetchWallet);

  const hidden = !user || HIDDEN_ON.some((pattern) => pattern.test(location.pathname));

  useEffect(() => {
    if (!hidden) fetchWallet();
  }, [hidden, fetchWallet]);

  if (hidden) return null;
  const atHome = location.pathname === "/";
  // At the table the way out is the thing people look for, so it says so.
  const atTable = /^\/tournament\/\d+\/(play|watch)\b/.test(location.pathname);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2
                       border-b border-(--color-border) bg-[rgba(10,7,8,0.86)] backdrop-blur">
      {/* Home, unless this is home. The one control that has to be in the same
          place on every screen. */}
      {!atHome && (
        <button
          onClick={() => navigate("/")}
          title={atTable ? "Back to the lobby — your seat is kept" : "Back to the lobby"}
          aria-label="Lobby"
          className="btn-secondary shrink-0 flex items-center gap-1 rounded px-2 py-1
                     text-xs font-semibold transition-colors"
        >
          <HomeIcon />
          <span className="hidden sm:inline">Lobby</span>
        </button>
      )}

      <button
        onClick={() => navigate("/clubs")}
        title="Your clubs"
        className={`shrink-0 rounded px-2 py-1 text-xs font-semibold transition-colors ${
          location.pathname.startsWith("/clubs")
            ? "btn-accent"
            : "text-(--color-text-muted) hover:text-(--color-silver)"
        }`}
      >
        🎴 <span className="hidden sm:inline">Clubs</span>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {/* Coins, beside the name, on every page — the number you check before
            deciding whether you can afford to sit down. */}
        {balance != null && (
          <span
            title={`${balance.toLocaleString()} coins`}
            className="flex items-center gap-1.5 text-sm font-semibold
                       text-(--color-highlight-text) tabular-nums"
          >
            🪙 {balance.toLocaleString()}
            {canClaim && (
              <button
                type="button"
                onClick={claim}
                title={`Take today's ${dailyAmount} coins`}
                aria-label={`Claim today's ${dailyAmount} coins`}
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold
                           bg-(--color-highlight-dim) border border-(--color-highlight-edge)
                           text-(--color-highlight-pale) animate-pulse-soft"
              >
                +{dailyAmount}
              </button>
            )}
          </span>
        )}

        <UserChip />

        <button
          onClick={logout}
          title="Log out"
          className="shrink-0 px-2 py-1 rounded text-xs font-semibold text-(--color-text-muted)
                     hover:text-(--color-silver) transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
