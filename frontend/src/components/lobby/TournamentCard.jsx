import PlayerFaces from "./PlayerFaces";
import Icon from "../icons/Icon";
import { rowEntries } from "../game/prizePool";
import { useCompactLayout } from "../game/useCompactLayout";
import { rebuyOffer } from "./rebuyOffer";
import { historyLine, rowLead, rowMoney, rowTags, spanBetween } from "./tournamentRow";
import { useCountdown, useSecondsUntil } from "./useCountdown";

const formatTime = (value) => (value
  ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : null);

const euros = (cents) => `${(cents / 100).toFixed(2)}€`;

/** A figure from rowMoney, in the currency it is in. */
const amountText = (money) => (money.kind === "coins"
  ? money.amount.toLocaleString()
  : euros(money.amount));

/**
 * One grid, shared by both shapes of row.
 *
 * Three columns on a phone and four from `sm:` up: a fixed rail for when or how
 * it went, everything about the tournament in the middle, the figures on the
 * right, and the buttons either below or in a column of their own. It was a
 * flex-wrap before, which on a 390px screen broke into three ragged lines with
 * three different alignments and stood 125px tall — four tournaments to a
 * phone. A grid cannot do that: the columns are the same width on every row, so
 * a list of them reads down as well as across.
 */
const ROW_GRID = "panel rounded-lg px-3 py-2 grid items-center gap-x-2.5 gap-y-1.5 "
  + "grid-cols-[3.25rem_minmax(0,1fr)_auto] sm:grid-cols-[3.25rem_minmax(0,1fr)_auto_auto] "
  + "hover:border-(--color-border-strong) transition-colors";

// Where each piece sits. Written out rather than left to the grid's automatic
// placement, because the buttons move column at `sm:` and auto-placement would
// then shuffle everything after them.
const AT_RAIL = "col-start-1 row-start-1 row-span-2";
const AT_NAME = "col-start-2 row-start-1 min-w-0";
const AT_STRIP = "col-start-2 row-start-2 min-w-0";
const AT_MONEY = "col-start-3 row-start-1 row-span-2";
const AT_ACTIONS = "col-start-1 col-span-3 row-start-3 "
  + "sm:col-start-4 sm:col-span-1 sm:row-start-1 sm:row-span-2";

// What the rail's answer is worth reading as. Names rather than colours, so the
// judgement lives in tournamentRow.js and only the palette lives here.
const LEAD_TONE = {
  win: "text-(--color-highlight-bright)",
  past: "text-(--color-text-muted)",
  live: "text-(--color-accent-link)",
  soon: "text-(--color-highlight-text)",
  plain: "text-(--color-silver)",
};

// Same for the chips. Only the deadline gets the loud one: if everything is
// urgent then nothing is, which is how "late reg 8:20" ended up indistinguish-
// able from "9-max" in the line these replaced.
const TAG_TONE = {
  urgent: "bg-(--color-highlight-dim) text-(--color-highlight-pale) border-(--color-highlight-edge)",
  muted: "bg-black/25 text-(--color-text-muted) border-(--color-border)",
  note: "bg-black/25 text-(--color-silver) border-(--color-border)",
};

// 44px is the smallest thing iOS expects anybody to hit. Every button on the
// old row was 26px tall, including Join. Only the primary one grows, and only
// on a phone: down there the buttons are a strip of their own across the bottom
// of the row, and three full-height ones would be taller than the row itself.
const PRIMARY = "min-h-11 sm:min-h-0 flex-1 sm:flex-none px-3 py-1.5 sm:py-1 rounded "
  + "text-xs font-semibold transition-colors";
const SECONDARY = "shrink-0 px-2 py-1 panel-raised hover:border-(--color-border-strong) "
  + "rounded text-xs transition-colors";

/**
 * The left rail: one short answer to "when", over the word that finishes it.
 *
 * Fixed width, and first in the reading order, which is the actual fix for the
 * row this replaces. "late reg 8:20" used to be the last of nine facts in a
 * nowrap paragraph and was therefore the first thing cut off — a time-critical
 * answer, lost to a column boundary. Nothing in a fixed-width rail can be
 * pushed off the end by anything else on the row.
 */
function Rail({ lead }) {
  // A step down in size for the long answers. "11h 59m" is the longest a
  // countdown gets, and a locale on a twelve-hour clock makes formatTime say
  // "09:34 PM" — both are wider than 3.25rem at 14px, and the rail is a fixed
  // width on purpose. Shrinking the few long ones keeps every rail the same
  // width, which is the whole reason the column exists.
  const long = lead.value.length > 6;
  return (
    <div className={`${AT_RAIL} text-center leading-none overflow-hidden`} title={lead.value}>
      <div className={`${long ? "text-[11px]" : "text-sm"} font-bold tabular-nums
                       tracking-tight truncate ${LEAD_TONE[lead.tone]}`}>
        {lead.value}
      </div>
      {lead.note && (
        <div className="mt-1 text-[9px] uppercase tracking-wider text-(--color-text-muted) truncate">
          {lead.note}
        </div>
      )}
    </div>
  );
}

