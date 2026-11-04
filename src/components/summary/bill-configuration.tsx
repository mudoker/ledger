'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Plus,
    Trash2,
    Percent,
    Tag,
    MapPin,
    Folder,
    Coins,
    QrCode,
    Crown,
} from "lucide-react";
import { useBillStore, type Person, type GlobalCharge, type Item } from "@/store/useBillStore";
import { useGroupStore } from "@/store/useGroupStore";
import { TransferOwnershipModal } from "@/components/shared/transfer-ownership-modal";
import { cn } from "@/lib/utils";
import { CurrencyInput } from "@/components/shared/currency-input";
import { CurrencyDropdown } from "@/components/shared/currency-dropdown";
import { getCurrencySymbol } from "@/lib/currency";
import { calculateBillTotals } from "@/lib/common-data-model";
import { InheritParticipantsDialog } from "@/components/groups/inherit-participants-dialog";
import { DeleteConfirmationModal } from "@/components/shared/delete-confirmation-modal";
import { SettingsPageLayout } from "@/components/shared/settings-page-layout";
import { QrUploadButton } from "@/components/shared/qr-upload-button";
import type { PersonData } from "@/../db/types";

export interface BillConfigurationProps {
    people?: Person[];
    hostId?: string | null;
    globalCharges?: GlobalCharge[];
    billName?: string;
    location?: string;
    items?: Item[];
    setHostId?: (id: string) => void;
    addGlobalCharge?: (charge: Omit<GlobalCharge, 'id'>) => void;
    updateGlobalCharge?: (id: string, data: Partial<GlobalCharge>) => void;
    removeGlobalCharge?: (id: string) => void;
    setBillName?: (name: string) => void;
    setLocation?: (location: string) => void;
    updatePerson?: (id: string, data: Partial<Person>) => void;
    onSave?: () => Promise<any>;
    qrCode?: string | null;
    setQrCode?: (url: string) => void;
}

const CHARGE_PRESETS: Array<{ name: string; amount: number; type: 'percent' | 'fixed' }> = [
    { name: 'VAT (8%)', amount: 8, type: 'percent' },
    { name: 'Tax (10%)', amount: 10, type: 'percent' },
    { name: 'Service (5%)', amount: 5, type: 'percent' },
];

