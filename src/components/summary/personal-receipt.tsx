'use client';

import React, { useState } from 'react';
import { useBillState } from "@/hooks/useBillState";
import { formatCurrency } from "@/lib/format";
import { getAvatarColor, getInitials } from "@/constants/colors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Receipt,
    User,
    Crown,
    Heart,
    Sparkles,
    CheckCircle2,
    Copy,
    Check,
    ChevronLeft,
    ChevronRight,
    ArrowRight,
    Coins,
    Percent,
    AlertCircle,
    Info,
    Utensils,
    ArrowDownLeft
} from "lucide-react";

export function PersonalReceipt() {
    const {
        people,
        items,
        globalCharges,
        hostId,
        billName,
        location,
        calculate
    } = useBillState();

    const {
        rawCosts,
        totalCosts,
        finalPayables,
        sponsorSurpluses,
        sponsorReliefs,
        totalItemCost,
        settlementFlows,
        totalBill
    } = calculate();

    // Default to the first person or host
    const [selectedPersonId, setSelectedPersonId] = useState<string>(() => {
        if (hostId && people.some(p => p.id === hostId)) return hostId;
        return people[0]?.id || '';
    });
    const [copiedReceipt, setCopiedReceipt] = useState(false);

    // Active selected person (fallback to people[0] if selection is invalid)
    const selectedPerson = people.find(p => p.id === selectedPersonId) || people[0];
    const currentIndex = people.findIndex(p => p.id === selectedPerson?.id);

    if (!selectedPerson || people.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center text-muted-foreground border border-dashed rounded-3xl bg-card/20">
                <User className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm font-semibold">No participants found</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Add participants to view itemized personal receipts.</p>
            </div>
        );
    }

    const isHost = selectedPerson.id === hostId;
    const baseCost = rawCosts[selectedPerson.id] || 0;
    const totalCost = totalCosts[selectedPerson.id] || 0;
    const finalPay = finalPayables[selectedPerson.id] || 0;

    // Sponsorship states
    const surplusAmount = sponsorSurpluses ? (sponsorSurpluses[selectedPerson.id] || 0) : 0;
    const reliefAmount = sponsorReliefs ? (sponsorReliefs[selectedPerson.id] || 0) : 0;
    const isSponsor = Boolean(
        (selectedPerson.sponsorAmount || 0) >= totalCost - 0.0001 &&
        (selectedPerson.sponsorAmount || 0) > 0
    );
    const isUnderPledged = Boolean(
        (selectedPerson.sponsorAmount || 0) > 0 &&
        (selectedPerson.sponsorAmount || 0) < totalCost - 0.0001
    );

    // 1. Calculate line item consumption for selected person
    interface ClaimedItem {
        id: string;
        name: string;
        itemPrice: number;
        pQty: number;
        itemQty: number;
        totalClaimed: number;
        userShare: number;
        shareDesc: string;
    }

    const claimedItems: ClaimedItem[] = [];
    let totalUnassignedPrice = 0;
    const activePersonIds = new Set<string>();

    items.forEach((item) => {
        const assignments = item.assignments || {};
        const assignmentEntries = Object.entries(assignments).filter(([_, pQty]) => pQty > 0);
        const itemQty = item.quantity || 1;
        const itemPrice = item.price;

        if (assignmentEntries.length > 0) {
            assignmentEntries.forEach(([pId]) => activePersonIds.add(pId));
            const totalClaimedQty = assignmentEntries.reduce((sum, [_, q]) => sum + Math.min(q, itemQty), 0);
            const userQty = assignments[selectedPerson.id] || 0;

            if (userQty > 0) {
                const cappedUserQty = Math.min(userQty, itemQty);
                let userShare = 0;
                let shareDesc = "";

                if (totalClaimedQty >= itemQty) {
                    userShare = (cappedUserQty / totalClaimedQty) * itemPrice;
                    const participantCount = assignmentEntries.length;
                    if (participantCount === 1) {
                        shareDesc = `100% (${cappedUserQty}/${itemQty} qty)`;
                    } else {
                        const pct = Math.round((cappedUserQty / totalClaimedQty) * 100);
                        shareDesc = `Split ${participantCount} ways (${pct}% share)`;
                    }
                } else {
                    userShare = (cappedUserQty / itemQty) * itemPrice;
                    const pct = Math.round((cappedUserQty / itemQty) * 100);
                    shareDesc = `${cappedUserQty}/${itemQty} portions (${pct}%)`;
                }

                claimedItems.push({
                    id: item.id,
                    name: item.name,
                    itemPrice,
                    pQty: userQty,
                    itemQty,
                    totalClaimed: totalClaimedQty,
                    userShare,
                    shareDesc
                });
            }

            if (totalClaimedQty < itemQty) {
                const totalAccounted = assignmentEntries.reduce((sum, [_, q]) => sum + (Math.min(q, itemQty) / itemQty) * itemPrice, 0);
                totalUnassignedPrice += Math.max(0, itemPrice - totalAccounted);
            }
        } else {
            totalUnassignedPrice += itemPrice;
        }
    });

    // 2. Communal item split share
    const effectiveSplitterIds = activePersonIds.size > 0
        ? Array.from(activePersonIds)
        : people.map(p => p.id);
    const isCommunalSplitter = effectiveSplitterIds.includes(selectedPerson.id);
    const communalShare = (isCommunalSplitter && totalUnassignedPrice > 0.01 && effectiveSplitterIds.length > 0)
        ? totalUnassignedPrice / effectiveSplitterIds.length
        : 0;

    // 3. Proportional global charges (taxes, tips, fees, discounts)
    const sumAllRaw = Object.values(rawCosts).reduce((a, b) => a + b, 0);
    const personRatio = sumAllRaw > 0 ? (baseCost / sumAllRaw) : (effectiveSplitterIds.length > 0 ? 1 / effectiveSplitterIds.length : 0);

    const allocatedCharges = globalCharges.map(charge => {
        const fullAmount = charge.type === 'percent'
            ? (charge.amount / 100) * totalItemCost
            : charge.amount;
        const userPortion = fullAmount * personRatio;
        return {
            id: charge.id,
            name: charge.name,
            type: charge.type,
            rate: charge.amount,
            fullAmount,
            userPortion
        };
    });

    // 4. Settlement transfer instruction for this person
    const transferFlow = settlementFlows.find(f => f.from === selectedPerson.id || f.to === selectedPerson.id);
    const incomingFromGuests = settlementFlows.filter(f => f.to === selectedPerson.id);
    const totalToCollect = incomingFromGuests.reduce((sum, f) => sum + f.amount, 0);
    const hostPerson = people.find(p => p.id === hostId);

    // Format copyable text receipt for messenger / WhatsApp / Zalo
    const handleCopyReceipt = () => {
        let text = `🧾 RECEIPT BREAKDOWN: ${selectedPerson.name}\n`;
        if (billName) text += `Event: ${billName}\n`;
        if (location) text += `Location: ${location}\n`;
        text += `--------------------------------\n`;
        text += `🍽️ Consumed Items:\n`;
        if (claimedItems.length === 0) {
            text += `  • No individual items claimed\n`;
        } else {
            claimedItems.forEach(item => {
                text += `  • ${item.name} (${item.shareDesc}): ${formatCurrency(item.userShare)}\n`;
            });
        }
        if (communalShare > 0) {
            text += `  • Communal / Shared items: ${formatCurrency(communalShare)}\n`;
        }
        text += `Items Subtotal: ${formatCurrency(baseCost)}\n`;

        if (allocatedCharges.length > 0) {
            text += `\n📋 Proportional Extras & Charges (${(personRatio * 100).toFixed(1)}% share):\n`;
            allocatedCharges.forEach(c => {
                const sign = c.userPortion >= 0 ? '+' : '';
                text += `  • ${c.name}: ${sign}${formatCurrency(c.userPortion)}\n`;
            });
            text += `Baseline Required Cost: ${formatCurrency(totalCost)}\n`;
        }

        if (isSponsor) {
            text += `\n❤️ Sponsor Contribution:\n`;
            text += `  • Baseline Share: ${formatCurrency(totalCost)}\n`;
            text += `  • Pledged Surplus: +${formatCurrency(surplusAmount)}\n`;
            text += `  • Total Pledged: ${formatCurrency(selectedPerson.sponsorAmount)}\n`;
        } else if (reliefAmount > 0) {
            text += `\n🎁 Sponsor Relief: -${formatCurrency(reliefAmount)} (Equal table subsidy)\n`;
        }

        text += `--------------------------------\n`;
        text += `💰 TOTAL TO PAY: ${formatCurrency(finalPay)}\n`;

        if (isHost) {
            text += `👑 Role: Host (Settle venue total: ${formatCurrency(totalBill)})\n`;
            if (incomingFromGuests.length > 0) {
                text += `📥 Collect from Guests (${incomingFromGuests.length} members):\n`;
                incomingFromGuests.forEach(f => {
                    const guest = people.find(p => p.id === f.from);
                    text += `  • Collect ${formatCurrency(f.amount)} from ${guest?.name || 'Guest'}\n`;
                });
            }
        } else if (transferFlow) {
            if (transferFlow.from === selectedPerson.id) {
                text += `👉 Send ${formatCurrency(transferFlow.amount)} to ${hostPerson?.name || 'Host'}\n`;
            } else {
                text += `👈 Host will reimburse ${formatCurrency(transferFlow.amount)}\n`;
            }
        }

        navigator.clipboard.writeText(text);
        setCopiedReceipt(true);
        setTimeout(() => setCopiedReceipt(false), 2000);
    };

    const handlePrev = () => {
        const prevIdx = (currentIndex - 1 + people.length) % people.length;
        setSelectedPersonId(people[prevIdx].id);
    };

    const handleNext = () => {
        const nextIdx = (currentIndex + 1) % people.length;
        setSelectedPersonId(people[nextIdx].id);
    };

    return (
        <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-300">
            {/* Header Controls: Participant Selector & Quick Nav */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-4 bg-muted/20 p-2.5 sm:p-3 rounded-2xl border border-foreground/5 shadow-2xs">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <Receipt className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground truncate">
                            Itemized Receipt
                        </h4>
                        <p className="text-[10px] text-muted-foreground truncate">
                            Line-by-line consumption, proportional extras, and sponsor subsidies
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground shrink-0"
                        onClick={handlePrev}
                        title="Previous participant"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>

                    <div className="w-44 xs:w-52 sm:w-60 shrink-0">
                        <Select value={selectedPerson.id} onValueChange={setSelectedPersonId}>
                            <SelectTrigger className="h-8 text-xs font-semibold rounded-xl bg-card border-border shadow-2xs">
                                <SelectValue placeholder="Select participant" />
                            </SelectTrigger>
                            <SelectContent className="max-h-64 rounded-xl">
                                {people.map(p => {
                                    const pFinal = finalPayables[p.id] || 0;
                                    const isPHost = p.id === hostId;
                                    const isPSponsor = (sponsorSurpluses && sponsorSurpluses[p.id] > 0) || ((p.sponsorAmount || 0) >= (totalCosts[p.id] || 0) && (p.sponsorAmount || 0) > 0);
                                    const isPRelief = sponsorReliefs && sponsorReliefs[p.id] > 0;

                                    return (
                                        <SelectItem key={p.id} value={p.id} className="text-xs font-medium py-1.5 cursor-pointer">
                                            <div className="flex items-center justify-between w-full gap-2 min-w-0">
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    <div className={cn(
                                                        "w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0",
                                                        getAvatarColor(p.name)
                                                    )}>
                                                        {getInitials(p.name)}
                                                    </div>
                                                    <span className="truncate">{p.name}</span>
                                                    {isPHost && (
                                                        <Crown className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                                    )}
                                                    {isPSponsor && (
                                                        <Heart className="w-2.5 h-2.5 text-rose-500 fill-rose-500/40 shrink-0" />
                                                    )}
                                                    {isPRelief && !isPSponsor && (
                                                        <Sparkles className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                                    )}
                                                </div>
                                                <span className="font-mono text-[11px] font-bold text-muted-foreground tabular-nums shrink-0 ml-1">
                                                    {pFinal < 0.01 ? "✓ 0 ₫" : formatCurrency(pFinal)}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground shrink-0"
                        onClick={handleNext}
                        title="Next participant"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs font-bold rounded-xl border-foreground/10 hover:bg-primary/10 hover:text-primary shrink-0 px-2 sm:px-3"
                        onClick={handleCopyReceipt}
                        title="Copy participant breakdown to clipboard"
                    >
                        {copiedReceipt ? (
                            <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="hidden xs:inline">Copied</span>
                            </>
                        ) : (
                            <>
                                <Copy className="w-3.5 h-3.5" />
                                <span className="hidden xs:inline">Copy Text</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Receipt Card Design */}
            <div className="relative rounded-3xl border border-foreground/10 bg-gradient-to-b from-card via-card/90 to-card/70 backdrop-blur-md p-4 sm:p-7 shadow-lg shadow-black/5 overflow-hidden">
                {/* Decorative Background Stamp */}
                <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-primary/5 pointer-events-none blur-3xl" />

                {/* Participant Identity Header */}
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-dashed border-border/80">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                            "w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-white font-black text-sm sm:text-base shadow-sm border border-white/20 shrink-0",
                            getAvatarColor(selectedPerson.name)
                        )}>
                            {getInitials(selectedPerson.name)}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                <h3 className="font-black text-base sm:text-lg text-foreground truncate" title={selectedPerson.name}>
                                    {selectedPerson.name}
                                </h3>
                                {isHost && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-[10px] font-bold shrink-0">
                                        <Crown className="w-3 h-3" /> Host
                                    </span>
                                )}
                                {isSponsor && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25 text-[10px] font-bold shrink-0">
                                        <Heart className="w-3 h-3 fill-rose-500/30" /> Sponsor
                                    </span>
                                )}
                                {reliefAmount > 0 && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-[10px] font-bold shrink-0">
                                        <Sparkles className="w-3 h-3" /> Relief Beneficiary
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                {selectedPerson.email || (billName ? `Session: ${billName}` : 'Session Member')}
                            </p>
                        </div>
                    </div>

                    <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Final Payable
                        </span>
                        <span className="text-base sm:text-xl font-black text-primary tabular-nums block">
                            {finalPay < 0.01 ? "✓ 0 ₫ (Paid)" : formatCurrency(finalPay)}
                        </span>
                    </div>
                </div>

                {/* Section 1: Itemized Consumption Breakdown */}
                <div className="py-4 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <Utensils className="w-3.5 h-3.5 text-primary" /> Consumed Items ({claimedItems.length})
                        </span>
                        <span>Your Share</span>
                    </div>

                    {claimedItems.length === 0 ? (
                        <div className="py-3 px-3.5 rounded-xl bg-muted/20 border border-border/40 text-xs text-muted-foreground italic flex items-center gap-2">
                            <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            No individual items assigned to this participant.
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {claimedItems.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors border border-border/40 text-xs"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-semibold text-foreground truncate">{item.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                                            <span className="font-mono">{formatCurrency(item.itemPrice)}</span>
                                            <span>•</span>
                                            <span className="text-primary/90 font-medium">{item.shareDesc}</span>
                                        </div>
                                    </div>
                                    <div className="font-bold text-foreground tabular-nums shrink-0 text-right">
                                        {formatCurrency(item.userShare)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Communal Unassigned Share (if any) */}
                    {communalShare > 0 && (
                        <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-primary/[0.03] border border-primary/15 text-xs">
                            <div className="min-w-0 flex-1">
                                <span className="font-semibold text-foreground flex items-center gap-1.5">
                                    <Coins className="w-3 h-3 text-primary" /> Communal & Unassigned Items Split
                                </span>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Split equally among {effectiveSplitterIds.length} active dining members
                                </p>
                            </div>
                            <div className="font-bold text-foreground tabular-nums shrink-0 text-right">
                                +{formatCurrency(communalShare)}
                            </div>
                        </div>
                    )}

                    {/* Base Consumption Subtotal */}
                    <div className="flex items-center justify-between pt-1 px-1 text-xs">
                        <span className="font-semibold text-muted-foreground">Items Subtotal</span>
                        <span className="font-bold text-foreground tabular-nums">{formatCurrency(baseCost)}</span>
                    </div>
                </div>

                {/* Section 2: Proportional Taxes, Fees & Adjustments */}
                {allocatedCharges.length > 0 && (
                    <div className="py-3.5 border-t border-dashed border-border/80 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <Percent className="w-3.5 h-3.5 text-amber-500" /> Proportional Extras & Charges
                            </span>
                            <span className="text-[10px] text-muted-foreground font-medium">
                                Based on {(personRatio * 100).toFixed(1)}% meal share
                            </span>
                        </div>

                        <div className="space-y-1">
                            {allocatedCharges.map(charge => {
                                const isPositive = charge.userPortion >= 0;
                                return (
                                    <div key={charge.id} className="flex items-center justify-between text-xs py-1 px-1">
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            <span>{charge.name}</span>
                                            {charge.type === 'percent' && (
                                                <span className="text-[10px] px-1 py-0.2 rounded bg-muted font-mono">
                                                    {charge.rate}%
                                                </span>
                                            )}
                                        </div>
                                        <span className={cn("font-semibold tabular-nums", isPositive ? "text-foreground" : "text-emerald-600 dark:text-emerald-400")}>
                                            {isPositive ? `+${formatCurrency(charge.userPortion)}` : formatCurrency(charge.userPortion)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Baseline Required Total */}
                        <div className="flex items-center justify-between pt-1.5 px-1 text-xs font-bold border-t border-border/40">
                            <span className="text-foreground">Required Baseline (Before Sponsorship)</span>
                            <span className="text-foreground tabular-nums">{formatCurrency(totalCost)}</span>
                        </div>
                    </div>
                )}

                {/* Section 3: Sponsorship or Relief Impact */}
                <div className="py-3.5 border-t border-dashed border-border/80 space-y-2">
                    {isSponsor ? (
                        <div className="p-3 sm:p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                                    <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" /> Generous Sponsor Contribution
                                </span>
                                <span className="text-xs font-black text-rose-700 dark:text-rose-400 tabular-nums">
                                    +{formatCurrency(surplusAmount)} Gift
                                </span>
                            </div>
                            <p className="text-[11px] text-rose-900/80 dark:text-rose-200/80 leading-relaxed">
                                You pledged <span className="font-bold">{formatCurrency(selectedPerson.sponsorAmount)}</span>, covering your own <span className="font-bold">{formatCurrency(totalCost)}</span> meal and gifting <span className="font-bold">{formatCurrency(surplusAmount)}</span> to relieve fellow diners. Your liability is capped at your pledge.
                            </p>
                        </div>
                    ) : isUnderPledged ? (
                        <div className="p-3 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Pledged Below Consumption
                                </span>
                                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                                    {formatCurrency(selectedPerson.sponsorAmount)} / {formatCurrency(totalCost)}
                                </span>
                            </div>
                            <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                                Pledge is less than your required baseline. Minimum sponsor pledge required to activate table subsidy is <span className="font-bold">{formatCurrency(totalCost)}</span>. Currently billed at baseline share.
                            </p>
                        </div>
                    ) : reliefAmount > 0 ? (
                        <div className="p-3 sm:p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" /> Sponsor Relief Received
                                </span>
                                <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                                    -{formatCurrency(reliefAmount)}
                                </span>
                            </div>
                            <p className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80 leading-relaxed">
                                Thanks to our group sponsors, you received an equitable flat relief of <span className="font-bold">-{formatCurrency(reliefAmount)}</span>, reducing your payable from <span className="line-through opacity-75">{formatCurrency(totalCost)}</span> down to <span className="font-bold">{formatCurrency(finalPay)}</span>.
                            </p>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between text-xs py-1 px-1 text-muted-foreground">
                            <span>Sponsorship Adjustments</span>
                            <span className="font-medium">—</span>
                        </div>
                    )}
                </div>

                {/* Section 4: Final Settlement Summary & Peer Instructions */}
                <div className="pt-4 border-t-2 border-border/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-muted/20 -mx-4 -mb-4 sm:-mx-7 sm:-mb-7 p-4 sm:p-6 rounded-b-3xl">
                    <div className="space-y-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                            Total Payment Due
                        </span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl sm:text-3xl font-black text-foreground tabular-nums">
                                {formatCurrency(finalPay)}
                            </span>
                            {finalPay < 0.01 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Covered
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col sm:items-end justify-center">
                        {isHost ? (
                            <div className="flex flex-col items-start sm:items-end gap-1">
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-bold text-amber-600 dark:text-amber-400">
                                    <Crown className="w-3.5 h-3.5" />
                                    <span>Host: Settles Venue Total ({formatCurrency(totalBill)})</span>
                                </div>
                                {incomingFromGuests.length > 0 && (
                                    <span className="text-[11px] font-semibold text-muted-foreground">
                                        Collects <span className="font-bold text-foreground">{formatCurrency(totalToCollect)}</span> from {incomingFromGuests.length} members
                                    </span>
                                )}
                            </div>
                        ) : transferFlow ? (
                            transferFlow.from === selectedPerson.id ? (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-bold text-primary">
                                    <ArrowRight className="w-3.5 h-3.5" />
                                    <span>Pay {formatCurrency(transferFlow.amount)} to {hostPerson?.name || 'Host'}</span>
                                </div>
                            ) : (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                    <ArrowDownLeft className="w-3.5 h-3.5" />
                                    <span>Host will reimburse {formatCurrency(transferFlow.amount)}</span>
                                </div>
                            )
                        ) : (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-xs font-semibold text-muted-foreground">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>No transfers required</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
