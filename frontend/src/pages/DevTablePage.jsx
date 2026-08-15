import { useEffect, useRef } from "react";
import useSandboxStore from "../dev/sandboxStore";
import useGameStore from "../store/gameStore";
import useAuthStore from "../store/authStore";
import { setSendInterceptor } from "../api/socket";
import { cameraSpecs, startFakeCameras, stopFakeCameras } from "../dev/fakeCameras";
import SandboxPanel from "../dev/SandboxPanel";
import GamePage from "./GamePage";
import {
  buildLevel, buildPlayers, buildStats, buildTournament,
  chatLine, communityCards, equityEntries, parseCardList, showdownEntries,
} from "../dev/mockTable";

/** The layout sandbox: the real game page, fed by knobs instead of a server.
 *
 * The whole point is that this renders `GamePage` itself rather than a copy of
 * it. A copy would drift, and tuning a copy tells you nothing about the page
 * players actually see. So the config here is turned into the same websocket
 * events the server sends, pushed through the same store reducer, and the page
 * below has no idea it is in a sandbox beyond skipping its network calls.
 */
export default function DevTablePage() {
  const active = useSandboxStore((s) => s.active);
  const setActive = useSandboxStore((s) => s.setActive);
  const config = useSandboxStore((s) => s.config);
  const setServerData = useSandboxStore((s) => s.setServerData);
  const handleEvent = useGameStore((s) => s.handleEvent);
  const username = useAuthStore((s) => s.user?.username) || "you";
  const chatCounter = useRef(0);
  const lastAction = useRef(null);

  // Turned on before the game page is allowed to mount — otherwise its own
  // mount effect would open a websocket to a tournament that does not exist.
  useEffect(() => {
    setActive(true);
    return () => {
      setActive(false);
      stopFakeCameras();
      setSendInterceptor(null);
      useGameStore.getState().reset();
    };
  }, [setActive]);

  // Everything the table draws, rebuilt from the config on every change.
  useEffect(() => {
    if (!active) return;
    const players = buildPlayers(config, username);
    const level = buildLevel(config);
    const heroSeat = config.heroSeat;
    const hero = players.find((p) => p.seat === heroSeat);

    const seats = players.map((p) => p.seat);
    const dealerSeat = seats.length ? seats[seats.length - 1] : null;
    const actionOnSeat = config.actionSeat === "none"
      ? null
      : config.actionSeat === "hero"
      ? heroSeat
      : Number(config.actionSeat);

    // Re-issuing `action_required` restarts the actor's clock, so it is only
    // sent when the decision itself changed. Without this every unrelated knob
    // would reset the timer, and the sandbox would misreport the one thing you
    // opened it to look at.
    const actionKey = actionOnSeat === null ? null
      : [actionOnSeat, config.pot, config.bigBlind, config.street, hero?.chips].join("|");
    const sameAction = actionKey !== null && actionKey === lastAction.current;
    lastAction.current = actionKey;

    // Anything with no clearing event of its own. A real table clears these by
    // starting the next hand, which would also wipe the board we are looking at.
    useGameStore.setState({
      showdown: null, potAwards: null, winnerSeats: [],
      allInEquity: null, rabbitCards: null,
      standings: null, lastElimination: null,
      ...(sameAction ? {} : { actionContext: null }),
    });

    handleEvent({
      type: "game_state",
      players,
      community_cards: communityCards(config.street),
      pot: config.pot,
      street: config.street,
      hand_number: 42,
      hole_cards: parseCardList(config.heroCards),
      level,
      dealer_seat: dealerSeat,
      sb_seat: seats[0] ?? null,
      bb_seat: seats[1] ?? seats[0] ?? null,
      action_on_seat: actionOnSeat,
      current_table_number: 1,
      current_table_id: 1,
      table_count: config.tableCount,
      table_summaries: Array.from({ length: config.tableCount }, (_, index) => ({
        table_number: index + 1,
        max_seats: config.capacity,
        player_count: index === 0 ? players.filter((p) => !p.is_eliminated).length : 6,
      })),
      is_paused: config.paused,
    });

    handleEvent({ type: "hand_strength", text: config.handStrength });
    handleEvent({ type: "countdown", seconds: config.countdown || null });

    if (actionOnSeat !== null && !sameAction) {
      handleEvent({
        type: "action_required",
        seat: actionOnSeat,
        to_call: config.bigBlind * 2,
        min_raise: config.bigBlind * 3,
        max_raise: hero?.chips || config.bigBlind * 50,
        valid_actions: ["fold", "call", "raise"],
        timer_sec: 30,
        action_timer_sec: 20,   // the remaining 10s read as time bank
        pot: config.pot,
        street: config.street,
      });
    }

    if (config.reveal === "showdown" || config.reveal === "winner") {
      const entries = showdownEntries(players, config.street);
      handleEvent({ type: "showdown", data: entries });
      if (config.reveal === "winner" && entries.length) {
        handleEvent({
          type: "pot_awarded",
          data: [{ seat: entries[0].seat, amount: config.pot, description: "main pot" }],
        });
      }
    } else if (config.reveal === "allin") {
      handleEvent({ type: "all_in_equity", data: equityEntries(players, config.street) });
    }

    if (config.finished) {
      handleEvent({
        type: "tournament_complete",
        standings: [...players]
          .sort((a, b) => b.chips - a.chips)
          .map((p, index) => ({ finish: index + 1, name: p.name })),
      });
    }

    useGameStore.getState().setConnectionStatus(config.connection);
    setServerData({
      tournament: buildTournament(config, players, username),
      statsByName: buildStats(players),
    });
  }, [active, config, username, handleEvent, setServerData]);

  // Cameras are their own effect: rebuilding streams on every unrelated keystroke
  // would restart every <video> on the table.
  useEffect(() => {
    if (!active) return undefined;
    const players = buildPlayers(config, username);
    startFakeCameras(cameraSpecs(players, config.cameras, config.cameraFaults, config.micOnly));
    return () => stopFakeCameras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active, username, config.cameras, config.cameraFaults, config.micOnly,
    config.playerCount, config.heroSeat, config.nameStyle, config.seatStates,
  ]);

  // The table-move notice dismisses itself after seven seconds, so it is fired
  // by the toggle rather than by every config change.
  useEffect(() => {
    if (!active || !config.moveNotice) return;
    handleEvent({
      type: "table_assignment",
      table_number: 2,
      table_id: 2,
      seat: 3,
      table_count: config.tableCount,
    });
  }, [active, config.moveNotice, config.tableCount, handleEvent]);

  useEffect(() => {
    if (!active || !config.chatAuto) return undefined;
    const id = setInterval(() => {
      chatCounter.current += 1;
      handleEvent({
        type: "chat_message",
        user_id: 900 + (chatCounter.current % 6),
        name: buildPlayers(config, username)[chatCounter.current % config.playerCount]?.name || "someone",
        text: chatLine(config, chatCounter.current),
      });
    }, Math.max(120, config.chatRate));
    return () => clearInterval(id);
  }, [active, config, username, handleEvent]);

  // Chat and action buttons would otherwise fall into a closed socket and do
  // nothing. Routed back into the store, they behave as they do in a real hand.
  useEffect(() => {
    if (!active) return undefined;
    setSendInterceptor((message) => {
      if (message.type === "chat_message") {
        handleEvent({ type: "chat_message", user_id: 1, name: username, text: message.text });
      } else if (message.type === "player_action") {
        handleEvent({
          type: "action_taken",
          seat: config.heroSeat,
          action: message.action,
          amount: message.amount,
          pot: config.pot + (message.amount || 0),
        });
      } else if (message.type === "sit_out") {
        handleEvent({ type: "player_sitting_out", seat: config.heroSeat, name: username, sitting_out: message.value });
      }
      return true;
    });
    return () => setSendInterceptor(null);
  }, [active, config.heroSeat, config.pot, username, handleEvent]);

  if (!active) return null;

  // The page is left at its true full width — the panel is a dialog you drag
  // out of the way, so what you are looking at is the real layout.
  return (
    <>
      <GamePage />
      <SandboxPanel />
    </>
  );
}
