# Changelog

Notable changes to the poker platform. Newest first.

Entries describe what changed for a player, and why. Where a change fixed
something that was silently wrong, the cause is named — those are the ones worth
remembering.

## Unreleased

### Added
- **The blackjack table is shared.** Eight seats, one dealer, one shoe: you take
  a chair and the cards that come out are the cards everybody else at the table
  is looking at, settled against the same dealer hand. What makes it worth
  having is not the blackjack, which is identical — it is that somebody else
  busting is something you watched happen.

  Everybody acts at the same time rather than in seat order. That is a real
  departure from a casino floor and it is the decision that makes the table
  playable at all: seat order means one player looking at their phone freezes
  seven other people, and the cure for that is a per-seat clock nobody enjoys.
  One window, everyone in it, and a seat that has not acted when it closes is
  stood on what it has. A seat that does not bet for three windows is given up,
  because eight chairs is few enough that holding one you are not playing is
  taking it from somebody who would.

  There is no worker behind it. The phase and the moment it ends are stored, and
  every request works out what phase the table should be in and walks it forward
  before answering — so a table nobody is looking at is idle rather than late,
  and the next person to open it does the walking and pays out everything that
  was owed. The client polls once a second, which is what the countdown needs
  and less machinery than a socket for a screen that changes that slowly.

  The solo game is unchanged and still what the poker table's drawer opens. A
  twelve-second betting window you cannot join halfway is no use in the thirty
  seconds between poker hands; that is what the solo game is for.
- **A casino, and blackjack in it.** A third tab beside Tournaments and Cash,
  and the first game in this app played against nobody: twenty-one against the
  dealer, in coins, alone. Single deck, dealer stands on soft 17, blackjack pays
  3:2, double on any two and split any pair — no re-splitting, and split aces
  get one card each. Coins only and always: the euros in this app are debts
  between people that it writes down and never touches, and a game against the
  house for those would be the app taking money, which it does not do.

  Any two cards of the same value split, which is the rule every casino plays:
  a king and a queen are two tens, and two tens is a pair whatever is printed on
  them. Each hand of a split is then played out on its own — hit it, stand it,
  double it — before the dealer turns over.

  The bet is built out of chips — 5, 25 and 100 — because the amount is the
  decision and a chip is a decision you can make with your thumb without looking
  away from the felt. Cards land one at a time, chips drop onto the pile, a hand
  that wins glows and one that busts shakes. The dealer's own cards are held
  back and let out on a beat: the server settles the whole round in one reply,
  so the wait is a fiction, and it is the fiction the game is made of — a dealer
  on 16 reaching for one more card is the reason anybody watches.

  Under the table, the last ten hands as a row of marks — W, L, P, and BJ for a
  blackjack, which gets its own because it paid 3:2 and is the row anybody wants
  to point at. Read as a shape before it is read as text. A round is judged by
  what it did to the wallet rather than by its hands, so a split where one won
  and one lost shows as a push: it moved nothing, and saying otherwise would
  disagree with the balance printed above it.

  The deck lives on the server and the hole card reaches the client as "??"
  until the round is over. So does the round itself, which is what lets the same
  hand be picked up in either of the two places it can be played, and what stops
  closing the tab being a way out of a hand you have coins on.

- **Blackjack at the poker table, for the hand you folded out of.** The side-bet
  panel — which already appears exactly when you have nothing to do — now also
  opens a hand of blackjack over the felt. It is the same round as the Casino
  tab, so one can be started in the lobby and finished at a table.

  It takes itself off the screen the moment the table needs you. No
  confirmation and nothing to dismiss: poker is the game and blackjack is the
  waiting, and a card game covering the buttons at a money table is how somebody
  times out of a hand they had chips in. Nothing is lost by it closing, because
  the hand is on the server and is still there when you fold again.
- **A euro tournament says so before it takes your seat.** Almost everything in
  this app is played for coins, which are the app's own currency and cost
  nobody anything. A tournament played for money looked exactly like the rest —
  the same Join button, the same one press — and the only thing telling them
  apart was a small figure with a € on it, which a player scanning a list has no
  reason to read differently from a figure with a chip on it. Joining one now
  asks first: the buy-in, large and on its own; how much of it is the bounty
  rather than the places, where there is one; and the sentence that actually
  matters, which is that the app does not take the money, hold it, or pay it
  out — it writes down what was agreed, and Calotes shows at the end what you
  are owed and what you owe. Somebody who joined believing their twenty euros
  were with the app had misunderstood the whole thing, and this is the last
  moment anybody can tell them.

  It asks at both doors — the lobby card and the tournament's own page — because
  a confirmation only one of the two ways in has is not a confirmation. Coin
  games are untouched: one press, as they always were.
