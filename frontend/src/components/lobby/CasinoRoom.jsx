import Icon from "../icons/Icon";
import SharedBlackjackTable from "../game/SharedBlackjackTable";
import useBlackjackTableStore from "../../store/blackjackTableStore";
import useWalletStore from "../../store/walletStore";

/**
 * The casino, as the lobby draws it.
 *
 * One game so far, so this is mostly a heading and the table underneath it —
 * but it is the same shape the other rooms have (FastGameBrowser, CashBrowser),
 * because a second game here should be a second section rather than a rewrite.
 *
 * The heading earns its place by saying the three things somebody arriving needs
 * and cannot see from the felt: that the house deals rather than another player,
 * that the chairs are shared with whoever else is here, and that it is coins.
 * That last one matters more than it looks — this app also runs tournaments for
 * actual money, and a game against the house for those would be something else
 * entirely.
 */
/**
 * The two rooms, as a pair of tabs.
 *
 * Named and priced here rather than read off the payload, because the strip has
 * to be drawable before either table has answered — and because what is on it
 * is a lobby decision. The table itself takes its stakes from the server; these
 * are the sign over the door. Kept in step with blackjacktable.ROOMS.
 */
const ROOMS = [
  { key: "main", name: "Low stakes", price: "5 – 500" },
  { key: "high", name: "High stakes", price: "500 +" },
];

export default function CasinoRoom() {
  const balance = useWalletStore((s) => s.balance);
  const room = useBlackjackTableStore((s) => s.room);
  const setRoom = useBlackjackTableStore((s) => s.setRoom);
  const table = useBlackjackTableStore((s) => s.table);
  const floor = table?.min_bet ?? (room === "high" ? 500 : 5);

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <Icon name="casino" className="w-8 h-8 shrink-0" tone="gold" />
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-(--color-silver) tracking-wide">Blackjack</h2>
          <p className="text-xs text-(--color-text-muted) leading-snug mt-1 max-w-prose">
            Get closer to 21 than the dealer without going over. A shared table: the same
            dealer, the same cards, and the seats played in turn from the right. Dealer
            stands on soft 17, you can double or split any pair, and every coin here is the
            app&apos;s own — nothing in this room is played for money.
          </p>
        </div>
      </header>

      {/* Which room. Two tables, two clocks, two sets of chairs — the only
          thing they share is the rules. */}
      <div className="flex gap-2" role="tablist" aria-label="Blackjack rooms">
        {ROOMS.map((one) => {
          const active = room === one.key;
          return (
            <button
              key={one.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setRoom(one.key)}
              className={`flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-(--color-highlight-edge) bg-(--color-highlight-dim)"
                  : "border-(--color-border) panel-raised hover:border-(--color-border-strong)"
              }`}
            >
              <span className={`block text-sm font-bold ${
                active ? "text-(--color-highlight-text)" : "text-(--color-silver)"
              }`}>
                {one.name}
              </span>
              <span className="block text-[11px] tabular-nums text-(--color-text-muted)">
                {one.price} coins
              </span>
            </button>
          );
        })}
      </div>

      {/* Wider than the solo felt was: a row of people is the shape of a table,
          and squeezing them into a column would be a picture of a queue. */}
      <div className="max-w-4xl">
        <SharedBlackjackTable />
      </div>

      {balance != null && balance < floor && (
        <p className="text-xs text-(--color-text-muted)">
          You are under this room&apos;s {floor.toLocaleString()}-coin minimum.
          {room === "high" ? " The low-stakes table starts at 5." : " The daily claim in the header is the way back."}
        </p>
      )}
    </div>
  );
}
