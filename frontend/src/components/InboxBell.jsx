import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Avatar from "./Avatar";
import Icon from "./icons/Icon";
import api from "../api/http";
import { onMessage } from "../api/presence";
import useAuthStore from "../store/authStore";
import useInboxStore from "../store/inboxStore";

/**
 * The bell: what is waiting for you, from wherever you are.
 *
 * Two things in this app are addressed to one person and outlive the moment they
 * happened — somebody asking to be friends, and an invitation to a game — and
 * both used to be findable only by opening the panel they lived in. Which means
 * both were missed by anybody who did not happen to look, and a friend request
 * nobody notices is the feature failing quietly.
 *
 * So: a count on the bell, a short list under it, and the answer inside the list
 * where it is useful — saying yes to a friend is one press from here rather than
 * a trip to a panel. Anything that needs more than a press hands you the page it
 * lives on instead.
 *
 * The count is what this browser has not shown yet, not what is unanswered:
 * opening the bell stops it glowing, and the item itself stays until the thing
 * is actually done. See store/inboxStore.js.
 */
/* The fallback picture for an item whose sender has no avatar. A friend request
   used to draw `eye`, which is the glyph for watching a table you are not sat
   at — so the same drawing meant "a person" here and "a spectator seat"
   everywhere else, and the lobby strip was using it for the Friends panel on
   top of that. `friends` is drawn for people; `eye` is back to meaning one
   thing. */
const KIND_ICON = { friend_request: "friends", tournament_invite: "trophy" };

export default function InboxBell() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const items = useInboxStore((s) => s.items);
  const seen = useInboxStore((s) => s.seen);
  const fetchInbox = useInboxStore((s) => s.fetchInbox);
  const add = useInboxStore((s) => s.add);
  const markSeen = useInboxStore((s) => s.markSeen);
  const drop = useInboxStore((s) => s.drop);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  // What the server still has for you, asked once per page load. The socket
  // below keeps it moving after that.
  useEffect(() => { if (user) fetchInbox(); }, [user, fetchInbox]);

  useEffect(() => {
    if (!user) return undefined;
    return onMessage((message) => {
      // Only the messages that are somebody's news rather than a game's: the
      // starting-game alert has its own banner, and putting it here too would
      // be the same thing said twice.
      if (!message?.kind || !message?.id) return;
      add(message);
    });
  }, [user, add]);

  const looked = new Set(seen);
  const unseen = items.filter((one) => !looked.has(one.id)).length;

  const toggle = useCallback(() => {
    setOpen((was) => {
      if (!was) markSeen();
      return !was;
    });
  }, [markSeen]);

  useEffect(() => {
    if (!open) return undefined;
    const key = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);

  if (!user) return null;

  /** Say yes to a friend, from here. The one answer short enough to belong in a
   *  list; everything else opens the page it lives on. */
  const accept = async (item) => {
    setBusy(item.id);
    try {
      await api.post("/auth/friends/", { username: item.from?.username });
      drop(item.id);
    } catch {
      // Left in the list rather than pretended away: the panel is still there.
    } finally {
      setBusy(null);
    }
  };

  const go = (item) => {
    setOpen(false);
    if (item.path) navigate(item.path);
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unseen ? `Notifications (${unseen} new)` : "Notifications"}
        title={items.length ? `${items.length} waiting` : "Nothing waiting"}
        className={`relative flex items-center rounded px-1.5 py-1 transition-colors ${
          unseen ? "text-(--color-highlight-text)" : "text-(--color-text-muted) hover:text-(--color-silver)"
        }`}
      >
        <Icon name="bell" className="w-4 h-4" tone={unseen ? "gold" : "mono"} />
        {unseen > 0 && (
          // The count rather than a plain dot: two friend requests and one are
          // different amounts of somebody's evening.
          <span className="absolute -top-0.5 -right-0.5 min-w-4 px-1 rounded-full
                           text-[9px] font-bold leading-4 text-center
                           bg-(--color-highlight-bright) text-(--color-highlight-ink)">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* A click anywhere else closes it, which is what people do instead of
              finding the button again. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full mt-2 z-50 w-72 panel panel-solid
                          rounded-lg shadow-xl shadow-black/60 overflow-hidden">
            <p className="px-3 py-2 text-[10px] uppercase tracking-wide
                          text-(--color-text-muted) border-b border-(--color-border)">
              Waiting for you
            </p>

            {items.length === 0 ? (
              <p className="px-3 py-3 text-xs text-(--color-text-muted)">
                Nothing waiting. Invitations and friend requests arrive here.
              </p>
            ) : (
              <ul className="divide-y divide-(--color-border) max-h-80 overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id} className="px-2 py-2 flex items-center gap-2">
                    {item.from?.username ? (
                      <Avatar
                        url={item.from.avatar_url}
                        emoji={item.from.avatar_emoji}
                        border={item.from.avatar_border}
                        name={item.from.display_name || item.from.username}
                        className="w-7 h-7 shrink-0 rounded-full panel-raised"
                        emojiClassName="text-base"
                      />
                    ) : (
                      <Icon name={KIND_ICON[item.kind] || "bell"} className="w-5 h-5 shrink-0" />
                    )}

                    <button
                      type="button"
                      onClick={() => go(item)}
                      className="flex-1 min-w-0 text-left text-xs text-(--color-silver)
                                 hover:text-(--color-highlight-text) transition-colors"
                    >
                      <span className="block truncate">{item.title}</span>
                      {item.body && (
                        <span className="block truncate text-[11px] text-(--color-text-muted)">
                          {item.body}
                        </span>
                      )}
                    </button>

                    {item.kind === "friend_request" && (
                      <button
                        type="button"
                        onClick={() => accept(item)}
                        disabled={busy === item.id}
                        className="btn-accent shrink-0 px-2 py-0.5 rounded text-xs font-semibold
                                   transition-colors disabled:opacity-50"
                      >
                        Yes
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
