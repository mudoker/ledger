'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Users,
  Copy,
  Check,
  ExternalLink,
  Wallet,
  Scale,
  Sparkles,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { calculateGroupSettlement, type GroupSettlementResult } from '@/lib/group-settlement';
import type { BillGroupDetail } from '@/../db/types';

interface GroupSummaryProps {
  group: BillGroupDetail;
  onSelectBill: (billId: string) => void;
}

export function GroupSummary({ group, onSelectBill }: GroupSummaryProps) {
  const [copied, setCopied] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'person' | 'bills'>('person');

  // Highly optimized group settlement computation
  const settlement: GroupSettlementResult = useMemo(() => {
    return calculateGroupSettlement(group);
  }, [group]);

  const handleCopySummary = async () => {
    try {
      let text = `🧾 ${group.name} — Expenses & Settlement\n`;
      text += `💰 Total Expenses: ${formatCurrency(settlement.totalExpenses)} across ${settlement.totalBills} bill${settlement.totalBills === 1 ? '' : 's'}\n\n`;

      if (settlement.transfers.length > 0) {
        text += `💸 Simplified Settlements:\n`;
        settlement.transfers.forEach(t => {
          text += `• ${t.fromName} ➔ ${t.toName}: ${formatCurrency(t.amount)}\n`;
        });
        text += `\n`;
      } else {
        text += `✅ All settled up! No payments needed.\n\n`;
      }

      text += `👥 Net Balances by Person:\n`;
      settlement.participants.forEach(p => {
        const sign = p.netBalance > 0 ? '+' : '';
        const status = p.status === 'receive' ? 'To receive' : p.status === 'pay' ? 'To pay' : 'Settled';
        text += `• ${p.name}: ${sign}${formatCurrency(p.netBalance)} (${status}) [Paid: ${formatCurrency(p.totalPaid)}, Share: ${formatCurrency(p.totalShare)}]\n`;
      });

      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  if (settlement.totalBills === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 rounded-3xl border-2 border-dashed bg-muted/20 px-6">
        <div className="p-3.5 bg-primary/10 rounded-2xl text-primary">
          <Scale className="w-8 h-8" />
        </div>
        <div className="space-y-1 max-w-xs">
          <h3 className="text-sm font-bold text-foreground">No Bills in Group Yet</h3>
          <p className="text-xs text-muted-foreground">
            Add bills to this group to see automatic debt simplification and group-wide settlements.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* SECTION 1: Top Hero - Who Sends to Who (Simplified Settlements) */}
      <div className="relative p-3.5 sm:p-5 rounded-3xl bg-gradient-to-br from-card via-card to-card/80 border border-primary/20 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-primary/10 text-primary">
                <Scale className="w-4 h-4" />
              </span>
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground">
                Who Sends to Who
              </h3>
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Simplified
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-medium">
              Net debt minimization across all {settlement.totalBills} bills in this group
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopySummary}
            className="gap-1.5 h-8 text-xs font-semibold rounded-xl border-border/80 hover:bg-muted/60 self-start sm:self-auto shrink-0 shadow-2xs"
            title="Copy settlement summary for chat apps"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-primary" />
                <span className="text-primary">Copied Plan</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Copy Summary</span>
              </>
            )}
          </Button>
        </div>

        {/* Transfers List */}
        {settlement.transfers.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-6 rounded-2xl bg-muted/20 border border-border/40 text-center">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-bold text-foreground">
              Everyone is settled up! No cross-payments needed.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {settlement.transfers.map((t, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-background/80 hover:bg-background border border-border/60 transition-all shadow-2xs min-w-0"
              >
                {/* Debtor */}
                <div className="flex items-center gap-2 min-w-0 max-w-[35%]">
                  <div className="w-7 h-7 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-black text-xs flex items-center justify-center border border-rose-500/20 shrink-0">
                    {t.fromName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-foreground truncate" title={t.fromName}>
                      {t.fromName}
                    </div>
                    <div className="text-[9px] text-muted-foreground uppercase font-black tracking-wider">
                      Pays
                    </div>
                  </div>
                </div>

                {/* Amount with directional arrow */}
                <div className="flex-1 flex flex-col items-center gap-0.5 px-2 min-w-0">
                  <div className="text-xs sm:text-sm font-black text-primary tabular-nums tracking-tight whitespace-nowrap">
                    {formatCurrency(t.amount)}
                  </div>
                  <div className="w-full flex items-center gap-1">
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-rose-500/30 via-primary/60 to-emerald-500/30 rounded-full" />
                    <ArrowRight className="w-3 h-3 text-primary shrink-0" />
                  </div>
                </div>

                {/* Creditor */}
                <div className="flex items-center gap-2 min-w-0 max-w-[35%] justify-end text-right">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-foreground truncate" title={t.toName}>
                      {t.toName}
                    </div>
                    <div className="text-[9px] text-muted-foreground uppercase font-black tracking-wider">
                      Receives
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black text-xs flex items-center justify-center border border-emerald-500/20 shrink-0">
                    {t.toName.slice(0, 1).toUpperCase()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Verification Status Banner */}
        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground flex-wrap gap-2">
          <div className="flex items-center gap-1.5 font-bold">
            {settlement.isBalanced ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-primary uppercase tracking-wider">Zero-Sum Balanced</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-amber-500 uppercase tracking-wider">Minor Rounding Drift</span>
              </>
            )}
          </div>
          <div className="font-semibold">
            Group Expenses:{' '}
            <strong className="text-foreground tabular-nums">
              {formatCurrency(settlement.totalExpenses)}
            </strong>
          </div>
        </div>
      </div>

      {/* SECTION 2: Dual Aggregation Switcher (By Person vs By Bills) */}
      <div className="space-y-3">
        <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as 'person' | 'bills')} className="w-full">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" /> Breakdown
            </h3>

            <TabsList className="h-8 bg-muted/40 p-0.5 rounded-xl border border-border/50">
              <TabsTrigger
                value="person"
                className="text-xs px-3 h-7 font-bold gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
              >
                <Users className="w-3.5 h-3.5" />
                <span>By Person ({settlement.participants.length})</span>
              </TabsTrigger>
              <TabsTrigger
                value="bills"
                className="text-xs px-3 h-7 font-bold gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-2xs"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>By Bills ({settlement.totalBills})</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* VIEW A: Aggregated By Person */}
          <TabsContent value="person" className="mt-0">
            <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto w-full">
                <Table className="w-full min-w-[500px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40 border-b border-border/80">
                      <TableHead className="px-3 sm:px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Participant
                      </TableHead>
                      <TableHead className="text-right px-3 sm:px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Total Paid
                      </TableHead>
                      <TableHead className="text-right px-3 sm:px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Fair Share
                      </TableHead>
                      <TableHead className="text-right px-3 sm:px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Net Balance
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settlement.participants.map((p) => {
                      const isAppMember = Boolean(p.userId || p.email);
                      return (
                        <TableRow
                          key={p.key}
                          className="hover:bg-muted/30 transition-colors border-b border-border/40 last:border-0"
                        >
                          {/* Participant Name & Badges */}
                          <TableCell className="px-3 sm:px-4 py-3 font-semibold">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-black text-xs flex items-center justify-center border border-primary/20 shrink-0">
                                {p.name.slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs sm:text-sm font-bold text-foreground truncate max-w-[130px] sm:max-w-[200px]" title={p.name}>
                                    {p.name}
                                  </span>
                                  {isAppMember ? (
                                    <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20">
                                      Member
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground border border-border">
                                      Guest
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {p.billsCount} of {settlement.totalBills} bill{settlement.totalBills === 1 ? '' : 's'}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          {/* Total Paid */}
                          <TableCell className="text-right px-3 sm:px-4 py-3 whitespace-nowrap text-xs font-semibold tabular-nums text-foreground">
                            {formatCurrency(p.totalPaid)}
                          </TableCell>

                          {/* Total Share */}
                          <TableCell className="text-right px-3 sm:px-4 py-3 whitespace-nowrap text-xs font-semibold tabular-nums text-muted-foreground">
                            {formatCurrency(p.totalShare)}
                          </TableCell>

                          {/* Net Balance & Status Badge */}
                          <TableCell className="text-right px-3 sm:px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-col items-end gap-0.5">
                              <span
                                className={`text-xs sm:text-sm font-black tabular-nums tracking-tight ${
                                  p.status === 'receive'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : p.status === 'pay'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {p.netBalance > 0 ? `+${formatCurrency(p.netBalance)}` : p.netBalance < 0 ? `-${formatCurrency(Math.abs(p.netBalance))}` : formatCurrency(0)}
                              </span>
                              <span
                                className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-md ${
                                  p.status === 'receive'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                    : p.status === 'pay'
                                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                    : 'bg-muted text-muted-foreground border border-border/50'
                                }`}
                              >
                                {p.status === 'receive' ? 'To receive' : p.status === 'pay' ? 'To pay' : 'Settled'}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          {/* VIEW B: Aggregated By Bills */}
          <TabsContent value="bills" className="mt-0 space-y-3">
            {settlement.billSummaries.map((bs) => (
              <Card
                key={bs.billId}
                className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-xs hover:border-primary/30 transition-all"
              >
                <CardContent className="p-3.5 sm:p-4 space-y-3">
                  {/* Bill Top Bar */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-primary shrink-0" />
                        <h4 className="text-xs sm:text-sm font-bold text-foreground truncate">
                          {bs.billName}
                        </h4>
                      </div>
                      {bs.location && (
                        <p className="text-[11px] text-muted-foreground pl-6">
                          📍 {bs.location}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-xs sm:text-sm font-black text-foreground tabular-nums tracking-tight">
                          {formatCurrency(bs.totalAmount)}
                        </div>
                        {bs.hostName && (
                          <div className="text-[10px] text-muted-foreground">
                            Host: <span className="font-semibold text-foreground">{bs.hostName}</span>
                          </div>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelectBill(bs.billId)}
                        className="h-8 px-2 text-xs font-semibold text-primary hover:bg-primary/10 rounded-xl gap-1 shrink-0"
                        title="Jump to full bill view"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Bill Participants Grid */}
                  <div className="pt-2 border-t border-border/50">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                      Bill Breakdown ({bs.participants.length} participants)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {bs.participants.map((bp) => (
                        <div
                          key={bp.personId}
                          className="p-2 rounded-xl bg-muted/20 border border-border/40 space-y-1"
                        >
                          <div className="text-xs font-bold text-foreground truncate" title={bp.name}>
                            {bp.name}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>Paid:</span>
                            <span className="font-medium tabular-nums text-foreground">{formatCurrency(bp.paid)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>Share:</span>
                            <span className="font-medium tabular-nums text-foreground">{formatCurrency(bp.share)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bill Flows if available */}
                  {bs.flows.length > 0 && (
                    <div className="pt-2 border-t border-border/40">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Settlement for this Bill
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {bs.flows.map((flow, fIdx) => (
                          <div
                            key={fIdx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-background border border-border/60 text-xs shadow-2xs"
                          >
                            <span className="font-semibold text-foreground">{flow.fromName}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="font-semibold text-foreground">{flow.toName}</span>
                            <span className="font-black text-primary tabular-nums ml-1">
                              {formatCurrency(flow.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
