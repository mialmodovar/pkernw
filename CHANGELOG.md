# Changelog

Notable changes to the poker platform. Newest first.

Entries describe what changed for a player, and why. Where a change fixed
something that was silently wrong, the cause is named — those are the ones worth
remembering.

## Unreleased

### Added
- **Side bets: the folded players get to call the hand.** Folding is the dullest
  thing that happens at a poker table — you are still there, still waiting, and
  now with nothing to think about. Back somebody to take the pot you got out of
  and find out at showdown whether you read it right. One call a hand and it
  cannot be moved, so backing somebody on the flop means something; the book
  shuts the moment the cards turn face up, because calling a hand you can
  already read is not calling anything. Your pick folding after you backed them
  is simply wrong, which is the risk of calling it early. The card in the
  corner takes the call, holds it, and reads the results out to the whole table.
- **Coins, and a shelf to spend them on.** Side bets are played for coins: 500
  to open an account and 200 more once a day. A calendar day rather than a
  rolling twenty-four hours, so "tomorrow" is an answer rather than "at 03:47".
  A call pays by how many players were still in when you made it — six-handed
  on the flop pays six, heads-up on the river pays two — and the odds are fixed
  at the moment you call, which is what makes calling early worth anything.
  Coins buy new throwables: everything already in use stays free, and there are
  eight more to save up for — including a cigar, which is not thrown at all: it
  is lit where you drew it and the smoke crosses on its own, hanging over the
  whole path for a second before it thins out. They are their own currency and
  buy nothing that money buys; Calotes settles real debts between friends and is
  kept well away from a game of guessing who wins a pot.
- **The best hand you have ever turned over, on your own stats, and clickable.**
  Only showdowns count — a monster everybody folded to was never seen and is on
  record nowhere. Clicking it replays the hand it was made in, however long ago
  that was.
- **How long is left to register, in minutes.** "Until level 4" is a fact about
  the schedule; how long you have is the thing you were asking. Counted across
  the levels between here and there, breaks included, since twenty minutes of
  break is twenty more minutes you can still register in. A level counted in
  hands has no clock, so those still say which level it closes on rather than
  invent a number.
- **How the tournament is going, without opening anything.** Players left of how
  many sat down, what an average stack has grown to, how many places pay and the
  registration clock — on the table's header, on the tournament lobby's banner
  and in the list at home, worked out in one place so the three cannot drift.
- **Throwables you can aim.** Pick something up and the cursor becomes a
  crosshair, with a dashed line curving from your own face to wherever you are
  pointing along the arc the object will actually fly. Whoever would catch it
  wears a ring with their name under it, so "can I hit them" is answered before
  you click. Clicking empty felt puts the thing down.
- **Your good cards catch the light.** A premium holding before the flop — tens
  or better, AK, AQs, KQs — and anything better than one pair once the board is
  out, and your two cards pick up a gold edge and a slow sheen. Only your own
  cards ever shine, and only when your cards are what made the hand: a board
  that pairs twice by itself belongs to the table, not to you. The sheen stops
  for anyone who has asked their system for less motion.
- **A player's card reads them in one word, and in a lot more numbers.** Tapping
  a seat used to give four preflop percentages and leave the interpreting to
  you. It now names the style — Nit, Rock, TAG, LAG, Calling station, Maniac —
  with the reasoning on hover, and only once there are twelve hands behind it,
  because below that the label describes the deck rather than the player. Under
  it: what they do when the pot is 3-bet or 4-bet into them (fold, call or raise
  again), how often they see a flop, how often they continuation bet, how often
  they fold to one, and what share of their postflop actions are aggressive.
  Every number still carries the sample it came from.
- **The tournament checks its own chip total after every hand.** Chips are the
  whole ledger: if the total can drift, a final standing means nothing. Every
  legitimate change — a rebuy adding a stack, an absent player being removed
  with theirs, somebody registering late — is accounted for, and anything else
  is reported to the log with the hand it happened on and the exact amount. A
  tournament that finished with 250 chips more than went into it took a database
  dig and a lot of guessing to even notice; the next one will name itself.

