# Poker Now Tournament Customization Gap Analysis

## Already Implemented

- Texas Hold'em only tournament flow.
- Tournament name.
- Starting stack.
- Custom blind schedule with small blind, big blind, ante, and per-level duration.
- Blind levels can run by hands or by minutes.
- Manual host-controlled tournament start.
- Late registration support exists in the backend.
- Rebuy support exists in the backend, including max rebuys and cutoff level.

## Partially Implemented

- Player cap exists, but it is currently a single-table total seat limit, not a true multi-table "players per table" setting.
- Late registration and rebuy rules are implemented in the backend, but they are not exposed as full tournament-creation options in the current frontend.
- Blind schedule editing exists, but there is no support for break levels yet.

## Missing Compared With Poker Now

- Schedule tournament start for a specific date and time.
- Prize pool distribution and payout structure customization.
- Time bank configuration:
	- time bank length
	- refill rules such as number of hands played before refill
- Tournament admin controls after creation:
	- pause tournament
	- resume tournament
	- skip blind level
- Tournament description.
- Tournament managers / additional admins.
- Social image upload.
- Break management in the blind structure.
- Invitation-code-only participation.
- Rabbit hunting toggle.
- Allow or block players from quitting the tournament.
- Auto-remove offline players after a configured timeout.
- Showdown presentation speed setting.
- Re-entry as a separate feature from rebuy.
