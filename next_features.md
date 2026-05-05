# Poker Now Tournament Customization Gap Analysis

## Already Implemented

- Texas Hold'em only tournament flow.
- Tournament name.
- Starting stack.
- Custom blind schedule with small blind, big blind, ante, and per-level duration.
- Blind levels can run by hands or by minutes.
- Manual host-controlled tournament start.
- Players-per-table configuration is stored separately from the total tournament player cap.
- Tournament tables and per-table seating assignments exist in the data model.
- Late registration support exists in the backend.
- Late registration configuration is available in the tournament creation flow.
- Rebuy support exists in the backend, including max rebuys and cutoff level.
- Rebuy configuration is available in the tournament creation flow.
- Break levels can be added to custom blind schedules.
- Multi-table live runtime: one HandEngine per active table running concurrently, with table-aware websocket groups and private hole-card unicast.
- Automatic table balancing between hands and final-table consolidation when active players fit on one table.
- Automated tests for the multi-table coordinator (2-table boot, balancing trigger on elimination, final-table merge).
- Frontend table-move affordance via a dismissible toast.
- Scheduled tournament start date and time with lobby/setup display and start-time enforcement.

## Partially Implemented

- (none — the previous multi-table runtime gap is now closed)

## Missing Compared With Poker Now

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
- Invitation-code-only participation.
- Rabbit hunting toggle.
- Allow or block players from quitting the tournament.
- Auto-remove offline players after a configured timeout.
- Showdown presentation speed setting.
- Re-entry as a separate feature from rebuy.

## Open Polish On Recently Shipped Work

- (none)
