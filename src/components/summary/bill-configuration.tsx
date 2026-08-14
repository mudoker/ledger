'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Settings, Percent, Banknote, Tag, MapPin, Check, CloudUpload, Folder, UserCheck, Shield } from "lucide-react";
import { useBillStore, type Person, type GlobalCharge, type Item } from "@/store/useBillStore";
import { useGroupStore } from "@/store/useGroupStore";
import { TransferOwnershipModal } from "@/components/shared/transfer-ownership-modal";
import { cn } from "@/lib/utils";
import { CurrencyInput } from "@/components/shared/currency-input";
import { CurrencyDropdown } from "@/components/shared/currency-dropdown";
import { getCurrencySymbol } from "@/lib/currency";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

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
    const updatePerson = props.updatePerson ?? store.updatePerson;
    const onSave = props.onSave ?? store.saveToDb;
    const qrCode = props.qrCode ?? store.qrCode;
    const setQrCode = props.setQrCode ?? store.setQrCode;

    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const currency = useBillStore((state) => state.currency);
    const groupId = useBillStore((state) => state.groupId);
    const setGroupId = useBillStore((state) => state.setGroupId);
    const currentBillId = useBillStore((state) => state.currentBillId);
    const isReadOnly = useBillStore((state) => state.isReadOnly);
    const deleteBill = useBillStore((state) => state.deleteBill);
    const { groups, fetchGroups } = useGroupStore();

    useEffect(() => {
        fetchGroups();
    }, [fetchGroups]);

    const totalItemCost = items.reduce((sum, item) => sum + (item.price || 0), 0);

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

    // Auto-save triggers
    useEffect(() => {
        setSaving(true);
        const timer = setTimeout(() => {
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
        }, 800);

        return () => clearTimeout(timer);
    }, [billName, location, hostId, globalCharges, people, items, qrCode, onSave]);

    return (
        <Card className="w-full h-full flex flex-col min-h-0 border-none shadow-none md:border md:shadow-sm bg-background overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-3 pt-2 sm:pt-4 px-3 sm:px-6 shrink-0 border-b border-border/40 gap-2">
                <div className="space-y-0.5 min-w-0 flex-1">
                    <CardTitle className="text-base sm:text-lg font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                        <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" /> Bill Settings
                    </CardTitle>
                    <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
                        Configure bill details, currency, charges & host payment QR
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {saving ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-foreground/5 rounded-full border border-foreground/10">
                            <div className="w-2.5 h-2.5 border-[1.5px] border-foreground/30 border-t-foreground rounded-full animate-spin" />
                            <span className="text-[9px] font-black uppercase text-foreground/80 tracking-widest">Saving...</span>
                        </div>
                    ) : saved ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-foreground/10 rounded-full border border-foreground/20">
                            <Check className="w-3 h-3 text-primary" />
                            <span className="text-[9px] font-black uppercase text-foreground tracking-widest">Saved</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-foreground/[0.03] rounded-full border border-foreground/[0.05]">
                            <CloudUpload className="w-3 h-3 text-muted-foreground/60" />
                            <span className="text-[9px] font-black uppercase text-muted-foreground/60 tracking-widest">Synced</span>
                        </div>
                    )}
                </div>
            </CardHeader>

            <CardContent className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col">
                <ScrollArea className="flex-1 min-h-0 h-full px-3 sm:px-6">
                    <div className="py-4 space-y-6 max-w-3xl pb-8">
                        {/* Bill Metadata */}
                        <div className="space-y-3 sm:space-y-4">
                            <Label className="text-[11px] font-black text-foreground/60 uppercase tracking-[0.2em] pl-1">Bill Details</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                                <div className="relative group">
                                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-foreground transition-colors pointer-events-none" />
                                    <Input
                                        placeholder="Bill name (e.g. Lunch at KFC)"
                                        value={billName}
                                        disabled={isReadOnly}
                                        onChange={(e) => setBillName(e.target.value)}
                                        className="pl-9 h-9 bg-foreground/[0.03] border-border rounded-xl focus-visible:ring-1 focus-visible:ring-foreground/20 font-medium text-xs disabled:opacity-60"
                                    />
                                </div>
                                <div className="relative group">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-foreground transition-colors pointer-events-none" />
                                    <Input
                                        placeholder="Location"
                                        value={location}
                                        disabled={isReadOnly}
                                        onChange={(e) => setLocation(e.target.value)}
                                        className="pl-9 h-9 bg-foreground/[0.03] border-border rounded-xl focus-visible:ring-1 focus-visible:ring-foreground/20 font-medium text-xs disabled:opacity-60"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Currency Setting */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                                <Label className="text-[11px] font-black text-foreground/60 uppercase tracking-[0.2em]">Currency</Label>
                                <span className="text-[10px] text-muted-foreground font-semibold">Live Frankfurter exchange rates</span>
                            </div>
                            <CurrencyDropdown variant="default" />
                            <p className="text-[10px] text-muted-foreground/80 px-1 font-medium">Switching currency automatically converts all prices and amounts using central bank rates.</p>
                        </div>

                        {/* Bill Group Setting */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                                <Label className="text-[11px] font-black text-foreground/60 uppercase tracking-[0.2em] flex items-center gap-1.5">
                                    <Folder className="w-3.5 h-3.5 text-primary" /> Group Assignment
                                </Label>
                                {groupId && (
                                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                                        Linked
                                    </span>
                                )}
                            </div>
                            <Select
                                value={groupId || "none"}
                                onValueChange={(val) => setGroupId(val === "none" ? null : val)}
                                disabled={isReadOnly}
                            >
                                <SelectTrigger className="h-9 bg-foreground/[0.03] border-border rounded-xl font-medium text-xs">
                                    <SelectValue placeholder="No Group (Standalone Bill)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No Group (Standalone Bill)</SelectItem>
                                    {groups.map((g) => (
                                        <SelectItem key={g.id} value={g.id}>
                                            <div className="flex items-center gap-2">
                                                <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
                                                <span>{g.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground/80 px-1 font-medium">
                                Link this bill to an overview group to track combined spending across multiple events.
                            </p>
                        </div>

                        {/* Payment QR Code */}
                        <div className="space-y-3">
                            <Label className="text-[11px] font-black text-foreground/60 uppercase tracking-[0.2em] pl-1">Payment QR Code</Label>
                            <div className="flex flex-col gap-4 p-4 sm:p-5 bg-muted/10 border border-foreground/[0.03] rounded-2xl">
                                {qrCode ? (
                                    <div className="relative group w-full aspect-square max-w-[200px] mx-auto bg-white rounded-xl overflow-hidden border border-foreground/10 p-2">
                                        <img src={qrCode} alt="Payment QR" className="w-full h-full object-contain" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => setQrCode("")}
                                                className="h-8 text-xs font-bold uppercase tracking-wider"
                                            >
                                                Remove QR
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-6 sm:p-8 border-2 border-dashed border-foreground/10 rounded-xl hover:border-foreground/30 hover:bg-foreground/5 transition-all text-center gap-3 cursor-pointer relative">
                                        <Input
                                            type="file"
                                            accept="image/*"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        setQrCode(reader.result as string);
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                        <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center text-foreground border border-foreground/10">
                                            <CloudUpload className="w-5 h-5" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-black uppercase tracking-wider">Upload QR Image</p>
                                            <p className="text-[9px] text-muted-foreground font-bold">Recommended for Host Payment</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Host Selection */}
                        <div className="space-y-2 sm:space-y-3">
                            <Label className="text-[11px] font-black text-foreground/60 uppercase tracking-[0.2em] pl-1">Primary Payer (Host)</Label>
                            <Select value={hostId || ""} onValueChange={setHostId} disabled={isReadOnly}>
                                <SelectTrigger className="w-full h-9 sm:h-10 bg-muted/20 border-foreground/5 rounded-xl hover:bg-foreground/5 hover:border-foreground/20 transition-all font-semibold text-xs sm:text-sm">
                                    <SelectValue placeholder="Who paid the bill?" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-foreground/10 bg-background">
                                    {people.map((p) => (
                                        <SelectItem key={p.id} value={p.id} className="rounded-lg font-bold">{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Upfront Payments */}
                        <div className="space-y-3">
                            <Label className="text-[11px] font-black text-foreground/60 uppercase tracking-[0.2em] pl-1">Upfront Payments</Label>
                            <div className="grid gap-2 sm:gap-2.5">
                                {people.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-muted/10 border border-foreground/[0.03] gap-2">
                                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-foreground/5 flex items-center justify-center font-black text-xs text-foreground/80 border border-foreground/10 shrink-0">
                                                {p.name[0]}
                                            </div>
                                            <span className="text-xs font-bold truncate">{p.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {p.id === hostId ? (
                                                <div className="h-8 sm:h-9 px-2.5 sm:px-3 flex items-center justify-center bg-foreground/5 rounded-lg border border-foreground/10">
                                                    <span className="text-[9px] sm:text-[10px] font-black text-foreground/80 uppercase">Pays Remaining</span>
                                                </div>
                                            ) : (
                                                <CurrencyInput
                                                    value={p.paidAmount || 0}
                                                    onChange={(val) => updatePerson(p.id, { paidAmount: val })}
                                                    className="w-24 xs:w-28 sm:w-32 h-8 sm:h-9 text-right text-xs bg-background border-foreground/[0.05] focus-visible:ring-1 focus-visible:ring-foreground/20 rounded-lg font-bold tabular-nums"
                                                    showCurrencySymbol={true}
                                                />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Extra Charges */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <Label className="text-[11px] font-black text-foreground/60 uppercase tracking-[0.2em]">Extra Charges & Taxes</Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1.5 text-[10px] font-black uppercase text-foreground hover:bg-foreground/10 rounded-full px-3 sm:px-4 border border-foreground/10 touch-manipulation active:scale-95"
                                    onClick={() => addGlobalCharge({ name: "Service Tax", amount: 10, type: 'percent' })}
                                >
                                    <Plus className="w-3.5 h-3.5" /> Add Charge
                                </Button>
                            </div>

                            <div className="space-y-2.5 sm:space-y-3">
                                {globalCharges.map((charge) => (
                                    <div key={charge.id} className="group relative flex items-start gap-2.5 sm:gap-4 p-3 sm:p-4 bg-muted/10 border border-foreground/[0.03] rounded-2xl transition-all hover:border-foreground/20 hover:bg-muted/20">
                                        <div className="grid gap-2 sm:gap-3 flex-1 min-w-0">
                                            <Input
                                                value={charge.name}
                                                onChange={(e) => updateGlobalCharge(charge.id, { name: e.target.value })}
                                                className="h-7 text-xs font-black bg-transparent border-none p-0 focus-visible:ring-0 placeholder:text-muted-foreground/30 text-foreground"
                                                placeholder="Charge name..."
                                            />
                                            <div className="flex items-center gap-1.5 sm:gap-2">
                                                <div className="relative flex-1 min-w-0">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-foreground/70 font-black z-10 pointer-events-none">
                                                        {charge.type === 'percent' ? <Percent className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />}
                                                    </span>
                                                    <CurrencyInput
                                                        value={charge.amount}
                                                        onChange={(val) => updateGlobalCharge(charge.id, { amount: val })}
                                                        className="h-9 pl-9 text-xs bg-background border-foreground/[0.05] focus-visible:ring-1 focus-visible:ring-foreground/20 rounded-xl font-bold"
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <div className="flex bg-background border border-foreground/[0.1] rounded-xl p-0.5 gap-0.5 shadow-sm shrink-0">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className={cn(
                                                            "h-8 sm:h-9 px-2 sm:px-3 rounded-lg text-[10px] font-black transition-all touch-manipulation active:scale-95",
                                                            charge.type === 'percent'
                                                                ? "bg-foreground text-background shadow-md scale-[1.02]"
                                                                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5 opacity-50"
                                                        )}
                                                        onClick={() => handleTypeChange(charge.id, charge.amount, charge.type, 'percent')}
                                                    >
                                                        %
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className={cn(
                                                            "h-8 sm:h-9 px-2 sm:px-3 rounded-lg text-[10px] font-black transition-all touch-manipulation active:scale-95",
                                                            charge.type === 'fixed'
                                                                ? "bg-foreground text-background shadow-md scale-[1.02]"
                                                                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5 opacity-50"
                                                        )}
                                                        onClick={() => handleTypeChange(charge.id, charge.amount, charge.type, 'fixed')}
                                                    >
                                                        {getCurrencySymbol(currency)}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors rounded-xl shrink-0 touch-manipulation active:scale-95"
                                            onClick={() => removeGlobalCharge(charge.id)}
                                            title="Delete charge"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        </Button>
                                    </div>
                                ))}

                                {globalCharges.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-10 text-center gap-3 rounded-2xl border border-dashed border-foreground/10 bg-muted/5">
                                        <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center border border-foreground/10">
                                            <Percent className="w-5 h-5 text-foreground/40" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">No extra charges</p>
                                            <p className="text-[9px] text-muted-foreground/30 px-6 leading-relaxed italic">Add Taxes or Service Fees to apply them globally.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bill Ownership & Administration */}
                        <div className="space-y-3 pt-2 border-t border-border/50">
                            <Label className="text-[11px] font-black text-foreground/60 uppercase tracking-[0.2em] pl-1 flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5 text-primary" /> Ownership &amp; Permissions
                            </Label>
                            <div className="p-3.5 sm:p-4 rounded-2xl border border-border/70 bg-card/60 flex items-center justify-between gap-3 flex-wrap">
                                <div className="space-y-0.5 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs font-bold text-foreground">
                                            {isReadOnly ? 'Read-Only Mode' : 'You own this bill'}
                                        </p>
                                        <span className={cn(
                                            "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded",
                                            isReadOnly ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary border border-primary/20"
                                        )}>
                                            {isReadOnly ? 'Participant / Viewer' : 'Owner'}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">
                                        {isReadOnly
                                            ? 'Only the bill owner can edit configuration, add items, or transfer ownership.'
                                            : 'You can transfer full administrative ownership of this bill to another registered user.'}
                                    </p>
                                </div>

                                {!isReadOnly && currentBillId && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsTransferModalOpen(true)}
                                        className="h-8 rounded-xl font-bold text-xs gap-1.5 shrink-0"
                                    >
                                        <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                                        <span>Transfer Ownership</span>
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Danger Zone: Delete Bill */}
                        {!isReadOnly && currentBillId && (
                            <div className="space-y-3 pt-2 border-t border-destructive/20">
                                <Label className="text-[11px] font-black text-destructive uppercase tracking-[0.2em] pl-1 flex items-center gap-1.5">
                                    <Trash2 className="w-3.5 h-3.5 text-destructive" /> Danger Zone
                                </Label>
                                <div className="p-3.5 sm:p-4 rounded-2xl border border-destructive/30 bg-destructive/5 flex items-center justify-between gap-3 flex-wrap">
                                    <div className="space-y-0.5 min-w-0">
                                        <p className="text-xs font-bold text-destructive">Delete this bill</p>
                                        <p className="text-[10px] text-muted-foreground">
                                            Permanently delete this bill and all associated items and calculations.
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={async () => {
                                            if (window.confirm(`Are you sure you want to permanently delete "${billName || 'this bill'}"?`)) {
                                                await deleteBill(currentBillId);
                                                window.location.href = window.location.origin + window.location.pathname;
                                            }
                                        }}
                                        className="h-8 rounded-xl font-bold text-xs gap-1.5 shrink-0 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Delete Bill</span>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>

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
        </Card>
    );
}