/**
 * One figure in the money column.
 *
 * No 9px "BUY-IN" heading over it any more. Two headings over two numbers was a
 * third of the column's height spent saying what the order and the colour
 * already say — the price on top in silver, what is in the pot under it in
 * gold — and the words are still there in the tooltip for anybody who wants
 * them spelled out.
 */
function Amount({ label, coin = false, tone = "text-(--color-silver)", size = "text-sm", title }) {
  return (
    <div title={title}
      className={`flex items-center justify-end gap-1 font-bold tabular-nums ${size} ${tone}`}>
      {coin && <Icon name="coin" className="w-3.5 h-3.5" />}
      {label}
    </div>
  );
}

/**
 * Whose night this is, and whether it counts for anything.
 *
 * The league used to be a fact in the prose line, spelled out in full beside
 * eight others. It is a trophy on the club's own chip now: which league a club
 * runs is something its members know, and the tooltip has said it all along.
 */
function ClubChip({ tournament: t }) {
  if (!t.club_emoji) return null;
  return (
    <span
      title={t.league_name
        ? `${t.club_name} · counts for ${t.league_name}`
        : `${t.club_name} · does not count for a league`}
      className="min-w-0 flex items-center gap-1 px-1.5 py-0.5 rounded
                 panel-raised text-[10px] font-semibold text-(--color-silver) max-w-[9rem]"
    >
      <span className="text-xs leading-none">{t.club_emoji}</span>
      <span className="truncate">{t.club_name}</span>
      {t.league_name && (
        <Icon name="trophy" tone="gold" className="w-3 h-3 text-(--color-highlight-text)" />
      )}
    </span>
  );
}

/** The capped strip of rules. Chips, never prose: prose is what overflowed. */
function Tags({ tags }) {
  return tags.map((tag) => (
    <span key={tag.key}
      className={`shrink-0 max-w-[8rem] truncate px-1.5 py-0.5 rounded border
                  text-[10px] font-semibold tracking-wide ${TAG_TONE[tag.tone]}`}>
      {tag.text}
    </span>
  ));
}

/**
 * Every button the row can offer, unchanged.
 *
 * Who may edit, delete, leave, rebuy, join or open a table is the same set of
 * conditions it has always been — a finished row simply satisfies none of them
 * and comes out with one button, which is why both shapes of row can share
 * this. `hasAccent` decides which button is the primary one, since the last one
 * is only the primary when nothing louder turned up in front of it.
 */
function RowActions({
  tournament: t, isFinished, atTheTable, canJoin, offer,
  onJoin, onOpen, onOpenTable, onQuit, onDelete, onEdit, onRebuy,
}) {
  const hasAccent = Boolean((atTheTable && onOpenTable) || (offer && onRebuy) || canJoin);
  return (
    <div className={`${AT_ACTIONS} flex items-center gap-1.5 justify-end`}>
      {/* The host too. Opening a tournament seats you automatically, so the
          person most likely to want out of one is the person who arranged
          it and then could not make it — and they were the one player this
          button was hidden from. Giving up the seat does not give up the
          night: they still host it. */}
      {t.is_joined && t.status === "lobby" && onQuit && (
        <button onClick={() => onQuit(t.id)}
          title="Give up your seat and free it for someone else"
          className={`${SECONDARY} text-(--color-text-muted)`}>
          Leave
        </button>
      )}
      {/* Paused counts as well: a night that breaks up half way through
          should not leave a game nobody can get rid of. */}
      {t.can_manage && t.status === "lobby" && onEdit && (
        <button onClick={() => onEdit(t)}
          title="Change this tournament — only until it starts"
          aria-label={`Edit ${t.name}`}
          className={`${SECONDARY} text-(--color-text-muted)`}>
          Edit
        </button>
      )}
      {t.can_manage && (t.status === "lobby" || t.status === "paused") && onDelete && (
        <button onClick={() => onDelete(t)}
          title={t.status === "paused"
            ? "Delete this paused tournament — the hands played are lost"
            : "Delete this tournament — only possible before it starts"}
          aria-label={`Delete ${t.name}`}
          className={`${SECONDARY} text-(--color-accent-link)`}>
          Delete
        </button>
      )}
      {atTheTable && onOpenTable && (
        <button onClick={() => onOpenTable(t.id)}
          title="Straight back to your seat"
          className={`btn-accent ${PRIMARY}`}>
          Open table
        </button>
      )}
      {offer && onRebuy && (
        <button onClick={() => onRebuy(t.id)}
          title={`Buy back in for ${offer.chips?.toLocaleString() ?? "the starting stack"} chips`
            + (offer.capped ? ` · ${offer.left} left` : "")}
          className={`btn-accent ${PRIMARY}`}>
          Rebuy
        </button>
      )}
      {canJoin && (
        // The whole row rather than its id: joining a euro tournament asks
        // first, and what it asks about is the buy-in.
        <button onClick={() => onJoin(t)}
          className={`btn-accent ${PRIMARY}`}>
          Join
        </button>
      )}
      <button onClick={() => onOpen(t.id)}
        className={hasAccent
          ? `${SECONDARY} text-(--color-silver)`
          : `${PRIMARY} panel-raised hover:border-(--color-border-strong) text-(--color-silver)`}>
        {isFinished ? "Results" : atTheTable ? "Lobby" : t.is_joined ? "Open" : "View"}
      </button>
    </div>
  );
}

