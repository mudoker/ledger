'use client';

import { useBillState } from "@/hooks/useBillState";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Receipt, Users, ArrowUpRight } from "lucide-react";

export function QuickInsights() {
    const { people, items, calculate } = useBillState();
    const { totalBill, totalExtras } = calculate();

    if (people.length === 0 && items.length === 0) return null;

    const avgCommitment = totalBill / (people.length || 1);

    return (
        <div className="insights-grid animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Total Bill Card */}
            <Card className="bg-card/70 backdrop-blur-xs border border-border/60 rounded-2xl shadow-none hover:border-foreground/20 transition-all group overflow-hidden">
                <CardContent className="p-3 relative">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-primary" /> Total Session Bill
                        </span>
                        <ArrowUpRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-base sm:text-lg font-bold text-foreground tabular-nums truncate max-w-full">
                            {formatCurrency(totalBill)}
                        </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5 truncate" title={totalExtras > 0 ? `Includes +${formatCurrency(totalExtras)} charges` : 'No extra charges'}>
                        {totalExtras > 0 ? (
                            <>
                                Includes <span className="font-semibold text-amber-600 dark:text-amber-400">+{formatCurrency(totalExtras)}</span> charges
                            </>
                        ) : (
                            'No extra charges'
                        )}
                    </p>
                </CardContent>
            </Card>

            {/* Average Per Person Card */}
            <Card className="bg-card/70 backdrop-blur-xs border border-border/60 rounded-2xl shadow-none hover:border-foreground/20 transition-all group overflow-hidden">
                <CardContent className="p-3 relative">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-primary" /> Avg. per Person
                        </span>
                        <ArrowUpRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-base sm:text-lg font-bold text-foreground tabular-nums truncate max-w-full">
                            {formatCurrency(avgCommitment)}
                        </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/75 mt-0.5 truncate">
                        {people.length} active {people.length === 1 ? 'member' : 'members'}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