- **A ladder to climb in the instant games.** Every one of them offered exactly
  two prices, and neither was the one a lot of players wanted: a Spin n Go cost
  25 or 50 coins, which is a quarter of a new player's whole balance at the
  bottom and nowhere to go at the top. There are seven rungs now — 5, 10, 25,
  50, 100, 250 and 500 — shared across the formats rather than picked per
  format, so a price means the same thing wherever it is seen. Spin n Go and
  Heads Up run the whole ladder; 6-Max and All In or Fold start at 10, because
  a 5 split six ways pays its winner nineteen coins and the same 5 divided into
  four bounties is not a game anybody would remember playing. All In or Fold
  stops one rung short of the top, its buy-in being four bounties rather than a
  pot.

  Five coins is the point of the bottom rung: the daily claim is 200, so a bad
  run no longer ends an evening. Five hundred is the point of the top one — it
  is where a Spin n Go's hundred-times draw is forty thousand coins.
- **Your game is starting, wherever you are.** A seat at an instant game is no
  longer exclusive — you can be queued at three tiers while playing a fourth
  game — and the only thing telling you one of them had filled was the lobby
  polling for it, which stops the moment the lobby is not the page on screen.
  So the ordinary way to use the app, sitting down and then going to play the
  game you already had running, was also the way to be dealt into a table
  nothing had told you about: blinds posted, a hand folded for you, and the
  first you knew of it was the tab strip. It now rings — a sound, a flashing
  tab title, a desktop notification when the window is behind something else,
  and a banner naming the format and what it is playing for, with the way in.
  It does not move you: somebody halfway through a hand at another table is not
  to be dragged out of it, so the banner waits to be pressed. The lobby's own
  walk-in is unchanged for anybody still standing in it.

  It travels on the presence socket, which is the connection the app already
  holds open from every page to say you are online — the only one that is not
  about a particular tournament, and so the only one that can reach somebody
  looking at something else. One group per player, never a broadcast: it shares
  an event loop with the games, and news for one player must not cost every
  other player a beat. The browser is asked for notification permission at the
  moment you press Sit, which is the one moment it is obviously about, and
  asked once — a refusal is a refusal.
- **Mystery bounties.** A knockout tournament where nobody's head is worth
  anything in particular: the same half of every buy-in goes into a sealed pool
  instead, and knockouts pay nothing at all until the pool is cut into envelopes
  of wildly different sizes. From that moment on, busting somebody draws one —
  most are worth about a buy-in, one is worth the night. The envelopes open
  either **at the money** or **when registration closes**, whichever the host
  picks, and both wait for the field to be final: a pool that can still grow is
  a pool that cannot be cut up. The board of what is left is public, because
  knowing what is still in there is most of the tension; only the draw is a
  gamble. The table makes a moment of both — the pool being opened stops the
  felt for a few seconds and deals the envelopes out one by one, and a draw
  tears open with the amount landing out of it, scaled to what it was worth
  against everything still on the board.
- **Sit n Go, in two shapes.** Beside the Spin n Go tab: **Heads Up** — two
  players, front to front, twenty-five big blinds each, five to ten minutes —
  and **6-Max**, thirty big blinds with the top two paid, ten to fifteen. Two
  buy-ins each (10 and 50 coins heads up, 25 and 100 six-handed), blinds every
  two minutes, and the same rule as the Spin n Go: you sit, and when the last
  seat fills the cards are in the air. No draw here — a Sit n Go pays out exactly
  what was paid in, split the way the format splits it, with nothing raked off.
- **A heads-up table that looks like one.** Two players get a smaller, rounder
  felt with a seat at each end, facing each other, rather than a ring built for
  eight with six empty chairs in it. The engine already knew the heads-up rules —
  the button posts the small blind, acts first before the flop and last after it
  — and now the felt reads the way the game is played.
- **One lobby behind three tabs.** Spin n Go and Sit n Go are the same machinery
  with different numbers, so they now share a catalogue, an endpoint and a
  settlement: the lobby fetches every format in one request and each tab draws
  its own. Adding a fourth format is a row in a table.

- **Signing up walks you into a game.** It used to be a username, a password and
  a table colour, which left somebody standing in an empty lobby with no club,
  nobody to watch and no idea two of the three game modes existed. It now also
  asks whether you read stacks in chips or big blinds, offers the clubs anybody
  can join (and takes an invite code), suggests players to follow as you type
  their name, and finishes by saying what there is to play — tournaments, Spin n
  Go and Sit n Go, with how long each one takes. Everything after the account is
  skippable and takes about a minute.
- **A way back in when you forget your password.** No email is ever sent — this
  is a poker game for a group of friends, not a mail provider — so an account
  gets a recovery code when it is made, shown once, and that code sets a new
  password. It is stored hashed, exactly like a password, and it is replaced the
  moment it is used: a code that has got somebody in once is a password sitting
  in whatever they wrote it down in. Accounts made before this are offered one
  from the lobby.
