'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tag,
  AlignLeft,
  Coins,
  Globe,
  Lock,
  QrCode,
  Plus,
  Trash2,
  Eye,
  Download,
  Check,
  Crown,
  Copy,
  CreditCard,
  User,
  CloudUpload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CurrencyDropdown } from "@/components/shared/currency-dropdown";
import { TransferOwnershipModal } from "@/components/shared/transfer-ownership-modal";
import { DeleteConfirmationModal } from "@/components/shared/delete-confirmation-modal";
import { SettingsPageLayout } from "@/components/shared/settings-page-layout";
import { QrUploadButton } from "@/components/shared/qr-upload-button";
import { ParticipantCombobox } from "@/components/shared/participant-combobox";
import { useGroupStore } from "@/store/useGroupStore";
import { useAppSettingsStore } from "@/store/useAppSettingsStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { BillGroupDetail, GroupPaymentQr } from "@/../db/types";

interface GroupConfigurationProps {
  group: BillGroupDetail;
  onDeleteGroup?: () => void;
}

export function GroupConfiguration({ group, onDeleteGroup }: GroupConfigurationProps) {
  const { updateGroup, addPaymentQr, removePaymentQr, fetchGroup } = useGroupStore();
  const storageMode = useAppSettingsStore((s) => s.storageMode);
  const isLocal = group.owner_id === 'local' || storageMode === 'local';

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [currency, setCurrency] = useState(group.currency || 'VND');
  const [visibility, setVisibility] = useState<'public' | 'restricted'>(group.visibility || 'public');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Modals state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isUploadQrModalOpen, setIsUploadQrModalOpen] = useState(false);
  const [previewQr, setPreviewQr] = useState<GroupPaymentQr | null>(null);
  const [qrToDelete, setQrToDelete] = useState<GroupPaymentQr | null>(null);

  // New QR form state
  const [newQrImage, setNewQrImage] = useState<string>('');
  const [newPayerName, setNewPayerName] = useState<string>('');
  const [newPayerId, setNewPayerId] = useState<string | null>(null);
  const [newQrNote, setNewQrNote] = useState<string>('');
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');

  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  // Sync state if group prop updates from outside
  useEffect(() => {
    setName(group.name);
    setDescription(group.description || '');
    setCurrency(group.currency || 'VND');
    setVisibility(group.visibility || 'public');
  }, [group.id, group.name, group.description, group.currency, group.visibility]);

  // Debounced auto-save for core group settings (owner only)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (!group.is_owner) return;

    // Check if anything actually changed
    const hasChanged =
      name !== group.name ||
      description !== (group.description || '') ||
      currency !== (group.currency || 'VND') ||
      visibility !== (group.visibility || 'public');

    if (!hasChanged) return;

    const timer = setTimeout(() => {
      setSaving(true);
      updateGroup(group.id, {
        name: name.trim(),
        description: description.trim() || null,
        currency,
        visibility,
      })
        .then(() => {
          setSaving(false);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        })
        .catch((err) => {
          console.warn('Auto-save group settings error:', err);
          setSaving(false);
        });
    }, 1000);

    return () => clearTimeout(timer);
  }, [name, description, currency, visibility, group.is_owner, group.id, group.name, group.description, group.currency, group.visibility, updateGroup]);

  // Handle QR upload submit
  const handleUploadQrSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newQrImage) {
      setUploadError('Please choose or upload a QR code image');
      return;
    }
    if (!newPayerName.trim()) {
      setUploadError('Please select or enter the payer name');
      return;
    }

    setIsUploadingQr(true);
    setUploadError('');
    try {
      await addPaymentQr(group.id, {
        payerName: newPayerName.trim(),
        payerId: newPayerId,
        qrUrl: newQrImage,
        note: newQrNote.trim() || null,
      });

      // Reset form and close
      setNewQrImage('');
      setNewPayerName('');
      setNewPayerId(null);
      setNewQrNote('');
      setIsUploadQrModalOpen(false);
      await fetchGroup(group.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload QR code';
      setUploadError(msg);
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handleCopyNote = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNoteId(id);
      setTimeout(() => setCopiedNoteId(null), 2000);
    } catch {
      // Clipboard copy fallback
    }
  };

  const handleConfirmDeleteQr = async () => {
    if (!qrToDelete) return;
    try {
      await removePaymentQr(group.id, qrToDelete.id);
      setQrToDelete(null);
      await fetchGroup(group.id);
    } catch (err) {
      console.error('Failed to remove QR code:', err);
    }
  };

  const paymentQrs: GroupPaymentQr[] = group.payment_qrs || [];
  const participants = group.participants || [];

  const authUser = useAuthStore((s) => s.user);

  // Identify "Me" participant if matching authUser or group owner
  const myParticipant = useMemo(() => {
    if (authUser) {
      const match = participants.find(
        (p) =>
          (p.userId && p.userId === authUser.id) ||
          (p.email && authUser.email && p.email.toLowerCase() === authUser.email.toLowerCase()) ||
          p.name.trim().toLowerCase() === authUser.name?.trim().toLowerCase()
      );
      if (match) return match;
    }
    if (group.is_owner && group.owner_name) {
      const match = participants.find(
        (p) => p.name.trim().toLowerCase() === group.owner_name?.trim().toLowerCase()
      );
      if (match) return match;
    }
    return null;
  }, [authUser, participants, group.is_owner, group.owner_name]);

  // Compute top quick candidates (strictly limited to max 3-4 suggestions total)
  const quickCandidates = useMemo<Array<{ id: string; name: string; isMe: boolean }>>(() => {
    const list: Array<{ id: string; name: string; isMe: boolean }> = [];
    const addedNames = new Set<string>();

    // 1. "Me" candidate first
    if (myParticipant) {
      list.push({ id: myParticipant.id, name: myParticipant.name, isMe: true });
      addedNames.add(myParticipant.name.trim().toLowerCase());
    } else if (authUser?.name) {
      list.push({ id: 'me', name: authUser.name, isMe: true });
      addedNames.add(authUser.name.trim().toLowerCase());
    } else if (group.is_owner && group.owner_name) {
      list.push({ id: 'me', name: group.owner_name, isMe: true });
      addedNames.add(group.owner_name.trim().toLowerCase());
    }

    // 2. Add top other participants (limit to max 3-4 total so it never clutters)
    for (const p of participants) {
      if (list.length >= 4) break;
      const lower = p.name.trim().toLowerCase();
      if (!addedNames.has(lower)) {
        list.push({ id: p.id, name: p.name, isMe: false });
        addedNames.add(lower);
      }
    }

    return list;
  }, [myParticipant, authUser, group.is_owner, group.owner_name, participants]);

  return (
    <>
      <SettingsPageLayout
        title="Group Settings"
        subtitle="Details, currency, access & payment QR codes"
        saving={saving}
        saved={saved}
        isLocal={isLocal}
        admin={{
          isReadOnly: !group.is_owner,
          roleBadgeText: group.is_owner ? 'Owner' : 'Participant',
          adminTitle: group.is_owner ? 'Group Administration' : 'Group Access',
          adminDescription: group.is_owner
            ? 'Transfer ownership to another user or permanently delete this group.'
            : `Managed by ${group.owner_name || 'group owner'}. Only the owner can modify group settings or delete this group.`,
          onTransferClick: group.is_owner ? () => setIsTransferModalOpen(true) : undefined,
          onDeleteClick: group.is_owner ? () => setIsDeleteModalOpen(true) : undefined,
          transferButtonText: 'Transfer',
          deleteButtonText: 'Delete Group',
        }}
      >
        {/* Section 1: General Group Info (Card) */}
        <div className="p-3.5 sm:p-4 rounded-2xl border border-border/70 bg-card/60 space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-primary" /> Group Info
                </span>
                {!group.is_owner && (
                  <span className="text-[10px] font-semibold text-muted-foreground/80 px-2 py-0.5 rounded-md bg-muted/40">
                    Read-only (Owner only)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-foreground">
                    Group Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="e.g. Europe Trip 2026"
                    value={name}
                    disabled={!group.is_owner}
                    onChange={(e) => setName(e.target.value)}
                    className="h-9 bg-background/70 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/40 font-semibold text-xs disabled:opacity-60"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                    <Coins className="w-3 h-3 text-primary" /> Default Currency
                  </Label>
                  <CurrencyDropdown
                    value={currency}
                    onChange={(curr) => setCurrency(curr)}
                    variant="default"
                    className="h-9 bg-background/70"
                    disabled={!group.is_owner}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                  <AlignLeft className="w-3 h-3 text-primary" /> Description / Notes
                </Label>
                <Input
                  placeholder="Optional trip, event, or shared apartment notes..."
                  value={description}
                  disabled={!group.is_owner}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-9 bg-background/70 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/40 font-medium text-xs disabled:opacity-60"
                />
              </div>

              {/* Visibility Switcher */}
              <div className="pt-2 border-t border-border/40">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                  Share &amp; Access Visibility
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={!group.is_owner}
                    onClick={() => setVisibility('public')}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer relative",
                      visibility === 'public'
                        ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-2xs"
                        : "border-border/60 bg-background/50 hover:bg-muted/40",
                      !group.is_owner && "cursor-default opacity-80"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn(
                        "p-1.5 rounded-lg shrink-0",
                        visibility === 'public' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        <Globe className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-xs text-foreground">Public Link</span>
                      {visibility === 'public' && (
                        <Check className="w-3.5 h-3.5 text-primary ml-auto" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-normal">
                      Anyone with the group link can view bills and access payment QRs.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={!group.is_owner}
                    onClick={() => setVisibility('restricted')}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer relative",
                      visibility === 'restricted'
                        ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-2xs"
                        : "border-border/60 bg-background/50 hover:bg-muted/40",
                      !group.is_owner && "cursor-default opacity-80"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn(
                        "p-1.5 rounded-lg shrink-0",
                        visibility === 'restricted' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-xs text-foreground">Restricted</span>
                      {visibility === 'restricted' && (
                        <Check className="w-3.5 h-3.5 text-primary ml-auto" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-normal">
                      Only authenticated group members and bill creators can view.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* Section 2: Multi-Payer Payment QR Codes Card */}
            <div className="p-3.5 sm:p-4 rounded-2xl border border-border/70 bg-card/60 space-y-3.5 shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 shrink-0">
                      <QrCode className="w-3.5 h-3.5 text-primary" /> Group Payment QRs
                    </Label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                      {paymentQrs.length} {paymentQrs.length === 1 ? 'QR' : 'QRs'}
                    </span>
                  </div>

                  {paymentQrs.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setUploadError('');
                        setIsUploadQrModalOpen(true);
                      }}
                      className="h-7 px-2.5 sm:h-8 sm:px-3 rounded-xl text-xs font-bold gap-1.5 bg-foreground text-background hover:bg-foreground/90 shrink-0 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Upload QR</span>
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Upload payment QR codes for each group payer. Visible to all members for instant settlement.
                </p>
              </div>

              {/* QR List Grid */}
              {paymentQrs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-2.5 rounded-xl border border-dashed border-border/70 bg-muted/15 px-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <p className="text-xs font-bold text-foreground">No payment QR codes uploaded yet</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      In a group with multiple payers, upload QR codes (Bank transfer, VietQR, PromptPay, Momo, Revolut) for each person so everyone can scan and settle up!
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUploadError('');
                      setIsUploadQrModalOpen(true);
                    }}
                    className="h-8 rounded-xl text-xs font-bold gap-1.5 mt-1 border-border/80"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    <span>Upload First Payment QR</span>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {paymentQrs.map((qr) => (
                    <div
                      key={qr.id}
                      className="group relative p-3 rounded-xl border border-border/70 bg-background/60 hover:bg-muted/20 transition-all flex items-center gap-3 shadow-2xs"
                    >
                      {/* Clickable QR Thumbnail */}
                      <button
                        type="button"
                        onClick={() => setPreviewQr(qr)}
                        className="relative w-14 h-14 rounded-xl bg-white border border-border p-1 shrink-0 overflow-hidden hover:ring-2 hover:ring-primary transition-all cursor-pointer shadow-2xs group/thumb"
                        title="Click to view full screen"
                      >
                        <img
                          src={qr.qrUrl}
                          alt={`${qr.payerName} QR`}
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye className="w-4 h-4 text-white" />
                        </div>
                      </button>

                      {/* QR Payer Info */}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {group.owner_name && qr.payerName.trim().toLowerCase() === group.owner_name.trim().toLowerCase() ? (
                            <span title="Group Owner">
                              <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            </span>
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
                              {qr.payerName[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                          <h4 className="font-bold text-xs text-foreground truncate" title={qr.payerName}>
                            {qr.payerName}
                          </h4>
                        </div>

                        {qr.note ? (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                            <span className="truncate">{qr.note}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyNote(qr.id, qr.note!)}
                              className="text-muted-foreground hover:text-foreground shrink-0 p-0.5 rounded hover:bg-muted"
                              title="Copy details"
                            >
                              {copiedNoteId === qr.id ? (
                                <Check className="w-3 h-3 text-primary" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground/60 italic">No bank note provided</p>
                        )}

                        <p className="text-[9px] text-muted-foreground/50">
                          {qr.createdAt ? `Added ${new Date(qr.createdAt).toLocaleDateString()}` : 'Uploaded to group'}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setPreviewQr(qr)}
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                          title="View QR"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setQrToDelete(qr)}
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Delete QR"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
      </SettingsPageLayout>

      {/* Upload QR Code Modal */}
      <Dialog open={isUploadQrModalOpen} onOpenChange={setIsUploadQrModalOpen}>
        <DialogContent className="w-[calc(100vw-24px)] sm:w-full max-w-md max-h-[90vh] flex flex-col p-4 sm:p-5 text-foreground shadow-2xl rounded-2xl sm:rounded-3xl border border-border/80 bg-card overflow-hidden">
          <DialogHeader className="pb-3 border-b border-border/60 shrink-0 text-left">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <QrCode className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold tracking-tight">
                  Upload Payment QR
                </DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground truncate">
                  Add a payment QR code for a payer in this group
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleUploadQrSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto overscroll-contain space-y-3.5 py-3.5 pr-0.5">
              {/* Image Picker */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <QrCode className="w-3 h-3 text-primary" /> QR Image <span className="text-destructive">*</span>
                </Label>

                {newQrImage ? (
                  <div className="flex items-center gap-3 p-3 rounded-2xl border border-border/70 bg-background/70">
                    <div className="w-16 h-16 rounded-xl bg-white border border-border p-1 shrink-0 overflow-hidden">
                      <img src={newQrImage} alt="Uploaded QR" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs font-bold text-foreground">QR Image Loaded</p>
                      <p className="text-[10px] text-muted-foreground">Ready to attach to payer</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setNewQrImage('')}
                        className="h-6 px-2 text-[10px] font-semibold text-destructive hover:bg-destructive/10 -ml-1"
                      >
                        Change Image
                      </Button>
                    </div>
                  </div>
                ) : (
                  <QrUploadButton
                    variant="dropzone"
                    label="Click to upload QR code"
                    onImageSelected={(dataUrl) => setNewQrImage(dataUrl)}
                  />
                )}
              </div>

              {/* Payer Selection via Combobox & Quick Suggestions */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <User className="w-3 h-3 text-primary" /> Who is this QR for? <span className="text-destructive">*</span>
                </Label>

                {/* Quick select chips (strictly limited to max 3-4, clean pills, no repetitive crowns) */}
                {quickCandidates.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {quickCandidates.map((c) => {
                      const isSelected = newPayerName.trim().toLowerCase() === c.name.trim().toLowerCase();
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setNewPayerName(c.name);
                            setNewPayerId(c.id === 'me' ? null : c.id);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap select-none",
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-2xs font-bold"
                              : "bg-muted/50 hover:bg-muted/80 border border-border/70 text-foreground"
                          )}
                        >
                          <span
                            className={cn(
                              "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                              isSelected
                                ? "bg-primary-foreground/20 text-primary-foreground"
                                : "bg-primary/10 text-primary"
                            )}
                          >
                            {c.isMe ? 'Me' : (c.name[0]?.toUpperCase() || '?')}
                          </span>
                          <span>{c.isMe ? `Me (${c.name})` : c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <ParticipantCombobox
                  participants={participants}
                  value={newPayerName}
                  selectedId={newPayerId}
                  onChange={(name, id) => {
                    setNewPayerName(name);
                    setNewPayerId(id);
                  }}
                  placeholder="Or search / select from all group members..."
                />
              </div>

              {/* Bank Note */}
              <div className="space-y-1">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CreditCard className="w-3 h-3 text-primary" /> Bank / Account Details (Optional)
                </Label>
                <Input
                  placeholder="e.g. Vietcombank: 1029384756 or Momo"
                  value={newQrNote}
                  onChange={(e) => setNewQrNote(e.target.value)}
                  className="h-9 text-xs rounded-xl bg-background/80"
                />
              </div>

              {uploadError && (
                <p className="text-xs font-semibold text-destructive px-1">{uploadError}</p>
              )}
            </div>

            <DialogFooter className="pt-3 border-t border-border/60 shrink-0 flex flex-row items-center justify-end gap-2 w-full">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsUploadQrModalOpen(false)}
                className="h-9 px-4 rounded-xl text-xs font-bold flex-1 sm:flex-initial"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!newQrImage || !newPayerName.trim() || isUploadingQr}
                className="h-9 px-4 rounded-xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 flex-1 sm:flex-initial shadow-sm"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                <span>{isUploadingQr ? 'Saving QR...' : 'Save & Publish QR'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* QR Preview / Zoom Full-Screen Modal */}
      {previewQr && (
        <Dialog open={Boolean(previewQr)} onOpenChange={(open) => !open && setPreviewQr(null)}>
          <DialogContent className="w-[calc(100vw-24px)] sm:w-full max-w-sm p-4 sm:p-6 text-foreground shadow-2xl rounded-3xl border border-border/80 bg-card flex flex-col items-center text-center">
            <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-border/40">
              <div className="flex items-center gap-2 text-left min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <QrCode className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-foreground truncate">{previewQr.payerName}</h3>
                  <p className="text-[10px] text-muted-foreground">Scan to Pay</p>
                </div>
              </div>
            </div>

            {/* High-res QR Image with download/copy capability */}
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
                  onClick={() => handleCopyNote(previewQr.id, previewQr.note!)}
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

      {/* Delete QR Confirmation Modal */}
      <DeleteConfirmationModal
        open={Boolean(qrToDelete)}
        onOpenChange={(open) => !open && setQrToDelete(null)}
        title="Remove Payment QR?"
        itemName={qrToDelete ? `${qrToDelete.payerName}'s QR code` : ''}
        description="Are you sure you want to remove this payment QR code? Others will no longer be able to scan it."
        confirmText="Remove"
        onConfirm={handleConfirmDeleteQr}
      />

      {/* Transfer Ownership Modal */}
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

      {/* Delete Group Modal */}
      <DeleteConfirmationModal
        open={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        title="Delete Group?"
        itemName={group.name}
        description={`Are you sure you want to delete "${group.name}"?`}
        warningNotice="Bills inside this group will NOT be deleted; they will simply be unlinked and remain available in your bills list."
        confirmText="Delete"
        onConfirm={async () => {
          if (onDeleteGroup) {
            onDeleteGroup();
          } else {
            await useGroupStore.getState().deleteGroup(group.id);
          }
        }}
      />
    </>
  );
}
