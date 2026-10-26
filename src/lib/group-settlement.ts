import { calculateBill } from "@/hooks/useBillState";
import type { BillGroupDetail, GroupBillOverview, PersonData } from "@/db/types";

export interface GroupParticipantSummary {
  key: string;
  name: string;
  userId?: string | null;
  email?: string | null;
  totalPaid: number;
  totalShare: number;
  netBalance: number;
  billsCount: number;
  status: 'receive' | 'pay' | 'settled';
}

export interface GroupSettlementTransfer {
  fromKey: string;
  fromName: string;
  toKey: string;
  toName: string;
  amount: number;
}

export interface BillParticipantSummary {
  personId: string;
  key: string;
  name: string;
  paid: number;
  share: number;
  net: number;
}

export interface GroupBillSummaryItem {
  billId: string;
  billName: string;
  location: string | null;
  currency: string;
  totalAmount: number;
  hostName: string | null;
  createdAt: string;
  participants: BillParticipantSummary[];
  flows: Array<{
    fromName: string;
    toName: string;
    amount: number;
  }>;
}

export interface GroupSettlementResult {
  totalExpenses: number;
  totalBills: number;
  uniqueParticipantsCount: number;
  participants: GroupParticipantSummary[];
  transfers: GroupSettlementTransfer[];
  billSummaries: GroupBillSummaryItem[];
  isBalanced: boolean;
}

/**
 * Deterministically generates a cross-bill participant key.
 * Prioritizes userId -> email -> normalized display name.
 */
export function getPersonKey(person: {
  id?: string;
  name: string;
  userId?: string | null;
  email?: string | null;
}): string {
  if (person.userId) return `uid:${person.userId}`;
  if (person.email && person.email.trim()) return `email:${person.email.trim().toLowerCase()}`;
  return `name:${person.name.trim().toLowerCase()}`;
}

/**
 * Greedy Min-Cash-Flow Debt Simplification Algorithm.
 * Matches debtors and creditors to settle all balances in minimal transactions (O(N log N)).
 */