/**
 * A tournament that has not been played yet, or is being played now.
 *
 * Read across: when, what it is called, who is in it and under what rules, what
 * it costs. What is not here is what the audit took off the row — the table
 * size, the number of places that pay, the registration count the faces already
 * print as "+N", the host's name beside a chip with the club's name on it. None
 * of them were wrong; all of them together were a paragraph, and the paragraph
 * did not fit.
 */
function UpcomingRow({ tournament: t, lead, tags, money, faces, actions, bountyOn, poolCents, koPoolCents }) {
  const { stake, pool } = money;
  return (
    <div className={t.is_joined ? `${ROW_GRID} border-l-2 border-l-(--color-highlight-edge)` : ROW_GRID}>
      <Rail lead={lead} />

      <div className={AT_NAME}>
        <h3 className="font-semibold text-sm text-(--color-silver) truncate">{t.name}</h3>
        {/* The gold edge down the left of the row is what says this one is
            yours. It costs no width, which the word "joined" did — and a
            border is not something a screen reader can read out. */}
        {t.is_joined && <span className="sr-only">You are registered</span>}
      </div>

      <div className={`${AT_STRIP} flex items-center gap-1.5 overflow-hidden`}>
        <ClubChip tournament={t} />
        <PlayerFaces players={t.registered} size="w-5 h-5" max={faces} />
        <Tags tags={tags} />
      </div>

      <div className={`${AT_MONEY} shrink-0 text-right leading-tight`}>
        <Amount
          label={stake ? amountText(stake) : "free"}
          coin={stake?.kind === "coins"}
          title={bountyOn
            ? `${euros((t.buy_in_cents || 0) - (t.bounty_cents || 0))} to the places, `
              + `${euros(t.bounty_cents || 0)} onto your head`
            : stake?.kind === "coins"
              ? "Coins, taken from your wallet when you sit down"
              : stake
                ? "Recorded, and settled between yourselves in Calotes"
                : "No buy-in at all"}
        />
        {pool && (
          <Amount
            label={amountText(pool)}
            coin={pool.kind === "coins"}
            tone="text-(--color-highlight-text)"
            size="text-xs"
            title={pool.kind === "coins"
              ? "Prize pool — everything paid in, in coins"
              : bountyOn
                ? `Prize pool — ${euros(poolCents)} to the places, ${euros(koPoolCents)} on heads`
                : "Prize pool — everything paid in, across every entry so far"}
          />
        )}
      </div>

      {actions}
    </div>
  );
}

/**
 * A tournament that is over, on the same grid and in the same columns.
 *
 * Its own component rather than a set of isFinished ternaries, because that is
 * what the row it replaces was: a finished night paid for a status pill saying
 * "finished", a Buy-in figure for a game nobody could enter, and a Join button
 * that never rendered — and still never said where you came. Sharing the grid
 * rather than the markup keeps the columns lined up down a mixed list without
 * making every element ask what kind of row it is in.
 */
