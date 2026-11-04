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
  QrCode,
  Crown,
  Eye,
  Download,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { formatCurrency } from '@/lib/format';
import { calculateGroupSettlement, type GroupSettlementResult } from '@/lib/group-settlement';
import type { BillGroupDetail, GroupPaymentQr } from '@/../db/types';

interface GroupSummaryProps {
  group: BillGroupDetail;
  onSelectBill: (billId: string) => void;
}

export function GroupSummary({ group, onSelectBill }: GroupSummaryProps) {
  const [copied, setCopied] = useState(false);
  const [previewQr, setPreviewQr] = useState<GroupPaymentQr | null>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  // Highly optimized group settlement computation
  const settlement: GroupSettlementResult = useMemo(() => {
    return calculateGroupSettlement(group);
  }, [group]);

  const groupCurrency = group.currency;

  const handleCopySummary = async () => {
    try {
      let text = `🧾 ${group.name} — Expenses & Settlement\n`;
      text += `💰 Total Expenses: ${formatCurrency(settlement.totalExpenses, groupCurrency)} across ${settlement.totalBills} bill${settlement.totalBills === 1 ? '' : 's'}\n\n`;

      if (settlement.transfers.length > 0) {
        text += `💸 Simplified Settlements:\n`;
        settlement.transfers.forEach(t => {
          text += `• ${t.fromName} ➔ ${t.toName}: ${formatCurrency(t.amount, groupCurrency)}\n`;
        });
        text += `\n`;
      } else {
        text += `✅ All settled up! No payments needed.\n\n`;
      }

      text += `👥 Net Balances by Person:\n`;
      settlement.participants.forEach(p => {
        const sign = p.netBalance > 0 ? '+' : '';
        const status = p.status === 'receive' ? 'To receive' : p.status === 'pay' ? 'To pay' : 'Settled';
        text += `• ${p.name}: ${sign}${formatCurrency(p.netBalance, groupCurrency)} (${status}) [Paid: ${formatCurrency(p.totalPaid, groupCurrency)}, Share: ${formatCurrency(p.totalShare, groupCurrency)}]\n`;
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
            {settlement.transfers.map((t, idx) => {
              const matchedQr = (group.payment_qrs || []).find(
                (q) => q.payerName.toLowerCase() === t.toName.toLowerCase()
              );
              return (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 sm:gap-3 bg-background/50 p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-foreground/5 w-full min-w-0"
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
                      {formatCurrency(t.amount, groupCurrency)}
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

                  {/* QR quick pay button if creditor has QR */}
                  {matchedQr && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewQr(matchedQr)}
                      className="h-7 px-2 rounded-xl text-[10px] font-bold gap-1 text-primary border-primary/30 hover:bg-primary/10 shrink-0"
                      title={`Scan ${t.toName}'s Payment QR`}
                    >
                      <QrCode className="w-3 h-3" />
                      <span className="hidden sm:inline">Pay QR</span>
                    </Button>
                  )}
                </div>
              );
            })}
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
              {formatCurrency(settlement.totalExpenses, groupCurrency)}
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
                        {formatCurrency(p.totalPaid, groupCurrency)}
                      </TableCell>

                      {/* Total Share */}
                      <TableCell className="text-right px-3 sm:px-4 py-3 whitespace-nowrap text-xs font-semibold tabular-nums text-muted-foreground">
                        {formatCurrency(p.totalShare, groupCurrency)}
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
                            {p.netBalance > 0 ? `+${formatCurrency(p.netBalance, groupCurrency)}` : p.netBalance < 0 ? `-${formatCurrency(Math.abs(p.netBalance), groupCurrency)}` : formatCurrency(0, groupCurrency)}
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

      {/* SECTION 3: Group Payment QRs */}
      {group.payment_qrs && group.payment_qrs.length > 0 && (
        <div className="p-3.5 sm:p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-primary/10 text-primary">
                <QrCode className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground">
                  Group Payment QRs
                </h3>
                <p className="text-[11px] text-muted-foreground font-medium">
                  Scan to pay any creditor or group payer directly
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {group.payment_qrs.length} {group.payment_qrs.length === 1 ? 'QR' : 'QRs'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
            {group.payment_qrs.map((qr) => (
              <div
                key={qr.id}
                onClick={() => setPreviewQr(qr)}
                className="p-2.5 rounded-2xl bg-background/60 hover:bg-muted/30 border border-border/70 flex items-center gap-2.5 cursor-pointer transition-all hover:border-primary/40 group shadow-2xs"
              >
                <div className="w-12 h-12 rounded-xl bg-white border border-border p-0.5 shrink-0 overflow-hidden group-hover:scale-105 transition-transform">
                  <img src={qr.qrUrl} alt={qr.payerName} className="w-full h-full object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-foreground truncate">{qr.payerName}</span>
                  </div>
                  {qr.note && (
                    <p className="text-[10px] text-muted-foreground truncate">{qr.note}</p>
                  )}
                  <span className="text-[9px] font-semibold text-primary inline-flex items-center gap-0.5 mt-0.5">
                    <Eye className="w-2.5 h-2.5" /> Tap to scan
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QR Zoom Preview Modal */}
      {previewQr && (
        <Dialog open={Boolean(previewQr)} onOpenChange={(open) => !open && setPreviewQr(null)}>
          <DialogContent className="w-[calc(100vw-24px)] sm:w-full max-w-sm p-4 sm:p-6 text-foreground shadow-2xl rounded-3xl border border-border/80 bg-card flex flex-col items-center text-center">
            <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-border/40">
              <div className="flex items-center gap-2 text-left min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Crown className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-foreground truncate">{previewQr.payerName}</h3>
                  <p className="text-[10px] text-muted-foreground">Scan to Settle Up</p>
                </div>
              </div>
            </div>

            {/* High-res QR Image */}
            <div className="w-64 h-64 sm:w-72 sm:h-72 p-3 bg-white rounded-2xl border border-border shadow-md my-2 flex items-center justify-center overflow-hidden">
              <img
                src={previewQr.qrUrl}
                alt={`${previewQr.payerName} Payment QR`}
                className="w-full h-full object-contain"
              />
            </div>

            {previewQr.note && (
              <div className="w-full mt-2 p-2.5 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between gap-2 text-left">
                <span className="text-xs font-semibold text-foreground truncate">{previewQr.note}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(previewQr.note!);
                    setCopiedNoteId(previewQr.id);
                    setTimeout(() => setCopiedNoteId(null), 2000);
                  }}
                  className="h-7 px-2 text-[10px] font-bold gap-1 shrink-0"
                >
                  {copiedNoteId === previewQr.id ? (
                    <>
                      <Check className="w-3 h-3 text-primary" />
                      <span className="text-primary">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2 mt-4 w-full">
              <a
                href={previewQr.qrUrl}
                download={`${previewQr.payerName}-Payment-QR.png`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-bold text-xs shadow-sm transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Image</span>
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewQr(null)}
                className="h-9 px-4 rounded-xl text-xs font-bold"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