export function simplifyGroupDebts(
  balances: Array<{ key: string; name: string; net: number }>
): GroupSettlementTransfer[] {
  // Separate into debtors (net < 0) and creditors (net > 0)
  const debtors = balances
    .filter(b => b.net < -0.01)
    .map(b => ({ ...b, remaining: Math.abs(b.net) }))
    .sort((a, b) => b.remaining - a.remaining);

  const creditors = balances
    .filter(b => b.net > 0.01)
    .map(b => ({ ...b, remaining: b.net }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: GroupSettlementTransfer[] = [];

  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const amount = Math.min(debtor.remaining, creditor.remaining);
    const roundedAmount = Math.round(amount);

    if (roundedAmount > 0) {
      transfers.push({
        fromKey: debtor.key,
        fromName: debtor.name,
        toKey: creditor.key,
        toName: creditor.name,
        amount: roundedAmount,
      });
    }

    debtor.remaining -= amount;
    creditor.remaining -= amount;

    if (debtor.remaining <= 0.01) {
      dIdx++;
    }
    if (creditor.remaining <= 0.01) {
      cIdx++;
    }
  }

  return transfers;
}

/**
 * Calculates complete group settlement aggregation:
 * 1. Executes per-bill calculations using battle-tested calculateBill.
 * 2. Reconciles participants across bills.
 * 3. Aggregates total paid, consumption share, and net balances by person.
 * 4. Simplifies overall net debts into who-sends-to-who transfers.
 * 5. Returns structured aggregation both by person and by bills.
 */
export function calculateGroupSettlement(
  group: Pick<BillGroupDetail, 'bills' | 'total_amount'>
): GroupSettlementResult {
  const bills = group.bills || [];
  let totalExpenses = 0;

  // Person aggregation dictionary keyed by getPersonKey
  const personMap = new Map<
    string,
    {
      key: string;
      name: string;
      userId?: string | null;
      email?: string | null;
      totalPaid: number;
      totalShare: number;
      billsCount: number;
    }
  >();

  const billSummaries: GroupBillSummaryItem[] = [];

  for (const b of bills) {
    const people = b.people || [];
    const items = b.items || [];
    const globalCharges = b.globalCharges || [];
    const hostId = b.host_id || (people.length > 0 ? people[0].id : null);

    // Run the core calculation engine for this bill
    const billCalc = calculateBill({
      people: people.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email || null,
        userId: p.userId || null,
        sponsorAmount: p.sponsorAmount || 0,
        paidAmount: p.paidAmount || 0,
      })),
      items: items.map(it => ({
        id: it.id,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        assignments: it.assignments || {},
      })),
      globalCharges: globalCharges.map(gc => ({
        id: gc.id,
        name: gc.name,
        type: gc.type as 'fixed' | 'percent',
        amount: gc.amount,
      })),
      hostId,
    });

    const billTotal = billCalc.totalBill > 0 ? billCalc.totalBill : b.totalAmount;
    totalExpenses += billTotal;

    // Calculate effective paid amounts matching calculateBill's logic
    let othersPaid = 0;
    people.forEach(p => {
      if (p.id !== hostId) {
        othersPaid += (p.paidAmount || 0);
      }
    });

    const effectivePaidAmounts: Record<string, number> = {};
    people.forEach(p => {
      if (p.id === hostId) {
        effectivePaidAmounts[p.id] = Math.max(0, billTotal - othersPaid);
      } else {
        effectivePaidAmounts[p.id] = p.paidAmount || 0;
      }
    });

    // Auto-correct slight floating-point gap on Host
    const totalPaidInBill = Object.values(effectivePaidAmounts).reduce((a, b) => a + b, 0);
    const totalNetPayable = Object.values(billCalc.finalPayables).reduce((a, b) => a + b, 0);
    const discrepancy = totalPaidInBill - totalNetPayable;
    if (Math.abs(discrepancy) > 0.001 && hostId && effectivePaidAmounts[hostId] !== undefined) {
      effectivePaidAmounts[hostId] -= discrepancy;
    }

    const billParticipants: BillParticipantSummary[] = [];

    // Track for this bill and accumulate into personMap
    people.forEach(p => {
      const paid = effectivePaidAmounts[p.id] || 0;
      const share = billCalc.finalPayables[p.id] || 0;
      const net = paid - share;
      const key = getPersonKey(p);

      billParticipants.push({
        personId: p.id,
        key,
        name: p.name,
        paid,
        share,
        net,
      });

      const existing = personMap.get(key);
      if (existing) {
        existing.totalPaid += paid;
        existing.totalShare += share;
        existing.billsCount += 1;
        // Keep the best name or user info
        if (!existing.userId && p.userId) existing.userId = p.userId;
        if (!existing.email && p.email) existing.email = p.email;
      } else {
        personMap.set(key, {
          key,
          name: p.name,
          userId: p.userId,
          email: p.email,
          totalPaid: paid,
          totalShare: share,
          billsCount: 1,
        });
      }
    });

    // Per-bill flows with resolved names
    const resolvedFlows = (billCalc.settlementFlows || []).map(f => {
      const debtor = people.find(p => p.id === f.from);
      const creditor = people.find(p => p.id === f.to);
      return {
        fromName: debtor ? debtor.name : 'Unknown',
        toName: creditor ? creditor.name : 'Host',
        amount: Math.round(f.amount),
      };
    });

    billSummaries.push({
      billId: b.id,
      billName: b.name,
      location: b.location,
      currency: b.currency,
      totalAmount: billTotal,
      hostName: b.host_name || (people.find(p => p.id === hostId)?.name ?? null),
      createdAt: b.created_at,
      participants: billParticipants,
      flows: resolvedFlows,
    });
  }

  // Convert person map to sorted list
  const participants: GroupParticipantSummary[] = Array.from(personMap.values()).map(p => {
    const net = Math.round(p.totalPaid - p.totalShare);
    let status: 'receive' | 'pay' | 'settled' = 'settled';
    if (net > 0) status = 'receive';
    else if (net < 0) status = 'pay';

    return {
      key: p.key,
      name: p.name,
      userId: p.userId,
      email: p.email,
      totalPaid: Math.round(p.totalPaid),
      totalShare: Math.round(p.totalShare),
      netBalance: net,
      billsCount: p.billsCount,
      status,
    };
  });

  // Sort participants: creditors first (highest net to receive), then debtors (highest net to pay)
  participants.sort((a, b) => b.netBalance - a.netBalance);

  // Generate simplified net transfers across the entire group
  const transfers = simplifyGroupDebts(
    participants.map(p => ({
      key: p.key,
      name: p.name,
      net: p.netBalance,
    }))
  );

  const sumNet = participants.reduce((acc, p) => acc + p.netBalance, 0);
  const isBalanced = Math.abs(sumNet) <= 1;

  return {
    totalExpenses,
    totalBills: bills.length,
    uniqueParticipantsCount: participants.length,
    participants,
    transfers,
    billSummaries,
    isBalanced,
  };
}
