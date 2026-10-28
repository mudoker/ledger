import { calculateBill } from "@/hooks/useBillState";
import type {
  BillGroupDetail,
  GroupItemOverview,
  PersonData,
  GlobalChargeData,
} from "@/../db/types";

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
    fromKey?: string;
    fromName: string;
    toKey?: string;
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
 * Union-Find (Disjoint-Set Union) data structure with path compression.
 * Enables deterministic cross-bill identity clustering across names, userIds, and emails.
 */
class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      return x;
    }
    const p = this.parent.get(x)!;
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootA, rootB);
    }
  }
}

export interface CanonicalPersonInfo {
  key: string;
  name: string;
  userId?: string | null;
  email?: string | null;
}

/**
 * Robustly reconciles and unifies participant identities across multiple bills in a group.
 * Connects occurrences by matching userId, email, or normalized name.
 * Maps every bill occurrence to a single canonical key.
 */
export function buildCanonicalPersonRegistry(
  bills: Array<{
    id: string;
    people?: PersonData[];
  }>
): {
  personToCanonicalKey: Map<string, string>; // `${billId}:::${personId}` -> canonicalKey
  canonicalPersons: Map<string, CanonicalPersonInfo>;
} {
  const uf = new UnionFind();
  const allOccurrences: Array<{ billId: string; p: PersonData; occId: string }> = [];

  for (const b of bills) {
    for (const p of b.people || []) {
      const occId = `${b.id}:::${p.id}`;
      allOccurrences.push({ billId: b.id, p, occId });

      if (p.name && p.name.trim()) {
        const nameKey = `name:${p.name.trim().toLowerCase()}`;
        uf.union(occId, nameKey);
      }

      if (p.userId && p.userId.trim()) {
        const uidKey = `uid:${p.userId.trim()}`;
        uf.union(occId, uidKey);
      }

      if (p.email && p.email.trim()) {
        const emailKey = `email:${p.email.trim().toLowerCase()}`;
        uf.union(occId, emailKey);
      }
    }
  }

  // Group occurrences by their cluster root
  const clusters = new Map<string, Array<{ billId: string; p: PersonData; occId: string }>>();
  for (const item of allOccurrences) {
    const root = uf.find(item.occId);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(item);
  }

  const personToCanonicalKey = new Map<string, string>();
  const canonicalPersons = new Map<string, CanonicalPersonInfo>();

  for (const [, items] of clusters.entries()) {
    let bestUserId: string | null = null;
    let bestEmail: string | null = null;
    let bestName: string = items[0].p.name || 'Unknown';

    for (const { p } of items) {
      if (!bestUserId && p.userId?.trim()) bestUserId = p.userId.trim();
      if (!bestEmail && p.email?.trim()) bestEmail = p.email.trim().toLowerCase();
      if (p.name && p.name.trim().length > bestName.trim().length) {
        bestName = p.name.trim();
      }
    }

    let canonicalKey: string;
    if (bestUserId) {
      canonicalKey = `uid:${bestUserId}`;
    } else if (bestEmail) {
      canonicalKey = `email:${bestEmail}`;
    } else {
      canonicalKey = `name:${bestName.trim().toLowerCase()}`;
    }

    const info: CanonicalPersonInfo = {
      key: canonicalKey,
      name: bestName.trim(),
      userId: bestUserId,
      email: bestEmail,
    };
    canonicalPersons.set(canonicalKey, info);

    for (const { occId } of items) {
      personToCanonicalKey.set(occId, canonicalKey);
    }
  }

  return { personToCanonicalKey, canonicalPersons };
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
 * Highly optimized, single-pass circulation & cycle elimination algorithm.
 * Removes directed debt cycles (e.g. A -> B -> C -> A) in O(V + E) time without brute-force DFS restarts.
 * Strictly preserves each participant's zero-sum net balance invariant.
 */
export function eliminateDebtCycles(
  initialTransfers: GroupSettlementTransfer[],
  personByKey: Map<string, { key: string; name: string }>
): GroupSettlementTransfer[] {
  // Collect unique node keys
  const nodeKeySet = new Set<string>();
  for (const t of initialTransfers) {
    if (t.amount > 0.001 && t.fromKey !== t.toKey) {
      nodeKeySet.add(t.fromKey);
      nodeKeySet.add(t.toKey);
    }
  }

  const nodes = Array.from(nodeKeySet);
  const N = nodes.length;
  if (N <= 1) {
    return initialTransfers.filter(t => t.amount > 0.001 && t.fromKey !== t.toKey);
  }

  const keyToIndex = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    keyToIndex.set(nodes[i], i);
  }

  interface Edge {
    to: number;
    amount: number;
  }

  // Build indexed adjacency list for O(1) edge access
  const adj: Edge[][] = Array.from({ length: N }, () => []);
  for (const t of initialTransfers) {
    if (t.amount <= 0.001 || t.fromKey === t.toKey) continue;
    const u = keyToIndex.get(t.fromKey)!;
    const v = keyToIndex.get(t.toKey)!;
    adj[u].push({ to: v, amount: t.amount });
  }

  const visited = new Array<boolean>(N).fill(false);
  const inStack = new Array<boolean>(N).fill(false);
  const stackPos = new Array<number>(N).fill(-1);
  const edgePtr = new Array<number>(N).fill(0);

  const nodeStack: number[] = [];
  const edgeIndexInParent: number[] = [];

  for (let root = 0; root < N; root++) {
    if (visited[root]) continue;

    nodeStack.push(root);
    edgeIndexInParent.push(-1);
    inStack[root] = true;
    stackPos[root] = 0;
    visited[root] = true;

    while (nodeStack.length > 0) {
      const u = nodeStack[nodeStack.length - 1];
      const p = edgePtr[u];

      if (p < adj[u].length) {
        const edge = adj[u][p];
        edgePtr[u]++;

        if (edge.amount <= 0.001) {
          continue;
        }

        const v = edge.to;

        if (inStack[v]) {
          // Cycle detected: starts at stackPos[v] up to u, closed by edge (u -> v)
          const startIdx = stackPos[v];

          let bottleneck = edge.amount;
          for (let i = startIdx + 1; i < nodeStack.length; i++) {
            const cap = adj[nodeStack[i - 1]][edgeIndexInParent[i]].amount;
            if (cap < bottleneck) bottleneck = cap;
          }

          if (bottleneck > 0.001) {
            edge.amount -= bottleneck;
            for (let i = startIdx + 1; i < nodeStack.length; i++) {
              adj[nodeStack[i - 1]][edgeIndexInParent[i]].amount -= bottleneck;
            }

            // Find first edge in the active path prefix that was zeroed out
            let firstZeroIdx = -1;
            for (let i = startIdx + 1; i < nodeStack.length; i++) {
              if (adj[nodeStack[i - 1]][edgeIndexInParent[i]].amount <= 0.001) {
                firstZeroIdx = i;
                break;
              }
            }

            if (firstZeroIdx !== -1) {
              // In-place stack retraction back to firstZeroIdx - 1 without full restarts
              while (nodeStack.length >= firstZeroIdx + 1) {
                const popped = nodeStack.pop()!;
                edgeIndexInParent.pop();
                inStack[popped] = false;
                stackPos[popped] = -1;
                visited[popped] = false;
                edgePtr[popped] = 0;
              }
            }
          }
          continue;
        }

        if (!visited[v]) {
          visited[v] = true;
          inStack[v] = true;
          stackPos[v] = nodeStack.length;
          edgeIndexInParent.push(p);
          nodeStack.push(v);
          edgePtr[v] = 0;
          continue;
        }

        // Cross or forward edge to already processed component
        continue;
      }

      // All edges of u explored: mark completely finished
      inStack[u] = false;
      stackPos[u] = -1;
      nodeStack.pop();
      edgeIndexInParent.pop();
    }
  }

  // Convert resulting acyclic DAG to sorted transfers
  const result: GroupSettlementTransfer[] = [];
  for (let u = 0; u < N; u++) {
    const fromKey = nodes[u];
    const debtor = personByKey.get(fromKey);
    for (const edge of adj[u]) {
      const rounded = Math.round(edge.amount);
      if (rounded > 0) {
        const toKey = nodes[edge.to];
        const creditor = personByKey.get(toKey);
        result.push({
          fromKey,
          fromName: debtor ? debtor.name : fromKey,
          toKey,
          toName: creditor ? creditor.name : toKey,
          amount: rounded,
        });
      }
    }
  }

  result.sort((a, b) => b.amount - a.amount);
  return result;
}