- **Your coins, beside your name.** The balance was only in the sidebar panel
  where you go to claim it, rather than where you look while deciding whether you
  can afford to sit down.

### Changed
- **A tournament row you can read at a glance.** The line under a tournament's
  name had grown to eleven facts joined by dots, inside a paragraph marked
  `truncate` — which means it never wrapped, whatever the comment above it
  claimed. It was cut off. A running club knockout produced about 394 points of
  text into the 332 a phone has, and the part that fell off the end was
  `late reg 8:20`: the one fact on the card you could still act on. The name
  itself was down to about 130 points, so anything longer than twenty characters
  was clipped as well, and the row broke into three ragged lines about 125
  points tall — four tournaments to a screen.

  It is a grid now, two rows and three columns, and the answer to "when" has a
  fixed rail of its own on the left where nothing can push it off: a countdown
  before it starts, how long it has been running, or your finishing place once
  it is over. The name gets the whole middle column. Money is one right-hand
  column without the little headings. What is left of the facts became at most
  a handful of chips, capped in code rather than by luck — so no future fact can
  quietly break the row again — and the ones that were noise are gone: the table
  size, how many places pay, a registration count the faces beside it already
  gave, and the host, whose name the search box still matches.

  Finished tournaments get their own shape rather than paying for a status pill
  and a buy-in price for a game nobody can enter. And a day is no longer able to
  head two sections at once: a night that finished this afternoon and one that
  starts this evening used to produce two sticky headings both reading "Today".
- **The lobby's icons say what they open.** On a phone the panels above the
  games collapse to a row of buttons, which is the right shape — but they were
  six bare glyphs, and four of them were drawn for something else. Missions was
  a bare tick, named "Yes" in the icon set. Friends was an eye, named "Watching",
  and the same eye stood for a friend request in the header bell, so one picture
  meant both "a person" and "a table you are not seated at". Calotes was a book.
  Clubs was the card suit, already sitting in the header a couple of inches away.

  Each button now prints its own name under its icon. The note in the code
  saying six labels could not fit was simply wrong: a phone gives each button
  about 55 points and the longest word needs 42 — it had been tried BESIDE a
  20-point icon, which needs 68, rather than under one. Missions and Friends
  get glyphs drawn for them, and the eye goes back to meaning only spectating.

  Two of them carry what is waiting: a number on Missions for coins you have not
  collected, a dot on Friends for somebody who has asked. The mission board was
  never even fetched on a phone before — the panel that asks for it only mounts
  when opened, so the one panel with money in it was the one a phone could not
  advertise. Each open panel now carries its own icon in its heading, so the
  picture and the word are learned together, and the profile card finally says
  "You" at the top of itself.
- **The instant-game lobby is a list rather than a wall of cards.** Two buy-ins
  fit as two cards; seven do not, and a phone got a card per screen. Each tier
  is a row now — what it costs, what it pays, how full it is, and the way in,
  in that order, which is the order the question is actually asked in. The
  prize table and the odds ladder sit behind a caret on the row that owns them,
  because they are read once and then never again. Every row fits a 320px
  screen without wrapping: the seat count spelled out and the faces of the
  people already waiting stand down as the screen narrows, and the seat pips —
  the part worth watching while you wait — never do.
- **One settings window, in pages.** The gear in the header and the gear on the
  lobby's profile card opened two different panels: the card's had the Google
  connection on the end of it and the header's did not, so which settings a
  player could find depended on which button they had found. They are now the
  same window — your name and picture, theme, cards, the table, finishers, the
  account — and the button only chooses which page it opens on.

  Paged rather than scrolled, because there is the better part of a thousand
  pixels of it: the finishers sat four screens below the fold on a phone, so
  reaching them meant scrolling back past every decision already made. Tabs to
  jump, arrows to step, and a swipe across the panel to turn — a swipe that has
  to be a good deal more sideways than downward, since this is a tall panel
  people drag up and down.
- **The settings fit a phone.** The window runs the full width of a small
  screen rather than sitting in a card capped at 22rem, which is what left every
  swatch inside it smaller than a fingertip. The close button, the tabs, the
  arrows and the buttons on a finisher row are now the size of a thumb rather
  than the size of the icons in them, nothing behind the window scrolls while it
  is open, and the fields inside it are big enough that iOS stops zooming the
  whole page in when one is tapped.
- **The raise buttons are set as buttons.** They were a text field per row
  holding "2, 2.5, 3.5": a format nobody was told, punctuation to get right on a
  phone keyboard, and a field that silently rewrote what you typed whenever it
  dropped something it could not read. The settings now show the row as the
  table will draw it — your three sizes and the all-in that is always there —
  each with arrows that step it by half a blind or five points of the pot, a
  cross to drop one, and a plus to add one back. The arrows snap onto the step,
  so a size somebody typed by hand is kept until they touch one; the sizes still
  live on the account and still follow you to another machine.
