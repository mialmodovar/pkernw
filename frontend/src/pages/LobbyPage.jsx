import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import useLobbyStore from "../store/lobbyStore";
import useFastGameStore from "../store/fastGameStore";
import TournamentBrowser from "../components/lobby/TournamentBrowser";
import FastGameBrowser from "../components/lobby/FastGameBrowser";
import { useAutoOpenTable } from "../components/lobby/autoOpenTable";
import { organisesForAClub, runsThePlace } from "../components/auth/runsThePlace";
import ProfileCard from "../components/lobby/ProfileCard";
import RecoveryCodePanel from "../components/lobby/RecoveryCodePanel";
import StatsPanel from "../components/lobby/StatsPanel";
import ClubPanel from "../components/lobby/ClubPanel";
import CalotesPanel from "../components/lobby/CalotesPanel";
import CoinPanel from "../components/lobby/CoinPanel";
import WatchPanel from "../components/lobby/WatchPanel";

// The three things you can be playing. Written as a list rather than three
// buttons so the strip is one loop, the way the filter chips inside the
// tournament browser are — and so a fourth has one place to be added.
//
// `formats` is which of the instant formats a tab shows; the tournament tab has
// none, being the one place where games are arranged rather than sat down at.
const LOBBY_TABS = [
  { key: "tournaments", label: "Tournaments", icon: "🏆", formats: null },
  { key: "spingo", label: "Spin n Go", icon: "🎡", formats: ["spingo"] },
  { key: "sitngo", label: "Sit n Go", icon: "⚔️", formats: ["hu", "sixmax"] },
];

/**
 * Watch your own instant game and leave for the table the moment it fires.
 *
 * Kept here rather than inside the tab it belongs to, because you can sit down
 * and then go and read something else — and the game starts dealing whether or
 * not its tab is the one on screen.
 *
 * Strictly on the change from waiting to dealing. Sending you to the table
 * because you are *in* a running game is the mistake this used to make: it made
 * the lobby unreachable for as long as the game lasted, since every poll took
 * you straight back. Opening the app mid-game is a different case and belongs to
 * useAutoOpenTable, which spends its redirect once; walking back here on purpose
 * has TableShortcut for a way back and no argument about it.
 */
function useFastGameWatch({ user }) {
  const navigate = useNavigate();
  const { myGames, fetchLobby } = useFastGameStore();
  // All of them, because you can be queued at several tiers at once and any of
  // them can be the one that fills.
  const waiting = myGames.some((game) => game.status === "lobby");
  // A stable key over id-and-status pairs: the effect below wants to run when a
  // game changes state, not every time the poll hands back the same list.
  const signature = myGames.map((game) => `${game.id}:${game.status}`).join(",");
  const previous = useRef(new Map());

  useEffect(() => {
    if (!user) return;
    fetchLobby();
  }, [user, fetchLobby]);

  // Two paces, like the tournament list: a queue you are sitting in can fill up
  // at any second and is worth knowing about immediately, and everything else
  // can wait.
  useEffect(() => {
    if (!user) return undefined;
    const id = setInterval(() => {
      fetchLobby({ silent: true }).catch(() => {});
    }, waiting ? 2000 : 8000);
    return () => clearInterval(id);
  }, [user, fetchLobby, waiting]);

  useEffect(() => {
    const before = previous.current;
    const games = signature
      ? signature.split(",").map((pair) => {
        const [id, status] = pair.split(":");
        return { id: Number(id), status };
      })
      : [];
    // The last seat of one of them just filled while you were looking at this
    // page. Any other combination — including finding yourself already in a
    // running game — is not a moment, and must not move you.
    const fired = games.find(
      (game) => before.get(game.id) === "lobby" && game.status === "running",
    );
    previous.current = new Map(games.map((game) => [game.id, game.status]));
    // Replaced rather than pushed, so "back" from the table is the lobby you
    // were looking at and not a bounce straight back to the felt.
    if (fired) navigate(`/tournament/${fired.id}/play`, { replace: true });
  }, [signature, navigate]);
}

