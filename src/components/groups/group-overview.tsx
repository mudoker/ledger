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
  X,
  Scale,
  Users,
  Shield,
} from 'lucide-react';
import { formatCurrency, formatConciseRelativeTime } from '@/lib/format';
import { motion, AnimatePresence } from 'framer-motion';
import { TransferOwnershipModal } from '@/components/shared/transfer-ownership-modal';
import { RoleBadge } from '@/components/layout/landing-card';
import { EditGroupModal } from '@/components/shared/edit-group-modal';
import { CreateBillModal, type CreateBillFormData } from '@/components/shared/create-bill-modal';
import { DeleteConfirmationModal } from '@/components/shared/delete-confirmation-modal';
import { ModeToggle } from '@/components/layout/mode-toggle';
import { GroupSummary } from './group-summary';
import type { BillGroupDetail } from '@/../db/types';

interface GroupOverviewProps {
  group: BillGroupDetail;
  onBack: () => void;
  onSelectBill: (billId: string) => void;
  onNewBill?: (data: CreateBillFormData) => void;
}

export function GroupOverview({ group, onBack, onSelectBill, onNewBill }: GroupOverviewProps) {
  const { deleteGroup, fetchGroup, addGroupParticipant, removeGroupParticipant } = useGroupStore();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isCreateBillModalOpen, setIsCreateBillModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: 'group' }
    | { type: 'bill'; id: string; name: string }
    | { type: 'member'; id: string; name: string }
    | null
  >(null);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<'bills' | 'members' | 'summary'>('bills');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);

  const handleAddMember = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMemberName.trim()) return;
    setIsAddingMember(true);
    try {
      await addGroupParticipant(group.id, newMemberName.trim(), newMemberEmail.trim() || null);
      setNewMemberName('');
      setNewMemberEmail('');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = (participantId: string, name: string) => {
    setDeleteTarget({ type: 'member', id: participantId, name });
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

  const handleDelete = () => {
    setDeleteTarget({ type: 'group' });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleteLoading(true);
    try {
      if (deleteTarget.type === 'group') {
        await deleteGroup(group.id);
        onBack();
      } else if (deleteTarget.type === 'bill') {
        const { useBillStore } = await import('@/store/useBillStore');
        await useBillStore.getState().deleteBill(deleteTarget.id);
        await fetchGroup(group.id);
      } else if (deleteTarget.type === 'member') {
        await removeGroupParticipant(group.id, deleteTarget.id);
      }
    } catch (e) {
      console.error('Failed to execute delete action:', e);
    } finally {
      setIsDeleteLoading(false);
      setDeleteTarget(null);
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
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      {/* Top Header / Sticky Nav */}
      <div className="flex-none px-4 sm:px-6 md:px-8 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:pt-6 pb-4 border-b border-border/40 w-full max-w-4xl mx-auto">
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
                  disabled={isDeleteLoading}
                  className="gap-1.5 h-8 text-xs font-semibold text-destructive hover:bg-destructive/10 rounded-xl"
                  title="Delete group"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </>
            )}
            <ModeToggle />
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
                <RoleBadge role={group.is_owner ? 'owner' : 'participant'} />
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

        {/* Aggregated Overview Cards with colored active borders */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 mt-5">
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-card to-card border border-primary ring-1 ring-primary/40 shadow-xs relative overflow-hidden">
            <div className="flex items-center gap-1.5 text-primary text-[10px] font-bold uppercase tracking-wider mb-1">
              <Coins className="w-3.5 h-3.5" />
              <span>Expenses</span>
            </div>
            <div className="text-base sm:text-2xl font-black text-foreground tabular-nums tracking-tight whitespace-nowrap truncate">
              {formatCurrency(group.total_amount)}
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5 whitespace-nowrap">across all bills</div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 via-card to-card border border-blue-500 ring-1 ring-blue-500/40 shadow-xs relative overflow-hidden">
            <div className="flex items-center gap-1.5 text-blue-500 text-[10px] font-bold uppercase tracking-wider mb-1">
              <Layers className="w-3.5 h-3.5" />
              <span>Bills</span>
            </div>
            <div className="text-base sm:text-2xl font-black text-foreground tabular-nums tracking-tight whitespace-nowrap truncate">
              {group.total_bills}
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5 whitespace-nowrap">linked invoices</div>
          </div>
        </div>
      </div>

      {/* Main Content Area - pb-36 ensures ample clearance above floating bottom search bar */}
      <div className="flex-1 px-4 sm:px-6 md:px-8 pt-5 pb-36 w-full max-w-4xl mx-auto space-y-4">
        {/* Top-Level Navigation Switcher: Bills vs Summary */}
        <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-3">
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-2xl border border-border/50">
            <button
              type="button"
              onClick={() => setActiveMainTab('bills')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeMainTab === 'bills'
                  ? 'bg-background text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Receipt className="w-3.5 h-3.5 text-primary" />
              <span>Bills ({group.total_bills})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('members')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeMainTab === 'members'
                  ? 'bg-background text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-primary" />
              <span>Members ({group.participants?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('summary')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeMainTab === 'summary'
                  ? 'bg-background text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Scale className="w-3.5 h-3.5 text-primary" />
              <span>Summary</span>
            </button>
          </div>

          {activeMainTab === 'bills' && onNewBill && (
            <Button
              onClick={() => setIsCreateBillModalOpen(true)}
              size="sm"
              className="gap-1.5 h-8 rounded-xl font-bold text-xs bg-foreground text-background hover:bg-foreground/90 shrink-0 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Bill to Group</span>
              <span className="sm:hidden">Add Bill</span>
            </Button>
          )}
        </div>

        {/* Tab 1: Group Summary View */}
        {activeMainTab === 'summary' && (
          <GroupSummary group={group} onSelectBill={onSelectBill} />
        )}

        {/* Tab 2: Group Members View */}
        {activeMainTab === 'members' && (
          <div className="space-y-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border/80 shadow-xs space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Group Participants
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Participants added here are automatically inherited whenever a new bill is created in or linked to this group.
                </p>
              </div>

              {group.is_owner && (
                <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <Input
                    placeholder="Participant Name (e.g. Sarah)"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    className="h-9 text-xs rounded-xl flex-1 bg-muted/20"
                  />
                  <Input
                    placeholder="Email (optional)"
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    className="h-9 text-xs rounded-xl sm:w-56 bg-muted/20"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!newMemberName.trim() || isAddingMember}
                    className="h-9 px-4 rounded-xl text-xs font-bold gap-1.5 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAddingMember ? 'Adding...' : 'Add Member'}</span>
                  </Button>
                </form>
              )}
            </div>

            {/* Members List */}
            {(!group.participants || group.participants.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-2 rounded-2xl border-2 border-dashed bg-muted/20 px-4">
                <Users className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-xs font-bold text-foreground">No group participants yet</p>
                <p className="text-[11px] text-muted-foreground/70 max-w-xs">
                  Add group members so all new bills automatically inherit everyone!
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {group.participants.map((person) => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border/70 hover:border-border transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                        {person.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{person.name}</p>
                        {person.email ? (
                          <p className="text-[10px] text-muted-foreground truncate">{person.email}</p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground/60 italic">Local Participant</p>
                        )}
                      </div>
                    </div>
                    {group.is_owner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveMember(person.id, person.name)}
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Bills View (Single-surface clean cards without item dropdowns) */}
        {activeMainTab === 'bills' && (
          <div className="space-y-4">
            {/* Controls: In-Page Filter */}
            <div className="relative w-full max-w-md">
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

            {/* Section Title */}
            <div className="flex items-center justify-between pt-1">
              <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Receipt className="w-3.5 h-3.5 text-primary" /> Bills ({filteredBills.length})
              </h2>
              <span className="text-[10px] text-muted-foreground font-semibold">
                Click bill to open
              </span>
            </div>

            {/* Drill-down Bills */}
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
                  No bills match &ldquo;{filterQuery}&rdquo;
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
              <div className="space-y-2.5">
                {filteredBills.map((bill) => (
                  <Card
                    key={bill.id}
                    onClick={() => onSelectBill(bill.id)}
                    className="overflow-hidden border border-border/70 hover:border-foreground/30 transition-all rounded-2xl shadow-xs bg-card group cursor-pointer"
                  >
                    <div className="flex items-center justify-between p-3.5 sm:p-4 bg-muted/20 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="p-2 bg-primary/10 text-primary rounded-xl shrink-0 group-hover:scale-105 transition-transform">
                          <Receipt className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap">
                            <h3 className="font-bold text-sm sm:text-base text-foreground truncate group-hover:text-primary transition-colors">
                              {bill.name}
                            </h3>
                            {(bill as any).isLocal && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0 inline-flex items-center gap-1">
                                <Shield className="w-2.5 h-2.5 text-emerald-500" />
                                <span>Local</span>
                              </span>
                            )}
                            <ExternalLink className="w-3 h-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5 min-w-0 flex-nowrap">
                            <div className="flex items-center gap-1 shrink-0">
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              <span className="whitespace-nowrap">
                                {formatConciseRelativeTime(bill.updated_at)}
                              </span>
                            </div>
                            {bill.location && (
                              <div className="flex items-center gap-1 truncate max-w-[100px] sm:max-w-[150px] shrink-0">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{bill.location}</span>
                              </div>
                            )}
                            <span className="text-primary font-bold shrink-0 whitespace-nowrap">
                              • {bill.items.length} item{bill.items.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-3">
                        <span className="font-black text-sm sm:text-base text-foreground tabular-nums tracking-tight">
                          {formatCurrency(bill.totalAmount)}
                        </span>
                        {group.is_owner && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ type: 'bill', id: bill.id, name: bill.name });
                            }}
                            className="p-1 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Delete Bill"
                            aria-label="Delete Bill"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
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

      <DeleteConfirmationModal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={
          deleteTarget?.type === 'group'
            ? 'Delete Group?'
            : deleteTarget?.type === 'bill'
            ? 'Delete Bill?'
            : 'Remove Participant?'
        }
        itemName={
          deleteTarget?.type === 'group'
            ? group.name
            : deleteTarget?.name
        }
        description={
          deleteTarget?.type === 'group'
            ? `Are you sure you want to delete "${group.name}"?`
            : deleteTarget?.type === 'bill'
            ? `Are you sure you want to delete "${deleteTarget?.name || 'this bill'}"? This action cannot be undone.`
            : `Are you sure you want to remove "${deleteTarget?.name}" from this group's participants?`
        }
        warningNotice={
          deleteTarget?.type === 'group'
            ? 'Bills inside this group will NOT be deleted; they will simply be unlinked and remain available in your bills list.'
            : undefined
        }
        confirmText={deleteTarget?.type === 'member' ? 'Remove' : 'Delete'}
        isLoading={isDeleteLoading}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
