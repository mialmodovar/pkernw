import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import useLobbyStore from "../store/lobbyStore";
import useFastGameStore from "../store/fastGameStore";
import TournamentBrowser from "../components/lobby/TournamentBrowser";
import FastGameBrowser from "../components/lobby/FastGameBrowser";
import CashBrowser from "../components/lobby/CashBrowser";
import NewCashTableModal from "../components/lobby/NewCashTableModal";
import RealMoneyModal from "../components/lobby/RealMoneyModal";
import CasinoRoom from "../components/lobby/CasinoRoom";
import { isRealMoney } from "../components/lobby/buyIn";
import Icon from "../components/icons/Icon";
import {
  LOBBY_TABS, openTabs, readStoredTab, storedKey, writeStoredTab,
} from "../components/lobby/lobbyTab";
import { useAutoOpenTable } from "../components/lobby/autoOpenTable";
import { clubsYouOrganise, runsThePlace } from "../components/auth/runsThePlace";
import ProfileCard from "../components/lobby/ProfileCard";
import RecoveryCodePanel from "../components/lobby/RecoveryCodePanel";
import StatsPanel from "../components/lobby/StatsPanel";
import ClubPanel from "../components/lobby/ClubPanel";
import CalotesPanel from "../components/lobby/CalotesPanel";
import MissionPanel from "../components/lobby/MissionPanel";
import PanelStrip from "../components/lobby/PanelStrip";
import FriendsPanel from "../components/lobby/FriendsPanel";


