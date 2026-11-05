/**
 * Canonical Group ViewModel
 * The single source of truth data structure representing a group across all views.
 * Landing Page cards, Group Overview, Bills list, and Summary views all bind
 * to this exact structure, guaranteeing 100% mathematical and presentation parity.
 */

import type { PersonData, GroupPaymentQr, GroupBillOverview } from '@/../db/types';
import { calculateGroupFinancialTotal } from '@/domain/financial/bill-financial';
import { ensureGroupParticipantsSuperset, resolveGroupPermissions } from '@/domain/metadata/group-metadata';
import { computeUserLedger, type GroupSettlementResult } from '@/domain/settlement/user-ledger';

export interface GroupViewModel {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  visibility: 'public' | 'restricted';
  isOwner: boolean;
  canEdit: boolean;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  totalAmount: number; // Derived strictly from canonical integer bill totals
  totalBills: number;
  totalItems: number;
  createdAt: string;
  updatedAt: string;
  bills: GroupBillOverview[];
  participants: PersonData[];
  paymentQrs: GroupPaymentQr[];
  ledger?: GroupSettlementResult;

  // Compatibility aliases ensuring zero discrepancy
  total_amount: number;
  total_bills: number;
  total_items: number;
  is_owner: boolean;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  created_at: string;
  updated_at: string;
  payment_qrs: GroupPaymentQr[];
}

export interface BuildGroupViewModelOptions {
  id: string;
  name: string;
  description?: string | null;
  currency?: string;
  visibility?: 'public' | 'restricted';
  ownerId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  currentUserId?: string | null;
  bills?: GroupBillOverview[];
  participants?: PersonData[];
  paymentQrs?: GroupPaymentQr[];
  createdAt?: string;
  updatedAt?: string;
  includeLedger?: boolean;
}

/**
 * Builds a deterministic GroupViewModel from bills and metadata.
 * Ensures totalAmount is identical between summary card and detail overview.
 */
export function buildGroupViewModel(options: BuildGroupViewModelOptions): GroupViewModel {
  const bills = Array.isArray(options.bills) ? options.bills : [];
  const financialTotals = calculateGroupFinancialTotal(bills);

  const participants = ensureGroupParticipantsSuperset(
    options.participants || [],
    bills.map(b => ({ people: b.people }))
  );

  const permissions = resolveGroupPermissions(options.ownerId, options.currentUserId);

  const ledger = options.includeLedger
    ? computeUserLedger({ bills, participants, totalAmount: financialTotals.totalAmount })
    : undefined;

  const vm: GroupViewModel = {
    id: options.id,
    name: options.name || 'Unnamed Group',
    description: options.description || null,
    currency: (options.currency || 'VND').trim().toUpperCase(),
    visibility: options.visibility || 'public',
    isOwner: permissions.isOwner,
    canEdit: permissions.canEdit,
    ownerId: options.ownerId || null,
    ownerName: options.ownerName || null,
    ownerEmail: options.ownerEmail || null,
    totalAmount: financialTotals.totalAmount,
    totalBills: financialTotals.totalBills,
    totalItems: financialTotals.totalItems,
    createdAt: options.createdAt || new Date().toISOString(),
    updatedAt: options.updatedAt || new Date().toISOString(),
    bills,
    participants,
    paymentQrs: options.paymentQrs || [],
    ledger,

    // Aliases
    get total_amount() { return this.totalAmount; },
    set total_amount(v: number) { this.totalAmount = v; },
    get total_bills() { return this.totalBills; },
    set total_bills(v: number) { this.totalBills = v; },
    get total_items() { return this.totalItems; },
    set total_items(v: number) { this.totalItems = v; },
    get is_owner() { return this.isOwner; },
    set is_owner(v: boolean) { this.isOwner = v; },
    get owner_id() { return this.ownerId; },
    set owner_id(v: string | null) { this.ownerId = v; },
    get owner_name() { return this.ownerName; },
    set owner_name(v: string | null) { this.ownerName = v; },
    get owner_email() { return this.ownerEmail; },
    set owner_email(v: string | null) { this.ownerEmail = v; },
    get created_at() { return this.createdAt; },
    set created_at(v: string) { this.createdAt = v; },
    get updated_at() { return this.updatedAt; },
    set updated_at(v: string) { this.updatedAt = v; },
    get payment_qrs() { return this.paymentQrs; },
    set payment_qrs(v: GroupPaymentQr[]) { this.paymentQrs = v; },
  };

  return vm;
}
