// Single chip formatter shared by the seats, the pot and the action panel, so
// the chips/BB toggle reads identically everywhere.
export function formatChips(amount, showBB, bigBlind) {
  if (amount == null) return "0";
  if (showBB && bigBlind > 0) return `${(amount / bigBlind).toFixed(1)} BB`;
  return amount.toLocaleString();
}
