import { useEffect, useState } from "react";

import Icon from "../icons/Icon";
import useWalletStore from "../../store/walletStore";
import ShopModal from "./ShopModal";

/**
 * Your coins, and what you do with them.
 *
 * Coins buy nothing that money buys, which is the point of keeping them in a
 * panel of their own rather than anywhere near Calotes, where the numbers are
 * real debts between real people. They are a stake all the same — a Spin n Go
 * seat and a coin tournament's buy-in are both charged from here — so the
 * balance is worth a glance before you go looking for a game.
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
        <span className="flex items-center gap-1.5 text-lg font-bold
                         text-(--color-highlight-text) tabular-nums">
          <Icon name="coin" className="w-4.5 h-4.5" tone="gold" />
          {balance.toLocaleString()}
        </span>
      </div>

      <p className="text-xs text-(--color-text-muted) leading-snug">
        Not money. Buys you into a Spin n Go or a coin tournament, calls a hand you folded out
        of, and pays for something to throw.
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
