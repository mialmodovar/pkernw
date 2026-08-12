const formatScheduledStart = (value) => {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatDate = (value) => {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
};

const ordinal = (n) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
};

export default function TournamentCard({ tournament: t, onJoin, onOpen }) {
  const statusColor = {
    lobby: "bg-amber-900/50 text-amber-200 border border-amber-700/40",
    running: "bg-(--color-accent-soft) text-red-200 border border-(--color-border-strong)",
    paused: "bg-black/30 text-(--color-silver) border border-(--color-border)",
    finished: "bg-black/30 text-(--color-text-muted) border border-(--color-border)",
  }[t.status];
  const scheduledStart = formatScheduledStart(t.scheduled_start_at);
  const isFinished = t.status === "finished";
  const iWon = t.my_finish_position === 1;

  return (
    <div className="panel p-4 rounded-lg flex items-center justify-between gap-4 hover:border-(--color-border-strong) transition-colors">
      <div className="min-w-0">
        <h3 className="font-semibold text-(--color-silver) truncate">{t.name}</h3>
        <p className="text-sm text-(--color-text-muted)">
          Host: {t.host_name} &middot; {t.player_count}/{t.max_players} players &middot; {t.players_per_table}/table &middot;{" "}
          {t.starting_chips.toLocaleString()} chips
        </p>

        {/* Finished tournaments lead with the result, which is the only thing
            still worth knowing about them. */}
        {isFinished ? (
          <p className="text-sm mt-1">
            {t.winner_name ? (
              <span className="text-[#d9c07a]">🏆 {t.winner_name} won</span>
            ) : (
              <span className="text-(--color-text-muted)">No winner recorded</span>
            )}
            {t.my_finish_position && (
              <span className={iWon ? "text-[#d9c07a]" : "text-(--color-silver)"}>
                {" · "}you finished {ordinal(t.my_finish_position)}
              </span>
            )}
            {formatDate(t.created_at) && (
              <span className="text-(--color-text-muted)"> · {formatDate(t.created_at)}</span>
            )}
          </p>
        ) : (
          <>
            {scheduledStart && (
              <p className="text-sm text-(--color-silver)">Scheduled start: {scheduledStart}</p>
            )}
            {t.time_bank_seconds > 0 && (
              <p className="text-sm text-(--color-text-muted)">Time bank: {t.time_bank_seconds}s</p>
            )}
            {t.payout_structure?.length > 0 && (
              <p className="text-sm text-(--color-text-muted)">Payouts: {t.payout_structure.length} places</p>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-xs px-2 py-1 rounded ${statusColor}`}>{t.status}</span>
        {t.late_registration_open && (
          <span className="text-xs px-2 py-1 rounded bg-emerald-900/40 text-emerald-200 border border-emerald-700/40">
            late reg
          </span>
        )}
        {t.is_joined && !isFinished && (
          <span className="text-xs text-(--color-text-muted)">Joined</span>
        )}
        {(t.status === "lobby" || t.late_registration_open) && !t.is_joined && (
          <button onClick={() => onJoin(t.id)}
            className="btn-accent px-3 py-1 rounded text-sm transition-colors">
            Join
          </button>
        )}
        <button onClick={() => onOpen(t.id)}
          className="px-3 py-1 panel-raised hover:border-(--color-border-strong) rounded text-sm transition-colors text-(--color-silver)">
          {isFinished ? "Results" : "Open"}
        </button>
      </div>
    </div>
  );
}
