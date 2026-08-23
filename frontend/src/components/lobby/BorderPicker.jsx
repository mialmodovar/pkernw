import { useEffect } from "react";

import Avatar from "../Avatar";
import useAuthStore from "../../store/authStore";
import useWalletStore from "../../store/walletStore";
import { BORDERS } from "../borders";

/**
 * Which ring goes around your face.
 *
 * In the shop you buy one; here you put it on. Both are needed and they are not
 * the same act — a border bought a week ago and worn today is the ordinary case,
 * and having to walk back through a till to change your mind is not.
 *
 * The ones you do not own are shown too, and shown locked. A picker that hid
 * them would be a picker that never told anybody there was anything to buy.
 */
export default function BorderPicker() {
  const profile = useAuthStore((s) => s.user?.profile);
  const { items, fetchShop, wearBorder, ownsBorder } = useWalletStore();
  const worn = profile?.avatar_border || "";

  // The catalogue is what says which of these are yours. Asked for once, when
  // this opens: the panel is behind a click already.
  useEffect(() => {
    if (items.length === 0) fetchShop();
  }, [items.length, fetchShop]);

  return (
    <div className="mt-3 pt-3 border-t border-(--color-border)">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-(--color-text-muted) mb-1.5">
        Border
      </p>

      <div className="grid grid-cols-6 gap-1">
        {/* No ring at all, which is where everybody starts and which has to be
            a choice rather than only a starting point. */}
        <button
          type="button"
          onClick={() => wearBorder("")}
          title="No border"
          aria-pressed={worn === ""}
          className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
            worn === "" ? "bg-(--color-accent-soft)" : "hover:bg-(--color-accent-soft)"
          }`}
        >
          <span className="w-7 h-7 rounded-full border border-dashed border-(--color-border-strong)" />
        </button>

        {BORDERS.map((border) => {
          const owned = ownsBorder(border.id);
          return (
            <button
              key={border.id}
              type="button"
              onClick={() => owned && wearBorder(border.id)}
              disabled={!owned}
              title={owned
                ? `${border.label} border`
                : `${border.label} — buy it in the shop`}
              aria-pressed={worn === border.id}
              className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
                worn === border.id ? "bg-(--color-accent-soft)" : "hover:bg-(--color-accent-soft)"
              } ${owned ? "" : "opacity-35 cursor-not-allowed"}`}
            >
              <Avatar
                url={profile?.avatar_url}
                emoji={profile?.avatar_emoji}
                border={border.id}
                name={border.label}
                className="w-7 h-7"
                emojiClassName="text-xs"
                ringWidth={2}
              />
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-[10px] text-(--color-text-muted)">
        Bought with coins in the shop. Worn everywhere you play.
      </p>
    </div>
  );
}