export default function LobbyPage() {
  const { user } = useAuthStore();
  const { upcoming, mineActive, past, fetchLobbyData, loading } = useLobbyStore();
  const navigate = useNavigate();
  // Opening a tournament now takes site staff or a club you help run, and the
  // button follows the same rule the server does.
  const [staffsAClub, setStaffsAClub] = useState(false);
  const [tab, setTab] = useState("tournaments");
  const activeTab = LOBBY_TABS.find((one) => one.key === tab) || LOBBY_TABS[0];
  const onClubsLoaded = useCallback((clubs) => {
    setStaffsAClub(organisesForAClub(clubs));
  }, []);

  // The three scopes overlap — a tournament you are seated at and that is open
  // for late registration comes back in two of them — so they are merged by id
  // rather than concatenated, or it would be listed twice.
  const tournaments = useMemo(() => {
    const byId = new Map();
    for (const tournament of [...mineActive, ...upcoming, ...past]) {
      byId.set(tournament.id, { ...byId.get(tournament.id), ...tournament });
    }
    // The server keeps fast games out of the browsable list and out of the
    // history; what it cannot keep them out of is your own active seats, which
    // is how the shortcut back to a table finds one. So they are dropped here
    // instead — this list is nights people arranged.
    return [...byId.values()].filter((one) => (one.format || "standard") === "standard");
  }, [mineActive, upcoming, past]);

  // A seat of yours that has started, or was already running when you opened
  // the app, takes you to the table — there is a hand waiting on you and this
  // list is not where you can play it.
  useAutoOpenTable({ tournaments, user, loading });
  useFastGameWatch({ user });

  // Waiting on a tournament of your own to begin is the one thing on this page
  // that is worth knowing about the second it happens, because it starts
  // dealing you cards. The rest of the list can take its time.
  const awaitingStart = tournaments.some((t) => t.is_joined && t.status === "lobby");

  useEffect(() => { fetchLobbyData(); }, [fetchLobbyData]);

  // Tournaments opening for late registration and seats freed by other players
  // both happen with no action of your own, so keep the lists live. A failed
  // tick is ignored because the next one recovers. Separate from the first load
  // above so that changing pace does not put the loading placeholder back over
  // a list that is already on screen.
  useEffect(() => {
    const id = setInterval(() => {
      fetchLobbyData({ silent: true }).catch(() => {});
    }, awaitingStart ? 4000 : 20000);
    return () => clearInterval(id);
  }, [fetchLobbyData, awaitingStart]);

  const onJoin = async (id) => {
    await useLobbyStore.getState().joinTournament(id);
    navigate(`/tournament/${id}`);
  };
  const onOpen = (id) => navigate(`/tournament/${id}`);
  const onOpenTable = (id) => navigate(`/tournament/${id}/play`);
  const onEdit = (tournament) => navigate(`/tournaments/${tournament.id}/edit`);
  // A rebuy from here is a seat at a table that is already dealing, so it ends
  // at the table. A refusal — the level ticked over while the list sat there —
  // is worth saying out loud, because the button was offered.
  const onRebuy = async (id) => {
    try {
      await useLobbyStore.getState().rebuyTournament(id);
      navigate(`/tournament/${id}/play`);
    } catch (e) {
      window.alert(e.response?.data?.error || "Rebuy failed");
      fetchLobbyData({ silent: true }).catch(() => {});
    }
  };
  const onQuit = async (id) => {
    if (!window.confirm("Unregister from this tournament? Your seat is freed for someone else.")) return;
    await useLobbyStore.getState().quitTournament(id);
  };
  const onDelete = async (tournament) => {
    const seated = tournament.player_count || 0;
    // A paused tournament has been played, so the warning says what that
    // costs rather than the one about seats nobody has taken yet.
    const warning = tournament.status === "paused"
      ? `Delete "${tournament.name}"? It is paused mid-play — the hands already `
        + `played are lost, and the ${seated} players in it lose the tournament.`
      : seated > 1
      ? `Delete "${tournament.name}"? ${seated} players are registered and will lose their seats.`
      : `Delete "${tournament.name}"? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    await useLobbyStore.getState().deleteTournament(tournament.id);
  };
  return (
    // Bounded to the viewport so the tournament list can scroll inside itself
    // rather than taking the whole page with it. dvh rather than vh: on a phone
    // the browser chrome is part of the height and moves as you scroll.
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-6
                    lg:h-[calc(100%-4rem)]">
      <aside className="lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-8 lg:self-start">
        <ProfileCard />
        <RecoveryCodePanel />
        <StatsPanel />
        <CalotesPanel />
        <WatchPanel />
        <ClubPanel onClubsLoaded={onClubsLoaded} />
        <CoinPanel />
      </aside>

      <main className="flex-1 min-h-0 flex flex-col gap-4">
        <div className="shrink-0 flex items-center gap-3">
          {/* One segmented control rather than three headline-sized pills. These
              are a way of switching what the page is showing, and they were
              set in the size of a page title — which read as three competing
              headings with no page underneath any of them. */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-lg panel-raised overflow-x-auto"
            role="tablist"
            aria-label="Game mode"
          >
            {LOBBY_TABS.map((one) => (
              <button
                key={one.key}
                type="button"
                role="tab"
                aria-selected={tab === one.key}
                onClick={() => setTab(one.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold
                            whitespace-nowrap transition-colors ${
                  tab === one.key
                    ? "bg-(--color-accent) text-(--color-accent-text)"
                    : "text-(--color-text-muted) hover:text-(--color-silver)"
                }`}
              >
                <span aria-hidden="true">{one.icon}</span>
                {one.label}
              </button>
            ))}
          </div>

          {/* Only what this tab can act on. Creating a tournament belongs to
              the Tournaments tab; nothing here opens a Spin n Go, which is what
              the Sit button on the card is for. */}
          <div className="ml-auto flex items-center gap-2">
            {tab === "tournaments" && (runsThePlace(user) || staffsAClub) && (
              <>
                <button onClick={() => navigate("/tournaments/new")}
                  className="btn-accent px-3 py-1.5 rounded font-semibold text-sm transition-colors
                             whitespace-nowrap">
                  New tournament
                </button>
                {/* A layout tool, not a way to play, so it is an icon beside
                    the thing it is a tool for rather than a button the same
                    size as one. */}
                <button onClick={() => navigate("/dev/table")}
                  title="Table sandbox — the felt with mock players, for layout work"
                  aria-label="Table sandbox"
                  className="btn-secondary w-8 h-8 rounded flex items-center justify-center
                             text-sm transition-colors">
                  🛠
                </button>
              </>
            )}
          </div>
        </div>

        {activeTab.formats ? (
          <FastGameBrowser
            // Remounted per tab so the prize panels a player opened on one do
            // not come back open on the other.
            key={activeTab.key}
            formatKeys={activeTab.formats}
            onOpenTable={onOpenTable}
          />
        ) : loading ? (
          <p className="text-(--color-text-muted)">Loading...</p>
        ) : (
          <TournamentBrowser
            tournaments={tournaments}
            onJoin={onJoin}
            onOpen={onOpen}
            onOpenTable={onOpenTable}
            onQuit={onQuit}
            onDelete={onDelete}
            onEdit={onEdit}
            onRebuy={onRebuy}
          />
        )}
      </main>
    </div>
  );
}
