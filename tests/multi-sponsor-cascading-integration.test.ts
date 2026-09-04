import { describe, expect, it } from 'bun:test';
import { calculateBill } from '../src/hooks/useBillState';
import type { Person, Item, GlobalCharge } from '../src/store/useBillStore';

describe('Multi-Sponsor Pooling, Cascading Relief & Multi-Creditor Integration Suite', () => {
  describe('Multi-Sponsor Cascading Equal Relief (BRD Invariant)', () => {
    it('accurately cascades leftover surplus across multiple rounds when some beneficiaries owe less than the equal share', () => {
      // 6 participants:
      // Alice: baseline meal = $50, pledges $150 (surplus = $100)
      // Bob: baseline meal = $40, pledges $80 (surplus = $40)
      // Total surplus = $140.
      // Non-sponsors: Charlie ($20), David ($35), Emma ($80), Frank ($120).
      const people: Person[] = [
        { id: 'p_alice', name: 'Alice', sponsorAmount: 150, paidAmount: 0 },
        { id: 'p_bob', name: 'Bob', sponsorAmount: 80, paidAmount: 0 },
        { id: 'p_charlie', name: 'Charlie', sponsorAmount: 0, paidAmount: 0 },
        { id: 'p_david', name: 'David', sponsorAmount: 0, paidAmount: 0 },
        { id: 'p_emma', name: 'Emma', sponsorAmount: 0, paidAmount: 0 },
        { id: 'p_frank', name: 'Frank', sponsorAmount: 0, paidAmount: 0 },
      ];

      const items: Item[] = [
        { id: 'i1', name: 'Alice Meal', price: 50, quantity: 1, assignments: { p_alice: 1 } },
        { id: 'i2', name: 'Bob Meal', price: 40, quantity: 1, assignments: { p_bob: 1 } },
        { id: 'i3', name: 'Charlie Meal', price: 20, quantity: 1, assignments: { p_charlie: 1 } },
        { id: 'i4', name: 'David Meal', price: 35, quantity: 1, assignments: { p_david: 1 } },
        { id: 'i5', name: 'Emma Meal', price: 80, quantity: 1, assignments: { p_emma: 1 } },
        { id: 'i6', name: 'Frank Meal', price: 120, quantity: 1, assignments: { p_frank: 1 } },
      ];

      const res = calculateBill({
        people,
        items,
        globalCharges: [],
        hostId: 'p_alice',
      });

      // Total bill: 50 + 40 + 20 + 35 + 80 + 120 = 345
      expect(res.totalBill).toBe(345);
      expect(res.totalSurplus).toBe(140); // 100 from Alice + 40 from Bob

      // Sponsors pay their pledged amounts
      expect(res.finalPayables['p_alice']).toBe(150);
      expect(res.finalPayables['p_bob']).toBe(80);

      // Charlie owed $20, which is < round 1 equal share ($35). Fully relieved!
      expect(res.finalPayables['p_charlie']).toBe(0);
      expect(res.sponsorReliefs['p_charlie']).toBe(20);

      // David owed $35, which == round 1 equal share ($35). Fully relieved!
      expect(res.finalPayables['p_david']).toBe(0);
      expect(res.sponsorReliefs['p_david']).toBe(35);

      // Leftover from Charlie is $15 ($35 - $20).
      // Cascades to Emma and Frank ($7.50 each).
      // Emma: 80 - 35 - 7.50 = 37.50
      expect(res.finalPayables['p_emma']).toBeCloseTo(37.5, 4);
      expect(res.sponsorReliefs['p_emma']).toBeCloseTo(42.5, 4);

      // Frank: 120 - 35 - 7.50 = 77.50
      expect(res.finalPayables['p_frank']).toBeCloseTo(77.5, 4);
      expect(res.sponsorReliefs['p_frank']).toBeCloseTo(42.5, 4);

      // Sum of all final payables must match total bill
      const sumPayables = Object.values(res.finalPayables).reduce((a, b) => a + b, 0);
      expect(sumPayables).toBeCloseTo(345, 4);
    });

    it('refunds excess unspent surplus pro-rata to multiple sponsors when surplus exceeds total non-sponsor debt', () => {
      // Non-sponsors only owe $30 total: Charlie ($10) and David ($20).
      // Alice contributes $60 surplus (pledges $80 for $20 food).
      // Bob contributes $30 surplus (pledges $50 for $20 food).
      // Total pooled surplus = $90.
      // Total debt to relieve = $30.
      // Remaining unspent surplus = $60.
      // Alice surplus ratio: 60/90 = 2/3 -> refund $40 -> Alice pays $80 - $40 = $40.
      // Bob surplus ratio: 30/90 = 1/3 -> refund $20 -> Bob pays $50 - $20 = $30.
      const people: Person[] = [
        { id: 'p_alice', name: 'Alice', sponsorAmount: 80, paidAmount: 0 },
        { id: 'p_bob', name: 'Bob', sponsorAmount: 50, paidAmount: 0 },
        { id: 'p_charlie', name: 'Charlie', sponsorAmount: 0, paidAmount: 0 },
        { id: 'p_david', name: 'David', sponsorAmount: 0, paidAmount: 0 },
      ];

      const items: Item[] = [
        { id: 'i1', name: 'Alice Food', price: 20, quantity: 1, assignments: { p_alice: 1 } },
        { id: 'i2', name: 'Bob Food', price: 20, quantity: 1, assignments: { p_bob: 1 } },
        { id: 'i3', name: 'Charlie Food', price: 10, quantity: 1, assignments: { p_charlie: 1 } },
        { id: 'i4', name: 'David Food', price: 20, quantity: 1, assignments: { p_david: 1 } },
      ];

      const res = calculateBill({
        people,
        items,
        globalCharges: [],
        hostId: 'p_alice',
      });

      // Total bill: 20 + 20 + 10 + 20 = 70
      expect(res.totalBill).toBe(70);

      // Non-sponsors are completely free ($0)
      expect(res.finalPayables['p_charlie']).toBe(0);
      expect(res.finalPayables['p_david']).toBe(0);

      // Alice pays baseline ($20) + unrefunded surplus ($20) = $40
      expect(res.finalPayables['p_alice']).toBeCloseTo(40, 4);

      // Bob pays baseline ($20) + unrefunded surplus ($10) = $30
      expect(res.finalPayables['p_bob']).toBeCloseTo(30, 4);

      // Total sum: 40 + 30 + 0 + 0 = 70
      const totalPaid = Object.values(res.finalPayables).reduce((a, b) => a + b, 0);
      expect(totalPaid).toBeCloseTo(70, 4);
    });
  });

  describe('Multi-Creditor / Multi-Payer Settlement & Flow Invariants', () => {
    it('correctly computes settlement balances and hub-and-spoke flows when multiple people paid portions of the bill', () => {
      // Total Bill = $300.
      // People:
      // Host Alice: pays remaining ($300 - Bob's $100 - Charlie's $50 = $150)
      // Bob: paid $100
      // Charlie: paid $50
      // David: paid $0
      // Final payables: Each owes $75 (equal 4-way split of $300).
      //
      // Balances:
      // Alice: Paid $150, Owes $75 -> Balance = +$75 (Creditor)
      // Bob: Paid $100, Owes $75 -> Balance = +$25 (Creditor)
      // Charlie: Paid $50, Owes $75 -> Balance = -$25 (Debtor)
      // David: Paid $0, Owes $75 -> Balance = -$75 (Debtor)
      //
      // Hub-and-Spoke Model:
      // Host (Alice) is the hub:
      // - Debtors pay Host: Charlie pays Alice $25; David pays Alice $75. (Host receives $100)
      // - Host pays other Creditors: Alice pays Bob $25. (Host pays out $25)
      // - Net for Host: +$100 - $25 = +$75! Exactly Alice's balance!
      const people: Person[] = [
        { id: 'p_alice', name: 'Alice (Host)', sponsorAmount: 0, paidAmount: 0 },
        { id: 'p_bob', name: 'Bob', sponsorAmount: 0, paidAmount: 100 },
        { id: 'p_charlie', name: 'Charlie', sponsorAmount: 0, paidAmount: 50 },
        { id: 'p_david', name: 'David', sponsorAmount: 0, paidAmount: 0 },
      ];

      const items: Item[] = [
        {
          id: 'i_feast',
          name: 'Grand Feast',
          price: 300,
          quantity: 1,
          assignments: { p_alice: 1, p_bob: 1, p_charlie: 1, p_david: 1 },
        },
      ];

      const res = calculateBill({
        people,
        items,
        globalCharges: [],
        hostId: 'p_alice',
      });

      expect(res.totalBill).toBe(300);
      expect(res.finalPayables['p_alice']).toBe(75);
      expect(res.finalPayables['p_bob']).toBe(75);
      expect(res.finalPayables['p_charlie']).toBe(75);
      expect(res.finalPayables['p_david']).toBe(75);

      // Verify settlement flows:
      // 1. Charlie -> Alice: $25
      // 2. David -> Alice: $75
      // 3. Alice -> Bob: $25
      expect(res.settlementFlows.length).toBe(3);

      const charlieToAlice = res.settlementFlows.find(f => f.from === 'p_charlie' && f.to === 'p_alice');
      expect(charlieToAlice).toBeDefined();
      expect(charlieToAlice?.amount).toBe(25);

      const davidToAlice = res.settlementFlows.find(f => f.from === 'p_david' && f.to === 'p_alice');
      expect(davidToAlice).toBeDefined();
      expect(davidToAlice?.amount).toBe(75);

      const aliceToBob = res.settlementFlows.find(f => f.from === 'p_alice' && f.to === 'p_bob');
      expect(aliceToBob).toBeDefined();
      expect(aliceToBob?.amount).toBe(25);
    });

    it('auto-absorbs floating-point discrepancies on Host payment to guarantee zero imbalance', () => {
      // 3 people splitting 100 USD (33.333333... each) with 8% tax ($8)
      // Total bill = 108 USD.
      const people: Person[] = [
        { id: 'p_alice', name: 'Alice (Host)', sponsorAmount: 0, paidAmount: 0 },
        { id: 'p_bob', name: 'Bob', sponsorAmount: 0, paidAmount: 0 },
        { id: 'p_charlie', name: 'Charlie', sponsorAmount: 0, paidAmount: 0 },
      ];

      const items: Item[] = [
        { id: 'i1', name: 'Shared Dish', price: 100, quantity: 1, assignments: { p_alice: 1, p_bob: 1, p_charlie: 1 } },
      ];

      const charges: GlobalCharge[] = [
        { id: 'c1', name: 'Sales Tax', amount: 8, type: 'percent' },
      ];

      const res = calculateBill({
        people,
        items,
        globalCharges: charges,
        hostId: 'p_alice',
      });

      expect(res.totalBill).toBe(108);
      // Discrepancy is auto-absorbed by Host
      expect(Math.abs(res.discrepancy)).toBeLessThan(0.0001);

      const sumPayables = Object.values(res.finalPayables).reduce((a, b) => a + b, 0);
      expect(sumPayables).toBeCloseTo(108, 2);
    });
  });
});
