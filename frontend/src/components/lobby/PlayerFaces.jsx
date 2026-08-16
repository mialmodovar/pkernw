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
      title={players.map((player) => player.username).join(", ")}
    >
      {shown.map((player) => (
        <span
          key={player.username}
          // Overlapped, so a full table costs the width of three faces rather
          // than six. Each sits on the felt's own dark ring, which is what
          // keeps the row legible where they touch.
          className={`${size} -mr-1.5 last:mr-0 rounded-full ring-2 ring-(--color-surface-sunken)
                      overflow-hidden ${player.is_eliminated ? "opacity-40 grayscale" : ""}`}
        >
          <Avatar
            url={player.avatar_url}
            emoji={player.avatar_emoji}
            name={player.username}
            className="w-full h-full"
            emojiClassName="text-[0.85rem]"
          />
        </span>
      ))}
      {rest > 0 && (
        <span className="ml-2.5 text-[11px] font-semibold text-(--color-text-muted)">+{rest}</span>
      )}
    </div>
  );
}