/**
 * Watch your own instant game and leave for the table the moment it fires.
 *
 * Kept here rather than inside the tab it belongs to, because you can sit down
 * and then go and read something else — and the game starts dealing whether or
 * not its tab is the one on screen.
 *
 * This is the walk-in, not the alarm. It only runs while the lobby is the page
 * on screen, which is why GameStartAlert exists — it rings on the presence
 * socket from anywhere in the app, including from here, a moment before this
 * poll notices. Arriving at the table dismisses its banner, so the two read as
 * one event.
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
  // The clubs you could open a game for, rather than only whether there is
  // one: the cash dialog has to ask which, and a picker built from clubs you
  // merely play at would offer rooms the server will refuse.
  const [myClubs, setMyClubs] = useState([]);
  const [openingCash, setOpeningCash] = useState(false);
  // The euro tournament somebody has pressed Join on and not yet agreed to,
  // and whether the agreeing is under way. Held here rather than in the card:
  // the dialog is one per lobby, not one per row.
  const [confirming, setConfirming] = useState(null);
  const [joining, setJoining] = useState(false);
  // Where you were last. Read once, when the page mounts: coming home from a
  // table should land you back in the room you play in, and for anybody who
  // plays one format that is every single time they leave a game.
  const [where, setWhere] = useState(() => {
    const { tab: firstTab, room } = openTabs(readStoredTab());
    return { tab: firstTab.key, room: room.key };
  });
  const activeTab = LOBBY_TABS.find((one) => one.key === where.tab) || LOBBY_TABS[0];
  const activeRoom = activeTab.rooms.find((one) => one.key === where.room) || activeTab.rooms[0];
  const tab = activeTab.key;

  const go = useCallback((tabKey, roomKey) => {
    const found = LOBBY_TABS.find((one) => one.key === tabKey) || LOBBY_TABS[0];
    // Landing on a tab lands on its first room, which is the one anybody
    // means by pressing "Tournaments" — except when a room is named, which is
    // the row underneath.
    const room = found.rooms.find((one) => one.key === roomKey) || found.rooms[0];
    setWhere({ tab: found.key, room: room.key });
    writeStoredTab(storedKey(found.key, room.key));
  }, []);
  const onClubsLoaded = useCallback((clubs) => {
    setMyClubs(clubsYouOrganise(clubs));
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

  // Taking a seat. A coin game is one press, as it always was; a euro one asks
  // first — see RealMoneyModal, and isRealMoney, which is the whole test.
  const join = async (id) => {
    await useLobbyStore.getState().joinTournament(id);
    navigate(`/tournament/${id}`);
  };
  const onJoin = async (tournament) => {
    if (isRealMoney(tournament)) return setConfirming(tournament);
    return join(tournament.id);
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
    // The tournament list is long and scrolls inside itself, so that tab is
    // bounded to the viewport. The fast-game tabs are a fixed handful of cards
    // and scroll with the page instead — a scrollbar inside a column that has
    // room to spare only makes the page feel cramped.
    <div className={`max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-6 ${
      activeRoom.formats || activeRoom.cash ? "lg:min-h-[calc(100%-4rem)]" : "lg:h-[calc(100%-4rem)]"
    }`}>
      {/* A phone gets the same panels as a row of icons, closed until asked
          for, so the games are the first thing on the screen rather than the
          ninth. Wide screens keep the column: a sidebar with room for
          everything open is the reason to have a sidebar. */}
      <PanelStrip onClubsLoaded={onClubsLoaded} />

      <aside className="hidden lg:block lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-8 lg:self-start">
        <ProfileCard />
        {/* Second, under your own name. It was last of eight, which on a phone
            is a long way below the fold — and what is worth playing today is
            the thing that decides what you open, so it has to be read before
            the lobby rather than after it. */}
        <MissionPanel />
        <RecoveryCodePanel />
        <StatsPanel />
        <CalotesPanel />
        <FriendsPanel />
        <ClubPanel onClubsLoaded={onClubsLoaded} />
      </aside>

      <main className="flex-1 min-h-0 flex flex-col gap-4">
        <div className="shrink-0 flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* One segmented control rather than three headline-sized pills. These
              are a way of switching what the page is showing, and they were
              set in the size of a page title — which read as three competing
              headings with no page underneath any of them. */}
          {/* Full width on a phone. There are three of these now, not the two
              the comment here used to assume — Tournaments, Cash games and
              Casino — and at 360-390px three labels no longer fit. So they are
              allowed to shrink and clip rather than push each other off the
              row: the icon carries the identity when a word runs out of space,
              and a control you have to drag to see the other half of is not a
              control. */}
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-lg panel-raised
                       w-full sm:w-auto"
            role="tablist"
            aria-label="Game mode"
          >
            {LOBBY_TABS.map((one) => (
              <button
                key={one.key}
                type="button"
                role="tab"
                aria-selected={tab === one.key}
                onClick={() => go(one.key)}
                className={`flex flex-1 sm:flex-none min-w-0 items-center justify-center gap-1.5
                            px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold
                            whitespace-nowrap transition-colors ${
                  tab === one.key
                    ? "bg-(--color-accent) text-(--color-accent-text)"
                    : "text-(--color-text-muted) hover:text-(--color-silver)"
                }`}
              >
                {/* Gold on the tab you are looking at, so the strip says which
                    room you are in without relying on the fill alone. */}
                <Icon
                  name={one.icon}
                  className="w-4 h-4 shrink-0"
                  tone={tab === one.key ? "gold" : "mono"}
                />
                <span className="truncate">{one.label}</span>
              </button>
            ))}
          </div>

          {/* Only what this tab can act on. Creating a tournament belongs to
              the Tournaments tab; nothing here opens a Spin n Go, which is what
              the Sit button on the card is for. */}
          <div className="ml-auto flex items-center gap-2">
            {/* A cash table belongs to a club, so this is the same permission
                the tournament button asks for and the same one the server
                checks. */}
            {activeRoom.cash && (runsThePlace(user) || myClubs.length > 0) && (
              <button onClick={() => setOpeningCash(true)}
                className="btn-accent px-2.5 sm:px-3 py-1 sm:py-1.5 rounded font-semibold
                           text-xs sm:text-sm transition-colors whitespace-nowrap">
                New<span className="hidden sm:inline"> cash table</span>
              </button>
            )}
            {activeRoom.key === "scheduled" && (runsThePlace(user) || myClubs.length > 0) && (
              <>
                <button onClick={() => navigate("/tournaments/new")}
                  className="btn-accent px-2.5 sm:px-3 py-1 sm:py-1.5 rounded font-semibold
                             text-xs sm:text-sm transition-colors whitespace-nowrap">
                  {/* On a phone the noun is the button: there is one kind of
                      thing this page makes, and spelling it out cost a third
                      of the width of the screen. */}
                  New<span className="hidden sm:inline"> tournament</span>
                </button>
                {/* A layout tool, not a way to play, so it is an icon beside
                    the thing it is a tool for rather than a button the same
                    size as one. */}
                <button onClick={() => navigate("/dev/table")}
                  title="Table sandbox — the felt with mock players, for layout work"
                  aria-label="Table sandbox"
                  className="btn-secondary w-8 h-8 rounded flex items-center justify-center
                             transition-colors">
                  <Icon name="tools" className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Which kind of tournament, under which of the two things this app is.
            Only where there is a choice to make: the cash tab has one room and
            a strip of one is a label pretending to be a control. */}
        {/* Wrapped rather than scrolled: four rooms do not fit across a phone,
            and a second line of pills is readable where a strip that hides two
            of them is not. */}
        {activeTab.rooms.length > 1 && (
          <div className="shrink-0 flex flex-wrap items-center gap-1"
            role="tablist" aria-label={activeTab.label}>
            {activeTab.rooms.map((room) => (
              <button
                key={room.key}
                type="button"
                role="tab"
                aria-selected={activeRoom.key === room.key}
                onClick={() => go(activeTab.key, room.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                            whitespace-nowrap transition-colors border ${
                  activeRoom.key === room.key
                    ? "border-(--color-highlight-edge) bg-(--color-highlight-dim) text-(--color-highlight-pale)"
                    : "border-(--color-border) text-(--color-text-muted) hover:text-(--color-silver)"
                }`}
              >
                <Icon
                  name={room.icon}
                  className="w-3.5 h-3.5"
                  tone={activeRoom.key === room.key ? "gold" : "mono"}
                />
                {room.label}
              </button>
            ))}
          </div>
        )}

        {confirming && (
          <RealMoneyModal
            tournament={confirming}
            busy={joining}
            onClose={() => setConfirming(null)}
            onConfirm={async () => {
              setJoining(true);
              try {
                await join(confirming.id);
              } finally {
                // Cleared whatever happened: a join that failed leaves the
                // player in the lobby rather than behind a dialog they cannot
                // press their way out of.
                setJoining(false);
                setConfirming(null);
              }
            }}
          />
        )}

        {openingCash && (
          <NewCashTableModal
            clubs={myClubs}
            allowPublic={runsThePlace(user)}
            onClose={() => setOpeningCash(false)}
          />
        )}

        {activeRoom.casino ? (
          <CasinoRoom />
        ) : activeRoom.cash ? (
          <CashBrowser />
        ) : activeRoom.formats ? (
          <FastGameBrowser
            // Remounted per room so the prize panels a player opened on one do
            // not come back open on the other.
            key={activeRoom.key}
            formatKeys={activeRoom.formats}
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
