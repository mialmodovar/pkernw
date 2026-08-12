import TournamentCard from "./TournamentCard";

export default function TournamentList({ title, tournaments, emptyMessage, onJoin, onOpen, onQuit, onDelete }) {
  return (
    <section>
      {title && <h2 className="text-lg font-semibold mb-3 text-(--color-silver)">{title}</h2>}
      {!tournaments.length ? (
        <p className="text-(--color-text-muted) text-sm">{emptyMessage || "Nothing here yet."}</p>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <TournamentCard key={t.id} tournament={t} onJoin={onJoin} onOpen={onOpen} onQuit={onQuit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}
