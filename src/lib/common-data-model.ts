import type {
  BillGroupDetail,
  BillGroupSummary,
  GroupBillOverview,
  GroupItemOverview,
  PersonData,
  GlobalChargeData,
} from '@/../db/types';
import type { LocalBillRecord, LocalGroupRecord } from '@/lib/local-db/types';

export interface BillCalculationInput {
  items?: Array<{
    id?: string;
    name?: string;
    price?: number;
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

export interface BillTotals {
  subtotal: number;
  fixedExtras: number;
  percentExtras: number;
  totalExtras: number;
  totalAmount: number;
  itemCount: number;
}

/**
 * Canonical calculation of bill totals (subtotal, charges, totalAmount)
 * ensuring 100% uniformity across landing page, bill editor, and group overview/summary.
 */
export function calculateBillTotals(bill: BillCalculationInput): BillTotals {
  const items = bill.items || [];
  const globalCharges = bill.globalCharges || [];

  const subtotal = items.reduce((sum, item) => {
    const qty = Math.max(1, item.quantity || 1);
    if (item.totalPrice !== undefined && item.totalPrice !== null) {
      return sum + Number(item.totalPrice || 0);
    }
    return sum + (Number(item.price || 0) * qty);
  }, 0);

  let fixedExtras = 0;
  let percentExtrasSum = 0;
  for (const ch of globalCharges) {
    const amt = Number(ch.amount || 0);
    if (ch.type === 'fixed') {
      fixedExtras += amt;
    } else if (ch.type === 'percent') {
      percentExtrasSum += amt;
    }
  }

  const percentExtras = Math.round((subtotal * percentExtrasSum) / 100);
  const totalExtras = fixedExtras + percentExtras;
  const totalAmount = Math.round(subtotal + totalExtras);

  return {
    subtotal,
    fixedExtras,
    percentExtras,
    totalExtras,
    totalAmount,
    itemCount: items.length,
  };
}

/**
 * Normalizes a local bill record into a complete GroupBillOverview, preserving all
 * people, item assignments, and global charge structures needed for group settlement.
 */
export function normalizeLocalBillToOverview(
  lb: LocalBillRecord,
  groupParticipants?: PersonData[]
): GroupBillOverview {
  const totals = calculateBillTotals(lb);
  const hostPerson = lb.people?.find(p => p.id === lb.hostId);

  // If local bill has no people but group has participants, inherit them
  let people = lb.people && lb.people.length > 0 ? lb.people : [];
  if (people.length === 0 && groupParticipants && groupParticipants.length > 0) {
    people = groupParticipants.map(gp => ({
      id: gp.id,
      name: gp.name,
      sponsorAmount: gp.sponsorAmount || 0,
      paidAmount: gp.paidAmount || 0,
      userId: gp.userId || null,
      email: gp.email || null,
    }));
  }

  const isLocalOnly = lb.sharingStatus === 'local' ||
    lb.sharingStatus === 'uploading' ||
    lb.sharingStatus === 'sync_error';

  return {
    id: lb.id,
    name: lb.name || `Bill ${lb.id.slice(0, 8)}`,
    location: lb.location ?? null,
    currency: lb.currency || 'VND',
    totalAmount: totals.totalAmount,
    host_id: lb.hostId ?? null,
    host_name: hostPerson?.name ?? (people.length > 0 ? people[0].name : null),
    created_at: lb.createdAt,
    updated_at: lb.updatedAt,
    isLocal: isLocalOnly,
    items: (lb.items || []).map(i => {
      const qty = Math.max(1, i.quantity || 1);
      const lineTotal = (i as any).totalPrice !== undefined
        ? Number((i as any).totalPrice)
        : (Number(i.price || 0) * qty);
      return {
        id: i.id,
        name: i.name,
        price: Number(i.price || 0),
        quantity: qty,
        totalPrice: lineTotal,
        assignments: i.assignments || {},
      };
    }),
    people: people.map(p => ({
      id: p.id,
      name: p.name,
      sponsorAmount: Number(p.sponsorAmount || 0),
      paidAmount: Number(p.paidAmount || 0),
      userId: p.userId || null,
      email: p.email || null,
    })),
    globalCharges: (lb.globalCharges || []).map(gc => ({
      id: gc.id,
      name: gc.name,
      type: gc.type,
      amount: Number(gc.amount || 0),
    })),
  };
}

/**
 * Robustly merges server bills and local bills for a specific group, ensuring
 * that local-only bills and local updates to server bills are never dropped or stripped.
 */
export function mergeBillsForGroup(
  serverBills: GroupBillOverview[],
  localBills: LocalBillRecord[],
  groupId: string,
  groupParticipants?: PersonData[]
): GroupBillOverview[] {
  const safeServerBills = Array.isArray(serverBills) ? serverBills : [];
  const safeLocalBills = Array.isArray(localBills) ? localBills : [];
  const billMap = new Map<string, GroupBillOverview>();

  // 1. Index server bills
  for (const sb of safeServerBills) {
    const totals = calculateBillTotals(sb);
    billMap.set(sb.id, {
      ...sb,
      totalAmount: totals.totalAmount,
      items: (sb.items || []).map(it => {
        const qty = Math.max(1, it.quantity || 1);
        const lineTotal = it.totalPrice !== undefined
          ? Number(it.totalPrice)
          : (Number(it.price || 0) * qty);
        return {
          ...it,
          quantity: qty,
          totalPrice: lineTotal,
        };
      }),
      people: sb.people || [],
      globalCharges: sb.globalCharges || [],
    });
  }

  // 2. Merge local bills linked to this group
  const linkedLocal = safeLocalBills.filter(
    b => b.groupId === groupId || (b as any).group_id === groupId
  );

  for (const lb of linkedLocal) {
    const existing = billMap.get(lb.id);
    const normalized = normalizeLocalBillToOverview(lb, groupParticipants);

    if (!existing) {
      billMap.set(lb.id, normalized);
    } else {
      // If local version has newer or equal updatedAt or has local changes, prioritize local
      const localTime = new Date(lb.updatedAt).getTime();
      const serverTime = new Date(existing.updated_at).getTime();
      const isLocalPreferred = localTime >= serverTime ||
        lb.sharingStatus === 'local' ||
        (lb.items && lb.items.length > (existing.items?.length || 0)) ||
        (lb.people && lb.people.length > (existing.people?.length || 0));

      if (isLocalPreferred) {
        billMap.set(lb.id, {
          ...normalized,
          isLocal: existing.isLocal || normalized.isLocal,
        });
      } else {
        // Server copy is retained, but fill in missing people or charges if server omitted them
        if ((!existing.people || existing.people.length === 0) && normalized.people && normalized.people.length > 0) {
          existing.people = normalized.people;
        }
        if ((!existing.globalCharges || existing.globalCharges.length === 0) && normalized.globalCharges && normalized.globalCharges.length > 0) {
          existing.globalCharges = normalized.globalCharges;
        }
      }
    }
  }

  // 3. For any bill in group that still has no people, inherit group participants
  if (groupParticipants && groupParticipants.length > 0) {
    for (const b of billMap.values()) {
      if (!b.people || b.people.length === 0) {
        b.people = groupParticipants.map(gp => ({
          id: gp.id,
          name: gp.name,
          sponsorAmount: gp.sponsorAmount || 0,
          paidAmount: gp.paidAmount || 0,
          userId: gp.userId || null,
          email: gp.email || null,
        }));
      }
    }
  }

  return Array.from(billMap.values()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

/**
 * Combines server group summaries with local bills and local groups, accurately
 * accounting for local-only bills so the landing page group summary always matches the detail page.
 */
export function aggregateGroupSummaries(
  serverGroups: BillGroupSummary[],
  localGroups: LocalGroupRecord[],
  localBills: LocalBillRecord[]
): BillGroupSummary[] {
  const safeServerGroups = Array.isArray(serverGroups) ? serverGroups : [];
  const safeLocalGroups = Array.isArray(localGroups) ? localGroups : [];
  const safeLocalBills = Array.isArray(localBills) ? localBills : [];
  const groupMap = new Map<string, BillGroupSummary>();

  // 1. Process server groups and fold in local bills
  for (const sg of safeServerGroups) {
    const serverBillIdSet = new Set(sg.bill_ids || []);
    const linkedLocalBills = safeLocalBills.filter(
      b => b.groupId === sg.id || (b as any).group_id === sg.id
    );

    // Identify local bills that are not already accounted for on server
    const localOnlyBills = linkedLocalBills.filter(lb => {
      if (serverBillIdSet.size > 0) {
        return !serverBillIdSet.has(lb.id);
      }
      return lb.sharingStatus === 'local' ||
        lb.sharingStatus === 'uploading' ||
        lb.sharingStatus === 'sync_error';
    });

    const localBillsAmount = localOnlyBills.reduce((sum, b) => {
      return sum + calculateBillTotals(b).totalAmount;
    }, 0);
    const localBillsItemCount = localOnlyBills.reduce(
      (sum, b) => sum + (b.items?.length || 0),
      0
    );

    const totalAmount = sg.total_amount + localBillsAmount;
    const totalBills = sg.total_bills + localOnlyBills.length;
    const totalItems = sg.total_items + localBillsItemCount;

    const matchingLocalGroup = safeLocalGroups.find(lg => lg.id === sg.id);
    const participants = (sg as any).participants?.length
      ? (sg as any).participants
      : matchingLocalGroup?.participants || [];

    groupMap.set(sg.id, {
      ...sg,
      total_amount: totalAmount,
      total_bills: totalBills,
      total_items: totalItems,
      participants,
    });
  }

  // 2. Add local-only groups that do not exist on server
  for (const lg of safeLocalGroups) {
    if (!groupMap.has(lg.id)) {
      const linkedBills = safeLocalBills.filter(
        b => b.groupId === lg.id || (b as any).group_id === lg.id
      );
      const totalAmount = linkedBills.reduce(
        (sum, b) => sum + calculateBillTotals(b).totalAmount,
        0
      );
      const totalItems = linkedBills.reduce(
        (sum, b) => sum + (b.items?.length || 0),
        0
      );

      groupMap.set(lg.id, {
        id: lg.id,
        name: lg.name,
        description: lg.description,
        owner_id: lg.ownerId || 'local',
        is_owner: true,
        currency: lg.currency,
        total_amount: totalAmount,
        total_bills: linkedBills.length,
        total_items: totalItems,
        created_at: lg.createdAt,
        updated_at: lg.updatedAt,
        participants: lg.participants || [],
      });
    }
  }

  return Array.from(groupMap.values()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

/**
 * Guarantees the invariant that a group's participants list is always a superset of
 * all participants found in all bills linked to that group (Bill.participants ⊆ Group.participants).
 * Any person present in a bill but not yet in the group is added to the group roster.
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
          userId: bp.userId || null,
          email: bp.email || null,
          sponsorAmount: 0,
          paidAmount: 0,
        });
      }
    }
  }

  return result;
}
