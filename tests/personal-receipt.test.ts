import { describe, it, expect } from "bun:test";
import { calculateBill } from "@/hooks/useBillState";
import type { Person, Item, GlobalCharge } from "@/store/useBillStore";

describe("Itemized Personal Breakdown & Receipt Invariants", () => {
    it("line-by-line item consumption + communal split equals baseline raw costs", () => {
        const people: Person[] = [
            { id: "alice", name: "Alice", sponsorAmount: 0, paidAmount: 0 },
            { id: "bob", name: "Bob", sponsorAmount: 0, paidAmount: 0 },
            { id: "carol", name: "Carol", sponsorAmount: 0, paidAmount: 0 },
        ];

        const items: Item[] = [
            { id: "item1", name: "Steak (Alice sole)", price: 150_000, quantity: 1, assignments: { alice: 1 } },
            { id: "item2", name: "Pizza (Bob & Carol split)", price: 200_000, quantity: 1, assignments: { bob: 1, carol: 1 } },
            { id: "item3", name: "Shared Salad (Unassigned communal)", price: 90_000, quantity: 1, assignments: {} },
        ];

        const globalCharges: GlobalCharge[] = [
            { id: "tax", name: "VAT", amount: 10, type: "percent" },
            { id: "svc", name: "Service", amount: 14_000, type: "fixed" },
        ];

        const res = calculateBill({
            people,
            items,
            globalCharges,
            hostId: "alice",
        });

        // 1. Steak: Alice gets 150,000
        // 2. Pizza: Bob gets 100,000, Carol gets 100,000
        // 3. Communal Salad: 90,000 / 3 active members = 30,000 each
        // Baseline raw costs:
        // Alice: 150,000 + 30,000 = 180,000
        // Bob: 100,000 + 30,000 = 130,000
        // Carol: 100,000 + 30,000 = 130,000
        expect(res.rawCosts["alice"]).toBe(180_000);
        expect(res.rawCosts["bob"]).toBe(130_000);
        expect(res.rawCosts["carol"]).toBe(130_000);

        // Total item cost = 150k + 200k + 90k = 440k
        expect(res.totalItemCost).toBe(440_000);

        // Total extras = 10% of 440k (44,000) + 14,000 = 58,000
        expect(res.totalExtras).toBe(58_000);

        // Proportional extras share:
        // Sum raw = 440,000
        // Alice ratio: 180 / 440 = 40.909%
        // Alice extras = 58,000 * (180/440) = 23,727.27
        // Bob ratio: 130 / 440 = 29.545%
        // Bob extras = 58,000 * (130/440) = 17,136.36
        // Carol extras = 58,000 * (130/440) = 17,136.36
        const aliceExtra = (180_000 / 440_000) * 58_000;
        const bobExtra = (130_000 / 440_000) * 58_000;
        expect(Math.abs(res.totalCosts["alice"] - (180_000 + aliceExtra))).toBeLessThan(0.01);
        expect(Math.abs(res.totalCosts["bob"] - (130_000 + bobExtra))).toBeLessThan(0.01);
        expect(Math.abs(res.totalCosts["carol"] - (130_000 + bobExtra))).toBeLessThan(0.01);

        // Total bill: 440,000 + 58,000 = 498,000
        expect(res.totalBill).toBe(498_000);
        const sumFinal = Object.values(res.finalPayables).reduce((a, b) => a + b, 0);
        expect(Math.abs(sumFinal - res.totalBill)).toBeLessThan(0.01);
    });

    it("transparently reflects sponsorship pledge and equal table relief in final payables", () => {
        const people: Person[] = [
            { id: "sponsor_sam", name: "Sam (Sponsor)", sponsorAmount: 300_000, paidAmount: 0 },
            { id: "guest_ben", name: "Ben", sponsorAmount: 0, paidAmount: 0 },
            { id: "guest_cloe", name: "Cloe", sponsorAmount: 0, paidAmount: 0 },
        ];

        const items: Item[] = [
            { id: "i1", name: "Dishes", price: 300_000, quantity: 1, assignments: { sponsor_sam: 1, guest_ben: 1, guest_cloe: 1 } },
        ];

        const res = calculateBill({
            people,
            items,
            globalCharges: [],
            hostId: "sponsor_sam",
        });

        // Sam ordered 100k, pledged 300k -> surplus = 200k
        expect(res.sponsorSurpluses["sponsor_sam"]).toBe(200_000);
        expect(res.finalPayables["sponsor_sam"]).toBe(300_000);

        // Ben and Cloe each owed 100k. Surplus 200k / 2 = 100k equal relief each!
        expect(res.sponsorReliefs["guest_ben"]).toBe(100_000);
        expect(res.sponsorReliefs["guest_cloe"]).toBe(100_000);
        expect(res.finalPayables["guest_ben"]).toBe(0);
        expect(res.finalPayables["guest_cloe"]).toBe(0);

        // Conservation
        expect(res.finalPayables["sponsor_sam"] + res.finalPayables["guest_ben"] + res.finalPayables["guest_cloe"]).toBe(300_000);
    });
});
