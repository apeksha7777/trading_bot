/**
 * Input validation module
 * Validates trading parameters
 */

function validateInputs(inputs) {
  const errors = [];

  if (!inputs.amount || inputs.amount <= 0)
    errors.push("amount must be positive");
  if (!inputs.entry1 || inputs.entry1 <= 0)
    errors.push("entry1 must be positive");
  if (!inputs.takeProfit || inputs.takeProfit <= 0)
    errors.push("takeProfit must be positive");
  if (!inputs.stopLoss || inputs.stopLoss <= 0)
    errors.push("stopLoss must be positive");
  if (!inputs.leverage || inputs.leverage <= 0)
    errors.push("leverage must be positive");
  if (!inputs.entry2 || inputs.entry2 <= 0)
    errors.push("entry2 must be positive");
  if (!inputs.entry3 || inputs.entry3 <= 0)
    errors.push("entry3 must be positive");
  if (!["LONG", "SHORT"].includes(inputs.side))
    errors.push("side must be LONG or SHORT");
  if (!inputs.symbol || typeof inputs.symbol !== "string")
    errors.push("symbol is required");

  if (errors.length > 0) {
    throw new Error("Validation errors: " + errors.join(", "));
  }
}

export { validateInputs };
