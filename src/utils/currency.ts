/**
 * Currency utilities for Indian Rupee (INR) calculations.
 * Always handles money internally as integer paise to prevent floating-point drift.
 */

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatINR(paise: number, includeDecimals = false): string {
  const rupees = paiseToRupees(paise);
  if (includeDecimals || rupees % 1 !== 0) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(rupees);
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees);
}

export function formatINRPlain(paise: number): string {
  const rupees = Math.round(paise) / 100;
  return `₹${rupees.toLocaleString('en-IN')}`;
}