- **Three themes, all three on screen.** Choosing one was a dropdown: a click, a
  menu, and three items in it. They sit in a row now, each showing the felt it
  lays with the card back that will be on it — the same kind of choice as the
  accent swatches underneath, made the same way.
- **Stats, one kind of game at a time.** A Spin n Go is three-handed for five
  minutes and a tournament is nine-handed for an evening; a VPIP averaged across
  both describes neither, and neither does an in-the-money rate. The stats panel
  now has a selector — all, tournaments, Spin n Go, Sit n Go — and everything in
  it follows: games played, cashes, winnings, best hand and the preflop reads.
- **One header, on every page.** Modelled on the table's, which is the one that
  worked: who you are and what you are holding on the right, the way back on the
  left, and nothing that moves as you navigate. Every page used to invent its
  own — on a phone the lobby put your account and the logout button at the
  *bottom*, under six panels, because they lived inside the scrolling column
  rather than above it. The blind level and the clock are not in it: they are
  about the hand, not about the app, and they stay on the felt where they are
  read. The tournament lobby no longer opens in a second browser tab either.
- **Setting up a prize pool is two sliders.** A host decides "the top fifth get
  paid" and "half the buy-in goes on heads" — not a grid of place numbers,
  labels and percentages that has to total exactly 100 by hand. Places paid is
  now a share of the field and the split follows from it; the knockout bounty is
  a share of the buy-in. The grid is still there for a night that wants a
  particular structure, and it opens with whatever is already on screen.
- **All your tables, along the top of the one you are at.** A player can be
  seated in three games at once and watching a fourth; the app could hold one in
  its head. Leaving a table lost it, and the way back was a single button that
  guessed which one you meant. Every open table is now a tab — with the hand you
  were dealt there, so you can tell them apart at a glance — and switching is one
  click. A watched table can be closed, because nothing on the server knows you
  are looking; a seat cannot, because you are in it. From the lobby, "back to
  the table" now means the table you were last at rather than the newest one.
- **The lobby header stops shouting.** Three game modes set in the size of a page
  title read as three competing headings with no page under any of them. They are
  a segmented control now, with the mode's own face on each. Creating a
  tournament sits with the tab it belongs to, and the table sandbox — a layout
  tool, not a way to play — is an icon rather than a button the same size as one.
- **Your coins live with your name.** Top left beside your face on a wide screen,
  and up in the corner on a phone, where the profile card is a long scroll away.
  A quiet pulse on the daily claim when there is one waiting, which takes it.
- **The winner is paid their own bounty, in every mode.** They always were —
  settlement has always handed back the head nobody collected — but it was only
  covered by one test of one case. It is now pinned for fixed, progressive and
  mystery alike, along with the property underneath it: whatever is on the heads
  plus whatever has been collected is always exactly what the buy-ins put in,
  checked after every knockout across hundreds of randomly ordered fields.
- **You stay logged in.** The session was two hours of access on a seven-day
  refresh, and the browser kept the first refresh token it was given — so an
  active player was signed out a week after they first logged in, whatever they
  did in between. Refresh tokens now last a month and are rotated on every use,
  so anybody who opens the app inside a month is never asked to log in again.
- **The instant-game lobby says what kind of game it is.** Every format now
  leads with its own name, face and shape — three players, 15bb, three to five
  minutes — instead of a small grey heading the Spin n Go tab did not draw at
  all. The tier cards were big and said little: the only figure on one was an
  unlabelled buy-in, large enough to read as a prize, over a row kept empty for
  faces that were not there. A card now says what it costs and what it pays, both
  labelled, with the seats as a row of pips beside the count; the full odds are
  still a click away under Details.
- **Chips or big blinds is a setting on your account.** It was kept in the
  browser, so it followed you from table to table but not from one device to the
  next. Which of the two you think in is a habit, not a property of the machine
  you happen to be sitting at.

### Fixed
- **A few things on a phone that were out of reach.** The lobby's three tabs no
  longer push each other off a 360-point screen — there are three of them now
  where the layout was written for two, so they are allowed to shrink and let
  the icon carry the name. The buy-in dialog and the new-cash-table dialog can
  be scrolled on a short screen: both were centred boxes with no height limit
  inside a frame that does not scroll, so on a phone in landscape the confirm
  button was simply below the bottom of the screen with no way to reach it.
  Four more dialogs measure themselves against the visible screen rather than
  the theoretical one, which is the difference a browser's own toolbars make.
  And an instant-game row gives the prize back the width two fixed columns were
  taking, which on a phone had left the number you read the row for with about
  sixty points to fit in.