function FinishedRow({ tournament: t, lead, money, history, actions }) {
  const { pool, net } = money;
  return (
    <div className={ROW_GRID}>
      <Rail lead={lead} />

      <div className={AT_NAME}>
        <h3 className="font-semibold text-sm text-(--color-silver) truncate">{t.name}</h3>
      </div>

      <div className={`${AT_STRIP} flex items-center gap-2 overflow-hidden
                       text-xs text-(--color-text-muted)`}>
        {history.winner ? (
          <span className="min-w-0 inline-flex items-center gap-1 text-(--color-highlight-text)">
            <Icon name="trophy" className="w-3.5 h-3.5" />
            <span className="truncate">{history.winner}</span>
          </span>
        ) : (
          <span className="truncate">no winner recorded</span>
        )}
        {history.duration && <span className="shrink-0 tabular-nums">{history.duration}</span>}
      </div>

      {/* What you took out of it, when the server can say — see rowMoney: the
          list serializer carries no prize field yet, so today this is the pot
          and nothing else, and the column simply is not drawn for a free game. */}
      {(net || pool) && (
        <div className={`${AT_MONEY} shrink-0 text-right leading-tight`}>
          {net && (
            <Amount label={amountText(net)} coin={net.kind === "coins"}
              tone="text-(--color-highlight-bright)" title="What you won" />
          )}
          {pool && (
            <Amount label={amountText(pool)} coin={pool.kind === "coins"}
              tone={net ? "text-(--color-text-muted)" : "text-(--color-highlight-text)"}
              size={net ? "text-xs" : "text-sm"}
              title="Everything paid in, across every entry" />
          )}
        </div>
      )}

      {actions}
    </div>
  );
}

/**
 * One tournament, in one row.
 *
 * This component now does the three things a component should: read the clocks,
 * work out who may press what, and hand both to a layout. Which facts a row is
 * allowed to say — and the cap that stops the next one breaking it again — is
 * tournamentRow.js's judgement, and is tested there.
 */
export default function TournamentCard({
  tournament: t, onJoin, onOpen, onOpenTable, onQuit, onDelete, onEdit, onRebuy,
}) {
  const compact = useCompactLayout();
  const lateRegLeft = useCountdown(t.late_registration_seconds_left ?? null);
  const startsInSeconds = useSecondsUntil(t.scheduled_start_at);
  const isFinished = t.status === "finished";
  const full = t.player_count >= t.max_players;
  const bountyOn = (t.bounty_mode || "none") !== "none" && (t.bounty_cents || 0) > 0;

  // What is actually at stake, in money. Buy-ins rather than people, so a
  // re-entry moves it: the card was reading the seat count and going quiet
  // about every buy-back after it.
  const entries = rowEntries(t);
  const money = rowMoney(t, entries);
  // The two halves of a knockout night, for the pool's tooltip only. Part of
  // every buy-in goes onto a head and is paid out hand by hand rather than by
  // placing, and somebody hovering the figure is entitled to the split.
  const poolCents = Math.max(0, (t.buy_in_cents || 0) - (bountyOn ? (t.bounty_cents || 0) : 0)) * entries;
  const koPoolCents = bountyOn ? (t.bounty_cents || 0) * entries : 0;

  const running = t.status === "running" || t.status === "paused";
  // How long it has been going, or how long it took. Neither can be read off
  // created_at: a tournament made on Monday for Friday night was not four days
  // long — which is why the server stamps play starting and ending.
  const elapsed = isFinished
    ? (t.started_at && t.finished_at ? spanBetween(t.started_at, t.finished_at) : null)
    : running ? spanBetween(t.started_at) : null;

  const lead = rowLead(t, { startTime: formatTime(t.scheduled_start_at), startsInSeconds, elapsed });
  // Two chips on a phone, four on a laptop. The cap is the layout's only
  // defence: the middle column is 211px wide down there, and anything that can
  // grow without limit will eventually be wider than that.
  const tags = rowTags(t, { lateRegSeconds: lateRegLeft, full, max: compact ? 2 : 4 })
    // The club chip sitting to the left of these already carries the league, as
    // a trophy and a tooltip. Saying it twice in one strip is what this row is
    // being cured of.
    .filter((tag) => !(tag.key === "league" && t.club_emoji));

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
  const atTheTable = t.is_joined && running && !t.my_finish_position;

  const actions = (
    <RowActions
      tournament={t}
      isFinished={isFinished}
      atTheTable={atTheTable}
      canJoin={canJoin}
      offer={offer}
      onJoin={onJoin}
      onOpen={onOpen}
      onOpenTable={onOpenTable}
      onQuit={onQuit}
      onDelete={onDelete}
      onEdit={onEdit}
      onRebuy={onRebuy}
    />
  );

  if (isFinished) {
    return (
      <FinishedRow
        tournament={t}
        lead={lead}
        money={money}
        history={historyLine(t, { elapsed })}
        actions={actions}
      />
    );
  }

  return (
    <UpcomingRow
      tournament={t}
      lead={lead}
      tags={tags}
      money={money}
      // Three faces on a phone, six on a laptop. They share the middle column
      // with the club chip and the tags, and the count that follows them says
      // how many more there are anyway.
      faces={compact ? 3 : 6}
      actions={actions}
      bountyOn={bountyOn}
      poolCents={poolCents}
      koPoolCents={koPoolCents}
    />
  );
}
