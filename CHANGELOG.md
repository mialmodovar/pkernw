# Changelog

Notable changes to the poker platform. Newest first.

Entries describe what changed for a player, and why. Where a change fixed
something that was silently wrong, the cause is named — those are the ones worth
remembering.

## Unreleased

### Added
- **Table chat.** Bottom left of the table, with the betting panel in the middle
  and the hand history on the right. Messages go to your own table and nowhere
  else, and nothing is stored — what is said at a friendly game belongs to the
  night it was said in, so reloading starts an empty room.
- **What each player won.** A finished tournament's standings now carry the prize
  beside the player, in euros, for tournaments that had a buy-in. The column only
  appears when there is money to show.

### Fixed
- **The table changed size whenever the window did.** It had been sized from the
  leftover vertical space, so any change in window height — or the browser's own
  zoom — rescaled the whole table at once. It is back to a fixed width and a
  fixed aspect: the same size whatever happens around it.
- **Seats overlapped at a six-handed table.** The seats were measured against the
  window while the table was measured against something else, so on a short
  screen they kept their full size on a table that had shrunk and the two on the
  left ran into each other. Everything on the felt is now measured against the
  felt.
- **Decide before it is your turn.** Fold, Check, Check/Fold and Call any can be
  ticked while somebody else is thinking, and fire the moment the action reaches
  you. A pre-selection only survives while it still means what it meant: someone
  raising behind you voids a Check and hands the decision back rather than
  guessing. It is cleared at the end of every hand, so one can never act on cards
  you have not seen.
- **Sound for the table, not just for your turn.** Chips for a bet, raise or
  call, knuckles for a check, a brush for a fold, and a longer clatter for an
  all-in. All synthesised, so there is no audio to download and nothing to fail
  on a slow connection. The existing sound toggle covers them.

### Changed
- **The table is bigger and the betting controls are smaller.** The felt now
  sizes itself to the height available rather than to the width, so it fills the
  screen without pushing the bottom seat off it. The betting panel no longer
  spans the whole width: the slider was enormous and the bet sizes sat a long way
  from the button they feed.
- **Cards are drawn rather than typed.** The suits are SVG paths instead of the
  unicode glyphs, which render thin on Windows, heavy on macOS and sometimes as
  emoji on Android — at card size that was the difference between reading a hand
  and squinting at it. Board cards gained a corner index, and the four-colour
  deck is unchanged.
- **Every button responds to the mouse.** Raised panels are used as buttons all
  over the app and had no hover state of their own, so about half the buttons on
  screen felt dead.

### Fixed
- **A break left at the end of a blind structure trapped the tournament.** There
  is nothing to advance to after the last level, so the break ran, ended, and
  started again — forever, without another hand being dealt. The tournament now
  falls back to the last playable level, which then runs until somebody wins.
  Non-break final levels were already correct: the last level has no duration and
  plays on rather than inventing blinds the host never set.
- **Camera and microphone at the table.** Each player can turn on their camera
  and microphone independently and see and hear whoever is sitting at the same
  table. The video sits on the outer edge of each seat and only appears when
  there is a picture to show, so a table where nobody uses a camera looks
  exactly as it did.

  Browsers connect directly to each other; the server only carries the messages
  they use to find one another, and refuses to pass a signal between players who
  are not at the same table. There is no relay server, so a small share of pairs
  behind restrictive networks will not connect — that is shown on the seat it
  affects and never interrupts the game.

  You take part or you do not: nothing is received without also transmitting,
  which keeps invisible spectators out of the table. Both devices start off on
  every visit and nothing is remembered between sessions — a microphone you had
  forgotten about leaks more at a poker table than a bad tell. Turning a device
  off releases it, so the camera light goes out rather than being politely muted.

- **What a tournament costs and pays, in the lobby list.** Entrants, buy-in,
  prize pool and places paid now sit on each card. The list previously led with
  the name and buried the numbers a player actually scans for.
- **Calotes — who owes whom.** A tournament can now carry a buy-in in euros. When
  it finishes, the app works out each player's stake and prize and keeps a running
  balance, then suggests the fewest payments that would clear everyone — nobody
  has to act as the bank. Each rebuy counts as another buy-in, so it grows both
  the pot and what you owe.

  Only the person who **received** money can mark it settled; a payer clearing
  their own debt is exactly the claim the other side would dispute. Amounts above
  what is actually owed are refused. Everyone sees only the debts they are part
  of.

  The app never handles money. It records what the tournament decided and who has
  since been paid. All arithmetic is in integer cents — the one place in this
  codebase where a rounding error is somebody's actual euro — and the rounding
  remainder on a split goes to first place rather than vanishing. Tournaments
  with no buy-in, which is every tournament that already existed, produce no
  ledger at all.
