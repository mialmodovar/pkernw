import { useEffect } from "react";

import Avatar from "../Avatar";
import useAuthStore from "../../store/authStore";
import useWalletStore from "../../store/walletStore";

/**
 * Who you are and what you are holding, in the corner where an account lives.
 *
 * The balance was only ever in the sidebar panel, which is where you go to
 * claim it — not where you look while deciding whether you can afford to sit
 * down. It belongs beside your own name, which is where everybody's eye goes
 * for "am I still me and how much have I got".
 */
export default function AccountChip() {
  const user = useAuthStore((s) => s.user);
  const balance = useWalletStore((s) => s.balance);
  const fetchWallet = useWalletStore((s) => s.fetchWallet);

  // The sidebar panel fetches this too, and the store is shared — but this is
  // drawn on pages that panel is not, so it cannot rely on it having asked.
  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  if (!user) return null;

  return (
    <div
      className="flex items-center gap-2 panel-raised rounded-full pl-1 pr-3 py-1"
      title={`${user.profile?.display_name || user.username}${
        balance == null ? "" : ` · ${balance.toLocaleString()} coins`
      }`}
    >
      <Avatar
        url={user.profile?.avatar_url}
        emoji={user.profile?.avatar_emoji}
        name={user.profile?.display_name || user.username}
        className="w-7 h-7 rounded-full shrink-0"
        emojiClassName="text-base"
      />
      <span className="text-sm text-(--color-silver) max-w-[9rem] truncate">
        {user.profile?.display_name || user.username}
      </span>
      {balance != null && (
        <span className="text-sm font-semibold text-(--color-highlight-text) tabular-nums
                         border-l border-(--color-border) pl-2">
          🪙 {balance.toLocaleString()}
        </span>
      )}
    </div>
  );
}
