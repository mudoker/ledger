import { useBillStore, type Person, type Item, type GlobalCharge } from "@/store/useBillStore";

export interface BillCalculationParams {
    people: Person[];
    items: Item[];
    globalCharges: GlobalCharge[];
    hostId: string | null;
}

export function calculateBill({ people, items, globalCharges, hostId }: BillCalculationParams) {
    // STEP 1: Calculate BASE item costs per person (before extras)
    const rawCosts: Record<string, number> = {};
    let totalItemCost = 0;
    let totalUnassignedPrice = 0;
    const activePersonIds = new Set<string>();

    items.forEach((item) => {
        const assignments = item.assignments || {};
        const assignmentEntries = Object.entries(assignments).filter(([_, pQty]) => pQty > 0);
        const itemQty = Math.max(1, item.quantity || 1);
        const lineTotal = (item as any).totalPrice !== undefined && (item as any).totalPrice !== null
            ? Number((item as any).totalPrice)
            : Number(item.price || 0) * itemQty;
        totalItemCost += lineTotal;

        if (assignmentEntries.length > 0) {
            assignmentEntries.forEach(([pId]) => activePersonIds.add(pId));
            const totalClaimedQty = assignmentEntries.reduce((sum, [_, pQty]) => {
                return sum + Math.min(pQty, itemQty);
            }, 0);

            if (totalClaimedQty >= itemQty) {
                assignmentEntries.forEach(([pId, pQty]) => {
                    const cappedPQty = Math.min(pQty, itemQty);
                    const share = (cappedPQty / totalClaimedQty) * lineTotal;
                    rawCosts[pId] = (rawCosts[pId] || 0) + share;
                });
            } else {
                let totalAccountedFor = 0;
                assignmentEntries.forEach(([pId, pQty]) => {
                    const cappedPQty = Math.min(pQty, itemQty);
                    const share = (cappedPQty / itemQty) * lineTotal;
                    rawCosts[pId] = (rawCosts[pId] || 0) + share;
                    totalAccountedFor += share;
                });
                totalUnassignedPrice += Math.max(0, lineTotal - totalAccountedFor);
            }
        } else {
            totalUnassignedPrice += lineTotal;
        }
    });

    const effectiveSplitterIds = activePersonIds.size > 0
        ? Array.from(activePersonIds)
        : people.map(p => p.id);

    if (totalUnassignedPrice > 0.01 && effectiveSplitterIds.length > 0) {
        const sharedShare = totalUnassignedPrice / effectiveSplitterIds.length;
        effectiveSplitterIds.forEach(id => {
            rawCosts[id] = (rawCosts[id] || 0) + sharedShare;
        });
    }

    let totalExtras = 0;
    globalCharges.forEach(charge => {
        if (charge.type === 'percent') {
            totalExtras += (charge.amount / 100) * totalItemCost;
        } else {
            totalExtras += charge.amount;
        }
    });

    const sumOfAllRawCosts = Object.values(rawCosts).reduce((a, b) => a + b, 0);

    const totalCosts: Record<string, number> = {};
    people.forEach((p) => {
        const baseCost = rawCosts[p.id] || 0;
        if (sumOfAllRawCosts > 0) {
            const ratio = baseCost / sumOfAllRawCosts;
            totalCosts[p.id] = baseCost + (totalExtras * ratio);
        } else if (effectiveSplitterIds.length > 0) {
            if (effectiveSplitterIds.includes(p.id)) {
                totalCosts[p.id] = totalExtras / effectiveSplitterIds.length;
            } else {
                totalCosts[p.id] = 0;
            }
        } else {
            totalCosts[p.id] = 0;
        }
    });

    // STEP 3: Multi-Sponsor & Equitable Equal Relief Calculation
    const finalPayables: Record<string, number> = {};
    const sponsorSurpluses: Record<string, number> = {};
    const sponsorReliefs: Record<string, number> = {};
    const invalidSponsors: Record<string, { pledged: number; required: number }> = {};
    let totalSurplus = 0;

    // Stage A: Classify Sponsors vs Non-Sponsors
    people.forEach((p) => {
        const cost = totalCosts[p.id] || 0;
        const sponsor = p.sponsorAmount || 0;

        if (sponsor > 0) {
            if (sponsor >= cost - 0.0001) {
                // Valid Sponsor:
                // 1. Their liability is CAPPED at their pledge (owes nothing more):
                finalPayables[p.id] = sponsor;
                // 2. Surplus contributed to the group pool:
                const surplus = sponsor - cost;
                sponsorSurpluses[p.id] = surplus;
                totalSurplus += surplus;
            } else {
                // Invalid Sponsor (pledged less than required consumption share):
                // Cannot self-discount; owes baseline required cost.
                invalidSponsors[p.id] = { pledged: sponsor, required: cost };
                finalPayables[p.id] = cost;
            }
        } else {
            // Non-sponsor: Baseline payable is their cost
            finalPayables[p.id] = cost;
        }
    });

    // Stage B: Distribute Pooled Surplus Equally among Non-Sponsor Beneficiaries (with Capping & Cascading)
    if (totalSurplus > 0) {
        let remainingSurplus = totalSurplus;
        // Candidate beneficiaries: non-sponsors with positive obligations
        let activeBeneficiaryIds = people
            .filter(p => !((p.sponsorAmount || 0) >= (totalCosts[p.id] || 0) - 0.0001 && (p.sponsorAmount || 0) > 0))
            .map(p => p.id)
            .filter(id => finalPayables[id] > 0);

        while (remainingSurplus > 0.001 && activeBeneficiaryIds.length > 0) {
            const equalShare = remainingSurplus / activeBeneficiaryIds.length;
            let surplusDeductedThisRound = 0;
            const nextRoundIds: string[] = [];

            for (const id of activeBeneficiaryIds) {
                const currentDue = finalPayables[id];
                if (currentDue <= equalShare + 0.0001) {
                    // Fully relieved
                    surplusDeductedThisRound += currentDue;
                    sponsorReliefs[id] = (sponsorReliefs[id] || 0) + currentDue;
                    finalPayables[id] = 0;
                } else {
                    // Partially relieved
                    surplusDeductedThisRound += equalShare;
                    sponsorReliefs[id] = (sponsorReliefs[id] || 0) + equalShare;
                    finalPayables[id] -= equalShare;
                    nextRoundIds.push(id);
                }
            }

            remainingSurplus -= surplusDeductedThisRound;
            if (surplusDeductedThisRound < 0.0001) break;
            activeBeneficiaryIds = nextRoundIds;
        }

        // Stage C: Multi-Sponsor Oversubsidy Refund
        // If the pooled surplus exceeds total non-sponsor debt, refund the unspent surplus pro-rata to sponsors
        if (remainingSurplus > 0.001) {
            const contributingSponsors = people.filter(p => (sponsorSurpluses[p.id] || 0) > 0);
            const sumSurplus = contributingSponsors.reduce((sum, p) => sum + (sponsorSurpluses[p.id] || 0), 0);
            if (sumSurplus > 0) {
                contributingSponsors.forEach(p => {
                    const mySurplus = sponsorSurpluses[p.id] || 0;
                    const refund = (mySurplus / sumSurplus) * remainingSurplus;
                    finalPayables[p.id] = Math.max(totalCosts[p.id] || 0, finalPayables[p.id] - refund);
                });
            }
            totalSurplus -= remainingSurplus;
        }
    }

    // STEP 4: Net Settlement Calculation (Multi-creditor support)
    const totalBill = totalItemCost + totalExtras;
    let discrepancy = 0;

    // Determine effective paid amounts
    const effectivePaidAmounts: Record<string, number> = {};
    let totalPaidInBill = 0;

    // Calculate total paid by everyone EXCEPT host
    let othersPaid = 0;
    people.forEach(p => {
        if (p.id !== hostId) {
            othersPaid += (p.paidAmount || 0);
        }
    });

    // Determine Host's effective paid amount
    people.forEach(p => {
        if (p.id === hostId) {
            // Host Payment = Total Bill - (Sum of what everyone else paid)
            effectivePaidAmounts[p.id] = Math.max(0, totalBill - othersPaid);
        } else {
            effectivePaidAmounts[p.id] = p.paidAmount || 0;
        }
        totalPaidInBill += effectivePaidAmounts[p.id];
    });

    const totalNetPayable = Object.values(finalPayables).reduce((acc, val) => acc + val, 0);
    discrepancy = totalPaidInBill - totalNetPayable;

    // Auto-correct any slight floating-point discrepancy on Host
    if (Math.abs(discrepancy) > 0.001 && hostId) {
        effectivePaidAmounts[hostId] -= discrepancy;
        discrepancy = 0;
    }

    const settlementBalances: Record<string, number> = {};
    people.forEach(p => {
        const whatTheyOwe = finalPayables[p.id] || 0;
        const whatTheyPaid = effectivePaidAmounts[p.id] || 0;

        settlementBalances[p.id] = whatTheyPaid - whatTheyOwe;
    });

    const flows: Array<{ from: string, to: string, amount: number }> = [];
    // HUB AND SPOKE MODEL:
    // Everyone settles with the Host directly.
    // - If you owe money (Balance < 0), you pay the Host.
    // - If you are owed money (Balance > 0), the Host pays you.
    people.forEach(p => {
        if (p.id === hostId) return; // Skip Host (they are the hub)

        const balance = settlementBalances[p.id] || 0;

        if (balance < -0.01) {
            // Debtor: Pays Host
            flows.push({ from: p.id, to: hostId!, amount: Math.abs(balance) });
        } else if (balance > 0.01) {
            // Creditor: Receives from Host
            flows.push({ from: hostId!, to: p.id, amount: balance });
        }
    });

    return {
        rawCosts,
        totalCosts,
        finalPayables,
        sponsorSurpluses,
        sponsorReliefs,
        invalidSponsors,
        totalItemCost,
        totalBill,
        totalExtras,
        totalSurplus,
        discrepancy,
        settlementFlows: flows
    };
}

export const useBillState = () => {
    const store = useBillStore();
    const calculate = () => calculateBill({
        people: store.people,
        items: store.items,
        globalCharges: store.globalCharges,
        hostId: store.hostId
    });

    return {
        ...store,
        calculate
    };
};
