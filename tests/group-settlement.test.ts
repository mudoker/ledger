import { describe, it, expect } from "bun:test";
import {
  calculateGroupSettlement,
  simplifyGroupDebts,
  getPersonKey,
} from "@/lib/group-settlement";
import type { GroupBillOverview } from "@/db/types";

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
