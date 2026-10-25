import { describe, it, expect, beforeEach } from "bun:test";
import { calculateBill } from "@/hooks/useBillState";
import type { Item, Person } from "@/store/useBillStore";

describe("Updated Sponsor & Multi-Sponsor Mechanism", () => {
    it("caps sponsor liability at their pledged amount and distributes surplus equally", () => {
        const hostId = "p-alex";
        const bobId = "p-bob";
        const davidId = "p-david";
        const charlieId = "p-charlie";

        const people: Person[] = [
            { id: hostId, name: "Alex (Host)", sponsorAmount: 0, paidAmount: 0 },
            { id: bobId, name: "Bob", sponsorAmount: 0, paidAmount: 0 },
            { id: davidId, name: "David", sponsorAmount: 0, paidAmount: 0 },
            { id: charlieId, name: "Charlie", sponsorAmount: 800000, paidAmount: 0 },
        ];
        const items: Item[] = [
            { id: "i1", name: "Dish Alex", price: 500000, quantity: 1, assignments: { [hostId]: 1 } },
            { id: "i2", name: "Dish Bob", price: 500000, quantity: 1, assignments: { [bobId]: 1 } },
            { id: "i3", name: "Dish David", price: 500000, quantity: 1, assignments: { [davidId]: 1 } },
            { id: "i4", name: "Dish Charlie", price: 500000, quantity: 1, assignments: { [charlieId]: 1 } },
        ];

        const { totalCosts, finalPayables, sponsorSurpluses, sponsorReliefs, totalBill } = calculateBill({
            people,
            items,
            globalCharges: [],
            hostId
        });

        expect(totalBill).toBe(2000000);
        // Charlie's baseline cost is 500,000
        expect(totalCosts[charlieId]).toBe(500000);
        // Charlie's liability is capped at his pledge of 800,000 (owes nothing more)
        expect(finalPayables[charlieId]).toBe(800000);
        expect(sponsorSurpluses[charlieId]).toBe(300000);

        // Surplus 300,000 divided equally among 3 non-sponsors: 100,000 each
        expect(sponsorReliefs[hostId]).toBe(100000);
        expect(sponsorReliefs[bobId]).toBe(100000);
        expect(sponsorReliefs[davidId]).toBe(100000);

        // Each non-sponsor pays 500k - 100k = 400k
        expect(finalPayables[hostId]).toBe(400000);
        expect(finalPayables[bobId]).toBe(400000);
        expect(finalPayables[davidId]).toBe(400000);

        // Conservation: 800k + 400k + 400k + 400k === 2,000,000
        const sumPayables = Object.values(finalPayables).reduce((a, b) => a + b, 0);
        expect(sumPayables).toBe(totalBill);
    });

    it("supports multiple sponsors pooling surplus with equal per-capita relief", () => {
        const hostId = "p-alex";
        const bobId = "p-bob";
        const davidId = "p-david";
        const charlieId = "p-charlie";
        const elenaId = "p-elena";

        const people: Person[] = [
            { id: hostId, name: "Alex (Host)", sponsorAmount: 0, paidAmount: 0 },
            { id: bobId, name: "Bob", sponsorAmount: 0, paidAmount: 0 },
            { id: davidId, name: "David", sponsorAmount: 0, paidAmount: 0 },
            { id: charlieId, name: "Charlie", sponsorAmount: 1000000, paidAmount: 0 },
            { id: elenaId, name: "Elena", sponsorAmount: 1600000, paidAmount: 0 },
        ];
        const items: Item[] = [
            { id: "i1", name: "Dish Alex", price: 600000, quantity: 1, assignments: { [hostId]: 1 } },
            { id: "i2", name: "Dish Bob", price: 800000, quantity: 1, assignments: { [bobId]: 1 } },
            { id: "i3", name: "Dish David", price: 1000000, quantity: 1, assignments: { [davidId]: 1 } },
            { id: "i4", name: "Dish Charlie", price: 600000, quantity: 1, assignments: { [charlieId]: 1 } },
            { id: "i5", name: "Dish Elena", price: 1000000, quantity: 1, assignments: { [elenaId]: 1 } },
        ];

        const { totalCosts, finalPayables, sponsorSurpluses, sponsorReliefs, totalBill, settlementFlows } = calculateBill({
            people,
            items,
            globalCharges: [],
            hostId
        });

        expect(totalBill).toBe(4000000);

        // Charlie generates 1M - 600k = 400k surplus; capped at 1,000,000
        expect(sponsorSurpluses[charlieId]).toBe(400000);
        expect(finalPayables[charlieId]).toBe(1000000);

        // Elena generates 1.6M - 1M = 600k surplus; capped at 1,600,000
        expect(sponsorSurpluses[elenaId]).toBe(600000);
        expect(finalPayables[elenaId]).toBe(1600000);

        // Total surplus is 400k + 600k = 1,000,000.
        // Divided equally across 3 non-sponsors: 333,333.33 each
        expect(Math.round(sponsorReliefs[hostId])).toBe(333333);
        expect(Math.round(sponsorReliefs[bobId])).toBe(333333);
        expect(Math.round(sponsorReliefs[davidId])).toBe(333333);

        // Beneficiary final payables:
        expect(Math.round(finalPayables[hostId])).toBe(266667); // 600k - 333.33k
        expect(Math.round(finalPayables[bobId])).toBe(466667);  // 800k - 333.33k
        expect(Math.round(finalPayables[davidId])).toBe(666667); // 1000k - 333.33k

        // Conservation holds exactly
        const sumPayables = Object.values(finalPayables).reduce((a, b) => a + b, 0);
        expect(Math.abs(sumPayables - totalBill)).toBeLessThan(0.01);

        // Settlement flows: Everyone pays Host their final payable amount
        const charlieFlow = settlementFlows.find(f => f.from === charlieId);
        expect(charlieFlow?.amount).toBe(1000000);

        const elenaFlow = settlementFlows.find(f => f.from === elenaId);
        expect(elenaFlow?.amount).toBe(1600000);
    });

    it("cascades unabsorbed equal relief when a beneficiary meal is smaller than the equal share", () => {
        const hostId = "p-alex";
        const bobId = "p-bob";
        const eveId = "p-eve";
        const charlieId = "p-charlie";

        const people: Person[] = [
            { id: hostId, name: "Alex (Host)", sponsorAmount: 0, paidAmount: 0 },
            { id: bobId, name: "Bob", sponsorAmount: 0, paidAmount: 0 },
            { id: eveId, name: "Eve", sponsorAmount: 0, paidAmount: 0 },
            { id: charlieId, name: "Charlie", sponsorAmount: 1600000, paidAmount: 0 },
        ];
        const items: Item[] = [
            { id: "i1", name: "Dish Alex", price: 600000, quantity: 1, assignments: { [hostId]: 1 } },
            { id: "i2", name: "Dish Bob", price: 800000, quantity: 1, assignments: { [bobId]: 1 } },
            { id: "i3", name: "Water Eve", price: 100000, quantity: 1, assignments: { [eveId]: 1 } },
            { id: "i4", name: "Dish Charlie", price: 600000, quantity: 1, assignments: { [charlieId]: 1 } },
        ];

        const { finalPayables, sponsorReliefs, totalBill } = calculateBill({
            people,
            items,
            globalCharges: [],
            hostId
        });

        expect(totalBill).toBe(2100000);
        // Surplus is 1,000,000.
        // Round 1 equal share is 333,333.33.
        // Eve only owes 100k, so her relief is capped at 100k and her payable becomes 0.
        expect(finalPayables[eveId]).toBe(0);
        expect(sponsorReliefs[eveId]).toBe(100000);

        // Remaining 900,000 is split between Alex and Bob (450k each)
        expect(sponsorReliefs[hostId]).toBe(450000);
        expect(sponsorReliefs[bobId]).toBe(450000);

        expect(finalPayables[hostId]).toBe(150000); // 600k - 450k
        expect(finalPayables[bobId]).toBe(350000);  // 800k - 450k
        expect(finalPayables[charlieId]).toBe(1600000);

        const sumPayables = Object.values(finalPayables).reduce((a, b) => a + b, 0);
        expect(Math.abs(sumPayables - totalBill)).toBeLessThan(0.01);
    });

    it("rejects under-sponsoring (< baseline cost) from discounting the participant", () => {
        const hostId = "p-alex";
        const bobId = "p-bob";

        const people: Person[] = [
            { id: hostId, name: "Alex (Host)", sponsorAmount: 0, paidAmount: 0 },
            { id: bobId, name: "Bob", sponsorAmount: 40000, paidAmount: 0 }, // Bob eats 100k but enters 40k sponsor
        ];
        const items: Item[] = [
            { id: "i1", name: "Dish Alex", price: 100000, quantity: 1, assignments: { [hostId]: 1 } },
            { id: "i2", name: "Dish Bob", price: 100000, quantity: 1, assignments: { [bobId]: 1 } },
        ];

        const { finalPayables, invalidSponsors, totalSurplus, totalBill } = calculateBill({
            people,
            items,
            globalCharges: [],
            hostId
        });

        // Bob is marked invalid and cannot self-discount
        expect(invalidSponsors[bobId]).toBeDefined();
        expect(invalidSponsors[bobId].pledged).toBe(40000);
        expect(invalidSponsors[bobId].required).toBe(100000);

        // Bob still owes his full 100k
        expect(finalPayables[bobId]).toBe(100000);
        expect(finalPayables[hostId]).toBe(100000);
        expect(totalSurplus).toBe(0);

        const sumPayables = Object.values(finalPayables).reduce((a, b) => a + b, 0);
        expect(sumPayables).toBe(totalBill);
    });

    it("refunds excess oversubsidy pro-rata to multiple sponsors when surplus exceeds non-sponsor debt", () => {
        const hostId = "p-alex";
        const charlieId = "p-charlie";
        const elenaId = "p-elena";

        const people: Person[] = [
            { id: hostId, name: "Alex (Host)", sponsorAmount: 0, paidAmount: 0 }, // Alex only owes 200k
            { id: charlieId, name: "Charlie", sponsorAmount: 500000, paidAmount: 0 }, // Charlie eats 100k, pledges 500k (400k surplus)
            { id: elenaId, name: "Elena", sponsorAmount: 700000, paidAmount: 0 }, // Elena eats 100k, pledges 700k (600k surplus)
        ];
        const items: Item[] = [
            { id: "i1", name: "Dish Alex", price: 200000, quantity: 1, assignments: { [hostId]: 1 } },
            { id: "i2", name: "Dish Charlie", price: 100000, quantity: 1, assignments: { [charlieId]: 1 } },
            { id: "i3", name: "Dish Elena", price: 100000, quantity: 1, assignments: { [elenaId]: 1 } },
        ];

        const { finalPayables, totalBill } = calculateBill({
            people,
            items,
            globalCharges: [],
            hostId
        });

        expect(totalBill).toBe(400000);
        // Alex's entire 200k bill is covered
        expect(finalPayables[hostId]).toBe(0);

        // Total surplus was 400k + 600k = 1,000,000.
        // Alex only needed 200,000.
        // Unspent excess = 800,000 refunded pro-rata:
        // Charlie gets 40% of 800k = 320,000 refund -> Charlie pays 500k - 320k = 180,000.
        // Elena gets 60% of 800k = 480,000 refund -> Elena pays 700k - 480k = 220,000.
        expect(finalPayables[charlieId]).toBe(180000);
        expect(finalPayables[elenaId]).toBe(220000);

        // Conservation: 0 + 180k + 220k === 400,000 Total Bill
        const sumPayables = Object.values(finalPayables).reduce((a, b) => a + b, 0);
        expect(sumPayables).toBe(totalBill);
    });
});