- **The table stops dying halfway through a tournament.** A page at a full table
  with the cameras on would go, with no action to blame, and come back fine on a
  reload. The cause was a disagreement about who belongs in the camera mesh: a
  player who busts keeps their seat, marked eliminated, and everybody still in
  the tournament dropped them from the mesh — while they, watching the same
  table, still wanted everybody. One side hung up, the other saw the connection
  fail, restarted it, connected, and was hung up on again, for the rest of the
  night. Every cycle was a fresh peer connection on every remaining player's
  machine — each one an ICE agent, an encoder and a decoder — and a browser
  holding more than it can is a browser the operating system kills outright,
  which is the crash that was being reported: the tab gone, an error page, no
  console and nothing in any server log.
  Whoever is on the table's roster is now in the mesh, busted or not — a player
  who stayed to watch is on the rail, and the rail has been in the mesh on
  purpose since watching stopped being a one-way mirror. Somebody who actually
  leaves drops off the roster, which is what takes them out of it.

  Two guards behind that fix, because it is the shape of failure that matters
  more than the one instance: a connection we have deliberately hung up on is
  not rebuilt when the other side calls again, and an ICE restart is only
  forgiven by a connection that then *lasted*, so a pair that keeps coming up
  and dying gives up instead of retrying all evening.
- **A crash now leaves something to read.** The reports were of the browser
  itself dying — Chrome's error page, the tab gone, a reload the only way back —
  and that is the one failure that leaves no trace anywhere: the console goes
  with the process, and nothing about it ever reaches the server. The page now
  keeps a black box. Every twenty seconds it writes down what it is holding —
  connections open, connections *ever opened*, video elements, heap — into
  storage that belongs to the tab rather than to the process, so the reading
  taken before the crash survives it. A run that never says goodbye is a run
  that was killed, and the reload afterwards says so and offers the details to
  copy. The number that names this class of fault is the difference between
  connections open and connections opened: seven that stay up is a table with
  cameras on, seven open against four hundred opened is the table eating the
  browser.
- **The mesh cannot open connections faster than a table could need them.** A
  backstop under all of the above, not a fix for anything known: sixty in five
  minutes is not a busy table, it is two sides disagreeing about who belongs in
  the mesh, and it now stops rather than continues. Cameras say they are
  settling and come back on their own once the burst has passed. Whatever
  disagreement comes next costs a picture instead of the tab.
- **A knockout GIF costs a tenth of what it did.** The clip in the middle of the
  felt was fetched at its original size — commonly 550 square, over a megabyte
  per frame held decoded — to be drawn about 350 pixels across, on every screen
  at the table, several times a night, alongside eight video streams already
  being decoded. It now asks for the downsized rendition, and falls back to the
  original for the few GIFs that have none.
- **A page that breaks no longer takes the whole app with it.** One component
  throwing while it drew meant React discarded everything — the felt, the
  buttons, the header — and left a white screen. A different failure from the
  browser being killed, and one nothing was guarding against. There is now a
  boundary around the pages
  and a second one around the felt itself: a table that fails to draw leaves the
  action buttons alive, so the hand you are already in can still be played. The
  screen says what happened, offers the reload, and hands over the details to
  copy — a crash is written down as it happens and survives the reload, so a
  report is worth reading instead of "it crashed again". The same net catches
  what a boundary never sees: a websocket handler, a WebRTC event, a promise
  nobody awaited.
- **One bad event no longer silences the table.** Every socket message was
  delivered to the game store, the sounds and the camera mesh in one pass, so a
  throw in any of them stopped the ones after it from ever seeing that message —
  and every message after it. Each listener now gets its own footing.
- **The hand history calls people what they call themselves.** A replay named
  every player by their login name, ignoring the display name they had set — at
  the one moment their play is being talked about. Rows are still filed under the
  login name, which is what the ledger and the stats key on.
- **Instant games stay out of the tournament list.** A Spin n Go you played three
  of before breakfast is not history in the sense that list means, and thirty of
  them would bury the night somebody actually arranged. Finished and waiting fast
  games are listed in their own tabs, with their own results; the Tournaments tab
  is for nights people arranged. A game of yours that is *dealing* still reaches
  the shortcut back to the table, which is the one place it has to.
- **Spin n Go.** A second game mode, beside Tournaments at the top of the lobby.
  Two tiers, 25 or 50 coins, three seats each: you sit, and when the third
  player sits the prize is drawn — a multiplier between 2× and 100× on the
  buy-in — and the cards are in the air. Fifteen big blinds, three-handed, two
  minutes a level, three to five minutes from the draw to somebody having all
  the chips, and the winner takes the whole coin pool. Nobody hosts one and
  there is nothing to configure; the server keeps the queue for each tier and
  fires it. The prize table is on the tier card rather than hidden behind "up to
  100×", and the weights average out to exactly three buy-ins, which is what the
  three of you paid in — nothing is raked off a currency the app prints.
  The table looks like a different game because it is one: a smaller, rounder
  three-seat felt in violet with a gold rim, the drawn prize written on the felt
  for the whole game, and the multiplier landing on a reel before the first hand.
