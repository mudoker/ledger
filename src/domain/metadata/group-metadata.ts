/**
 * Canonical Group Metadata Domain Service
 * Manages group attributes, participant registry, ownership/role permissions,
 * and payment QR code profile management.
 */

import type { PersonData, GroupPaymentQr } from '@/../db/types';

export interface GroupMetadataInput {
  id: string;
  name: string;
  description?: string | null;
  ownerId?: string | null;
  currency?: string;
  visibility?: 'public' | 'restricted';
  participants?: PersonData[];
  paymentQrs?: GroupPaymentQr[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Guarantees the invariant that a group's participants list is always a strict superset
 * of all participants found in bills linked to that group (Bill.participants ⊆ Group.participants).
 */
export function ensureGroupParticipantsSuperset(
  groupParticipants: PersonData[] | undefined,
  bills: Array<{ people?: PersonData[] }>
): PersonData[] {
  const result: PersonData[] = Array.isArray(groupParticipants) ? [...groupParticipants] : [];

  for (const bill of bills) {
    if (!bill.people || !Array.isArray(bill.people)) continue;
    for (const bp of bill.people) {
      if (!bp || !bp.name || !bp.name.trim()) continue;
      const bpName = bp.name.trim().toLowerCase();
      const bpEmail = bp.email?.trim().toLowerCase();
      const bpUserId = bp.userId?.trim();

      const exists = result.some(gp => {
        if (bpUserId && gp.userId && gp.userId.trim() === bpUserId) return true;
        if (bpEmail && gp.email && gp.email.trim().toLowerCase() === bpEmail) return true;
        if (gp.name && gp.name.trim().toLowerCase() === bpName) return true;
        return false;
      });

      if (!exists) {
        result.push({
          id: bp.id || crypto.randomUUID(),
          name: bp.name.trim(),
          sponsorAmount: Number(bp.sponsorAmount || 0),
          paidAmount: Number(bp.paidAmount || 0),
          userId: bp.userId || null,
          email: bp.email || null,
        });
      }
    }
  }

  return result;
}

/**
 * Resolves ownership and editing permissions for a group
 */
export function resolveGroupPermissions(
  groupOwnerId: string | null | undefined,
  currentUserId: string | null | undefined
): { isOwner: boolean; canEdit: boolean } {
  if (!groupOwnerId || groupOwnerId === 'local') {
    return { isOwner: true, canEdit: true };
  }
  const isOwner = Boolean(currentUserId && groupOwnerId === currentUserId);
  return { isOwner, canEdit: isOwner };
}

/**
 * Resolves payment QR codes across group sources, ensuring unique payer IDs
 */
export function resolveGroupPaymentQrs(
  primaryQrs?: GroupPaymentQr[],
  secondaryQrs?: GroupPaymentQr[]
): GroupPaymentQr[] {
  const qrMap = new Map<string, GroupPaymentQr>();
  (primaryQrs || []).forEach(q => qrMap.set(q.id, q));
  (secondaryQrs || []).forEach(q => {
    if (!qrMap.has(q.id)) {
      qrMap.set(q.id, q);
    }
  });
  return Array.from(qrMap.values());
}