- **What you hold, next to your cards.** "Pair of Aces", "Two pair, Kings and
  Sevens", "Ace high" — updated as each street lands, and sent only to you.
  Computed by the engine rather than a second implementation of the hand rules
  in the browser.
- **Reads on the other players.** Each seat carries that player's VPIP, and
  tapping a nameplate opens VPIP, PFR, 3-bet and attempt-to-steal, mined from
  recorded hand history. Every figure shows the sample behind it, and a
  statistic with no opportunities yet shows a dash rather than a misleading 0%.
  The definitions live in one module that the lobby stats read from too, so the
  two cannot drift apart.
- **Only staff can open a tournament.** Any registered account could create one,
  which sets stakes and a blind structure for other people. Browsing, joining and
  playing are unchanged for everyone. Staff is granted in the Django admin at
  `/admin/` by a superuser — that is the permissions UI, and it comes with
  Django; what was missing was a superuser and the rule itself.
- **Hand history, recorded and reviewable.** The engine now writes each finished
  hand — the board, every action by street, the showdown hands and the pot
  awards — and a Review button on the table replays the last few. The tables
  existed from the start and nothing had ever written to them, which is also why
  the VPIP and PFR figures in the lobby could only read zero.
- **Multi-table view.** The info panel lists every table with its seats filled
  and marks your own, names the chip leader, and says where the money line is —
  how many places pay, "On the bubble" one bust away, "In the money" once
  inside. Per-table counts had been in the client all along and were never shown.
- **Hosts can delete a tournament that never started.** Only before the first
  hand: once play begins the tournament owns results and hand history that other
  players have a claim on.
- **End-of-tournament results.** Finishing a tournament led with your own
  result — whether you won or where you placed, out of how many entrants, and
  the share of the prize pool that place takes — followed by entrants, hands
  played, the final blinds, and full standings with percentages and rebuys.
  Previously it showed the words "Tournament Complete" over a bare list of
  names, identical whether you had won or busted first.
- **Spectating after busting out.** The elimination screen waits a few seconds
  so the river, showdown and pot finish playing out, and offers to keep
  watching.
- **Break overlay.** A break used to stop play with no explanation at all.
  It now shows a countdown, that the seat is kept, and the blinds waiting on
  the other side.
- **Sit out.** You keep your seat and keep paying blinds and antes; your turns
  resolve immediately. The panel says so, and offers a way back in.
- **Connection status.** A banner while the websocket is down, and the action
  buttons disable — a swallowed action used to become a timeout fold with no
  indication anything was wrong.
- **Elimination screen** with your finish, the prize percentage and a way out.
  Sourced from the REST detail, so it survives a reload.
- **Staged showdown.** Hands turn over one at a time, the winning five cards
  take a gold ring, the hand name sits under the seat, and losing seats dim.
  The result is held back until every hand has turned over.
- **Dealer button and blind markers**, an all-in badge, a per-seat countdown
  ring, and player avatars on the table.
- **Turn alert** — a chime and a flashing tab title, on by default.
- **Keyboard shortcuts** for the action panel. The mouse commits immediately;
  keys arm on the first press and commit on the second, so a stray keystroke
  cannot fold your hand.
- **Hand history panel** grouped by hand and street, naming players.
- **Tournament panel** on the table: blinds, next level, players left, average
  stack, your rank, payouts.
- **Lobby**: emoji avatar profile, per-user stats including VPIP and PFR mined
  from hand history, and tournaments split into upcoming, active and past.
- **Docker stack** for deployment — one service that builds the frontend and
  serves it from Daphne alongside the API, plus Postgres. Same origin, so the
  client's relative calls and its websocket work with no CORS and no proxy, and
  it matches the constraint that the engine must run as exactly one process.
  Refuses to start with no database configured when debug is off, rather than
  falling back to a SQLite file the next deploy would discard.

### Changed
- **The tournament page reads like a tournament lobby.** A banner carries the
  name, state and the headline numbers — entrants, starting stack, places paid —
  with the actions beside them. Below it: what is happening now (players left,
  current and next level, largest, average and smallest stack), what it pays,
  and a ranked, searchable player list where busted players keep their place
  greyed out with where they finished. The blind structure is a table rather
  than a long list, with the current level marked.