- **Clubs can be run, not just started.** A club used to be a thing you could
  only make: the server had always allowed renaming it, making it private,
  handing it over and staffing it, and there was no way in the app to ask for any
  of it — so a typo in a club name was permanent and every club was stuck with
  exactly one person able to open a tournament. A **Manage** panel on the club
  page now covers the name, the description, the face, and whether the club is
  listed at all. The invite code sits there too, with a copy button and a way to
  replace it when it has been passed somewhere it should not have been — members
  stay members, the old code stops working.
- **Staff, appointed by the owner.** The members list becomes a staff list for
  whoever owns the club: make somebody staff so they can open the club's nights
  and run its leagues, take it back, hand the club over entirely, or remove
  somebody. Removing a player takes them out of the club and leaves their results
  in the tables they played in. There is still exactly one owner — handing over
  makes you staff — and an owner is told to hand the club on rather than offered a
  Leave button that would strand everybody.
- **Leagues can be renamed and shelved.** A shelved league keeps every season
  table it ever produced and stops being offered for new nights; whoever runs the
  club still sees it, marked, and can bring it back.
- **A club can be closed down.** Owners only, and it asks you to type the club's
  address to be sure. What goes is the club, its leagues and its season tables.
  What stays is every night the club ever ran — the hands, the results and who won
  them are untouched; they simply stop belonging to a club.
- **The superuser can actually reach what they administer.** Every control on a
  club page is drawn from the server's own answer to "may this person manage
  this", rather than from their membership — a superuser is a member of nothing,
  so the account that can fix any club was shown the controls for none of them.
  Private clubs are listed for them too, for the same reason.
- **A way back to the table, and a way out of it.** Being in a game used to mean
  the lobby was unreachable: every page that knew about your tournament sent you
  straight back to the felt, on every refresh, for as long as the game lasted.
  You are now only taken to the table when there is a moment worth taking you to
  — you opened the app with a game already running, or the one you were waiting
  on has just started dealing — and the rest of the time you can go and read the
  lobby. A button pinned to the corner of every other page takes you back, says
  which game it is, and shows the hand you were holding when you left, for as
  long as it is still recent enough to be the hand.
- **The end of a Spin n Go reads like the end of a tournament.** A GIF for how it
  went, the multiplier and the coins beside it, and never a percentage: a share
  is a rule for splitting a pot, and what people want at the end is the number
  that landed in their wallet. The finish screen for a coin tournament now says
  coins throughout — the payout column, your own result and the standings — read
  from the ledger once it settles rather than recomputed.
- **The Spin n Go lobby remembers.** Under the tables: your last ten games with
  what each one came to and your net across them, and beside it the three biggest
  spins anybody in the app has landed — nickname, multiplier and prize. The
  hundred-times is what makes the format worth playing, and a board of them is
  the proof it happens.
- **Coins buy you into a tournament that has no euro prize pool.** A tournament
  is now played for one currency or the other, and there is no third option: a
  game with nothing at stake is a game nobody folds in. Euros work exactly as
  before — the app records what was agreed and never handles a cent, and you
  settle up in Calotes. Coins are the app's own, so they are actually taken off
  the wallet when you join and actually paid into the winners' wallets when it
  ends, to the coin, by the payout structure the host set. A new tournament that
  says nothing about money costs 50 coins and pays the winner. Unregistering
  before it starts gives the buy-in back, a rebuy is another buy-in, and joining
  with too little is refused before a seat is taken rather than after. Every
  tournament that existed before this stays free.
- **Share a tournament.** A button on the tournament page hands the night to
  somebody: the phone's own share sheet where there is one, the link on the
  clipboard everywhere else, and the button says which of the two happened
  rather than claiming a copy that did not take. It shares the lobby page
  rather than the table, because that is the one that says what the night is —
  the structure, the buy-in, and who is already in.
- **A shared link survives the login page.** Following one without being signed
  in used to mean landing on login and then, having signed in, on the home list
  — with the tournament you were invited to somewhere in it, if you could
  remember its name. Where you were going is remembered through logging in, and
  through registering, so an invitation lands where it was pointed.
- **The table sounds like a table being dealt.** Every hand now opens with the
  cards going round — one flick per card, two rounds of them, at the pace a
  dealer actually pitches, and counted off the seats that are in the hand so a
  three-handed table does not sound like a full one. Your own two come in from
  the middle of the felt rather than fading up under your name, the second a
  beat behind the first.
