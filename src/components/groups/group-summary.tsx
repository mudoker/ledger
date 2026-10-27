'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
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
          <div className="space-y-2 sm:space-y-4">
            {settlement.transfers.map((t, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 sm:gap-4 bg-background/50 p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-foreground/5 w-full min-w-0"
              >
                {/* Debtor */}
                <div className="flex flex-col items-center gap-0.5 shrink-0 w-11 xs:w-12 sm:w-14">
                  <div className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8 rounded-full bg-foreground/5 flex items-center justify-center font-black text-xs border border-foreground/10 text-foreground shrink-0">
                    {t.fromName[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tighter truncate max-w-[44px] xs:max-w-[48px] sm:max-w-[56px] text-center" title={t.fromName}>
                    {t.fromName}
                  </span>
                </div>

                {/* Amount with directional shimmer track */}
                <div className="flex-1 flex flex-col items-center gap-0.5 sm:gap-1 min-w-0 px-1">
                  <div className="text-[11px] xs:text-xs sm:text-sm font-black text-primary tabular-nums italic truncate max-w-full">
                    {formatCurrency(t.amount)}
                  </div>
                  <div className="w-full h-1 bg-primary/10 rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-shimmer" />
                  </div>
                </div>

                {/* Creditor */}
                <div className="flex flex-col items-center gap-0.5 shrink-0 w-11 xs:w-12 sm:w-14">
                  <div className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center font-black text-xs text-primary border border-primary/20 shrink-0">
                    {t.toName[0]?.toUpperCase() || '?'}
                  </div>
                  <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-tighter truncate max-w-[44px] xs:max-w-[48px] sm:max-w-[56px] text-center" title={t.toName}>
                    {t.toName}
                  </span>
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

      {/* SECTION 2: Participant Breakdown Table (By Person) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" /> Breakdown by Person ({settlement.participants.length})
          </h3>
        </div>

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
                  <TableHead className="text-right px-3 sm:px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap" title="Total consumption expenses share for this participant across all bills">
                    Expenses (Share)
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
      </div>
    </div>
  );
}
