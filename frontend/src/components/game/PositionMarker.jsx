/**
 * The dealer button and the blind markers, as discs on the felt.
 *
 * They live out here beside the chips a seat has put in rather than up in the
 * nameplate, because that is where they are at a real table and because that is
 * what they are about: the button says who acts last, and the blinds say where
 * the money in front of those two seats came from. Reading them next to the
 * bets means never having to look from a badge by somebody's name back down to
 * the felt to work out what they already owe.
 */

// Kept small on purpose. These sit in the same row as the chips, and that row
// has to fit between two neighbouring seats on a nine-handed ring — where the
// gap is 136px and every pixel of the row is spent against it.
const DISC = "flex items-center justify-center rounded-full font-extrabold leading-none " +
             "shadow shadow-black/60 w-[clamp(0.85rem,2.15cqw,1.2rem)] h-[clamp(0.85rem,2.15cqw,1.2rem)] " +
             "text-[clamp(0.36rem,0.88cqw,0.5rem)]";

export default function PositionMarker({ isDealer, isSB, isBB }) {
  if (!isDealer && !isSB && !isBB) return null;

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {isDealer && (
        <span
          title="Dealer button"
          className={`${DISC} bg-[linear-gradient(135deg,#efe9e3,#b9b0a7)] text-[#1a1208]
                      border border-[#8c8379] text-[clamp(0.5rem,1.2cqw,0.7rem)]`}
        >
          D
        </span>
      )}
      {(isSB || isBB) && (
        <span
          title={isSB ? "Small blind" : "Big blind"}
          className={`${DISC} bg-[linear-gradient(135deg,rgba(20,14,15,0.95),rgba(8,5,6,0.95))]
                      text-(--color-highlight-text) border border-(--color-highlight-edge)`}
        >
          {isSB ? "SB" : "BB"}
        </span>
      )}
    </div>
  );
}