- **The table reads more clearly.** Cards look like cards — ivory face, rounded
  corners, a fine edge and a shadow — and a covered hand shows a woven burgundy
  back instead of a question mark. Bets are placed on the line between a seat
  and the pot, so they no longer land on the player's own cards wherever they
  sit. Nameplates carry the avatar, name and stack in one row and sit outside
  the felt: seats above the centre put the plate on their outer edge, since a
  single order left it pointing into the middle of the table for half the seats.
  The hand number left the centre of the felt.
- **Bet sizing sits above the slider, and the shove is one of the sizes.** The
  separate All-in button is gone and Raise is the rightmost button. Sizes are
  the ones players think in: 2bb, 2.5bb and 3.5bb before the flop, 25%, 40% and
  75% of the pot after it, with All in alongside them. `A` still shoves — it
  sizes the bet and arms Raise, so it confirms like every other shortcut.
- **A proper four-colour deck.** The copper diamonds and muted green clubs read
  as near-black at table size, which defeats the point of four colours. Red,
  blue, green and black now, with a larger and heavier rank and suit.
- **The raise slider is usable.** Its step was a twentieth of the whole range,
  which gave a short slider twenty positions — small drags changed nothing and
  the amount on the Raise button looked frozen. It is one chip per step now, on
  a much wider track.
- **Time bank on by default** (30 seconds). Without one, a moment's hesitation
  on a big decision timed you out into a fold.
- **The engine owns the chip arithmetic.** The client used to recompute stacks,
  bets and the pot in parallel with the engine and only reconcile at the end of
  a hand. It now applies what the engine sends.
- **Dark red, black and silver theme** across every screen, replacing the
  default greys and greens.
- **Responsive table.** It was a fixed 700×420 box that clipped on a narrow
  window, and seats were laid out from the number of players present, so
  everyone's seat moved when someone busted. Seats now come from the table's
  capacity, with empty seats drawn.
- **Wider tournament detail page** — it was a single narrow column that
  scrolled for no reason.

### Fixed
- **A restart rewound a running tournament to level 1.** The blind level and
  hand count lived only in memory. Both are persisted now, so a restart resumes
  where play actually was. (The clock on time-based levels still restarts.)
- **Two engines could run the same tournament.** The boot check ran several
  awaits before registering the game, so simultaneous connects each started
  their own coordinator; the two then overwrote each other's players. This was
  behind chips reverting to earlier values and players flickering in and out of
  being eliminated.
- **Rebuy never worked.** It wrote only to the database, which the engine
  overwrote after the next hand — the rebuy was spent and silently undone. It
  now goes through the engine.
- **Finished tournaments recorded no winner.** The winner is not eliminated, and
  the persistence step only kept a finish position for eliminated players, so
  first place was written away as null. A data migration recovers it where the
  winner is unambiguous.
- **A seat collision crashed the whole tournament.** Eliminated players kept
  their seat and were absent from the new layout, so compacting the survivors
  landed on top of them — right after the first bust. The crash killed the
  engine and marked the tournament finished with players still holding chips.
- **A phantom disconnect hid your own cards.** A superseded socket's teardown
  unregistered the live channel, which is how private hole cards are delivered,
  and announced a disconnect that never happened.
- **Reconnecting on your own turn lost you the hand.** The snapshot carried no
  action context and the request was never re-sent, so the panel sat dead until
  you timed out. The clock now resumes rather than restarting.
- **No pot was shown for the whole of preflop** — blinds were never added to it.
- **Paused tournaments rendered an empty table** and could not be recovered
  after a restart. There is now resume UI, since the only control lived on a
  page a paused tournament could not reach.
- **Folded hands stayed on the table.** A muck now leaves, though you can hover
  your own to see what you let go.
- **Native checkboxes and sliders** rendered in browser blue against the dark
  theme.

### Removed
- **Travelling chip animation.** It repeated continuously — the item list was
  rebuilt on every render, restarting the flight — and added little once fixed.
- **The all-in panel.** It covered the table; the moment is now a small line
  under the pot, with the per-seat equity pills carrying the numbers.

## Earlier

Tournament creation and lobby, the multi-table live engine with automatic table
balancing and final-table consolidation, scheduled starts, blind structures with
breaks, late registration, rebuys, payout structures, time banks, host controls
(pause, resume, skip level), rabbit hunting, and auto-removal of offline players.
