import { useBillState } from "@/hooks/useBillState";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableIcon, PieChartIcon, CheckCircle2, AlertTriangle, Receipt, TrendingUp, LayoutGrid, ArrowRight, QrCode } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import { CostPieChart, buildChartData } from "./summary-charts";
import { PersonalReceipt } from "./personal-receipt";

export function SummarySection() {
    const {
        people,
        items,
        globalCharges,
        hostId,
        calculate,
        qrCode,
    } = useBillState();

    const { totalCosts, finalPayables, sponsorSurpluses, sponsorReliefs, totalBill, totalExtras, totalSurplus, totalItemCost, settlementFlows } = calculate();
    const { pieData, itemCostData } = buildChartData(people, items, totalCosts, finalPayables);

    // Verification: sum of all final payables should strictly equal total bill
    const sumFinalPayables = Object.values(finalPayables).reduce((a, b) => a + b, 0);
    const verificationDiff = Math.abs(totalBill - sumFinalPayables);
    const isBalanced = verificationDiff < 1; // within 1 dong rounding tolerance

    return (
        <Card id="summary-card" className="w-full h-full flex flex-col min-h-0 border-none shadow-none md:border md:shadow-sm bg-background overflow-hidden">
            <CardContent className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col pt-1 sm:pt-3">
                <ScrollArea className="flex-1 min-h-0 h-full px-1.5 xs:px-2.5 sm:px-4 md:px-6">
                    <div className="space-y-2.5 sm:space-y-5 pt-1 pb-4 sm:py-5 pr-0.5 sm:pr-2">
                        {/* Optional Host QR Pay Trigger */}
                        {qrCode && (
                            <div className="flex justify-end pb-0.5">
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs font-bold gap-1.5 text-foreground hover:bg-primary/10 hover:text-primary transition-all border-foreground/10 px-2.5 rounded-xl"
                                            title="Show Host Payment QR"
                                        >
                                            <QrCode className="w-3.5 h-3.5 text-primary" />
                                            <span>Pay Host QR</span>
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="w-[calc(100vw-28px)] sm:w-full max-w-sm rounded-2xl border-border bg-card shadow-2xl p-4 sm:p-6">
                                        <DialogHeader>
                                            <DialogTitle className="text-base sm:text-lg font-black uppercase tracking-wider flex items-center gap-2 text-primary">
                                                <QrCode className="w-5 h-5" /> Host Payment
                                            </DialogTitle>
                                        </DialogHeader>
                                        <div className="flex flex-col items-center justify-center p-4 gap-3">
                                            <div className="w-full aspect-square max-w-[260px] bg-white rounded-xl overflow-hidden border border-foreground/10 p-2 shadow-sm">
                                                <img src={qrCode} alt="Host Payment QR" className="w-full h-full object-contain" />
                                            </div>
                                            <p className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                                Scan to pay the host directly
                                            </p>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        )}
                        {/* Summary Stats */}
                        <div className="grid grid-cols-3 gap-1 xs:gap-1.5 sm:gap-3">
                            <div className="bg-card/30 rounded-xl sm:rounded-2xl p-1.5 xs:p-2 sm:p-4 border border-foreground/5 transition-all hover:border-primary/20 group min-w-0" title={`Items Subtotal: ${formatCurrency(totalItemCost)}`}>
                                <div className="text-[8px] xs:text-[9px] sm:text-[10px] text-muted-foreground uppercase font-black tracking-wider sm:tracking-widest mb-0.5 sm:mb-1 group-hover:text-primary transition-colors truncate">Items</div>
                                <div className="text-[10px] xs:text-xs sm:text-sm font-bold text-foreground tabular-nums truncate tracking-tight">{formatCurrency(totalItemCost)}</div>
                            </div>
                            <div className="bg-amber-500/10 rounded-xl sm:rounded-2xl p-1.5 xs:p-2 sm:p-4 border border-amber-500/20 transition-all hover:bg-amber-500/20 min-w-0" title={`Extras/Taxes: ${formatCurrency(totalExtras)}`}>
                                <div className="text-[8px] xs:text-[9px] sm:text-[10px] text-amber-600 dark:text-amber-400 uppercase font-black tracking-wider sm:tracking-widest mb-0.5 sm:mb-1 truncate">Extras</div>
                                <div className="text-[10px] xs:text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums truncate tracking-tight">+{formatCurrency(totalExtras)}</div>
                            </div>
                            <div className="relative overflow-hidden bg-primary/10 rounded-xl sm:rounded-2xl p-1.5 xs:p-2 sm:p-4 border border-primary/20 transition-all hover:bg-primary/20 group text-primary min-w-0" title={`Total Bill: ${formatCurrency(totalBill)}`}>
                                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
                                <div className="text-[8px] xs:text-[9px] sm:text-[10px] uppercase font-black tracking-wider sm:tracking-[0.2em] mb-0.5 sm:mb-1 opacity-90 text-primary truncate">Total Bill</div>
                                <div className="text-[11px] xs:text-xs sm:text-sm md:text-xl font-black tabular-nums tracking-tight drop-shadow-sm text-primary truncate">{formatCurrency(totalBill)}</div>
                            </div>
                        </div>

                        {totalSurplus > 0.01 && (
                            <div className="bg-primary/5 rounded-xl p-2 sm:p-3 border border-primary/20 flex items-center justify-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary shrink-0" />
                                <span className="text-[11px] sm:text-xs text-primary font-black uppercase tracking-tight text-center">
                                    Sponsor surplus: {formatCurrency(totalSurplus)} (distributed equally)
                                </span>
                            </div>
                        )}

                        {/* Tabbed Content */}
                        <Tabs defaultValue="table" className="w-full">
                            <TabsList className="grid w-full grid-cols-3 h-8 sm:h-10 bg-muted/20 p-0.5 sm:p-1 border border-foreground/5 rounded-xl">
                                <TabsTrigger value="table" className="text-[10px] xs:text-[11px] sm:text-xs px-1 sm:px-2 gap-1 sm:gap-1.5 font-bold uppercase transition-all data-[state=active]:bg-background data-[state=active]:text-primary py-1 min-w-0">
                                    <TableIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" /> <span className="truncate">Splits</span>
                                </TabsTrigger>
                                <TabsTrigger value="pie" className="text-[10px] xs:text-[11px] sm:text-xs px-1 sm:px-2 gap-1 sm:gap-1.5 font-bold uppercase transition-all data-[state=active]:bg-background data-[state=active]:text-primary py-1 min-w-0">
                                    <PieChartIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" /> <span className="truncate">Charts</span>
                                </TabsTrigger>
                                <TabsTrigger value="receipt" className="text-[10px] xs:text-[11px] sm:text-xs px-1 sm:px-2 gap-1 sm:gap-1.5 font-bold uppercase transition-all data-[state=active]:bg-background data-[state=active]:text-primary py-1 min-w-0">
                                    <Receipt className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" /> <span className="truncate">Breakdown</span>
                                </TabsTrigger>
                            </TabsList>

                            {/* TABLE TAB */}
                            <TabsContent value="table" className="mt-3 sm:mt-4 space-y-3.5 sm:space-y-6">
                                <div className="rounded-xl sm:rounded-2xl border border-foreground/5 bg-card/30 overflow-hidden shadow-sm shadow-black/5">
                                    <div className="overflow-x-auto w-full">
                                        <Table className="w-full min-w-[280px]">
                                            <TableHeader>
                                                <TableRow className="bg-muted/40 border-b border-border/80">
                                                    <TableHead className="px-2 xs:px-2.5 sm:px-4 py-2 sm:py-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wider sm:tracking-widest text-foreground/75 dark:text-muted-foreground">Participant</TableHead>
                                                    <TableHead className="text-right px-1.5 xs:px-2.5 sm:px-4 py-2 sm:py-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wider sm:tracking-widest text-foreground/75 dark:text-muted-foreground whitespace-nowrap">Subtotal</TableHead>
                                                    <TableHead className="text-right px-1.5 xs:px-2.5 sm:px-4 py-2 sm:py-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wider sm:tracking-widest text-foreground/75 dark:text-muted-foreground whitespace-nowrap">Sponsor / Relief</TableHead>
                                                    <TableHead className="text-right px-2 xs:px-2.5 sm:px-4 py-2 sm:py-3 text-[9px] sm:text-[10px] font-black uppercase tracking-wider sm:tracking-widest text-primary whitespace-nowrap">Final Pay</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {people.length === 0 && (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="text-center text-muted-foreground h-20 text-xs sm:text-sm font-medium italic">
                                                            No participants yet...
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                                {people.map((p) => {
                                                    const total = totalCosts[p.id] || 0;
                                                    const pay = finalPayables[p.id] || 0;
                                                    const isAppMember = Boolean(p.userId || p.email);
                                                    return (
                                                        <TableRow key={p.id} className="hover:bg-primary/[0.02] transition-colors border-b border-border/40 last:border-0">
                                                            <TableCell className="font-bold px-2 xs:px-2.5 sm:px-4 py-2 sm:py-2.5">
                                                                <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                                                                    <span className="truncate max-w-[70px] xs:max-w-[100px] sm:max-w-[160px] block text-xs sm:text-sm" title={p.name}>{p.name}</span>
                                                                    {isAppMember ? (
                                                                        <span className="text-[7px] xs:text-[8px] font-black uppercase px-1 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                                                                            Member
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[7px] xs:text-[8px] font-black uppercase px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border shrink-0">
                                                                            Anon
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right text-foreground/85 dark:text-muted-foreground px-1.5 xs:px-2.5 sm:px-4 py-2 sm:py-2.5 whitespace-nowrap text-xs font-semibold tabular-nums">
                                                                {formatCurrency(total)}
                                                            </TableCell>
                                                            <TableCell className="text-right px-1.5 xs:px-2.5 sm:px-4 py-2 sm:py-2.5 whitespace-nowrap text-xs tabular-nums">
                                                                {(() => {
                                                                    const surplus = sponsorSurpluses ? (sponsorSurpluses[p.id] || 0) : 0;
                                                                    const relief = sponsorReliefs ? (sponsorReliefs[p.id] || 0) : 0;
                                                                    const upfront = p.paidAmount || 0;

                                                                    if (surplus > 0) {
                                                                        const netSurplus = surplus - upfront;
                                                                        return (
                                                                            <span className="text-rose-600 dark:text-rose-400 font-bold" title={`Pledged ${formatCurrency(p.sponsorAmount || 0)}${upfront > 0 ? ` (paid upfront ${formatCurrency(upfront)})` : ''}`}>
                                                                                {netSurplus >= 0 ? `+${formatCurrency(netSurplus)}` : `-${formatCurrency(Math.abs(netSurplus))}`}
                                                                            </span>
                                                                        );
                                                                    }

                                                                    const totalDeduction = relief + upfront;
                                                                    if (totalDeduction > 0) {
                                                                        return (
                                                                            <span
                                                                                className="text-primary font-bold"
                                                                                title={`Credit: ${relief > 0 ? `relief -${formatCurrency(relief)}` : ''}${relief > 0 && upfront > 0 ? ' + ' : ''}${upfront > 0 ? `upfront -${formatCurrency(upfront)}` : ''}`}
                                                                            >
                                                                                -{formatCurrency(totalDeduction)}
                                                                            </span>
                                                                        );
                                                                    }

                                                                    return <span className="text-muted-foreground/30">—</span>;
                                                                })()}
                                                            </TableCell>
                                                            <TableCell className="text-right font-black px-2 xs:px-2.5 sm:px-4 py-2 sm:py-2.5 whitespace-nowrap text-xs sm:text-sm tabular-nums">
                                                                {(() => {
                                                                    const isHost = p.id === hostId;
                                                                    const upfront = p.paidAmount || 0;
                                                                    const remaining = pay - upfront;

                                                                    if (isHost) {
                                                                        return <span className="text-primary">✓ PAID</span>;
                                                                    }
                                                                    if (remaining <= 0.01) {
                                                                        return <span className="text-primary">✓ PAID</span>;
                                                                    }
                                                                    return <span className="text-foreground">{formatCurrency(remaining)}</span>;
                                                                })()}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    {/* Verification Footer */}
                                    {people.length > 0 && (
                                        <div className="border-t border-foreground/5 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-muted/10 flex items-center justify-between text-[9px] sm:text-[10px] flex-wrap gap-1">
                                            <div className="flex items-center gap-1.5 sm:gap-2">
                                                {isBalanced
                                                    ? <><CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" /><span className="text-primary font-black uppercase tracking-widest">Balanced</span></>
                                                    : <><AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" /><span className="text-amber-500 font-black uppercase tracking-widest">System Gap</span></>
                                                }
                                            </div>
                                            <div className="text-muted-foreground font-bold uppercase tracking-tighter">
                                                Net Payable: <span className="text-foreground">{formatCurrency(sumFinalPayables)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {people.length > 0 && (
                                    <div className="relative p-2.5 xs:p-3 sm:p-6 rounded-2xl sm:rounded-3xl bg-foreground/[0.02] border border-primary/10 overflow-hidden shadow-xl shadow-black/10 transition-all hover:bg-foreground/[0.03]">
                                        <div className="relative z-10">
                                            <div className="flex items-center justify-between mb-3 sm:mb-8">
                                                <div className="space-y-0.5 sm:space-y-1">
                                                    <h4 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] sm:tracking-[0.3em] text-primary">Settlement Flows</h4>
                                                    <p className="text-[8px] sm:text-[10px] font-bold text-muted-foreground uppercase">Optimized Peer-to-Peer Payments</p>
                                                </div>
                                                <div className="px-2 sm:px-3 py-0.5 sm:py-1 bg-primary text-primary-foreground rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 shrink-0">
                                                    Plan Ready
                                                </div>
                                            </div>

                                            <div className="space-y-2 sm:space-y-4">
                                                {settlementFlows.length > 0 ? (
                                                    settlementFlows.map((flow, idx) => {
                                                        const debtor = people.find(p => p.id === flow.from);
                                                        const creditor = people.find(p => p.id === flow.to);
                                                        if (!debtor || !creditor) return null;

                                                        return (
                                                            <div key={idx} className="flex items-center gap-1.5 sm:gap-4 bg-background/50 p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-foreground/5 w-full min-w-0">
                                                                <div className="flex flex-col items-center gap-0.5 shrink-0 w-11 xs:w-12 sm:w-14">
                                                                    <div className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8 rounded-full bg-foreground/5 flex items-center justify-center font-black text-xs border border-foreground/10 text-foreground shrink-0">
                                                                        {debtor.name[0]}
                                                                    </div>
                                                                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tighter truncate max-w-[44px] xs:max-w-[48px] sm:max-w-[56px] text-center">{debtor.name}</span>
                                                                </div>

                                                                <div className="flex-1 flex flex-col items-center gap-0.5 sm:gap-1 min-w-0 px-1">
                                                                    <div className="text-[11px] xs:text-xs sm:text-sm font-black text-primary tabular-nums italic truncate max-w-full">{formatCurrency(flow.amount)}</div>
                                                                    <div className="w-full h-1 bg-primary/10 rounded-full overflow-hidden relative">
                                                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-shimmer" />
                                                                        <ArrowRight className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary opacity-60" />
                                                                    </div>
                                                                    <div className="text-[7px] xs:text-[8px] font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] text-muted-foreground flex items-center gap-0.5">
                                                                        Transfer <ArrowRight className="w-2 h-2" />
                                                                    </div>
                                                                </div>

                                                                <div className="flex flex-col items-center gap-0.5 shrink-0 w-11 xs:w-12 sm:w-14">
                                                                    <div className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-black text-xs shadow-lg shadow-primary/20 shrink-0">
                                                                        {creditor.name[0]}
                                                                    </div>
                                                                    <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tighter truncate max-w-[44px] xs:max-w-[48px] sm:max-w-[56px] text-center">{creditor.name}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="text-center py-4 text-muted-foreground text-xs italic">
                                                        No transfers needed. Everyone is settled!
                                                    </div>
                                                )}
                                            </div>

                                            {/* Show Settled / Uninvolved People */}
                                            {(() => {
                                                const involvedIds = new Set<string>();
                                                settlementFlows.forEach(f => {
                                                    involvedIds.add(f.from);
                                                    involvedIds.add(f.to);
                                                });
                                                const settledPeople = people.filter(p => !involvedIds.has(p.id));

                                                if (settledPeople.length === 0) return null;

                                                return (
                                                    <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-foreground/5">
                                                        <h5 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 sm:mb-3 opacity-60">Already Settled</h5>
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
                                                            {settledPeople.map(p => (
                                                                <div key={p.id} className="flex items-center gap-2 bg-foreground/[0.02] p-2 rounded-xl border border-transparent hover:border-primary/20 transition-colors">
                                                                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                                        <CheckCircle2 className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-primary" />
                                                                    </div>
                                                                    <span className="text-[10px] font-bold text-muted-foreground/80 truncate">{p.name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </TabsContent>

                            {/* PIE CHART TAB */}
                            <TabsContent value="pie" className="mt-4 space-y-4 sm:space-y-6">
                                <div className="grid gap-4 sm:gap-6">
                                    <div className="rounded-2xl sm:rounded-3xl border border-foreground/5 bg-card/30 p-4 sm:p-8 shadow-sm">
                                        <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-8">
                                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                                                <PieChartIcon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                                            </div>
                                            <div>
                                                <h4 className="text-xs sm:text-sm font-black uppercase tracking-[0.1em]">Share Breakdown</h4>
                                                <p className="text-[10px] sm:text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Consumption per person</p>
                                            </div>
                                        </div>
                                        <CostPieChart data={pieData} />
                                    </div>

                                    {itemCostData.length > 0 && (
                                        <div className="rounded-2xl sm:rounded-3xl border border-foreground/5 bg-card/30 p-4 sm:p-8 shadow-sm">
                                            <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-8">
                                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0">
                                                    <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                                                </div>
                                                <div>
                                                    <h4 className="text-xs sm:text-sm font-black uppercase tracking-[0.1em]">Categoric Volume</h4>
                                                    <p className="text-[10px] sm:text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Distribution by menu item</p>
                                                </div>
                                            </div>
                                            <CostPieChart data={itemCostData} />
                                        </div>
                                    )}

                                    {/* Neon Insight Card */}
                                    <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-primary/[0.03] border border-primary/10 flex items-start gap-3 sm:gap-4">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 shadow-inner">
                                            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                                        </div>
                                        <div>
                                            <h5 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] mb-1 sm:mb-1.5 text-primary">Consumption Insights</h5>
                                            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                                                Primary contributor identified: <span className="font-bold text-foreground">{(pieData[0]?.name || 'N/A')}</span> with a dominance of
                                                <span className="text-primary font-black ml-1">
                                                    {pieData.length > 0 ? ((pieData[0].value / totalBill) * 100).toFixed(1) : 0}%
                                                </span> of total bill volume.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            {/* ITEMIZED PERSONAL RECEIPT BREAKDOWN TAB */}
                            <TabsContent value="receipt" className="mt-3 sm:mt-4 w-full min-w-0 max-w-full overflow-hidden">
                                <PersonalReceipt />
                            </TabsContent>
                        </Tabs>
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
