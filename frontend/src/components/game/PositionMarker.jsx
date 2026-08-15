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

const DISC = "flex items-center justify-center rounded-full font-extrabold leading-none " +
             "shadow shadow-black/60 w-[clamp(0.95rem,2.5cqw,1.4rem)] h-[clamp(0.95rem,2.5cqw,1.4rem)] " +
             "text-[clamp(0.4rem,1cqw,0.55rem)]";

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
