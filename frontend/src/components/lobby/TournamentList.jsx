import TournamentCard from "./TournamentCard";

export default function TournamentList({ tournaments, onJoin, onOpen }) {
  if (!tournaments.length) {
    return <p className="text-gray-500">No tournaments yet. Create one!</p>;
  }
  return (
    <div className="space-y-3">
      {tournaments.map((t) => (
        <TournamentCard key={t.id} tournament={t} onJoin={onJoin} onOpen={onOpen} />
      ))}
    </div>
  );
}
