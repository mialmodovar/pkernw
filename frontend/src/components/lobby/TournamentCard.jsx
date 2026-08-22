import PlayerFaces from "./PlayerFaces";
import Icon from "../icons/Icon";
import { buyInLabel, isSpinGo, prizeLabel } from "./buyIn";
import { rebuyOffer } from "./rebuyOffer";
import { countdownLabel } from "./tournamentVitals";
import { useCountdown } from "./useCountdown";

const formatTime = (value) => (value
  ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : null);

const ordinal = (n) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
};

const euros = (cents) => `${(cents / 100).toFixed(2)}€`;

/** "2h 15m" — the way a host says how long something took. */
const spanBetween = (from, to) => {
  if (!from) return null;
  const minutes = Math.round((new Date(to || Date.now()) - new Date(from)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just started";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

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
// Only one game so far, so the label is only worth the width when a
// tournament is something other than the default everybody assumes.
const GAME_LABELS = { nlh: "NLH" };

export default function TournamentCard({
  tournament: t, onJoin, onOpen, onOpenTable, onQuit, onDelete, onEdit, onRebuy,
}) {
  const lateRegLeft = useCountdown(t.late_registration_seconds_left ?? null);
  const isFinished = t.status === "finished";
  const iWon = t.my_finish_position === 1;
  const buyInCents = t.buy_in_cents || 0;
  const spinGo = isSpinGo(t);
  const startTime = formatTime(t.scheduled_start_at);
  const full = t.player_count >= t.max_players;
  const bountyOn = (t.bounty_mode || "none") !== "none" && (t.bounty_cents || 0) > 0;

  // What is actually at stake, in money. The list payload carries no rebuy
  // counts, so this is entrants so far — the same basis the old card used, and
  // a figure that only ever grows.
  const poolCents = Math.max(0, buyInCents - (bountyOn ? (t.bounty_cents || 0) : 0)) * t.player_count;
  // The other half of a knockout night. It is paid out hand by hand rather than
  // by placing, which is why it is not in the pool above — but it is money, and
  // a card that leaves it out says a KO night was worth half what it was.
  const koPoolCents = bountyOn ? (t.bounty_cents || 0) * t.player_count : 0;

  const running = t.status === "running" || t.status === "paused";
  // How long it has been going, or how long it took. Neither can be read off
  // created_at: a tournament made on Monday for Friday night was not four days
  // long — which is why the server stamps play starting and ending.
  const elapsed = isFinished
    ? (t.started_at && t.finished_at ? spanBetween(t.started_at, t.finished_at) : null)
    : running ? spanBetween(t.started_at) : null;

  // Read left to right, most-particular first. Joined as one line so it wraps
  // as prose on a narrow screen instead of becoming a column of chips.
  const facts = [
    startTime && !isFinished && !running ? startTime : null,
    elapsed ? (isFinished ? `took ${elapsed}` : `${elapsed} in`) : null,
    `${t.player_count}/${t.max_players}`,
    // 8-max and 9-max play differently enough that it belongs next to the
    // turnout rather than buried in the setup screen.
    t.players_per_table ? `${t.players_per_table}-max` : null,
    // Euros or coins, and never a bare number that could be either.
    buyInLabel(t),
    // Never the percentages: a share is a rule for splitting a pot, and the pot
    // is knowable here. Places paid is the count, the pool is the money.
    poolCents > 0
      ? `${euros(poolCents)} ${bountyOn ? "places" : "pool"}`
      : prizeLabel(t, t.player_count),
    // A Spin n Go says so, and says what it drew. Only ever seen on the
    // finished ones — a waiting queue is not listed here at all — so the
    // multiplier is history rather than news.
    spinGo ? "Spin n Go" : null,
    spinGo && t.spin_multiplier ? `${t.spin_multiplier}×` : null,
    spinGo ? null : GAME_LABELS[t.game_type] || null,
    t.club_name ? (t.league_name || "club night") : null,
    // The format and what it is worth, in one fact — "PKO" on its own said the
    // rules and left the money out.
    bountyOn
      ? `${{ progressive: "PKO", mystery: "Mystery", fixed: "KO" }[t.bounty_mode] || "KO"} `
        + `${euros(koPoolCents)}`
      : null,
    t.payout_structure?.length > 0 ? `${t.payout_structure.length} paid` : null,
    // Only worth saying while you can still act on it, and in minutes once the
    // clock is running — "until level 4" is a fact about the schedule, and how
    // long you have is the thing you were actually asking.
    !isFinished && t.late_reg_level > 0 && (t.status === "lobby" || t.late_registration_open)
      ? (countdownLabel(lateRegLeft)
        ? `late reg closes in ${countdownLabel(lateRegLeft)}`
        : `registration until level ${t.late_reg_level}`)
      : null,
  ].filter(Boolean);

  const canJoin = (t.status === "lobby" || t.late_registration_open) && !t.is_joined && !full;
  // Busted, but the tournament is still taking rebuys. Without this the only
  // route back in was the elimination screen, which is gone the moment you
  // close it — and this list was where you ended up instead.
  const offer = rebuyOffer(t, {
    eliminated: Boolean(t.my_finish_position),
    rebuysUsed: t.my_rebuy_count ?? 0,
  });
  // A seat you are still sitting in. Getting back to it took two clicks and a
  // page in between, which is a long way round for the one tournament on this
  // list that is actually waiting on you.
  const atTheTable = t.is_joined
    && (t.status === "running" || t.status === "paused")
    && !t.my_finish_position;

  return (
    <div className="panel rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2
                    hover:border-(--color-border-strong) transition-colors">
      {/* Name and the facts under it take the width; everything else is fixed
          and sits to the right, or wraps under on a phone. */}
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex items-center gap-2 min-w-0">
          <StatusPill tournament={t} />
          {/* Whose night this is, and whether it moves a table. One glyph and a
              tooltip: the club page is where the detail belongs. */}
          {t.club_emoji && (
            <span
              title={t.league_name
                ? `${t.club_name} · counts for ${t.league_name}`
                : `${t.club_name} · does not count for a league`}
              className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded
                         panel-raised text-[10px] font-semibold text-(--color-silver) max-w-[9rem]"
            >
              <span className="text-xs leading-none">{t.club_emoji}</span>
              <span className="truncate">{t.club_name}</span>
            </span>
          )}
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
                ? (
                  <span className="inline-flex items-center gap-1 text-(--color-highlight-text)">
                    <Icon name="trophy" className="w-3.5 h-3.5" />
                    {t.winner_name}
                  </span>
                )
                : "no winner recorded"}
              {t.my_finish_position && (
                <span className={iWon ? "text-(--color-highlight-text)" : "text-(--color-silver)"}>
                  {` · you ${ordinal(t.my_finish_position)}`}
                </span>
              )}
              {/* The result leads, but how big and how long it was is the rest
                  of what anybody asks about a night that is over. */}
              {` · ${t.player_count} played`}
              {elapsed && ` · took ${elapsed}`}
              {/* Everything that was on the table, bounties included: on a night
                  that is over, "€30" beside the winner's name is read as what
                  the night was worth, not as one of its two pools. */}
              {poolCents + koPoolCents > 0 && ` · ${euros(poolCents + koPoolCents)}`}
            </>
          ) : (
            <>
              {facts.join(" · ")}
              <span className="hidden sm:inline"> · {t.host_display_name || t.host_name}</span>
            </>
          )}
        </p>
      </div>

      {/* Who is in it, before the buttons that let you join them. */}
      <PlayerFaces players={t.registered} />

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
        {t.can_manage && t.status === "lobby" && onEdit && (
          <button onClick={() => onEdit(t)}
            title="Change this tournament — only until it starts"
            aria-label={`Edit ${t.name}`}
            className="px-2 py-1 panel-raised hover:border-(--color-border-strong) rounded text-xs
                       transition-colors text-(--color-text-muted)">
            Edit
          </button>
        )}
        {t.can_manage && (t.status === "lobby" || t.status === "paused") && onDelete && (
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
        {atTheTable && onOpenTable && (
          <button onClick={() => onOpenTable(t.id)}
            title="Straight back to your seat"
            className="btn-accent px-3 py-1 rounded text-xs font-semibold transition-colors">
            Open table
          </button>
        )}
        {offer && onRebuy && (
          <button onClick={() => onRebuy(t.id)}
            title={`Buy back in for ${offer.chips?.toLocaleString() ?? "the starting stack"} chips`
              + (offer.capped ? ` · ${offer.left} left` : "")}
            className="btn-accent px-3 py-1 rounded text-xs font-semibold transition-colors">
            Rebuy
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
          {isFinished ? "Results" : atTheTable ? "Lobby" : t.is_joined ? "Open" : "View"}
        </button>
      </div>
    </div>
  );
}