- **Your hand sorts itself, big card first.** The deck deals in the order it
  deals, so half your hands arrived as "9♦ A♠" — which is not how anybody holds
  cards. They land as dealt, and then the big one slides across to the front,
  because watching it happen is better than never having seen the order it came
  in. Only your own hand does the shuffle: somebody else's is turned over at
  showdown already in order, and rearranging itself half a second later would
  read as a fault. Which card is which is unchanged underneath — showing "the
  first card" still shows the card the deck gave you first.
- **A bad beat counter on every player's card.** Beside their hand count, in
  the profile that opens when you tap a seat: how many showdowns they have lost
  holding three of a kind or better. Not the jackpot definition — nobody here
  is drawing to aces full — and not "was a favourite and lost", which would
  need the equity at the time and is not recorded. It is the count of the hands
  people actually talk about afterwards.
- **A way to wipe the history and keep the players.** `manage.py purge_history`
  deletes every tournament, hand, seat and settled debt, and touches no
  accounts, profiles, pictures, clubs, leagues or coin balances — for starting a
  season over without asking anybody to sign up again. It reports what it would
  delete and does nothing until told `--yes`, takes `--before` a date, and
  refuses outright while a tournament is running, because the engine holds that
  one in memory and deleting its rows would break the table under the players.
  Settlements go with it: a payment with no debt behind it is not neutral, the
  balances read it as money owed the other way.
- **When you are behind in an all-in, the table says what you are drawing to.**
  Under your equity, a small bubble: how many cards still win it, and the first
  few of them by name. Only for whoever is behind — a hand in front is not
  drawing to anything — and only on your own seat, because it is your own draw
  you are counting. The list comes off the evaluator rather than a count of your
  suit, so it already knows that the heart which pairs the board and fills
  somebody up is not an out: nine hearts left, eight outs.
- **Buy a throwable where you wanted to throw it.** The locked half of the
  picker was greyed out with "buy it in the lobby shop", which means leaving the
  table and coming back to a hand that has moved on. Every locked one now wears
  its price, and clicking it offers the purchase there and then — with your
  balance beside it, and the thing armed and ready to throw the moment it goes
  through. Two steps, so nothing spends 300 coins on one stray click.
- **Show a card while the hand is still going, and show both if you like.**
  Flashing the ace before you muck it is half of why anybody plays with people
  they can see; it was only possible after the hand, which is too late to be a
  bluff. Your own cards are now clickable throughout. Clicking one picks it —
  click the other to pick that too — and a "Show" button appears over the pair
  to turn over whatever you picked. Picking rather than showing on the first
  click because on a phone the gesture for peeking at your own hand is the same
  tap, and this is not something to do by accident. The row of buttons in the
  action panel still waits for the hand to end: that one lives beside Fold.
- **The superuser has the host's controls over every tournament.** Not the staff
  flag — staff is a job, opening tournaments and running clubs, and it should
  not carry ownership of everybody else's night. This is the account that
  administers the installation, and there is nobody above them to appeal to when
  a table is stuck at two in the morning. They can start, pause, resume, skip a
  level, edit or delete any tournament, including one with no club behind it,
  which until now answered to its host and to nobody else. Editing the blind
  structure asked for the host by name, so even a club's own organisers could
  start a tournament they were not allowed to fix a typo in; that goes through
  the same rule as everything else now. The lobby and the table draw their
  buttons from what the server says it will allow rather than from a name
  comparison, so neither can offer a control that then refuses to work.
- **Three finishers instead of one, and each of them makes a noise.** The same
  clip over every knockout is funny twice. You can keep up to three now, and the
  table picks between them each time you put somebody out — picked by the engine
  rather than by each browser, so everyone at the table watches the same one.
  Each carries a sound chosen with it: an air horn, a boom, a fanfare, a sad
  trombone or a slam, all synthesised like the rest of the table's noises, so
  there is nothing to download and nothing to fail. Picking one plays it, so you
  are not choosing from a list of names. A finisher chosen before any of this
  existed keeps working and is folded into the list the next time you save.
- **Show a card by turning it over.** The only way to show a hand you did not
  have to was a row of buttons in the action panel, which is not where anybody's
  hand is. Between hands your own cards lift under the cursor and clicking one
  shows it to the table. The bar is still there — it is what tells you the
  window is open, and it is where "both" lives — and both routes now ask the
  same question about whether you may show, so they cannot disagree.
- **Everything you throw now lands with its own sound.** A brick and a rose
  arriving with the same wet thud was the joke falling flat — half of throwing
  something is what it sounds like when it hits. An egg cracks, a beer breaks,
  a chip clinks, ice chinks, a chicken objects twice, a crown gets a small
  fanfare it has not earned, and the bomb is as loud as you would expect. All
  of them are still a couple of oscillators and a burst of filtered noise, so
  nothing is downloaded and nothing can fail to load. The cigar keeps its
  silence: it never lands.