### Security
- **The engine no longer believes what a client sends.** A raise amount went
  straight into the chip arithmetic without a bounds check, so a raise *below*
  your own bet for that street computed a negative commitment and ran the sums
  backwards — pulling chips back out of the pot, blinds included. A non-numeric
  amount crashed the hand outright. An action that was not on offer is now
  replaced by the safest one that is, and a raise is forced inside the legal
  range before anything is committed.

### Changed
- **The table's navigation makes sense now.** Home is a house, up beside your
  avatar, in the same place on every screen — leaving is about you, not about
  this hand. The tournament's name is in the top-left corner, since it is
  possible to be in two. Info, hand history and the lobby are one group in the
  row below, because all three are "step away from the hand for a moment", and
  they have icons. Chips/BB and the sound toggle moved down beside Sit out,
  where the other things that change what the felt does live.
- **A hand replays street by street.** The history used to be one list of
  actions with three headings dropped into it and the board drawn once at the
  top, so a bet on the turn was a name and a number with no cards anywhere near
  it. Each street now carries the board the players were looking at when they
  acted, with the cards that street turned over lit up. The showdown leads with
  whoever was paid, and every card that made a hand is ringed.
- **An all-in sounds like a pulse.** Two thumps to a beat, quickening — a steady
  heart is calm and one that is speeding up is not. It starts when the chips go
  in rather than when somebody calls, so a shove everyone folds to is no longer
  the loudest thing a player can do in silence.
- **The home stats say the four things worth knowing.** Tournaments, cashes with
  the rate beside them, everything won, and your best hand. A cash in four is a
  different player from a cash in forty and the count alone could not tell you
  which. The rate counts the nights that finished, so a tournament still in play
  does not drag it down while you sit in it.
- **A tournament you are in the middle of has the button back to your seat**,
  right there in the list at home. It was two clicks and a page in between.
- **The hand that ends a tournament stays on screen.** The standings replaced
  the table the instant the last pot was awarded, so the hand you just lost — or
  won — everything on was gone before you could look at it. The table now holds
  for eight seconds, with a line saying the tournament is over and a button for
  anyone who has seen enough. Busting out waits the same eight seconds, rather
  than six.
- **The number on a nameplate says what it is.** The bare figure beside a
  player's stack was their VPIP, which you had to already know to read. It is
  labelled now, and coloured by how loose it is — cold for the players who
  wait, warm for the ones who cannot — so a table of tendencies can be taken in
  without hovering anything. Under twelve hands it stays grey, because a colour
  there would be claiming a read the sample cannot support.
- **The table fills the screen.** The betting panel moved into the bottom-right
  corner of the felt and the chat into the bottom-left, both smaller; the
  tournament panel moved to the top right and now shows the blinds and how many
  players are left, opening on hover for the rest. That freed the whole row that
  used to sit below the table, and the table grew into it.
- **Bigger cameras.** Roughly double the area at a table of six or fewer, and at
  a fuller table the picture on the nameplate went from a dot to something you
  can read a face in.

### Changed
- **Your own camera shows at your own seat**, under your name, where everyone
  else's is, instead of as a preview parked beside the controls.
- **At a table of seven or more the picture rides on the nameplate.** Nine tiles
  of their own do not fit around the ring, and trying made the seats overlap.

### Fixed
- **Your cards no longer shine while you are losing.** Once everybody is all in
  the hands turn face up, so the table knows exactly who is ahead — but the
  shine went on judging your cards against the board alone. A river that paired
  you lit up like good news while you were drawing dead to a set. Where the
  other hands can be seen, they settle it: behind is dark, and so is a chop.
  Nothing changes for an ordinary hand, where the cards are face down and there
  is nothing to compare against.
