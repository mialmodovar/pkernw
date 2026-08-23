import Avatar from "../Avatar";

// Enough to recognise the table, not so many that the row becomes the card.
// The rest are counted, which is the part you can read at a glance anyway.
const SHOWN = 6;

/**
 * Who is in a tournament, as a row of overlapping faces.
 *
 * "6/18" tells you how full something is. It does not tell you whether the six
 * are the people you play with, which is the actual question anybody scanning a
 * lobby is asking. Same faces as the watch panel, so a player looks the same
 * wherever they turn up.
 */
export default function PlayerFaces({ players = [], size = "w-6 h-6" }) {
  if (players.length === 0) return null;
  const shown = players.slice(0, SHOWN);
  const rest = players.length - shown.length;

  return (
    <div
      className="flex items-center shrink-0"
      title={players.map((player) => player.display_name || player.username).join(", ")}
    >
      {shown.map((player) => {
        const name = player.display_name || player.username;
        return (
          <span
            key={player.username}
            // Overlapped, so a full table costs the width of three faces rather
            // than six. Each sits on the felt's own dark ring, which is what
            // keeps the row legible where they touch.
            //
            // `group` and a z-index on hover, because overlapping is the whole
            // layout: the face you are pointing at has to come out from under
            // the one next to it, and its name has to sit over both.
            className={`group relative ${size} -mr-1.5 last:mr-0 rounded-full
                        ring-2 ring-(--color-surface-sunken) overflow-visible
                        transition-transform hover:z-20 hover:scale-110
                        ${player.is_eliminated ? "opacity-40 grayscale" : ""}`}
          >
            <span className="block w-full h-full rounded-full overflow-hidden">
              <Avatar
                url={player.avatar_url}
                emoji={player.avatar_emoji}
                border={player.avatar_border}
                name={name}
                className="w-full h-full"
                emojiClassName="text-[0.85rem]"
              />
            </span>

            {/* Who that is. On hover only: six names written out is the row
                the faces replaced. */}
            <span
              className="pointer-events-none absolute left-1/2 bottom-full z-30 mb-1
                         -translate-x-1/2 hidden group-hover:block whitespace-nowrap
                         rounded px-1.5 py-0.5 text-[10px] font-semibold
                         bg-[rgba(12,7,18,0.95)] border border-(--color-border-strong)
                         text-(--color-silver) shadow-lg shadow-black/60"
            >
              {name}
              {player.is_eliminated && (
                <span className="text-(--color-text-muted)"> · out</span>
              )}
            </span>
          </span>
        );
      })}
      {rest > 0 && (
        <span className="ml-2.5 text-[11px] font-semibold text-(--color-text-muted)">+{rest}</span>
      )}
    </div>
  );
}
