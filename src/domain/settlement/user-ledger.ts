/**
 * Canonical User Ledger Domain Service
 * Handles member balances, net dues, and directional debt minimization ("Person A owes Person B").
 * Enforces integer arithmetic.
 */

import { calculateGroupSettlement, simplifyGroupDebts } from '@/lib/group-settlement';
import type {
  GroupParticipantSummary,
  GroupSettlementTransfer,
  GroupSettlementResult,
} from '@/lib/group-settlement';
import type { PersonData, GroupBillOverview } from '@/../db/types';

export type { GroupParticipantSummary, GroupSettlementTransfer, GroupSettlementResult };

export interface UserLedgerInput {
  bills: GroupBillOverview[];
  participants?: PersonData[];
  totalAmount?: number;
}

export function computeUserLedger(input: UserLedgerInput): GroupSettlementResult {
  const safeBills = Array.isArray(input.bills) ? input.bills : [];
  const totalAmount = input.totalAmount !== undefined
    ? input.totalAmount
    : safeBills.reduce((s, b) => s + Math.round(Number(b.totalAmount || 0)), 0);

  return calculateGroupSettlement({
    bills: safeBills,
    total_amount: Math.round(totalAmount),
    participants: input.participants || [],
  });
}
