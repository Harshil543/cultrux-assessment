/** Money helpers — all monetary values are integer paise. Credits are integers. */

export function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
}

export function computeCustomQuantityPaise(perCreditPaise: number, quantity: number): number {
  assertInteger(perCreditPaise, 'perCreditPaise');
  assertInteger(quantity, 'quantity');
  return perCreditPaise * quantity;
}
