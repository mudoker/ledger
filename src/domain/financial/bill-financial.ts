/**
 * Canonical Financial Domain Service
 * Enforces integer-base arithmetic (smallest fractional base unit, e.g. VND dong, cents)
 * across line items, percent/fixed global charges, bill totals, and group totals.
 * Zero floating-point drift.
 */

export interface BillFinancialInput {
  id?: string;
  items?: Array<{
    id?: string;
    name?: string;
    price: number;
    quantity?: number;
    totalPrice?: number;
    assignments?: Record<string, number>;
  }>;
  globalCharges?: Array<{
    id?: string;
    name?: string;
    type: string | 'fixed' | 'percent';
    amount?: number;
  }>;
}

export interface BillFinancialTotals {
  subtotal: number;
  fixedCharges: number;
  percentCharges: number;
  totalExtras: number;
  totalAmount: number;
  itemCount: number;
}

export interface GroupFinancialTotals {
  totalAmount: number;
  totalBills: number;
  totalItems: number;
}

/**
 * Calculates a single line item's total using integer rounding
 */
export function calculateLineItemTotal(price: number, quantity: number = 1): number {
  const safeQty = Math.max(1, Number(quantity) || 1);
  const safePrice = Number(price) || 0;
  return Math.round(safePrice * safeQty);
}

/**
 * Canonical calculation of bill financial totals
 */
export function calculateBillFinancialTotals(bill: BillFinancialInput): BillFinancialTotals {
  const items = bill.items || [];
  const charges = bill.globalCharges || [];

  const subtotal = Math.round(
    items.reduce((sum, item) => {
      if (item.totalPrice !== undefined && item.totalPrice !== null) {
        return sum + Math.round(Number(item.totalPrice) || 0);
      }
      return sum + calculateLineItemTotal(item.price, item.quantity);
    }, 0)
  );

  let fixedCharges = 0;
  let percentChargesSum = 0;
  for (const ch of charges) {
    const amt = Number(ch.amount || 0);
    if (ch.type === 'fixed') {
      fixedCharges += Math.round(amt);
    } else if (ch.type === 'percent') {
      percentChargesSum += amt;
    }
  }

  const percentChargesTotal = Math.round(subtotal * (percentChargesSum / 100));
  const totalExtras = fixedCharges + percentChargesTotal;
  const totalAmount = Math.max(0, subtotal + totalExtras);

  return {
    subtotal,
    fixedCharges,
    percentCharges: percentChargesSum,
    totalExtras,
    totalAmount,
    itemCount: items.length,
  };
}

/**
 * Canonical calculation of group totals from an array of bills
 * Enforces integer summation
 */
export function calculateGroupFinancialTotal(
  bills: Array<{ totalAmount?: number; items?: any[] }>
): GroupFinancialTotals {
  const safeBills = Array.isArray(bills) ? bills : [];
  let totalAmount = 0;
  let totalItems = 0;

  for (const b of safeBills) {
    totalAmount += Math.round(Number(b.totalAmount || 0));
    totalItems += Array.isArray(b.items) ? b.items.length : 0;
  }

  return {
    totalAmount,
    totalBills: safeBills.length,
    totalItems,
  };
}