- **A reaction is drawn as the picture it is.** The emoji buttons send their
  faces as ordinary chat text, so a 👍 arrived over a seat at eleven pixels —
  the size of a full stop. A message that is nothing but one or two faces is
  now large, over the seat and in the chat panel alike. A sentence with an emoji
  in it is still a sentence, and a paragraph of emoji is someone writing rather
  than reacting, so both stay their ordinary size.
- **Something to look at when you go out.** The finish screen was a number and
  three buttons. It now carries a GIF that celebrates with you if you cashed and
  laughs at you if you did not, searched at the moment it opens and seeded on
  where you came — so it holds still rather than reshuffling, and two players
  who finished in different places do not get the same picture. A table with no
  Giphy key configured simply carries on without it.
- **The app opens at your table when there is a hand waiting on you.** Being
  registered in a tournament that is dealing and landing on a list with your own
  game somewhere in it is the wrong place to be put: the blinds are going
  through your stack while you find the button. Open the app — or log in, or
  follow a link to a tournament already running — and if a seat of yours is live
  you go straight to it. The same when one starts while you are looking at the
  lobby, and the home list now checks every four seconds instead of twenty while
  you are waiting on a start, because that is the one thing on the page worth
  knowing the second it happens. It only ever happens on arrival or on a
  tournament actually starting under you: pressing "Back home" from the table
  leaves you at home, which it has to, or home is a page you cannot reach.
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
- **Chips you can tell apart, and chips you can see move.** The seven
  denominations were seven dark faces with a coloured rim, so on a dark felt at
  the size they actually render — nine pixels beside a bet, fourteen by the pot
  — the whole set read as grey dots, with black and silver indistinguishable.
  The face carries the colour now, the rim scales with the chip instead of being
  a fixed hairline, and each one has its own count of spots around the edge so
  the set survives for anyone who cannot separate the red from the green. A
  stack has a side and a lean, which is what makes it read as objects rather
  than a column of rings. And the money moves: bets are pushed forward from
  their owner, travel to the pot when the street ends and travel back out to
  whoever won it — three of those had no animation at all, and the pot simply
  changed number while the chips blinked out of existence.
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
- **The finish screen told you what percentage you had won.** "In the money —
  20% of the prize pool" is a rule for splitting a pot, on the one screen where
  the question is what you are owed. It says the money now — €5.00 — and falls
  back to the share only where there is no pot to apply it to. The lobby keeps
  its percentages beside the money, which is the one place a split is the point.
- **Folding stopped hiding your hand from the room.** With "hide my hand until I
  hover" on, the moment you folded your cards were left on the seat at a
  fifteenth of their opacity — faint to you, perfectly legible to whoever is
  standing behind you, and with the hand still going. The cover now stays on
  until the hand is public, and the mucked cards lift on the same hover as the
  live ones did.
- **The quick panels opened behind the player next to you.** Every seat is
  translated into its place on the ring, and a transform makes a stacking
  context — so the emoji, chat and throwables panels could not reach over their
  neighbour however high their z-index went. The table lifts your whole seat
  while a panel is open, which is what it already did for a seat holding a
  speech bubble.
- **"You were moved to table 1" at the table you were already sitting at.**
  Four players, one busts, and the two below them shift up a seat as the table
  closes ranks — which the engine was reporting as a table assignment, because
  it compared seat numbers rather than tables. Everybody who moved up got a
  move notice for a move that never happened. Underneath it was worse than
  noise: that event tells a client to leave its table group and forget its
  camera, so a knockout quietly dropped the survivors' video at the table they
  had not left. Only a change of table counts now, and the payload says which
  table you came from, so being seated for the first time is not announced as
  having been moved either.
- **The tournament lobby promised a prize pool that did not exist.** It worked
  the pot out as the buy-in times the number of names, which is wrong twice over
  in a knockout tournament: half of every buy-in went onto somebody's head and
  is paid out hand by hand rather than by placing, and a rebuy is another buy-in
  the count never saw. A €20 PKO with a €10 bounty and three players advertised
  a €60 pool and a €42 first prize, while the table's own panel — which has
  always used the shared arithmetic — said €40 and €28, and €28 is what the
  ledger pays. The lobby now uses that same helper, so the two screens cannot
  disagree, and states the two pools as two: places and KO.
- **A knockout tournament looked like an ordinary one from the lobby.** The page
  listed rebuys, late registration, the time bank and the blinds, and said
  nothing about the bounties — no mode, no amount, no KO pool, no knockouts —
  on the one page a player who has just busted can still read. It now says what
  the format is and what it does with your buy-in, and the players table carries
  a KO column: what each player has taken off other people's heads, and what is
  still riding on their own for somebody to come and collect.
- **A finished knockout night was listed as worth half what it was.** The card
  on the home page showed only the placing pool, so a €60 night read "€30". It
  shows the whole night now, and while one is still running the two pools are
  labelled — "€30 places · PKO €30" — instead of one figure called "pool".
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
