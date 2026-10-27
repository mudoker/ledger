import { describe, it, expect } from "bun:test";
import {
  calculateGroupSettlement,
  simplifyGroupDebts,
  eliminateDebtCycles,
  getPersonKey,
} from "@/lib/group-settlement";
import type { GroupBillOverview } from "@/../db/types";

describe("Group Settlement & Cross-Bill Aggregation", () => {
  it("generates deterministic person keys prioritizing userId > email > name", () => {
    expect(getPersonKey({ name: "Alex", userId: "u123", email: "alex@test.com" })).toBe("uid:u123");
    expect(getPersonKey({ name: "Bob", email: " Bob@Test.COM " })).toBe("email:bob@test.com");
    expect(getPersonKey({ name: " Charlie Brown " })).toBe("name:charlie brown");
  });

  it("simplifies circular cross-bill debts using Greedy Min-Cash-Flow", () => {
    // Balances:
    // Alex: +100
    // Bob: +100
    // Charlie: -200
    const balances = [
      { key: "alex", name: "Alex", net: 100 },
      { key: "bob", name: "Bob", net: 100 },
      { key: "charlie", name: "Charlie", net: -200 },
    ];

    const transfers = simplifyGroupDebts(balances);
    expect(transfers.length).toBe(2);

    // Charlie pays both Alex and Bob
    const charlieTransfers = transfers.filter(t => t.fromName === "Charlie");
    expect(charlieTransfers.length).toBe(2);
    const totalCharliePaid = charlieTransfers.reduce((s, t) => s + t.amount, 0);
    expect(totalCharliePaid).toBe(200);

    const alexReceived = transfers.find(t => t.toName === "Alex")?.amount;
    const bobReceived = transfers.find(t => t.toName === "Bob")?.amount;
    expect(alexReceived).toBe(100);
    expect(bobReceived).toBe(100);
  });

  it("aggregates across multiple bills with different payers correctly and preserves zero-sum invariant", () => {
    // Bill 1: Lunch (Total: 300,000 VND)
    // Host: Alex (paid 300,000). Alex, Bob, Charlie each had a 100,000 item.
    const bill1: GroupBillOverview = {
      id: "bill-1",
      name: "Team Lunch",
      location: "Bistro",
      currency: "VND",
      totalAmount: 300000,
      host_id: "p-alex-1",
      host_name: "Alex",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "p-alex-1", name: "Alex", userId: "user-alex" },
        { id: "p-bob-1", name: "Bob", userId: "user-bob" },
        { id: "p-charlie-1", name: "Charlie", userId: "user-charlie" },
      ],
      items: [
        { id: "i1", name: "Alex Pasta", price: 100000, quantity: 1, totalPrice: 100000, assignments: { "p-alex-1": 1 } },
        { id: "i2", name: "Bob Pizza", price: 100000, quantity: 1, totalPrice: 100000, assignments: { "p-bob-1": 1 } },
        { id: "i3", name: "Charlie Salad", price: 100000, quantity: 1, totalPrice: 100000, assignments: { "p-charlie-1": 1 } },
      ],
      globalCharges: [],
    };

    // Bill 2: Dinner (Total: 300,000 VND)
    // Host: Bob (paid 300,000). Alex, Bob, Charlie each had a 100,000 item.
    const bill2: GroupBillOverview = {
      id: "bill-2",
      name: "Dinner & Drinks",
      location: "Pub",
      currency: "VND",
      totalAmount: 300000,
      host_id: "p-bob-2",
      host_name: "Bob",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "p-alex-2", name: "Alex", userId: "user-alex" },
        { id: "p-bob-2", name: "Bob", userId: "user-bob" },
        { id: "p-charlie-2", name: "Charlie", userId: "user-charlie" },
      ],
      items: [
        { id: "i4", name: "Alex Beer", price: 100000, quantity: 1, totalPrice: 100000, assignments: { "p-alex-2": 1 } },
        { id: "i5", name: "Bob Burger", price: 100000, quantity: 1, totalPrice: 100000, assignments: { "p-bob-2": 1 } },
        { id: "i6", name: "Charlie Wine", price: 100000, quantity: 1, totalPrice: 100000, assignments: { "p-charlie-2": 1 } },
      ],
      globalCharges: [],
    };

    const result = calculateGroupSettlement({
      bills: [bill1, bill2],
      total_amount: 600000,
    });

    expect(result.totalExpenses).toBe(600000);
    expect(result.totalBills).toBe(2);
    expect(result.uniqueParticipantsCount).toBe(3);
    expect(result.isBalanced).toBe(true);

    const alex = result.participants.find(p => p.name === "Alex")!;
    const bob = result.participants.find(p => p.name === "Bob")!;
    const charlie = result.participants.find(p => p.name === "Charlie")!;

    // In Bill 1, Alex paid 300,000. In Bill 2, Alex paid 0. Total paid = 300,000.
    // Total share across 2 bills = 100,000 + 100,000 = 200,000.
    // Net = +100,000.
    expect(alex.totalPaid).toBe(300000);
    expect(alex.totalShare).toBe(200000);
    expect(alex.netBalance).toBe(100000);
    expect(alex.status).toBe("receive");
    expect(alex.billsCount).toBe(2);

    // In Bill 2, Bob paid 300,000. In Bill 1, Bob paid 0. Total paid = 300,000.
    // Total share = 200,000. Net = +100,000.
    expect(bob.totalPaid).toBe(300000);
    expect(bob.totalShare).toBe(200000);
    expect(bob.netBalance).toBe(100000);
    expect(bob.status).toBe("receive");
    expect(bob.billsCount).toBe(2);

    // Charlie paid 0. Share = 200,000. Net = -200,000.
    expect(charlie.totalPaid).toBe(0);
    expect(charlie.totalShare).toBe(200000);
    expect(charlie.netBalance).toBe(-200000);
    expect(charlie.status).toBe("pay");
    expect(charlie.billsCount).toBe(2);

    // Net transfers should directly instruct Charlie to pay Alex 100k and Bob 100k
    expect(result.transfers.length).toBe(2);
    expect(result.transfers.some(t => t.fromName === "Charlie" && t.toName === "Alex" && t.amount === 100000)).toBe(true);
    expect(result.transfers.some(t => t.fromName === "Charlie" && t.toName === "Bob" && t.amount === 100000)).toBe(true);

    // Per-bill summaries
    expect(result.billSummaries.length).toBe(2);
    expect(result.billSummaries[0].billName).toBe("Team Lunch");
    expect(result.billSummaries[0].flows.length).toBe(2); // Bob -> Alex 100k, Charlie -> Alex 100k
  });

  it("handles complex bill with taxes and multi-sponsor relief cascading into group totals", () => {
    // Bill with 10% tax and Dan sponsoring 200k
    const bill: GroupBillOverview = {
      id: "bill-complex",
      name: "Sponsored Feast",
      location: "Sky Lounge",
      currency: "VND",
      totalAmount: 330000, // 300k items + 10% VAT = 330,000
      host_id: "dan",
      host_name: "Dan",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "dan", name: "Dan", sponsorAmount: 200000 },
        { id: "eva", name: "Eva" },
        { id: "frank", name: "Frank" },
      ],
      items: [
        { id: "i1", name: "Dan Steak", price: 100000, quantity: 1, totalPrice: 100000, assignments: { dan: 1 } },
        { id: "i2", name: "Eva Salmon", price: 100000, quantity: 1, totalPrice: 100000, assignments: { eva: 1 } },
        { id: "i3", name: "Frank Duck", price: 100000, quantity: 1, totalPrice: 100000, assignments: { frank: 1 } },
      ],
      globalCharges: [
        { id: "c1", name: "VAT", type: "percent", amount: 10 },
      ],
    };

    const result = calculateGroupSettlement({
      bills: [bill],
      total_amount: 330000,
    });

    expect(result.totalExpenses).toBe(330000);
    expect(result.isBalanced).toBe(true);

    // Dan paid 330,000 as host. Pledged 200,000 sponsor.
    // Dan base with 10% = 110,000. Surplus = 200,000 - 110,000 = 90,000.
    // Eva & Frank each base 110,000, minus equal relief of 45,000 = 65,000 each.
    // Final payables: Dan: 200,000, Eva: 65,000, Frank: 65,000. Sum = 330,000!
    const eva = result.participants.find(p => p.name === "Eva")!;
    const frank = result.participants.find(p => p.name === "Frank")!;
    const dan = result.participants.find(p => p.name === "Dan")!;

    expect(dan.totalPaid).toBe(330000);
    expect(dan.totalShare).toBe(200000);
    expect(dan.netBalance).toBe(130000);

    expect(eva.totalShare).toBe(65000);
    expect(eva.netBalance).toBe(-65000);

    expect(frank.totalShare).toBe(65000);
    expect(frank.netBalance).toBe(-65000);

    expect(result.transfers.length).toBe(2);
    expect(result.transfers.some(t => t.fromName === "Eva" && t.toName === "Dan" && t.amount === 65000)).toBe(true);
    expect(result.transfers.some(t => t.fromName === "Frank" && t.toName === "Dan" && t.amount === 65000)).toBe(true);
  });

  it("aggregates multi-bill debts by payer: A owes B on bill 1, and owes C on bill 2 and bill 3", () => {
    // Bill 1: Lunch (Total: 400,000 VND). Payer/Host: Bob. A has 200k item, B has 200k item.
    // A owes B 200k.
    const bill1: GroupBillOverview = {
      id: "bill-1",
      name: "Lunch with Bob",
      location: null,
      currency: "VND",
      totalAmount: 400000,
      host_id: "p-bob-1",
      host_name: "Bob",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "p-alice-1", name: "Alice", userId: "user-a" },
        { id: "p-bob-1", name: "Bob", userId: "user-b" },
      ],
      items: [
        { id: "i1", name: "Alice Lunch", price: 200000, quantity: 1, totalPrice: 200000, assignments: { "p-alice-1": 1 } },
        { id: "i2", name: "Bob Lunch", price: 200000, quantity: 1, totalPrice: 200000, assignments: { "p-bob-1": 1 } },
      ],
      globalCharges: [],
    };

    // Bill 2: Dinner (Total: 600,000 VND). Payer/Host: Charlie. A has 300k item, C has 300k item.
    // A owes C 300k.
    const bill2: GroupBillOverview = {
      id: "bill-2",
      name: "Dinner with Charlie",
      location: null,
      currency: "VND",
      totalAmount: 600000,
      host_id: "p-charlie-2",
      host_name: "Charlie",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "p-alice-2", name: "Alice", userId: "user-a" },
        { id: "p-charlie-2", name: "Charlie", userId: "user-c" },
      ],
      items: [
        { id: "i3", name: "Alice Dinner", price: 300000, quantity: 1, totalPrice: 300000, assignments: { "p-alice-2": 1 } },
        { id: "i4", name: "Charlie Dinner", price: 300000, quantity: 1, totalPrice: 300000, assignments: { "p-charlie-2": 1 } },
      ],
      globalCharges: [],
    };

    // Bill 3: Coffee (Total: 200,000 VND). Payer/Host: Charlie. A has 100k item, C has 100k item.
    // A owes C 100k again.
    const bill3: GroupBillOverview = {
      id: "bill-3",
      name: "Coffee with Charlie",
      location: null,
      currency: "VND",
      totalAmount: 200000,
      host_id: "p-charlie-3",
      host_name: "Charlie",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "p-alice-3", name: "Alice", userId: "user-a" },
        { id: "p-charlie-3", name: "Charlie", userId: "user-c" },
      ],
      items: [
        { id: "i5", name: "Alice Coffee", price: 100000, quantity: 1, totalPrice: 100000, assignments: { "p-alice-3": 1 } },
        { id: "i6", name: "Charlie Coffee", price: 100000, quantity: 1, totalPrice: 100000, assignments: { "p-charlie-3": 1 } },
      ],
      globalCharges: [],
    };

    const result = calculateGroupSettlement({
      bills: [bill1, bill2, bill3],
      total_amount: 1200000,
    });

    // Alice owes Bob 200k
    // Alice owes Charlie 300k + 100k = 400k
    expect(result.transfers.length).toBe(2);

    const aliceToBob = result.transfers.find(t => t.fromName === "Alice" && t.toName === "Bob");
    const aliceToCharlie = result.transfers.find(t => t.fromName === "Alice" && t.toName === "Charlie");

    expect(aliceToBob).toBeDefined();
    expect(aliceToBob?.amount).toBe(200000);

    expect(aliceToCharlie).toBeDefined();
    expect(aliceToCharlie?.amount).toBe(400000);
  });

  it("strictly aggregates mutual debts between any pair: A pays X, C pays Y and Z where X > Y+Z -> C pays A net, never both", () => {
    // Scenario requested:
    // Bill 1: Alex (A) pays 500k. A has 250k item, C has 250k item. C owes A 250k (X = 250k).
    // Bill 2: Charlie (C) pays 100k. A has 50k item, C has 50k item. A owes C 50k (Y = 50k).
    // Bill 3: Charlie (C) pays 100k. A has 50k item, C has 50k item. A owes C 50k (Z = 50k).
    // Since X (250k) > Y + Z (100k):
    // Net transfer MUST be: C pays A 150k.
    // There must NEVER be both A -> C and C -> A!
    const bill1: GroupBillOverview = {
      id: "bill-1",
      name: "BBQ Paid by Alex",
      location: null,
      currency: "VND",
      totalAmount: 500000,
      host_id: "p-alex-1",
      host_name: "Alex",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "p-alex-1", name: "Alex", userId: "user-alex" },
        { id: "p-charlie-1", name: "Charlie" }, // guest in bill 1
      ],
      items: [
        { id: "i1", name: "Alex BBQ", price: 250000, quantity: 1, totalPrice: 250000, assignments: { "p-alex-1": 1 } },
        { id: "i2", name: "Charlie BBQ", price: 250000, quantity: 1, totalPrice: 250000, assignments: { "p-charlie-1": 1 } },
      ],
      globalCharges: [],
    };

    const bill2: GroupBillOverview = {
      id: "bill-2",
      name: "Coffee Paid by Charlie",
      location: null,
      currency: "VND",
      totalAmount: 100000,
      host_id: "p-charlie-2",
      host_name: "Charlie",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "p-charlie-2", name: "Charlie", userId: "user-charlie" },
        { id: "p-alex-2", name: "Alex" }, // guest in bill 2
      ],
      items: [
        { id: "i3", name: "Charlie Coffee", price: 50000, quantity: 1, totalPrice: 50000, assignments: { "p-charlie-2": 1 } },
        { id: "i4", name: "Alex Coffee", price: 50000, quantity: 1, totalPrice: 50000, assignments: { "p-alex-2": 1 } },
      ],
      globalCharges: [],
    };

    const bill3: GroupBillOverview = {
      id: "bill-3",
      name: "Dessert Paid by Charlie",
      location: null,
      currency: "VND",
      totalAmount: 100000,
      host_id: "p-charlie-3",
      host_name: "Charlie",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "p-charlie-3", name: "Charlie", userId: "user-charlie" },
        { id: "p-alex-3", name: "Alex" }, // guest in bill 3
      ],
      items: [
        { id: "i5", name: "Charlie Dessert", price: 50000, quantity: 1, totalPrice: 50000, assignments: { "p-charlie-3": 1 } },
        { id: "i6", name: "Alex Dessert", price: 50000, quantity: 1, totalPrice: 50000, assignments: { "p-alex-3": 1 } },
      ],
      globalCharges: [],
    };

    const result = calculateGroupSettlement({
      bills: [bill1, bill2, bill3],
      total_amount: 700000,
    });

    // 1. Check participants unification
    expect(result.uniqueParticipantsCount).toBe(2);
    expect(result.participants.length).toBe(2);

    const alex = result.participants.find(p => p.name === "Alex")!;
    const charlie = result.participants.find(p => p.name === "Charlie")!;

    // Alex: Paid 500k. Share = 250k + 50k + 50k = 350k. Net = +150k (to receive).
    expect(alex.totalPaid).toBe(500000);
    expect(alex.totalShare).toBe(350000);
    expect(alex.netBalance).toBe(150000);
    expect(alex.status).toBe("receive");

    // Charlie: Paid 100k + 100k = 200k. Share = 250k + 50k + 50k = 350k. Net = -150k (to pay).
    expect(charlie.totalPaid).toBe(200000);
    expect(charlie.totalShare).toBe(350000);
    expect(charlie.netBalance).toBe(-150000);
    expect(charlie.status).toBe("pay");

    // 2. Transfers must contain EXACTLY ONE transfer: Charlie -> Alex for 150,000
    expect(result.transfers.length).toBe(1);
    expect(result.transfers[0].fromName).toBe("Charlie");
    expect(result.transfers[0].toName).toBe("Alex");
    expect(result.transfers[0].amount).toBe(150000);

    // Assert that Alex NEVER sends to Charlie
    const alexSendsToCharlie = result.transfers.some(t => t.fromName === "Alex" && t.toName === "Charlie");
    expect(alexSendsToCharlie).toBe(false);
  });

  it("eliminates 3-way circular debt loops so participants do not send redundant cash in a circle", () => {
    // Bill 1: Alex pays 300k. Alex, Bob share 150k each. Bob owes Alex 150k.
    const bill1: GroupBillOverview = {
      id: "bill-1",
      name: "Bill 1",
      location: null,
      currency: "VND",
      totalAmount: 300000,
      host_id: "p-alex-1",
      host_name: "Alex",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "p-alex-1", name: "Alex" },
        { id: "p-bob-1", name: "Bob" },
      ],
      items: [
        { id: "i1", name: "Alex Share", price: 150000, quantity: 1, totalPrice: 150000, assignments: { "p-alex-1": 1 } },
        { id: "i2", name: "Bob Share", price: 150000, quantity: 1, totalPrice: 150000, assignments: { "p-bob-1": 1 } },
      ],
      globalCharges: [],
    };

    // Bill 2: Bob pays 300k. Bob, Charlie share 150k each. Charlie owes Bob 150k.
    const bill2: GroupBillOverview = {
      id: "bill-2",
      name: "Bill 2",
      location: null,
      currency: "VND",
      totalAmount: 300000,
      host_id: "p-bob-2",
      host_name: "Bob",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "p-bob-2", name: "Bob" },
        { id: "p-charlie-2", name: "Charlie" },
      ],
      items: [
        { id: "i3", name: "Bob Share", price: 150000, quantity: 1, totalPrice: 150000, assignments: { "p-bob-2": 1 } },
        { id: "i4", name: "Charlie Share", price: 150000, quantity: 1, totalPrice: 150000, assignments: { "p-charlie-2": 1 } },
      ],
      globalCharges: [],
    };

    // Bill 3: Charlie pays 300k. Charlie, Alex share 150k each. Alex owes Charlie 150k.
    const bill3: GroupBillOverview = {
      id: "bill-3",
      name: "Bill 3",
      location: null,
      currency: "VND",
      totalAmount: 300000,
      host_id: "p-charlie-3",
      host_name: "Charlie",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      people: [
        { id: "p-charlie-3", name: "Charlie" },
        { id: "p-alex-3", name: "Alex" },
      ],
      items: [
        { id: "i5", name: "Charlie Share", price: 150000, quantity: 1, totalPrice: 150000, assignments: { "p-charlie-3": 1 } },
        { id: "i6", name: "Alex Share", price: 150000, quantity: 1, totalPrice: 150000, assignments: { "p-alex-3": 1 } },
      ],
      globalCharges: [],
    };

    // Everyone paid 300k and consumed 300k. Everyone's net balance is 0.
    // The circular loop (Bob -> Alex -> Charlie -> Bob) is completely canceled!
    const result = calculateGroupSettlement({
      bills: [bill1, bill2, bill3],
      total_amount: 900000,
    });

    expect(result.uniqueParticipantsCount).toBe(3);
    expect(result.transfers.length).toBe(0); // All settled, 0 redundant circular transfers!
  });

  it("handles complex multi-cycle and large debt networks with O(V+E) single-pass efficiency", () => {
    // 5-person multi-cycle test:
    // Cycle 1: A -> B (100k) -> C (100k) -> A (100k)
    // Cycle 2: C -> D (50k) -> E (50k) -> C (50k)
    // Extra independent debt: B -> E (75k)
    const personMap = new Map<string, { key: string; name: string }>([
      ["A", { key: "A", name: "Alex" }],
      ["B", { key: "B", name: "Bob" }],
      ["C", { key: "C", name: "Charlie" }],
      ["D", { key: "D", name: "Dan" }],
      ["E", { key: "E", name: "Eva" }],
    ]);

    const transfers = [
      { fromKey: "A", fromName: "Alex", toKey: "B", toName: "Bob", amount: 100000 },
      { fromKey: "B", fromName: "Bob", toKey: "C", toName: "Charlie", amount: 100000 },
      { fromKey: "C", fromName: "Charlie", toKey: "A", toName: "Alex", amount: 100000 },
      { fromKey: "C", fromName: "Charlie", toKey: "D", toName: "Dan", amount: 50000 },
      { fromKey: "D", fromName: "Dan", toKey: "E", toName: "Eva", amount: 50000 },
      { fromKey: "E", fromName: "Eva", toKey: "C", toName: "Charlie", amount: 50000 },
      { fromKey: "B", fromName: "Bob", toKey: "E", toName: "Eva", amount: 75000 },
    ];

    const t0 = performance.now();
    const simplified = eliminateDebtCycles(transfers, personMap);
    const durationMs = performance.now() - t0;

    // Both cycles cancel completely to 0!
    // Only the non-cyclic debt B -> E for 75,000 remains!
    expect(simplified.length).toBe(1);
    expect(simplified[0].fromName).toBe("Bob");
    expect(simplified[0].toName).toBe("Eva");
    expect(simplified[0].amount).toBe(75000);

    // Performance assertion: Must execute in under 10ms (typically < 0.2ms)
    expect(durationMs).toBeLessThan(10);
  });

  it("handles empty groups gracefully", () => {
    const result = calculateGroupSettlement({
      bills: [],
      total_amount: 0,
    });
    expect(result.totalExpenses).toBe(0);
    expect(result.totalBills).toBe(0);
    expect(result.uniqueParticipantsCount).toBe(0);
    expect(result.participants).toEqual([]);
    expect(result.transfers).toEqual([]);
    expect(result.billSummaries).toEqual([]);
    expect(result.isBalanced).toBe(true);
  });
});
