import { useEffect } from "react";

import Avatar from "../Avatar";
import useAuthStore from "../../store/authStore";
import useWalletStore from "../../store/walletStore";

/**
 * Who you are and what you are holding, compactly.
 *
 * The sidebar's profile card says this on a wide screen, where it sits top left
 * beside everything else about you. On a phone that card is a long way down the
 * page — the lobby stacks — so the same two facts come up to the corner, which
 * is where an account lives on every other app anybody has used.
 */
export default function AccountChip({ className = "" }) {
  const user = useAuthStore((s) => s.user);
  const balance = useWalletStore((s) => s.balance);
  const canClaim = useWalletStore((s) => s.canClaim);
  const dailyAmount = useWalletStore((s) => s.dailyAmount);
  const claim = useWalletStore((s) => s.claim);
  const fetchWallet = useWalletStore((s) => s.fetchWallet);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  if (!user) return null;
  const name = user.profile?.display_name || user.username;

  return (
    <div className={`flex items-center gap-2 panel-raised rounded-full pl-1 pr-2.5 py-1 ${className}`}>
      <Avatar
        url={user.profile?.avatar_url}
        emoji={user.profile?.avatar_emoji}
        name={name}
        className="w-7 h-7 rounded-full shrink-0"
        emojiClassName="text-base"
      />
      <span className="min-w-0 leading-tight">
        <span className="block text-xs text-(--color-silver) max-w-[7rem] truncate">{name}</span>
        {balance != null && (
          <span className="block text-xs font-semibold text-(--color-highlight-text) tabular-nums">
            🪙 {balance.toLocaleString()}
          </span>
        )}
      </span>
      {/* Only when there is something to take, and it takes it. */}
      {canClaim && (
        <button
          type="button"
          onClick={claim}
          title={`Take today's ${dailyAmount} coins`}
          aria-label={`Claim today's ${dailyAmount} coins`}
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold
                     bg-(--color-highlight-dim) border border-(--color-highlight-edge)
                     text-(--color-highlight-pale) animate-pulse-soft"
        >
          +{dailyAmount}
        </button>
      )}
    </div>
  );
}
