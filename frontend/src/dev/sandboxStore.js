import { create } from "zustand";

/** The layout sandbox's own state.
 *
 * Deliberately separate from the game store: this holds the *knobs*, and the
 * game store holds the table those knobs produce. Keeping them apart means the
 * sandbox can be deleted without touching a line of game code, and means the
 * real table is driven through exactly the same events the server sends —
 * nothing here is a second rendering path.
 */

export const DEFAULT_CONFIG = {
  // Table shape
  playerCount: 6,
  capacity: 9,
  heroSeat: 0,
  nameStyle: "normal",   // normal | long — long names are the layout stress case
  stackSize: "normal",   // short | normal | deep — deep stacks stress chip formatting

  // The hand
  street: "flop",        // preflop | flop | turn | river
  pot: 4800,
  showBets: true,
  actionSeat: "hero",    // none | hero | <seat number>
  actionSeconds: 20,     // the regular clock
  timeBankSeconds: 10,   // 0 = no bank at all, as a tournament may be configured
  heroCards: "As Kd",
  handStrength: "Pair of Aces",
  reveal: "none",        // none | showdown | winner | allin

  // Per-seat state overrides: { [seat]: "folded" | "allin" | ... }
  seatStates: {},

  // Blinds
  levelNumber: 5,
  smallBlind: 200,
  bigBlind: 400,
  ante: 50,
  levelRemaining: 754,

  // Tournament context
  tableCount: 3,
  hostControls: true,
  buyInCents: 2000,      // €20 a seat, so the prize figures have something to work from

  // Cameras
  cameras: "none",       // none | half | all
  cameraFaults: false,   // mix in connecting/failed/no-picture peers
  micOnly: false,        // give the seats without a camera a live microphone

  // Chat
  chatAuto: false,
  chatRate: 900,
  chatStyle: "normal",   // normal | long | emoji

  // Overlays and status
  connection: "open",    // open | connecting | reconnecting | failed
  paused: false,
  countdown: 0,          // 0 = off
  onBreak: false,
  moveNotice: false,
  heroOut: false,        // drives the elimination screen
  finished: false,       // drives the final standings screen
};

const useSandboxStore = create((set) => ({
  active: false,
  panelOpen: true,
  config: DEFAULT_CONFIG,

  // Stand-ins for the two REST payloads the game page would fetch.
  tournament: null,
  statsByName: {},
  hands: null,           // null = "not flooded yet", so the panel reads honestly

  setActive: (active) => set({ active }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  patch: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

  setSeatState: (seat, value) =>
    set((s) => {
      const seatStates = { ...s.config.seatStates };
      if (value === "active") delete seatStates[seat];
      else seatStates[seat] = value;
      return { config: { ...s.config, seatStates } };
    }),

  setServerData: (patch) => set(patch),

  reset: () => set({ config: DEFAULT_CONFIG, hands: null }),
}));

export default useSandboxStore;