- **A hand's history put players in the wrong seats.** Every action was recorded
  against the seat that player is sitting in *now*, and a seat moves when tables
  rebalance — so a replay could show somebody acting from a seat they only
  reached two hands later, and match them against another player's showdown
  cards. The hand records its own seats; those are the ones that come back.
- **The best-hand preview opened inside the panel it came from.** Every frosted
  panel makes a stacking context, which no z-index climbs out of, so a dialog
  declared full-screen was pinned into a column of the lobby and laid over the
  tiles behind it.
- **A busted player can buy back in from anywhere the tournament is.** The rebuy
  was only ever offered on the two screens the table itself puts up: the strip
  that appears for ten seconds after you go out, and the elimination screen
  behind it. Close either one — press "Back home", or just reload — and a
  tournament still selling rebuys had no way to take yours. Both the tournament
  lobby and the home list now carry the button whenever the server would accept
  it, and they ask the same question the endpoint does rather than guessing: the
  running engine says whether the period is still open, so a button that is
  offered is a button that works.
- **The tournament lobby says which level is running.** It has always drawn a
  "Current level" and was never served one — the field existed in the database
  and was left out of the payload — so a running tournament read "Current level
  —" all night, and the blind structure below never highlighted the row it was
  on. Both now read from the live engine rather than the column, which is a hand
  behind. The rebuy line says whether the window is open or closed, too.
- **Stacks and bets are easier to read.** The chips or big blinds under each
  player's name, and the figure on the chips they have pushed out, both went up
  a notch — they are the numbers you read all night from across the table.
- **Some players appeared as a black rectangle while seeing everyone else fine.**
  Three separate causes, all found by reproducing it: everyone pressing the
  camera button at the same moment.
  - Both sides opened the connection at once, so each declared its own audio and
    video up front. Resolving the collision left the exchange carrying two of
    each — one live pair and one dead pair — and a video element plays the first
    video track it is handed, which was the dead one. Only one side opens the
    call now; the other takes the shape from the offer.
  - While the browser was asking for camera permission the app still believed
    both devices were off, so it tore down the connections it had just made and
    threw away the offers arriving from whoever pressed first. Whoever's camera
    opened slower ended up with one-way media.
  - The seat swaps between an audio element, a video element and a notice as a
    peer's state changes, and the code that hands the stream to the element only
    ran when the stream changed — not when the element did. A freshly mounted
    video element was left with no source at all: black, forever.
- **A picture that stops arriving now says so** instead of showing black, which
  everyone reasonably reads as the other person's camera being broken.
- **Seats no longer overlap at six or nine handed with cameras on.** Measured at
  six window sizes with every seat transmitting.
- **The build is stamped on the page.** Bottom right, in small grey type: the
  time the bundle was built and, when built from a checkout, the commit. Telling
  a stale cached page from a fresh deploy had been guesswork, and that guesswork
  already cost a round of chasing a bug that was no longer there.

### Changed
- **The hand history is a button, up in the top right.** It used to be a live log
  that grew a line per action, and every line changed the height of the whole
  bottom row — the betting panel and the waiting message moved under the mouse
  while a hand played out. It now sits with the other table controls, and the
  history itself reads better in the review panel, where hands are laid out
  whole.
- **The camera and microphone toggles moved into the chat header.** Both are
  talking to the table, and stacking them above the chat cost a hundred pixels
  the felt wanted.

### Fixed
- **The table no longer needs scrolling.** On a laptop screen the page ran past
  the bottom of the window while you played. Everything now fits one screen: the
  table keeps its full size whenever there is room and only shrinks on a short
  window, which is the one case where something has to give. Measured at five
  window sizes down to 1280×700 — no scrolling at any of them.
- **Names fit on the nameplate again.** Moving the seats onto the table's own
  measurements had shrunk them by a quarter, leaving room for about two
  characters of a nickname.
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
