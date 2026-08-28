import Icon from "../icons/Icon";
import BlackjackTable from "../game/BlackjackTable";
import useWalletStore from "../../store/walletStore";

/**
 * The casino, as the lobby draws it.
 *
 * One game so far, so this is mostly a heading and the table underneath it —
 * but it is the same shape the other rooms have (FastGameBrowser, CashBrowser),
 * because a second game here should be a second section rather than a rewrite.
 *
 * The heading earns its place by saying the two things somebody arriving needs
 * and cannot see from the felt: that this is against the house rather than
 * against people, and that it is coins. The second one matters more than it
 * looks — this app also runs tournaments for actual money, and a game against
 * the house for those would be something else entirely.
 */
export default function CasinoRoom() {
  const balance = useWalletStore((s) => s.balance);
  const game = useWalletStore((s) => s.games).find((one) => one.id === "blackjack");
  const low = game?.min_stake ?? 5;
  const high = game?.max_stake ?? 500;

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <Icon name="casino" className="w-8 h-8 shrink-0" tone="gold" />
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-(--color-silver) tracking-wide">Blackjack</h2>
          <p className="text-xs text-(--color-highlight-text) tabular-nums">
            Against the house · {low}–{high} coins · pays 3:2
          </p>
          <p className="text-xs text-(--color-text-muted) leading-snug mt-1 max-w-prose">
            Get closer to 21 than the dealer without going over. Dealer stands on soft 17,
            you can double or split any pair, and every coin here is the app's own — nothing
            in this room is played for money.
          </p>
        </div>
      </header>

      {/* Held to the width a card table wants. Stretched across a desktop lobby
          the two hands end up a foot apart with felt between them, which is a
          picture of a table nobody is sitting at. */}
      <div className="max-w-xl">
        <BlackjackTable />
      </div>

      {balance != null && balance < low && (
        <p className="text-xs text-(--color-text-muted)">
          You are under the {low}-coin minimum. The daily claim in the header is the way back.
        </p>
      )}
    </div>
  );
}
