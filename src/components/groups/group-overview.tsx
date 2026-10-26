'use client';

import { useState, useMemo } from 'react';
import { useGroupStore } from '@/store/useGroupStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Receipt,
  Folder,
  Tag,
  Clock,
  MapPin,
  Trash2,
  UserCheck,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Layers,
  ShoppingBag,
  Coins,
  Search,
  Plus,
  Share2,
  Check,
  Sparkles,
  Settings2,
  X
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { TransferOwnershipModal } from '@/components/shared/transfer-ownership-modal';
import { EditGroupModal } from '@/components/shared/edit-group-modal';
import { CreateBillModal, type CreateBillFormData } from '@/components/shared/create-bill-modal';
import type { BillGroupDetail } from '@/../db/types';

interface GroupOverviewProps {
  group: BillGroupDetail;
  onBack: () => void;
  onSelectBill: (billId: string) => void;
  onNewBill?: (data: CreateBillFormData) => void;
}

export function GroupOverview({ group, onBack, onSelectBill, onNewBill }: GroupOverviewProps) {
  const { deleteGroup, fetchGroup } = useGroupStore();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isCreateBillModalOpen, setIsCreateBillModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Bill accordion expansion state (default: all expanded for quick overview)
  const [collapsedBills, setCollapsedBills] = useState<Record<string, boolean>>({});

  const toggleBillCollapse = (billId: string) => {
    setCollapsedBills((prev) => ({
      ...prev,
      [billId]: !prev[billId],
    }));
  };

  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}?groupId=${group.id}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${group.name}"?\n\nThe bills inside this group will NOT be deleted; they will simply be unlinked.`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteGroup(group.id);
      onBack();
    } catch (e) {
      console.error('Failed to delete group:', e);
      alert('Failed to delete group');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter bills and items by in-page search query
  const filteredBills = useMemo(() => {
    if (!filterQuery.trim()) return group.bills;
    const q = filterQuery.toLowerCase().trim();

    return group.bills
      .map((bill) => {
        const matchesBill =
          bill.name.toLowerCase().includes(q) ||
          (bill.location && bill.location.toLowerCase().includes(q));

        const matchingItems = bill.items.filter((item) =>
          item.name.toLowerCase().includes(q)
        );

        if (matchesBill) return bill;
        if (matchingItems.length > 0) {
          return {
            ...bill,
            items: matchingItems,
          };
        }
        return null;
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [group.bills, filterQuery]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-y-auto">
      {/* Top Header / Sticky Nav */}
      <div className="flex-none px-4 sm:px-6 md:px-8 pt-4 pb-4 border-b border-border/40 w-full max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1.5 h-8 text-xs font-bold -ml-2 text-muted-foreground hover:text-foreground rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Groups</span>
          </Button>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="gap-1.5 h-8 text-xs font-semibold rounded-xl border-border/70 hover:bg-muted/60"
              title="Copy group share link"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-primary" />
                  <span className="hidden sm:inline text-primary">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="hidden sm:inline">Share</span>
                </>
              )}
            </Button>

            {group.is_owner && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditModalOpen(true)}
                  className="gap-1.5 h-8 text-xs font-semibold rounded-xl border-border/70 hover:bg-muted/60"
                  title="Edit group details"
                >
                  <Settings2 className="w-3.5 h-3.5 text-primary" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTransferModalOpen(true)}
                  className="gap-1.5 h-8 text-xs font-semibold rounded-xl border-border/70 hover:bg-muted/60"
                  title="Transfer group ownership"
                >
                  <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Transfer</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="gap-1.5 h-8 text-xs font-semibold text-destructive hover:bg-destructive/10 rounded-xl"
                  title="Delete group"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Group Hero Info */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="p-2.5 bg-primary/10 rounded-2xl border border-primary/20 text-primary shadow-sm">
              <Folder className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground truncate">
                  {group.name}
                </h1>
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shadow-2xs ${
                    group.is_owner
                      ? 'bg-foreground/10 text-foreground border-foreground/20'
                      : 'bg-primary/10 text-primary border-primary/20'
                  }`}
                >
                  {group.is_owner ? 'Owner' : 'Participant'}
                </span>
              </div>
              {group.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
              )}
            </div>
          </div>

          {group.owner_name && !group.is_owner && (
            <p className="text-[11px] text-muted-foreground/80 pl-0.5">
              Managed by <strong className="text-foreground">{group.owner_name}</strong>
            </p>
          )}
        </div>

        {/* Aggregated Overview Cards with subtle gradients */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4 mt-5">
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-card to-card border border-primary/20 shadow-xs relative overflow-hidden">
            <div className="flex items-center gap-1.5 text-primary text-[10px] font-bold uppercase tracking-wider mb-1">
              <Coins className="w-3.5 h-3.5" />
              <span>Total Spend</span>
            </div>
            <div className="text-base sm:text-2xl font-black text-foreground tabular-nums tracking-tight">
              {formatCurrency(group.total_amount)}
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">across all bills</div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 via-card to-card border border-blue-500/20 shadow-xs relative overflow-hidden">
            <div className="flex items-center gap-1.5 text-blue-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              <Layers className="w-3.5 h-3.5" />
              <span>Bills</span>
            </div>
            <div className="text-base sm:text-2xl font-black text-foreground tabular-nums tracking-tight">
              {group.total_bills}
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">linked invoices</div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-card to-card border border-emerald-500/20 shadow-xs relative overflow-hidden">
            <div className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Items</span>
            </div>
            <div className="text-base sm:text-2xl font-black text-foreground tabular-nums tracking-tight">
              {group.total_items}
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">ordered items</div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-4 sm:px-6 md:px-8 py-5 w-full max-w-4xl mx-auto space-y-4">
        {/* Controls: In-Page Filter + New Bill Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter bills or items in this group..."
              className="h-9 pl-8 text-xs rounded-xl bg-card border-border/80 focus-visible:ring-1 focus-visible:ring-primary/40 placeholder:text-muted-foreground/50"
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {onNewBill && (
            <Button
              onClick={() => setIsCreateBillModalOpen(true)}
              size="sm"
              className="gap-1.5 h-9 rounded-xl font-bold text-xs bg-foreground text-background hover:bg-foreground/90 shrink-0 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Bill to Group</span>
            </Button>
          )}
        </div>

        {/* Section Title */}
        <div className="flex items-center justify-between pt-1">
          <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Receipt className="w-3.5 h-3.5 text-primary" /> Bills &amp; Line Items ({filteredBills.length})
          </h2>
          <span className="text-[10px] text-muted-foreground font-semibold">
            Click item to jump to bill
          </span>
        </div>

        {/* Drill-down Bills and Items */}
        {group.bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center space-y-3 rounded-3xl border-2 border-dashed bg-muted/20 px-6">
            <div className="p-3 bg-primary/10 rounded-2xl text-primary">
              <Receipt className="w-8 h-8" />
            </div>
            <div className="space-y-1 max-w-xs">
              <p className="text-xs font-bold text-foreground">No bills in this group yet</p>
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                Add an existing bill via Bill Settings, or start a new bill linked directly to &ldquo;{group.name}&rdquo;.
              </p>
            </div>
            {onNewBill && (
              <Button
                onClick={() => setIsCreateBillModalOpen(true)}
                size="sm"
                className="rounded-xl text-xs font-bold gap-1.5 mt-2"
              >
                <Plus className="w-3.5 h-3.5" /> Create First Bill
              </Button>
            )}
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="py-12 text-center space-y-2 rounded-2xl border border-border/50 bg-card">
            <Search className="w-6 h-6 text-muted-foreground/40 mx-auto" />
            <p className="text-xs font-semibold text-muted-foreground">
              No bills or items match &ldquo;{filterQuery}&rdquo;
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterQuery('')}
              className="text-xs font-bold text-primary"
            >
              Clear filter
            </Button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredBills.map((bill) => {
              const isCollapsed = Boolean(collapsedBills[bill.id]);

              return (
                <Card
                  key={bill.id}
                  className="overflow-hidden border border-border/70 hover:border-foreground/30 transition-all rounded-2xl shadow-xs bg-card group"
                >
                  {/* Bill Card Header */}
                  <div className="flex items-center justify-between p-3.5 sm:p-4 bg-muted/20 border-b border-border/40">
                    <div
                      onClick={() => onSelectBill(bill.id)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group-hover:opacity-95"
                    >
                      <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0 group-hover:scale-105 transition-transform">
                        <Receipt className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-sm sm:text-base text-foreground truncate group-hover:text-primary transition-colors">
                            {bill.name}
                          </h3>
                          <ExternalLink className="w-3 h-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>
                              {formatDistanceToNow(new Date(bill.updated_at), { addSuffix: true })}
                            </span>
                          </div>
                          {bill.location && (
                            <div className="flex items-center gap-1 truncate max-w-[140px] sm:max-w-none">
                              <MapPin className="w-2.5 h-2.5" />
                              <span className="truncate">{bill.location}</span>
                            </div>
                          )}
                          <span className="text-primary font-bold">
                            {bill.items.length} item{bill.items.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="font-black text-sm sm:text-base text-foreground tabular-nums tracking-tight">
                        {formatCurrency(bill.totalAmount)}
                      </span>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleBillCollapse(bill.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                        title={isCollapsed ? 'Expand items' : 'Collapse items'}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expandable Line Items (Clicking any item jumps directly to bill) */}
                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <CardContent className="p-0 divide-y divide-border/20">
                          {bill.items.length === 0 ? (
                            <div className="py-3 px-4 text-[11px] text-muted-foreground/60 italic text-center">
                              No items entered in this bill yet.
                            </div>
                          ) : (
                            bill.items.map((item) => (
                              <div
                                key={item.id}
                                onClick={() => onSelectBill(bill.id)}
                                className="flex items-center justify-between py-2 px-4 text-xs hover:bg-foreground/[0.03] cursor-pointer transition-colors group/item"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <Tag className="w-3 h-3 text-muted-foreground/40 shrink-0 group-hover/item:text-primary transition-colors" />
                                  <span className="font-medium text-foreground truncate group-hover/item:text-primary transition-colors">
                                    {item.name}
                                  </span>
                                  {item.quantity > 1 && (
                                    <span className="text-[10px] font-bold text-muted-foreground px-1.5 py-0.2 rounded-md bg-muted/80 shrink-0">
                                      × {item.quantity}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-3 shrink-0 ml-3">
                                  <span className="font-bold text-foreground tabular-nums text-xs">
                                    {formatCurrency(item.totalPrice)}
                                  </span>
                                  <span className="text-[10px] text-primary opacity-0 group-hover/item:opacity-100 transition-opacity font-bold">
                                    Open ↗
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <EditGroupModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        group={group}
        onSuccess={() => {
          fetchGroup(group.id);
        }}
      />

      <TransferOwnershipModal
        open={isTransferModalOpen}
        onOpenChange={setIsTransferModalOpen}
        targetType="group"
        targetId={group.id}
        targetName={group.name}
        onSuccess={() => {
          fetchGroup(group.id);
        }}
      />

      {onNewBill && (
        <CreateBillModal
          open={isCreateBillModalOpen}
          onOpenChange={setIsCreateBillModalOpen}
          onSubmit={onNewBill}
          initialGroupId={group.id}
        />
      )}
    </div>
  );
}