/**
 * Calculates complete group settlement aggregation:
 * 1. Executes per-bill calculations using battle-tested calculateBill.
 * 2. Unifies participant identities across bills via buildCanonicalPersonRegistry.
 * 3. Aggregates total paid, consumption share, and net balances by person.
 * 4. Netted pairwise debt aggregation across all bills (strictly single net direction between any pair).
 * 5. Returns structured aggregation both by person and by bills.
 */
export function calculateGroupSettlement(
  group: Pick<BillGroupDetail, 'bills' | 'total_amount'>
): GroupSettlementResult {
  const bills = group.bills || [];
  let totalExpenses = 0;

  // Build canonical participant registry across all bills in this group
  const { personToCanonicalKey, canonicalPersons } = buildCanonicalPersonRegistry(bills);

  // Person aggregation dictionary keyed by canonical key
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
    const people: PersonData[] = b.people || [];
    const items: GroupItemOverview[] = b.items || [];
    const globalCharges: GlobalChargeData[] = b.globalCharges || [];

    // Robustly resolve Host person ID
    const hostNameTarget = b.host_name?.trim().toLowerCase();
    const hostPerson = people.find((p: PersonData) => p.id === b.host_id)
      || (b.host_id ? people.find((p: PersonData) => p.userId === b.host_id) : undefined)
      || (hostNameTarget ? people.find((p: PersonData) => p.name.trim().toLowerCase() === hostNameTarget) : undefined)
      || (people.length > 0 ? people[0] : null);

    const effectiveHostId = hostPerson ? hostPerson.id : null;

    // Run the core calculation engine for this bill
    const billCalc = calculateBill({
      people: people.map((p: PersonData) => ({
        id: p.id,
        name: p.name,
        email: p.email || null,
        userId: p.userId || null,
        sponsorAmount: p.sponsorAmount || 0,
        paidAmount: p.paidAmount || 0,
      })),
      items: items.map((it: GroupItemOverview) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        assignments: it.assignments || {},
      })),
      globalCharges: globalCharges.map((gc: GlobalChargeData) => ({
        id: gc.id,
        name: gc.name,
        type: gc.type as 'fixed' | 'percent',
        amount: gc.amount,
      })),
      hostId: effectiveHostId,
    });

    const billTotal = billCalc.totalBill > 0 ? billCalc.totalBill : b.totalAmount;
    totalExpenses += billTotal;

    // Calculate effective paid amounts matching calculateBill's logic
    let othersPaid = 0;
    people.forEach((p: PersonData) => {
      if (p.id !== effectiveHostId) {
        othersPaid += (p.paidAmount || 0);
      }
    });

    const effectivePaidAmounts: Record<string, number> = {};
    people.forEach((p: PersonData) => {
      if (p.id === effectiveHostId) {
        effectivePaidAmounts[p.id] = Math.max(0, billTotal - othersPaid);
      } else {
        effectivePaidAmounts[p.id] = p.paidAmount || 0;
      }
    });

    // Auto-correct slight floating-point gap on Host
    const totalPaidInBill = Object.values(effectivePaidAmounts).reduce((a, b) => a + b, 0);
    const totalNetPayable = Object.values(billCalc.finalPayables).reduce((a, b) => a + b, 0);
    const discrepancy = totalPaidInBill - totalNetPayable;
    if (Math.abs(discrepancy) > 0.001 && effectiveHostId && effectivePaidAmounts[effectiveHostId] !== undefined) {
      effectivePaidAmounts[effectiveHostId] -= discrepancy;
    }

    const billParticipants: BillParticipantSummary[] = [];

    // Track for this bill and accumulate into personMap using canonical keys
    people.forEach((p: PersonData) => {
      const paid = effectivePaidAmounts[p.id] || 0;
      const share = billCalc.finalPayables[p.id] || 0;
      const net = paid - share;
      const canonicalKey = personToCanonicalKey.get(`${b.id}:::${p.id}`) || getPersonKey(p);

      billParticipants.push({
        personId: p.id,
        key: canonicalKey,
        name: p.name,
        paid,
        share,
        net,
      });

      const existing = personMap.get(canonicalKey);
      if (existing) {
        existing.totalPaid += paid;
        existing.totalShare += share;
        existing.billsCount += 1;
        if (!existing.userId && p.userId) existing.userId = p.userId;
        if (!existing.email && p.email) existing.email = p.email;
      } else {
        const canonicalMeta = canonicalPersons.get(canonicalKey);
        personMap.set(canonicalKey, {
          key: canonicalKey,
          name: canonicalMeta?.name || p.name,
          userId: canonicalMeta?.userId || p.userId,
          email: canonicalMeta?.email || p.email,
          totalPaid: paid,
          totalShare: share,
          billsCount: 1,
        });
      }
    });

    // Per-bill flows with resolved canonical names and keys
    const resolvedFlows = (billCalc.settlementFlows || []).map(f => {
      const debtor = people.find((p: PersonData) => p.id === f.from);
      const creditor = people.find((p: PersonData) => p.id === f.to);
      const debtorKey = debtor ? (personToCanonicalKey.get(`${b.id}:::${debtor.id}`) || getPersonKey(debtor)) : undefined;
      const creditorKey = creditor ? (personToCanonicalKey.get(`${b.id}:::${creditor.id}`) || getPersonKey(creditor)) : undefined;

      const debtorMeta = debtorKey ? canonicalPersons.get(debtorKey) : undefined;
      const creditorMeta = creditorKey ? canonicalPersons.get(creditorKey) : undefined;

      return {
        fromKey: debtorKey,
        fromName: debtorMeta?.name || debtor?.name || 'Unknown',
        toKey: creditorKey,
        toName: creditorMeta?.name || creditor?.name || 'Host',
        amount: Math.round(f.amount),
      };
    });

    billSummaries.push({
      billId: b.id,
      billName: b.name,
      location: b.location,
      currency: b.currency,
      totalAmount: billTotal,
      hostName: b.host_name || hostPerson?.name || null,
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

  // Generate aggregated pairwise net transfers across all bills
  const pairwiseTransfers = aggregatePairwiseDebts(billSummaries, participants);
  const transfers = pairwiseTransfers.length > 0
    ? pairwiseTransfers
    : simplifyGroupDebts(
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

/**
 * Aggregates debts pairwise across all bills.
 * When different bills have different payers, accurately sums debts from A to B and A to C,
 * netting out mutual debts between any pair, and ensuring A pays both B and C directly.
 * Strictly guarantees that between any pair (A, C), only ONE net transfer exists (either A -> C or C -> A, never both).
 */
export function aggregatePairwiseDebts(
  billSummaries: GroupBillSummaryItem[],
  participants: GroupParticipantSummary[]
): GroupSettlementTransfer[] {
  const pairwiseDebt = new Map<string, number>();
  const personByKey = new Map<string, GroupParticipantSummary>();
  participants.forEach(p => personByKey.set(p.key, p));

  const nameToKey = new Map<string, string>();
  participants.forEach(p => nameToKey.set(p.name.trim().toLowerCase(), p.key));

  for (const b of billSummaries) {
    const billNameToKey = new Map<string, string>();
    b.participants.forEach(bp => {
      billNameToKey.set(bp.name.trim().toLowerCase(), bp.key);
    });

    for (const flow of b.flows) {
      if (flow.amount <= 0.001) continue;
      const fromKey = flow.fromKey || billNameToKey.get(flow.fromName.trim().toLowerCase()) || nameToKey.get(flow.fromName.trim().toLowerCase());
      const toKey = flow.toKey || billNameToKey.get(flow.toName.trim().toLowerCase()) || nameToKey.get(flow.toName.trim().toLowerCase());

      if (fromKey && toKey && fromKey !== toKey) {
        const pairKey = `${fromKey}:::${toKey}`;
        pairwiseDebt.set(pairKey, (pairwiseDebt.get(pairKey) || 0) + flow.amount);
      }
    }
  }

  const rawTransfers: GroupSettlementTransfer[] = [];
  const processedPairs = new Set<string>();

  for (const pairKey of pairwiseDebt.keys()) {
    const [fromKey, toKey] = pairKey.split(':::');
    const symmetricKey = fromKey < toKey ? `${fromKey}:::${toKey}` : `${toKey}:::${fromKey}`;
    if (processedPairs.has(symmetricKey)) continue;
    processedPairs.add(symmetricKey);

    const fromToAmount = pairwiseDebt.get(`${fromKey}:::${toKey}`) || 0;
    const toFromAmount = pairwiseDebt.get(`${toKey}:::${fromKey}`) || 0;
    const net = fromToAmount - toFromAmount;
    const roundedNet = Math.round(Math.abs(net));

    if (roundedNet > 0) {
      if (net > 0) {
        const debtor = personByKey.get(fromKey);
        const creditor = personByKey.get(toKey);
        rawTransfers.push({
          fromKey,
          fromName: debtor ? debtor.name : fromKey,
          toKey,
          toName: creditor ? creditor.name : toKey,
          amount: roundedNet,
        });
      } else {
        const debtor = personByKey.get(toKey);
        const creditor = personByKey.get(fromKey);
        rawTransfers.push({
          fromKey: toKey,
          fromName: debtor ? debtor.name : toKey,
          toKey: fromKey,
          toName: creditor ? creditor.name : fromKey,
          amount: roundedNet,
        });
      }
    }
  }

  // Eliminate any directed multi-party circular transfer loops (e.g. A -> B -> C -> A)
  const transfers = eliminateDebtCycles(rawTransfers, personByKey);
  return transfers;
}
