import { useState } from "react";

import Avatar from "../Avatar";
import api from "../../api/http";
import { ROLE_BLURB, ROLE_LABEL, memberActions } from "./clubRoles";

/**
 * Who is in the club, and — for whoever runs it — what they are.
 *
 * Two readings of the same list. To a member it is a row of faces, which is all
 * anybody wants from it. To the owner it is the staff list: making somebody staff
 * was a thing the server has always allowed and the app had no way to ask for, so
 * every club was stuck with exactly one person able to open a tournament.
 */
export default function ClubMembers({ club, myUsername, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const canOwn = Boolean(club.can_own);

  const act = async (member, action) => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setError("");
    setBusy(`${member.username}:${action.kind}:${action.role || ""}`);
    try {
      const url = `/clubs/${club.slug}/members/${member.username}/`;
      if (action.kind === "remove") await api.delete(url);
      else await api.patch(url, { role: action.role });
      await onChanged?.();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "That did not go through.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel rounded-lg p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">
          Members
        </h2>
        {canOwn && (
          <span className="text-[10px] text-(--color-text-muted)">
            Staff can open tournaments and run the leagues
          </span>
        )}
      </div>

      {error && <p className="text-xs text-(--color-accent-link)">{error}</p>}

      {/* Faces when there is nothing to be done with them, rows when there is:
          a list of twenty chips is the right shape for reading and the wrong one
          for holding a menu of buttons per person. */}
      {canOwn ? (
        <ul className="divide-y divide-(--color-border)">
          {club.members.map((member) => {
            const actions = memberActions(member, { canOwn, myUsername });
            return (
              <li key={member.username} className="py-2 flex flex-wrap items-center gap-2">
                <Avatar
                  url={member.avatar_url}
                  emoji={member.avatar_emoji}
                  name={member.username}
                  className="w-7 h-7 rounded-full shrink-0"
                  emojiClassName="text-base"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-(--color-silver) truncate">
                    {member.display_name || member.username}
                    {member.username === myUsername && (
                      <span className="text-(--color-text-muted)"> (you)</span>
                    )}
                  </span>
                  <span className="block text-[11px] text-(--color-text-muted) truncate"
                    title={ROLE_BLURB[member.role]}>
                    {ROLE_LABEL[member.role] || member.role}
                  </span>
                </span>

                {actions.length === 0 ? (
                  <span className="text-[11px] text-(--color-text-muted)">
                    {member.role === "owner" ? "Runs the club" : ""}
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-1.5 shrink-0">
                    {actions.map((action) => (
                      <button
                        key={`${action.kind}-${action.role || ""}`}
                        type="button"
                        disabled={busy != null}
                        onClick={() => act(member, action)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors
                                    disabled:opacity-40 ${
                          action.danger
                            ? "text-(--color-accent-link) hover:bg-white/5"
                            : "btn-secondary"
                        }`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-wrap gap-2">
          {club.members.map((member) => (
            <span
              key={member.username}
              title={`${member.username} · ${ROLE_LABEL[member.role] || member.role}`}
              className="panel-raised rounded-full pl-1 pr-2.5 py-1 flex items-center gap-1.5 text-xs"
            >
              <Avatar
                url={member.avatar_url}
                emoji={member.avatar_emoji}
                name={member.username}
                className="w-6 h-6 rounded-full shrink-0"
                emojiClassName="text-sm"
              />
              <span className="text-(--color-silver)">{member.display_name || member.username}</span>
              {member.role !== "member" && (
                <span className="text-[9px] uppercase tracking-wide text-(--color-highlight-text)">
                  {member.role}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
