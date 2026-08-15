const formatTime = (value) => (value
  ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : null);

const ordinal = (n) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
};

const euros = (cents) => `${(cents / 100).toFixed(2)}€`;

/** A word about what state this is in, in the one colour that says it. */
function StatusPill({ tournament: t }) {
  if (t.late_registration_open) {
    return (
      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                       bg-(--color-highlight-dim) text-(--color-highlight-pale)
                       border border-(--color-highlight-edge)">
        late reg
      </span>
    );
  }
  const tone = {
    lobby: "bg-(--color-accent-soft) text-(--color-silver) border-(--color-border-strong)",
    running: "bg-(--color-accent) text-(--color-accent-text) border-(--color-border-strong)",
    paused: "bg-black/30 text-(--color-silver) border-(--color-border)",
    finished: "bg-black/30 text-(--color-text-muted) border-(--color-border)",
  }[t.status];
  return (
    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${tone}`}>
      {t.status === "lobby" ? "open" : t.status}
    </span>
  );
}

/**
 * One tournament, in one row.
 *
 * The old card stacked four tile-shaped statistics and three lines of prose,
 * which meant three tournaments filled a laptop screen and one filled a phone.
 * Everything that survived is what you actually scan a list for: when, who is
 * in it, what it costs — one line of it, in the order you read.
 */
export default function TournamentCard({ tournament: t, onJoin, onOpen, onQuit, onDelete }) {
  const isFinished = t.status === "finished";
  const iWon = t.my_finish_position === 1;
  const buyInCents = t.buy_in_cents || 0;
  const startTime = formatTime(t.scheduled_start_at);
  const full = t.player_count >= t.max_players;
  const bountyOn = (t.bounty_mode || "none") !== "none" && (t.bounty_cents || 0) > 0;

  // What is actually at stake, in money. The list payload carries no rebuy
  // counts, so this is entrants so far — the same basis the old card used, and
  // a figure that only ever grows.
  const poolCents = Math.max(0, buyInCents - (bountyOn ? (t.bounty_cents || 0) : 0)) * t.player_count;

  // Read left to right, most-particular first. Joined as one line so it wraps
  // as prose on a narrow screen instead of becoming a column of chips.
  const facts = [
    startTime && !isFinished ? startTime : null,
    `${t.player_count}/${t.max_players}`,
    buyInCents > 0 ? euros(buyInCents) : "free",
    // Never the percentages: a share is a rule for splitting a pot, and the pot
    // is knowable here. Places paid is the count, the pool is the money.
    poolCents > 0 ? `${euros(poolCents)} pool` : null,
    bountyOn ? (t.bounty_mode === "progressive" ? "PKO" : "KO") : null,
    t.payout_structure?.length > 0 ? `${t.payout_structure.length} paid` : null,
  ].filter(Boolean);

  const canJoin = (t.status === "lobby" || t.late_registration_open) && !t.is_joined && !full;

  return (
    <div className="panel rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2
                    hover:border-(--color-border-strong) transition-colors">
      {/* Name and the facts under it take the width; everything else is fixed
          and sits to the right, or wraps under on a phone. */}
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex items-center gap-2 min-w-0">
          <StatusPill tournament={t} />
          <h3 className="font-semibold text-sm text-(--color-silver) truncate">{t.name}</h3>
          {t.is_joined && !isFinished && (
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-(--color-highlight-text)">
              joined
            </span>
          )}
        </div>

        <p className="text-xs text-(--color-text-muted) truncate">
          {isFinished ? (
            <>
              {t.winner_name
                ? <span className="text-(--color-highlight-text)">🏆 {t.winner_name}</span>
                : "no winner recorded"}
              {t.my_finish_position && (
                <span className={iWon ? "text-(--color-highlight-text)" : "text-(--color-silver)"}>
                  {` · you ${ordinal(t.my_finish_position)}`}
                </span>
              )}
            </>
          ) : (
            <>
              {facts.join(" · ")}
              <span className="hidden sm:inline"> · {t.host_name}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        {full && !t.is_joined && !isFinished && (
          <span className="text-[11px] text-(--color-text-muted)">full</span>
        )}
        {t.is_joined && !t.is_host && t.status === "lobby" && onQuit && (
          <button onClick={() => onQuit(t.id)}
            title="Give up your seat and free it for someone else"
            className="px-2 py-1 panel-raised hover:border-(--color-border-strong) rounded text-xs
                       transition-colors text-(--color-text-muted)">
            Leave
          </button>
        )}
        {/* Paused counts as well: a night that breaks up half way through
            should not leave a game nobody can get rid of. */}
        {t.is_host && (t.status === "lobby" || t.status === "paused") && onDelete && (
          <button onClick={() => onDelete(t)}
            title={t.status === "paused"
              ? "Delete this paused tournament — the hands played are lost"
              : "Delete this tournament — only possible before it starts"}
            aria-label={`Delete ${t.name}`}
            className="px-2 py-1 panel-raised hover:border-(--color-border-strong) rounded text-xs
                       transition-colors text-(--color-accent-link)">
            Delete
          </button>
        )}
        {canJoin && (
          <button onClick={() => onJoin(t.id)}
            className="btn-accent px-3 py-1 rounded text-xs font-semibold transition-colors">
            Join
          </button>
        )}
        <button onClick={() => onOpen(t.id)}
          className="px-2.5 py-1 panel-raised hover:border-(--color-border-strong) rounded text-xs
                     transition-colors text-(--color-silver)">
          {isFinished ? "Results" : t.is_joined ? "Open" : "View"}
        </button>
      </div>
    </div>
  );
}
