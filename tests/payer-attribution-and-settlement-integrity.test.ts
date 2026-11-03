import { describe, it, expect, beforeEach } from 'bun:test';
import { calculateBill } from '@/hooks/useBillState';
import { calculateGroupSettlement, buildCanonicalPersonRegistry } from '@/lib/group-settlement';
import { resolveEffectivePayerName, mergeBillsForGroup } from '@/lib/common-data-model';
import { useAppSettingsStore } from '@/store/useAppSettingsStore';
import { useGroupStore } from '@/store/useGroupStore';
import { SqliteAdapter } from '../db/sqlite';
import type { PersonData, GroupBillOverview } from '../db/types';
import type { LocalBillRecord } from '@/lib/local-db/types';

describe('Payer Attribution, Settlement Integrity & Identity Isolation', () => {
  beforeEach(() => {
    useAppSettingsStore.setState({ storageMode: 'local' });
  });

  it('accurately attributes expenses to Đạt (~15.4M) and Quí (~6.8M) instead of group owner Quốc (~366k)', () => {
    // 6 participants matching user screenshot
    const participants: PersonData[] = [
      { id: 'p_dat', name: 'Đạt', paidAmount: 0, sponsorAmount: 0 },
      { id: 'p_qui', name: 'Quí', paidAmount: 0, sponsorAmount: 0 },
      { id: 'p_lan', name: 'Lan', paidAmount: 0, sponsorAmount: 0 },
      { id: 'p_luong', name: 'Lương', paidAmount: 0, sponsorAmount: 0 },
      { id: 'p_quoc', name: 'Quốc', paidAmount: 0, sponsorAmount: 0, userId: 'user_quoc_id' },
      { id: 'p_alice', name: 'Alice', paidAmount: 0, sponsorAmount: 0 },
    ];

    // Helper to generate a bill with specified payer and attendants
    const createTripBill = (
      id: string,
      name: string,
      amount: number,
      payerId: string | string[],
      attendantIds: string[]
    ): GroupBillOverview => {
      const attendants = participants.filter(p => attendantIds.includes(p.id));
      const isMultiPayer = Array.isArray(payerId);
      const peopleMap = new Map<string, any>();
      attendants.forEach(p => peopleMap.set(p.id, { ...p, paidAmount: 0 }));
      if (isMultiPayer) {
        payerId.forEach(pid => {
          const person = participants.find(p => p.id === pid)!;
          const existing = peopleMap.get(pid) || { ...person, paidAmount: 0 };
          existing.paidAmount = amount / payerId.length;
          peopleMap.set(pid, existing);
        });
      } else {
        const person = participants.find(p => p.id === payerId)!;
        const existing = peopleMap.get(payerId) || { ...person, paidAmount: 0 };
        existing.paidAmount = amount;
        peopleMap.set(payerId, existing);
      }
      const billPeople = Array.from(peopleMap.values());

      const singleHostId = isMultiPayer ? null : (payerId as string);

      return {
        id,
        name,
        location: 'Đà Lạt',
        currency: 'VND',
        totalAmount: amount,
        host_id: singleHostId,
        host_name: isMultiPayer ? 'Shared' : (participants.find(p => p.id === payerId)?.name || null),
        created_at: '2026-11-03T08:00:00Z',
        updated_at: '2026-11-03T08:00:00Z',
        items: [
          {
            id: `item_${id}`,
            name,
            price: amount,
            quantity: 1,
            totalPrice: amount,
            assignments: Object.fromEntries(attendants.map(p => [p.id, 1])),
          },
        ],
        people: billPeople,
        globalCharges: [],
      };
    };

    const all6 = ['p_dat', 'p_qui', 'p_lan', 'p_luong', 'p_quoc', 'p_alice'];
    const fiveNoAlice = ['p_dat', 'p_qui', 'p_lan', 'p_luong', 'p_quoc'];
    const fourGrab = ['p_dat', 'p_qui', 'p_lan', 'p_luong'];

    // Bills exact match from user spreadsheet
    const tripBills: GroupBillOverview[] = [
      createTripBill('b1', 'Tiền nhà', 7428189, 'p_dat', all6),
      createTripBill('b_tien_coc', 'Tiền cọc', 1500000, ['p_qui', 'p_lan', 'p_luong'], ['p_dat']),
      createTripBill('b2', 'Tiền xe đi', 3250000, 'p_qui', fiveNoAlice),
      createTripBill('b3', 'Tiền xe về', 2570000, 'p_qui', fourGrab), // 4 attendants per latest spreadsheet: Dat, Qui, Lan, Luong
      createTripBill('b4', 'Ăn sáng (D1)', 280000, 'p_dat', fiveNoAlice),
      createTripBill('b5', 'Xăng (D1)', 150000, 'p_dat', fiveNoAlice),
      createTripBill('b6', 'Vé mongo', 700000, 'p_dat', fiveNoAlice),
      createTripBill('b7', 'Vé cáp treo', 750000, 'p_dat', fiveNoAlice),
      createTripBill('b8', 'Ăn trưa (D1)', 954000, 'p_qui', fiveNoAlice),
      createTripBill('b9', 'Nước suối', 23000, 'p_dat', fiveNoAlice),
      createTripBill('b10', 'Ăn tối', 1524700, 'p_dat', fiveNoAlice),
      createTripBill('b11', 'Đậu nành', 130000, 'p_dat', fiveNoAlice),
      createTripBill('b11_an_sang_d2', 'Ăn sáng (D2)', 360000, 'p_dat', all6),
      createTripBill('b12', 'Xăng (D2)', 150000, ['p_dat', 'p_qui', 'p_quoc'], all6), // 3 co-payers (50k each)
      createTripBill('b13', 'Farm', 480000, 'p_dat', all6),
      createTripBill('b14', 'Langfarm', 1289520, 'p_dat', all6),
      createTripBill('b15', 'Cafe', 316000, 'p_quoc', all6), // Quốc pays cafe
      createTripBill('b16', 'Ăn trưa (D2)', 590000, 'p_dat', all6),
      createTripBill('b17', 'Cafe hoàng hôn', 400000, 'p_dat', all6),
      createTripBill('b18', 'Tối lẩu bò', 1357000, 'p_dat', all6),
      createTripBill('b19', 'Ăn vặt', 140000, 'p_luong', all6),
      createTripBill('b20', 'Ăn sáng (D3)', 248000, 'p_dat', fiveNoAlice),
      createTripBill('b21', 'Grab', 49000, 'p_qui', fourGrab),
      createTripBill('b22', 'Áo mưa', 40000, 'p_dat', fourGrab),
    ];

    const settlement = calculateGroupSettlement({
      bills: tripBills,
      total_amount: tripBills.reduce((s, b) => s + b.totalAmount, 0),
      participants,
    });

    expect(settlement.isBalanced).toBe(true);
    expect(settlement.totalExpenses).toBe(24679409);
    expect(settlement.totalBills).toBe(24);

    const datSummary = settlement.participants.find(p => p.name === 'Đạt');
    const quiSummary = settlement.participants.find(p => p.name === 'Quí');
    const quocSummary = settlement.participants.find(p => p.name === 'Quốc');
    const lanSummary = settlement.participants.find(p => p.name === 'Lan');
    const luongSummary = settlement.participants.find(p => p.name === 'Lương');
    const aliceSummary = settlement.participants.find(p => p.name === 'Alice');

    // Verify all 6 participants are recognized and distinct
    expect(settlement.participants.length).toBe(6);
    expect(datSummary).toBeDefined();
    expect(quiSummary).toBeDefined();
    expect(quocSummary).toBeDefined();
    expect(lanSummary).toBeDefined();
    expect(luongSummary).toBeDefined();
    expect(aliceSummary).toBeDefined();

    // Exact match with spreadsheet total row:
    // Đạt: +9,948,601 đ
    // Qui: +3,021,192 đ
    // Lan: -3,851,808 đ
    // Lương: -3,711,808 đ
    // Quốc: -3,321,058 đ
    // Alice: -2,085,118 đ
    expect(Math.round(datSummary!.netBalance)).toBe(9948601);
    expect(Math.round(quiSummary!.netBalance)).toBe(3021192);
    expect(Math.round(lanSummary!.netBalance)).toBe(-3851808);
    expect(Math.round(luongSummary!.netBalance)).toBe(-3711808);
    expect(Math.round(quocSummary!.netBalance)).toBe(-3321058);
    expect(Math.round(aliceSummary!.netBalance)).toBe(-2085118);

    // 5. Debtors and intermediary creditors settle towards primary creditors (Đạt, Quí)
    expect(settlement.transfers.length).toBeGreaterThan(0);
    const transfersToDat = settlement.transfers.filter(t => t.toName === 'Đạt');
    const transfersToQui = settlement.transfers.filter(t => t.toName === 'Quí');
    expect(transfersToDat.length).toBeGreaterThan(0);
    expect(transfersToQui.length).toBeGreaterThan(0);

    // Quốc has negative net balance and transfers out significantly
    const quocTransfersOut = settlement.transfers.filter(t => t.fromName === 'Quốc');
    expect(quocTransfersOut.length).toBeGreaterThan(0);
    const quocTotalTransferredOut = quocTransfersOut.reduce((s, t) => s + t.amount, 0);
    expect(quocTotalTransferredOut).toBeGreaterThan(3000000);

    // 6. Bill summaries properly show actual payer names
    const tienNhaSummary = settlement.billSummaries.find(b => b.billName === 'Tiền nhà');
    expect(tienNhaSummary?.hostName).toBe('Đạt');

    const xeDiSummary = settlement.billSummaries.find(b => b.billName === 'Tiền xe đi');
    expect(xeDiSummary?.hostName).toBe('Quí');

    const cafeSummary = settlement.billSummaries.find(b => b.billName === 'Cafe');
    expect(cafeSummary?.hostName).toBe('Quốc');
  });

  it('prevents distinct attendees from collapsing into the same canonical person even if userId was erroneously duplicated', () => {
    // Simulate legacy corrupted data where bill creator userId was mistakenly written to host person
    const billsWithPollutedId = [
      {
        id: 'b1',
        people: [
          { id: 'p1', name: 'Đạt', userId: 'user_quoc_polluted', email: null },
          { id: 'p2', name: 'Quốc', userId: 'user_quoc_polluted', email: 'quoc@gmail.com' },
          { id: 'p3', name: 'Lan', userId: null, email: null },
        ],
      },
      {
        id: 'b2',
        people: [
          { id: 'p4', name: 'Đạt', userId: null, email: null },
          { id: 'p5', name: 'Quốc', userId: 'user_quoc_polluted', email: 'quoc@gmail.com' },
        ],
      },
    ];

    const registry = buildCanonicalPersonRegistry(billsWithPollutedId);

    // Đạt and Quốc MUST be two distinct canonical persons despite sharing userId in corrupted b1
    const datKey = registry.personToCanonicalKey.get('b1:::p1');
    const quocKey = registry.personToCanonicalKey.get('b1:::p2');
    const lanKey = registry.personToCanonicalKey.get('b1:::p3');

    expect(datKey).toBeDefined();
    expect(quocKey).toBeDefined();
    expect(lanKey).toBeDefined();

    expect(datKey).not.toBe(quocKey);
    expect(datKey).not.toBe(lanKey);
    expect(quocKey).not.toBe(lanKey);

    const datMeta = registry.canonicalPersons.get(datKey!);
    const quocMeta = registry.canonicalPersons.get(quocKey!);
    expect(datMeta?.name).toBe('Đạt');
    expect(quocMeta?.name).toBe('Quốc');
  });

  it('correctly resolves effective payer name in common-data-model even when hostId is null or paid 0', () => {
    const people: PersonData[] = [
      { id: 'p_quoc', name: 'Quốc', paidAmount: 0 },
      { id: 'p_dat', name: 'Đạt', paidAmount: 7428189 },
    ];

    // Case 1: hostId is null, Đạt paid 7.4M
    expect(resolveEffectivePayerName(people, null, 7428189)).toBe('Đạt');

    // Case 2: hostId is Quốc, but Quốc paid 0 and Đạt paid the full 7.4M
    expect(resolveEffectivePayerName(people, 'p_quoc', 7428189)).toBe('Đạt');

    // Case 3: hostId is Quốc and Quốc paid
    const peopleQuocPaid: PersonData[] = [
      { id: 'p_quoc', name: 'Quốc', paidAmount: 316000 },
      { id: 'p_dat', name: 'Đạt', paidAmount: 0 },
    ];
    expect(resolveEffectivePayerName(peopleQuocPaid, 'p_quoc', 316000)).toBe('Quốc');
  });

  it('deduplicates local and cloud bills across devices and prevents double counting', () => {
    const serverBills: GroupBillOverview[] = [
      {
        id: 'server_bill_1',
        name: 'Tiền nhà',
        location: 'Đà Lạt',
        currency: 'VND',
        totalAmount: 7428189,
        host_id: 'p_dat',
        host_name: 'Đạt',
        created_at: '2026-11-03T02:00:00Z',
        updated_at: '2026-11-03T02:00:00Z',
        items: [{ id: 'i1', name: 'Homestay', price: 7428189, quantity: 1, totalPrice: 7428189, assignments: {} }],
        people: [{ id: 'p_dat', name: 'Đạt', sponsorAmount: 0, paidAmount: 7428189 }],
        globalCharges: [],
      },
    ];

    // Local bill saved with a client-generated UUID hours earlier offline
    const localBills: LocalBillRecord[] = [
      {
        id: 'local_client_uuid_1',
        name: 'Tiền nhà',
        location: 'Đà Lạt',
        currency: 'VND',
        hostId: 'p_dat',
        qrCode: null,
        groupId: 'grp_dalat',
        groupName: 'Đà Lạt Trip',
        ownerId: 'user_quoc',
        people: [{ id: 'p_dat', name: 'Đạt', sponsorAmount: 0, paidAmount: 7428189 }],
        items: [{ id: 'i1', name: 'Homestay', price: 7428189, quantity: 1, assignments: {} }],
        globalCharges: [],
        sharingStatus: 'shared',
        visibility: 'public',
        shareToken: null,
        lastSyncedAt: null,
        syncError: null,
        createdAt: '2026-11-02T20:00:00Z',
        updatedAt: '2026-11-02T20:00:00Z',
      },
    ];

    useAppSettingsStore.setState({ storageMode: 'cloud' });

    const merged = mergeBillsForGroup(serverBills, localBills, 'grp_dalat');

    // Deduplication should recognize they are the same bill: only 1 bill in list!
    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe('server_bill_1');
    expect(merged[0].totalAmount).toBe(7428189);
    expect(merged[0].isLocal).toBe(false);
  });

  it('isolates participant identity in SQLite adapter so Đạt does not receive Quốc userId', async () => {
    const db = new SqliteAdapter(':memory:');
    await db.init();
    const quocUser = await db.upsertUser({
      id: 'user_quoc',
      email: 'quoc@gmail.com',
      name: 'Quốc',
      avatar_url: null,
    });
    const group = await db.createGroup('Trip Đà Lạt', quocUser.id);

    // Bill created by Quốc where Đạt is the host
    await db.saveBill(
      'bill_homestay',
      {
        name: 'Tiền nhà',
        location: 'Đà Lạt',
        currency: 'VND',
        groupId: group.id,
        hostId: 'person_dat',
        people: [
          { id: 'person_dat', name: 'Đạt', paidAmount: 7428189, sponsorAmount: 0 },
          { id: 'person_quoc', name: 'Quốc', paidAmount: 0, sponsorAmount: 0 },
        ],
        items: [
          { id: 'it_homestay', name: 'Villa Homestay', price: 7428189, quantity: 1, assignments: { person_dat: 1, person_quoc: 1 } },
        ],
      },
      quocUser.id // Quốc is the logged-in user saving the bill
    );

    const loadedBill = await db.getBill('bill_homestay', quocUser.id);
    expect(loadedBill).toBeDefined();

    const dat = loadedBill?.data.people.find(p => p.name === 'Đạt');
    const quoc = loadedBill?.data.people.find(p => p.name === 'Quốc');

    // Đạt must NOT have quocUser.id as userId
    expect(dat?.userId).toBeNull();
    // Quốc matches quocUser
    expect(quoc?.userId).toBe(quocUser.id);

    // getGroup must report host_name as "Đạt"
    const loadedGroup = await db.getGroup(group.id, quocUser.id);
    const billInGroup = loadedGroup?.bills.find(b => b.id === 'bill_homestay');
    expect(billInGroup?.host_name).toBe('Đạt');

    db.close();
  });
});
