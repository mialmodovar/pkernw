// Bounties are money, not chips, and money is held in integer cents everywhere
// on the server. One formatter so a bounty reads the same on a nameplate, in
// the info panel and in the action log.
export function formatEuros(cents) {
  if (!cents) return "€0";
  const euros = cents / 100;
  // Whole euros lose the ".00": a table full of "€10.00" pills is just noise.
  return `€${euros.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(euros) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
