const formatScheduledStart = (value) => {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export default function TournamentCard({ tournament: t, onJoin, onOpen }) {
  const statusColor = {
    lobby: "bg-amber-900/50 text-amber-200 border border-amber-700/40",
    running: "bg-(--color-accent-soft) text-red-200 border border-(--color-border-strong)",
    paused: "bg-black/30 text-(--color-silver) border border-(--color-border)",
    finished: "bg-black/30 text-(--color-text-muted) border border-(--color-border)",
  }[t.status];
  const scheduledStart = formatScheduledStart(t.scheduled_start_at);

  return (
    <div className="panel p-4 rounded-lg flex items-center justify-between hover:border-(--color-border-strong) transition-colors">
      <div>
        <h3 className="font-semibold text-(--color-silver)">{t.name}</h3>
        <p className="text-sm text-(--color-text-muted)">
          Host: {t.host_name} &middot; {t.player_count}/{t.max_players} players &middot; {t.players_per_table}/table &middot;{" "}
          {t.starting_chips.toLocaleString()} chips
        </p>
        {scheduledStart && (
          <p className="text-sm text-(--color-silver)">Scheduled start: {scheduledStart}</p>
        )}
        {t.time_bank_seconds > 0 && (
          <p className="text-sm text-(--color-text-muted)">Time bank: {t.time_bank_seconds}s</p>
        )}
        {t.payout_structure?.length > 0 && (
          <p className="text-sm text-(--color-text-muted)">Payouts: {t.payout_structure.length} places</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs px-2 py-1 rounded ${statusColor}`}>{t.status}</span>
        {t.is_joined && (
          <span className="text-xs text-(--color-text-muted)">Joined</span>
        )}
        {t.status === "lobby" && !t.is_joined && (
          <button onClick={() => onJoin(t.id)}
            className="btn-accent px-3 py-1 rounded text-sm transition-colors">
            Join
          </button>
        )}
        <button onClick={() => onOpen(t.id)}
          className="px-3 py-1 panel-raised hover:border-(--color-border-strong) rounded text-sm transition-colors text-(--color-silver)">
          Open
        </button>
      </div>
    </div>
  );
}
