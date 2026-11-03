import type {
  BillGroupDetail,
  BillGroupSummary,
  GroupBillOverview,
  GroupItemOverview,
  PersonData,
  GlobalChargeData,
} from '@/../db/types';
import type { LocalBillRecord, LocalGroupRecord } from '@/lib/local-db/types';
import { useAppSettingsStore } from '@/store/useAppSettingsStore';

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
 * Robustly resolves the effective payer/host name for a bill, checking:
 * 1. Explicit hostId matching a person
 * 2. If hostId paid 0 but another participant paid upfront via paidAmount, resolves to the actual payer
 * 3. Highest upfront payer (paidAmount > 0)
 * 4. Fallback to first participant
 */
export function resolveEffectivePayerName(
  people: Array<{ id: string; name: string; paidAmount?: number | null; userId?: string | null }> | undefined | null,
  hostId: string | null | undefined,
  billTotal?: number
): string | null {
  if (!people || people.length === 0) return null;
  const nominalHost = hostId
    ? (people.find(p => p.id === hostId) || people.find(p => p.userId === hostId))
    : undefined;
  const topUpfrontPayer = [...people].sort((a, b) => (b.paidAmount || 0) - (a.paidAmount || 0))[0];

  if (nominalHost) {
    if (billTotal !== undefined && billTotal > 0) {
      const othersPaid = people.reduce(
        (sum, p) => (p.id !== nominalHost.id ? sum + (p.paidAmount || 0) : sum),
        0
      );
      const nominalPaid = Math.max(0, billTotal - othersPaid);
      if (nominalPaid <= 0.01 && topUpfrontPayer && (topUpfrontPayer.paidAmount || 0) > 0.01) {
        return topUpfrontPayer.name;
      }
    }
    return nominalHost.name;
  }

  if (topUpfrontPayer && (topUpfrontPayer.paidAmount || 0) > 0.01) {
    return topUpfrontPayer.name;
  }

  return people[0]?.name || null;
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

  const isLocalOnly =
    lb.sharingStatus === 'local' ||
    lb.sharingStatus === 'revocation_pending' ||
    lb.sharingStatus === 'uploading' ||
    lb.sharingStatus === 'sync_error';

  const hostName = resolveEffectivePayerName(people, lb.hostId, totals.totalAmount);

  return {
    id: lb.id,
    name: lb.name || `Bill ${lb.id.slice(0, 8)}`,
    location: lb.location ?? null,
    currency: lb.currency || 'VND',
    totalAmount: totals.totalAmount,
    host_id: lb.hostId ?? null,
    host_name: hostName ?? (people.length > 0 ? people[0].name : null),
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

export function parseTimestampMs(ts: string | number | Date | null | undefined): number {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  const trimmed = ts.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed)) {
    return new Date(trimmed.replace(' ', 'T') + 'Z').getTime();
  }
  return new Date(trimmed).getTime();
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
  const storageMode = useAppSettingsStore.getState().storageMode;
  const isAutoSyncMode = storageMode === 'cloud' || storageMode === 'hybrid';
  const billMap = new Map<string, GroupBillOverview>();
  const localBillById = new Map<string, LocalBillRecord>();
  for (const lb of safeLocalBills) {
    localBillById.set(lb.id, lb);
  }

  // 1. Index server bills (excluding any bill that was locally unlinked or moved to another group)
  for (const sb of safeServerBills) {
    const localRecord = localBillById.get(sb.id);
    if (localRecord && storageMode !== 'cloud') {
      const localGroupId = localRecord.groupId !== undefined ? localRecord.groupId : (localRecord as any).group_id;
      const localTime = parseTimestampMs(localRecord.updatedAt);
      const serverTime = parseTimestampMs(sb.updated_at);
      if (localGroupId !== groupId && localTime > serverTime) {
        continue;
      }
    }

    const totals = calculateBillTotals(sb);
    billMap.set(sb.id, {
      ...sb,
      isLocal: isAutoSyncMode ? false : Boolean(sb.isLocal),
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
      host_name:
        resolveEffectivePayerName(sb.people, sb.host_id, totals.totalAmount) ||
        sb.host_name ||
        (sb.people && sb.people.length > 0 ? sb.people[0].name : null),
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
      // Check if this local bill is a duplicate of an already-present server bill with a different ID
      const normName = (normalized.name || '').trim().toLowerCase();
      const normTime = parseTimestampMs(normalized.created_at || normalized.updated_at);
      let duplicateServerBill: GroupBillOverview | undefined;
      for (const candidate of billMap.values()) {
        const candName = (candidate.name || '').trim().toLowerCase();
        const candTime = parseTimestampMs(candidate.created_at || candidate.updated_at);

        if (candName === normName && (candidate.currency || 'VND') === (normalized.currency || 'VND')) {
          const isSameAmount = candidate.totalAmount === normalized.totalAmount;
          const isSameItemCount = (candidate.items?.length || 0) === (normalized.items?.length || 0);
          const timeDiff = Math.abs(candTime - normTime);

          const candidateItems = (candidate.items || []).map(i => i.name.trim().toLowerCase());
          const normalizedItems = (normalized.items || []).map(i => i.name.trim().toLowerCase());
          const itemsOverlap = candidateItems.length > 0 && normalizedItems.length > 0 &&
            candidateItems.some(name => normalizedItems.includes(name));

          const isDuplicate = isSameAmount && (
            (itemsOverlap && isSameItemCount) ||
            timeDiff < 86400000 || // within 24h
            isAutoSyncMode ||
            (candidate.totalAmount > 0 && isSameItemCount)
          );

          if (isDuplicate) {
            duplicateServerBill = candidate;
            break;
          }
        }
      }
      if (!duplicateServerBill) {
        if (storageMode === 'cloud' && safeServerBills.length > 0 && lb.sharingStatus !== 'uploading') {
          // In Cloud mode, do not resurrect local-only orphaned bills into a synced server group
          continue;
        }
        billMap.set(lb.id, {
          ...normalized,
          isLocal: isAutoSyncMode && lb.sharingStatus !== 'revocation_pending' ? false : normalized.isLocal,
        });
      } else {
        if ((!duplicateServerBill.people || duplicateServerBill.people.length === 0) && normalized.people && normalized.people.length > 0) {
          duplicateServerBill.people = normalized.people;
        }
        if ((!duplicateServerBill.items || duplicateServerBill.items.length === 0) && normalized.items && normalized.items.length > 0) {
          duplicateServerBill.items = normalized.items;
        }
      }
    } else {
      const localTime = parseTimestampMs(lb.updatedAt);
      const serverTime = parseTimestampMs(existing.updated_at);
      const isLocalPreferred = storageMode === 'cloud'
        ? (existing.totalAmount === 0 && (existing.items?.length || 0) === 0 && normalized.totalAmount > 0 && localTime >= serverTime)
        : (
          localTime > serverTime ||
          lb.sharingStatus === 'uploading' ||
          lb.sharingStatus === 'sync_error' ||
          (storageMode === 'local' && lb.sharingStatus === 'local' && localTime >= serverTime) ||
          (localTime >= serverTime && existing.totalAmount === 0 && normalized.totalAmount > 0) ||
          (localTime >= serverTime && (lb.items?.length || 0) > (existing.items?.length || 0)) ||
          (localTime >= serverTime && (lb.people?.length || 0) > (existing.people?.length || 0))
        );

      const resolvedIsLocal = isAutoSyncMode
        ? false
        : (lb.sharingStatus === 'revocation_pending' ? true : Boolean(existing.isLocal));

      if (isLocalPreferred) {
        billMap.set(lb.id, {
          ...normalized,
          isLocal: resolvedIsLocal,
        });
      } else {
        existing.isLocal = resolvedIsLocal;
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

  return Array.from(billMap.values()).sort((a, b) => {
    const timeA = parseTimestampMs(a.created_at || a.updated_at || 0);
    const timeB = parseTimestampMs(b.created_at || b.updated_at || 0);
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return a.id.localeCompare(b.id);
  });
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
  const storageMode = useAppSettingsStore.getState().storageMode;
  const groupMap = new Map<string, BillGroupSummary>();

  const localGroupMap = new Map<string, LocalGroupRecord>();
  for (const lg of safeLocalGroups) {
    localGroupMap.set(lg.id, lg);
  }

  const serverGroupIds = new Set(safeServerGroups.map(sg => sg.id));
  const mergedLocalGroupIds = new Set<string>();
  const localGroupRemap = new Map<string, string>();

  const localBillById = new Map<string, LocalBillRecord>();
  for (const lb of safeLocalBills) {
    localBillById.set(lb.id, lb);
  }

  // 1. Process server groups and fold in local bills
  for (const sg of safeServerGroups) {
    let matchingLocalGroup = localGroupMap.get(sg.id);
    if (matchingLocalGroup) {
      mergedLocalGroupIds.add(matchingLocalGroup.id);
    } else {
      // Deduplicate against local groups created with a different ID but identical name and currency
      const sgNameNorm = (sg.name || '').trim().toLowerCase();
      const sgCurrNorm = (sg.currency || 'VND').trim().toUpperCase();
      const duplicateLocal = safeLocalGroups.find(lg =>
        !serverGroupIds.has(lg.id) &&
        !mergedLocalGroupIds.has(lg.id) &&
        (lg.name || '').trim().toLowerCase() === sgNameNorm &&
        (lg.currency || 'VND').trim().toUpperCase() === sgCurrNorm &&
        (!lg.ownerId || lg.ownerId === 'local' || lg.ownerId === sg.owner_id)
      );
      if (duplicateLocal) {
        matchingLocalGroup = duplicateLocal;
        mergedLocalGroupIds.add(duplicateLocal.id);
        localGroupRemap.set(duplicateLocal.id, sg.id);
      }
    }

    const linkedLocalBills = safeLocalBills.filter(b => {
      const gid = b.groupId !== undefined ? b.groupId : (b as any).group_id;
      return gid === sg.id || (gid && localGroupRemap.get(gid) === sg.id);
    });

    // Track per-bill accounting
    const billMap = new Map<string, { totalAmount: number; itemCount: number }>();

    // 1a. Seed with server bill stats (excluding bills unlinked or moved locally)
    if (sg.bill_amounts && sg.bill_ids && sg.bill_ids.length > 0) {
      for (const bid of sg.bill_ids) {
        const localRecord = localBillById.get(bid);
        if (localRecord && storageMode !== 'cloud') {
          const rawLocalGroupId = localRecord.groupId !== undefined ? localRecord.groupId : (localRecord as any).group_id;
          const localGroupId = (rawLocalGroupId && localGroupRemap.get(rawLocalGroupId)) || rawLocalGroupId;
          const localTime = parseTimestampMs(localRecord.updatedAt);
          const serverGroupTime = parseTimestampMs(sg.updated_at);
          if (localGroupId !== sg.id && localTime > serverGroupTime) {
            continue;
          }
        }
        billMap.set(bid, {
          totalAmount: sg.bill_amounts[bid] ?? 0,
          itemCount: sg.bill_item_counts?.[bid] ?? 0,
        });
      }
    } else if (!sg.bill_amounts) {
      billMap.set('__server_aggregate__', {
        totalAmount: sg.total_amount || 0,
        itemCount: sg.total_items || 0,
      });
    }

    const serverBillIdSet = new Set(sg.bill_ids || []);
    let localOnlyBillsCount = 0;

    // 1b. Merge linked local bills
    for (const lb of linkedLocalBills) {
      const totals = calculateBillTotals(lb);
      const isKnownServerBill = serverBillIdSet.has(lb.id);

      if (billMap.has('__server_aggregate__')) {
        // If we only have server aggregate, fold in local-only bills
        if (!isKnownServerBill) {
          if (storageMode === 'cloud' && lb.sharingStatus !== 'uploading') {
            continue;
          }
          const lbName = ((lb as any).data?.name || lb.name || '').trim().toLowerCase();
          const isDuplicateByName = sg.bill_names && Object.values(sg.bill_names).some(
            sn => sn.trim().toLowerCase() === lbName
          );
          if (isDuplicateByName) {
            continue;
          }
          billMap.set(lb.id, {
            totalAmount: totals.totalAmount,
            itemCount: totals.itemCount,
          });
          localOnlyBillsCount++;
        }
      } else {
        // Detailed per-bill mode
        const existing = billMap.get(lb.id);

        if (!existing) {
          if (storageMode === 'cloud' && serverBillIdSet.size > 0 && lb.sharingStatus !== 'uploading') {
            continue;
          }
          // Check if this local bill is a duplicate of an existing server bill by name
          const lbName = ((lb as any).data?.name || lb.name || '').trim().toLowerCase();
          const isDuplicateByName = sg.bill_names && Object.values(sg.bill_names).some(
            sn => sn.trim().toLowerCase() === lbName
          );
          if (isDuplicateByName) {
            continue;
          }
          // Local-only bill: add to group
          billMap.set(lb.id, {
            totalAmount: totals.totalAmount,
            itemCount: totals.itemCount,
          });
        } else {
          // Bill exists on both server and local.
          const localTime = parseTimestampMs(lb.updatedAt);
          const serverGroupTime = parseTimestampMs(sg.updated_at);
          const isLocalPreferred = storageMode === 'cloud'
            ? (existing.totalAmount === 0 && totals.totalAmount > 0 && localTime >= serverGroupTime)
            : (
              localTime > serverGroupTime ||
              lb.sharingStatus === 'uploading' ||
              lb.sharingStatus === 'sync_error' ||
              (storageMode === 'local' && lb.sharingStatus === 'local' && localTime >= serverGroupTime) ||
              (existing.totalAmount === 0 && totals.totalAmount > 0 && localTime >= serverGroupTime)
            );

          if (isLocalPreferred) {
            billMap.set(lb.id, {
              totalAmount: totals.totalAmount,
              itemCount: totals.itemCount,
            });
          }
        }
      }
    }

    let calculatedTotalAmount = 0;
    let calculatedTotalItems = 0;
    for (const b of billMap.values()) {
      calculatedTotalAmount += b.totalAmount;
      calculatedTotalItems += b.itemCount;
    }
    const calculatedTotalBills = billMap.has('__server_aggregate__')
      ? sg.total_bills + localOnlyBillsCount
      : billMap.size;

    const finalTotalAmount = calculatedTotalAmount;
    const finalTotalBills = calculatedTotalBills;
    const finalTotalItems = calculatedTotalItems;

    const participants = ensureGroupParticipantsSuperset(
      (sg as any).participants || [],
      [
        { people: matchingLocalGroup?.participants || [] },
        ...linkedLocalBills.map(b => ({ people: b.people })),
      ]
    );

    const isLocalNewer = storageMode !== 'cloud' && matchingLocalGroup && matchingLocalGroup.updatedAt
      ? parseTimestampMs(matchingLocalGroup.updatedAt) > parseTimestampMs(sg.updated_at)
      : false;

    groupMap.set(sg.id, {
      ...sg,
      name: isLocalNewer ? (matchingLocalGroup?.name || sg.name) : sg.name,
      description: isLocalNewer ? (matchingLocalGroup?.description ?? sg.description) : sg.description,
      currency: isLocalNewer ? (matchingLocalGroup?.currency || sg.currency) : sg.currency,
      visibility: isLocalNewer ? (matchingLocalGroup?.visibility || sg.visibility || 'public') : (sg.visibility || matchingLocalGroup?.visibility || 'public'),
      total_amount: finalTotalAmount,
      total_bills: finalTotalBills,
      total_items: finalTotalItems,
      participants,
    });
  }

  // 2. Add local-only groups that do not exist on server
  const seenLocalSignatures = new Set<string>();
  for (const lg of safeLocalGroups) {
    if (!groupMap.has(lg.id) && !mergedLocalGroupIds.has(lg.id)) {
      const sig = `${(lg.name || '').trim().toLowerCase()}::${(lg.currency || 'VND').trim().toUpperCase()}`;
      if (seenLocalSignatures.has(sig)) {
        continue;
      }
      seenLocalSignatures.add(sig);

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

      const participants = ensureGroupParticipantsSuperset(
        lg.participants || [],
        linkedBills.map(b => ({ people: b.people }))
      );

      const finalAmount = linkedBills.length > 0 ? totalAmount : (lg.totalAmount ?? 0);
      const finalBillsCount = linkedBills.length > 0 ? linkedBills.length : (lg.totalBills ?? 0);
      const finalItemsCount = linkedBills.length > 0 ? totalItems : (lg.totalItems ?? 0);

      groupMap.set(lg.id, {
        id: lg.id,
        name: lg.name,
        description: lg.description,
        owner_id: lg.ownerId || 'local',
        is_owner: true,
        currency: lg.currency,
        visibility: lg.visibility || 'public',
        total_amount: finalAmount,
        total_bills: finalBillsCount,
        total_items: finalItemsCount,
        created_at: lg.createdAt,
        updated_at: lg.updatedAt,
        participants,
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
          id: bp.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'p_' + Math.random().toString(36).substring(2, 9)),
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
