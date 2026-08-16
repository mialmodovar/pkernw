import { useEffect, useState } from "react";

import useWalletStore from "../../store/walletStore";
import ShopModal from "./ShopModal";

/**
 * Your coins, and the two things you do with them.
 *
 * Coins are the side games' own currency and buy nothing that money buys —
 * which is the point of keeping them in a panel of their own rather than
 * anywhere near Calotes, where the numbers are real debts between real people.
 */
export default function CoinPanel() {
  const { balance, dailyAmount, canClaim, claim, fetchWallet, error } = useWalletStore();
  const [shopOpen, setShopOpen] = useState(false);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  if (balance == null) return null;

  return (
    <div className="panel rounded-lg p-4 space-y-3 shadow-lg shadow-black/40">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-(--color-silver) uppercase tracking-wide">Coins</h2>
        <span className="text-lg font-bold text-(--color-highlight-text) tabular-nums">
          🪙 {balance.toLocaleString()}
        </span>
      </div>

      <p className="text-xs text-(--color-text-muted) leading-snug">
        Side-game coins. Not money — call a hand you folded out of, and spend what you win on
        something to throw.
      </p>

      <div className="flex gap-2">
        <button
          onClick={claim}
          disabled={!canClaim}
          title={canClaim ? `Take today's ${dailyAmount} coins` : "Already taken — come back tomorrow"}
          className={`flex-1 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
            canClaim ? "btn-accent" : "btn-secondary opacity-50 cursor-not-allowed"
          }`}
        >
          {canClaim ? `Claim ${dailyAmount}` : "Claimed today"}
        </button>
        <button
          onClick={() => setShopOpen(true)}
          className="btn-secondary px-3 py-1.5 rounded text-xs font-semibold transition-colors"
        >
          Shop
        </button>
      </div>

      {error && <p className="text-xs text-[#c76b7a]">{error}</p>}

      {shopOpen && <ShopModal onClose={() => setShopOpen(false)} />}
    </div>
  );
}