export function BillConfiguration(props: BillConfigurationProps = {}) {
    const store = useBillStore();

    const people = props.people ?? store.people;
    const hostId = props.hostId ?? store.hostId;
    const globalCharges = props.globalCharges ?? store.globalCharges;
    const billName = props.billName ?? store.billName;
    const location = props.location ?? store.location;
    const items = props.items ?? store.items;
    const setHostId = props.setHostId ?? store.setHostId;
    const addGlobalCharge = props.addGlobalCharge ?? store.addGlobalCharge;
    const updateGlobalCharge = props.updateGlobalCharge ?? store.updateGlobalCharge;
    const removeGlobalCharge = props.removeGlobalCharge ?? store.removeGlobalCharge;
    const setBillName = props.setBillName ?? store.setBillName;
    const setLocation = props.setLocation ?? store.setLocation;
    const onSave = props.onSave ?? store.saveToDb;
    const qrCode = props.qrCode ?? store.qrCode;
    const setQrCode = props.setQrCode ?? store.setQrCode;

    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeletingBill, setIsDeletingBill] = useState(false);
    const [chargeToDelete, setChargeToDelete] = useState<GlobalCharge | null>(null);
    const currency = useBillStore((state) => state.currency);
    const groupId = useBillStore((state) => state.groupId);
    const setGroupId = useBillStore((state) => state.setGroupId);
    const currentBillId = useBillStore((state) => state.currentBillId);
    const isReadOnly = useBillStore((state) => state.isReadOnly);
    const deleteBill = useBillStore((state) => state.deleteBill);
    const sharingStatus = useBillStore((state) => state.sharingStatus);
    const visibility = useBillStore((state) => state.visibility);
    const isLocal = !currentBillId || sharingStatus === 'local' || visibility === 'local';
    const { groups, fetchGroups } = useGroupStore();

    useEffect(() => {
        fetchGroups();
    }, [fetchGroups]);

    const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
    const [showInheritDialog, setShowInheritDialog] = useState(false);
    const [targetGroupData, setTargetGroupData] = useState<{ name: string; participants: PersonData[] } | null>(null);

    const handleGroupSelect = async (val: string) => {
        if (val === "none") {
            await setGroupId(null);
            return;
        }
        if (val === groupId) return;

        const matched = groups.find((g) => g.id === val);
        let participants: PersonData[] = (matched as any)?.participants || [];

        if (!participants || participants.length === 0) {
            try {
                const gd = await useGroupStore.getState().fetchGroup(val);
                if (gd && (gd as any).participants?.length) {
                    participants = (gd as any).participants;
                }
            } catch {
                // Ignore group participant fetch error
            }
        }

        const hasUnadded = participants.some((gp) => {
            const gpName = gp.name.trim().toLowerCase();
            const gpEmail = gp.email?.trim().toLowerCase();
            return !people.some((cp) => {
                if (gpEmail && cp.email && cp.email.trim().toLowerCase() === gpEmail) return true;
                if (cp.name && cp.name.trim().toLowerCase() === gpName) return true;
                return false;
            });
        });

        if (hasUnadded && participants.length > 0) {
            setPendingGroupId(val);
            setTargetGroupData({
                name: matched?.name || 'Group',
                participants,
            });
            setShowInheritDialog(true);
        } else {
            await setGroupId(val, []);
        }
    };

    const totalItemCost = calculateBillTotals({ items }).subtotal;

    const handleTypeChange = (chargeId: string, currentAmount: number, currentType: 'fixed' | 'percent', targetType: 'fixed' | 'percent') => {
        if (currentType === targetType) return;

        let newAmount = currentAmount;
        if (totalItemCost > 0) {
            if (targetType === 'fixed') {
                newAmount = Math.round((totalItemCost * currentAmount) / 100);
            } else {
                newAmount = Number(((currentAmount / totalItemCost) * 100).toFixed(1));
            }
        } else {
            newAmount = 0;
        }

        updateGlobalCharge(chargeId, { type: targetType, amount: newAmount });
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setSaving(true);
            onSave()
                .then(() => {
                    setSaving(false);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                })
                .catch((err) => {
                    console.warn('Auto-save error:', err);
                    setSaving(false);
                });
        }, 1000);

        return () => clearTimeout(timer);
    }, [billName, location, hostId, globalCharges, people, items, qrCode, onSave]);

    return (
        <>
            <SettingsPageLayout
                title="Bill Settings"
                subtitle="Details, currency, taxes & payment QR"
                saving={saving}
                saved={saved}
                isLocal={isLocal}
                admin={{
                    isReadOnly,
                    roleBadgeText: isReadOnly ? 'Viewer' : 'Owner',
                    adminTitle: isReadOnly ? 'Read-Only Access' : 'Bill Administration',
                    adminDescription: isReadOnly
                        ? 'Only the bill owner can modify settings or delete this bill.'
                        : 'Transfer ownership to another member or permanently delete this bill.',
                    onTransferClick: (!isReadOnly && currentBillId) ? () => setIsTransferModalOpen(true) : undefined,
                    onDeleteClick: (!isReadOnly && currentBillId) ? () => setIsDeleteModalOpen(true) : undefined,
                    transferButtonText: 'Transfer',
                    deleteButtonText: 'Delete Bill',
                }}
            >
            {/* Section 1: General Bill Info (2x2 Grid Card) */}
            <div className="p-3.5 sm:p-4 rounded-2xl border border-border/70 bg-card/60 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Tag className="w-3 h-3 text-primary" /> Bill Name
                                    </Label>
                                    <Input
                                        placeholder="e.g. Lunch at KFC"
                                        value={billName}
                                        disabled={isReadOnly}
                                        onChange={(e) => setBillName(e.target.value)}
                                        className="h-9 bg-background/70 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/40 font-semibold text-xs disabled:opacity-60"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <MapPin className="w-3 h-3" /> Venue / Location
                                    </Label>
                                    <Input
                                        placeholder="Optional location"
                                        value={location}
                                        disabled={isReadOnly}
                                        onChange={(e) => setLocation(e.target.value)}
                                        className="h-9 bg-background/70 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/40 font-medium text-xs disabled:opacity-60"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1">
                                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Coins className="w-3 h-3 text-primary" /> Currency
                                    </Label>
                                    <CurrencyDropdown variant="default" className="h-9 bg-background/70" disabled={isReadOnly} />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Folder className="w-3 h-3 text-primary" /> Linked Group
                                    </Label>
                                    <Select
                                        value={groupId || "none"}
                                        onValueChange={handleGroupSelect}
                                        disabled={isReadOnly}
                                    >
                                        <SelectTrigger className="h-9 bg-background/70 border-border/80 rounded-xl font-medium text-xs">
                                            <SelectValue placeholder="Standalone Bill" />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-xl">
                                            <SelectItem value="none" className="text-xs">Standalone Bill</SelectItem>
                                            {groups.map((g) => (
                                                <SelectItem key={g.id} value={g.id} className="text-xs">
                                                    <div className="flex items-center gap-1.5">
                                                        <Folder className="w-3 h-3 text-primary shrink-0" />
                                                        <span className="truncate">{g.name}</span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {people.length > 0 && (
                                <div className="pt-1 border-t border-border/50 flex items-center justify-between gap-3">
                                    <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 shrink-0">
                                        <Crown className="w-3.5 h-3.5 text-amber-500" /> Primary Payer (Host)
                                    </Label>
                                    <Select value={hostId || ""} onValueChange={setHostId} disabled={isReadOnly}>
                                        <SelectTrigger className="h-8 w-auto min-w-[140px] max-w-[220px] bg-background/70 border-border/80 rounded-xl font-semibold text-xs">
                                            <SelectValue placeholder="Select host" />
                                        </SelectTrigger>
                                        <SelectContent align="end" className="rounded-xl">
                                            {people.map((p) => (
                                                <SelectItem key={p.id} value={p.id} className="text-xs font-medium">
                                                    {p.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                        {/* Section 2: Extra Charges & Taxes (Compact Single-Line Rows + Quick Presets) */}
                        <div className="p-3.5 sm:p-4 rounded-2xl border border-border/70 bg-card/60 space-y-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Percent className="w-3.5 h-3.5 text-primary" /> Extra Charges &amp; Taxes
                                </Label>

                                {!isReadOnly && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                        {CHARGE_PRESETS.map((preset) => (
                                            <button
                                                key={preset.name}
                                                type="button"
                                                onClick={() => addGlobalCharge(preset)}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border/60 text-[10px] font-semibold text-muted-foreground transition-colors cursor-pointer active:scale-95"
                                            >
                                                <Plus className="w-2.5 h-2.5" />
                                                <span>{preset.name}</span>
                                            </button>
                                        ))}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 px-2 text-[10px] font-bold rounded-lg gap-1"
                                            onClick={() => addGlobalCharge({ name: "Custom Charge", amount: 0, type: 'fixed' })}
                                        >
                                            <Plus className="w-2.5 h-2.5" /> Custom
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {globalCharges.length > 0 ? (
                                <div className="space-y-2">
                                    {globalCharges.map((charge) => (
                                        <div
                                            key={charge.id}
                                            className="flex items-center gap-2 p-2 rounded-xl bg-background/70 border border-border/60"
                                        >
                                            <Input
                                                value={charge.name}
                                                disabled={isReadOnly}
                                                onChange={(e) => updateGlobalCharge(charge.id, { name: e.target.value })}
                                                className="h-8 text-xs font-semibold bg-transparent border-border/50 rounded-lg flex-1 min-w-[100px]"
                                                placeholder="Charge name..."
                                            />
                                            <div className="w-28 sm:w-32 shrink-0">
                                                <CurrencyInput
                                                    value={charge.amount}
                                                    onChange={(val) => updateGlobalCharge(charge.id, { amount: val })}
                                                    className="h-8 text-xs bg-background border-border/50 rounded-lg font-bold text-right px-2"
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="flex bg-muted/60 border border-border/60 rounded-lg p-0.5 shrink-0">
                                                <button
                                                    type="button"
                                                    disabled={isReadOnly}
                                                    className={cn(
                                                        "h-7 px-2 rounded-md text-[10px] font-bold transition-all cursor-pointer",
                                                        charge.type === 'percent'
                                                            ? "bg-foreground text-background shadow-2xs"
                                                            : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                    onClick={() => handleTypeChange(charge.id, charge.amount, charge.type, 'percent')}
                                                >
                                                    %
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isReadOnly}
                                                    className={cn(
                                                        "h-7 px-2 rounded-md text-[10px] font-bold transition-all cursor-pointer",
                                                        charge.type === 'fixed'
                                                            ? "bg-foreground text-background shadow-2xs"
                                                            : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                    onClick={() => handleTypeChange(charge.id, charge.amount, charge.type, 'fixed')}
                                                >
                                                    {getCurrencySymbol(currency)}
                                                </button>
                                            </div>
                                            {!isReadOnly && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                                                    onClick={() => setChargeToDelete(charge)}
                                                    title="Delete charge"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[11px] text-muted-foreground/70 py-1.5 text-center border border-dashed border-border/60 rounded-xl bg-muted/10">
                                    No extra charges applied. Tap a preset above to add VAT or service tax.
                                </p>
                            )}
                        </div>

                        {/* Section 3: Compact Payment QR Code Card */}
                        <div className="p-3.5 sm:p-4 rounded-2xl border border-border/70 bg-card/60 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 min-w-0">
                                {qrCode ? (
                                    <div className="w-12 h-12 rounded-xl bg-white border border-border p-1 shrink-0 overflow-hidden">
                                        <img src={qrCode} alt="Payment QR" className="w-full h-full object-contain" />
                                    </div>
                                ) : (
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                                        <QrCode className="w-4 h-4" />
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-foreground">Host Payment QR Code</p>
                                    <p className="text-[11px] text-muted-foreground truncate">
                                        {qrCode
                                            ? (isLocal ? "Displayed in Summary (stored locally on this device)" : "Displayed in Summary for instant scanning")
                                            : "Upload bank or e-wallet QR for participants"}
                                    </p>
                                </div>
                            </div>

                            {!isReadOnly && (
                                <div className="flex items-center gap-2 shrink-0">
                                    {qrCode ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setQrCode("")}
                                            className="h-8 rounded-xl text-xs font-semibold text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                                        >
                                            Remove QR
                                        </Button>
                                    ) : (
                                        <QrUploadButton
                                            onImageSelected={(dataUrl) => setQrCode(dataUrl)}
                                            disabled={isReadOnly}
                                            label="Upload QR"
                                        />
                                    )}
                                </div>
                            )}
                        </div>
        </SettingsPageLayout>

            {targetGroupData && (
                <InheritParticipantsDialog
                    open={showInheritDialog}
                    onOpenChange={setShowInheritDialog}
                    groupName={targetGroupData.name}
                    groupParticipants={targetGroupData.participants}
                    currentPeople={people}
                    onConfirm={async (selected) => {
                        if (pendingGroupId) {
                            await setGroupId(pendingGroupId, selected);
                            setPendingGroupId(null);
                        }
                    }}
                    onSkip={async () => {
                        if (pendingGroupId) {
                            await setGroupId(pendingGroupId, []);
                            setPendingGroupId(null);
                        }
                    }}
                />
            )}

            {currentBillId && (
                <TransferOwnershipModal
                    open={isTransferModalOpen}
                    onOpenChange={setIsTransferModalOpen}
                    targetType="bill"
                    targetId={currentBillId}
                    targetName={billName || 'Untitled Bill'}
                    onSuccess={() => {
                        store.fetchBill(currentBillId);
                    }}
                />
            )}

            {currentBillId && (
                <DeleteConfirmationModal
                    open={isDeleteModalOpen}
                    onOpenChange={setIsDeleteModalOpen}
                    title="Delete Bill?"
                    itemName={billName || 'Untitled Bill'}
                    description="Are you sure you want to permanently delete this bill and all associated items and calculations? This action cannot be undone."
                    confirmText="Delete Bill"
                    isLoading={isDeletingBill}
                    onConfirm={async () => {
                        setIsDeletingBill(true);
                        try {
                            await deleteBill(currentBillId);
                            window.location.href = window.location.origin + window.location.pathname;
                        } finally {
                            setIsDeletingBill(false);
                            setIsDeleteModalOpen(false);
                        }
                    }}
                />
            )}

            <DeleteConfirmationModal
                open={Boolean(chargeToDelete)}
                onOpenChange={(open) => !open && setChargeToDelete(null)}
                title="Delete Charge?"
                itemName={chargeToDelete?.name}
                description={`Are you sure you want to remove the "${chargeToDelete?.name}" charge from this bill?`}
                confirmText="Delete Charge"
                onConfirm={() => {
                    if (chargeToDelete) {
                        removeGlobalCharge(chargeToDelete.id);
                        setChargeToDelete(null);
                    }
                }}
            />
        </>
    );
}
