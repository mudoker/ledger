import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Trash2, Edit2, Users, Check, X, Plus, Minus } from "lucide-react";
import { useBillStore, type Item } from "@/store/useBillStore";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { CurrencyInput } from "@/components/shared/currency-input";
import { DeleteConfirmationModal } from "@/components/shared/delete-confirmation-modal";

export function ItemRow({ item }: { item: Item }) {
    const { updateItem, removeItem, people, isReadOnly } = useBillStore();
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(item.name);
    const [price, setPrice] = useState(item.price);
    const [quantity, setQuantity] = useState(item.quantity?.toString() || "1");
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const handleSave = () => {
        const newQty = Math.max(1, parseInt(quantity) || 1);
        const assignments = item.assignments || {};
        const clampedAssignments: Record<string, number> = {};
        for (const [pId, pVal] of Object.entries(assignments)) {
            clampedAssignments[pId] = Math.max(1, Math.min(newQty, Math.round(Number(pVal) || 1)));
        }

        updateItem(item.id, {
            name: name.trim() || item.name,
            price,
            quantity: newQty,
            assignments: clampedAssignments,
        });
        setIsEditing(false);
    };

    const handleCancel = () => {
        setName(item.name);
        setPrice(item.price);
        setQuantity(item.quantity?.toString() || "1");
        setIsEditing(false);
    };

    const togglePerson = (personId: string) => {
        if (isReadOnly) return;
        const assignments = item.assignments || {};
        const newAssignments = { ...assignments };
        if (newAssignments[personId] !== undefined) {
            delete newAssignments[personId];
        } else {
            newAssignments[personId] = 1;
        }
        updateItem(item.id, { assignments: newAssignments });
    };

    const updatePersonQty = (personId: string, qtyVal: number) => {
        if (isReadOnly) return;
        const maxQty = Math.max(1, Math.round(item.quantity || 1));
        const sanitizedQty = Math.max(1, Math.min(maxQty, Math.round(qtyVal)));
        const assignments = item.assignments || {};
        const newAssignments = { ...assignments, [personId]: sanitizedQty };
        updateItem(item.id, { assignments: newAssignments });
    };

    const toggleAll = () => {
        if (isReadOnly) return;
        const maxQty = Math.max(1, Math.round(item.quantity || 1));
        const assignments = item.assignments || {};
        const allAssignedCount = people.filter(p => assignments[p.id] !== undefined).length;
        const everyoneAssigned = people.length > 0 && allAssignedCount === people.length;

        if (everyoneAssigned) {
            updateItem(item.id, { assignments: {} });
        } else {
            const newAssignments: Record<string, number> = {};
            people.forEach(p => {
                newAssignments[p.id] = Math.max(1, Math.min(maxQty, Math.round(Number(assignments[p.id]) || 1)));
            });
            updateItem(item.id, { assignments: newAssignments });
        }
    };

    const qty = Math.max(1, item.quantity || 1);
    const lineTotal = (item as any).totalPrice !== undefined
        ? Number((item as any).totalPrice)
        : Number(item.price || 0) * qty;
    const unitPrice = Number(item.price || 0);
    const assignments = item.assignments || {};
    const assignedPeopleIds = Object.keys(assignments);
    const totalClaimedQty = Object.values(assignments).reduce((sum, pQty) => {
        return sum + Math.min(pQty, qty);
    }, 0);

    const getPersonShare = (pQty: number) => {
        const cappedPQty = Math.min(pQty, qty);
        if (totalClaimedQty <= 0) return 0;

        if (totalClaimedQty >= qty) {
            return (cappedPQty / totalClaimedQty) * lineTotal;
        } else {
            return (cappedPQty / qty) * lineTotal;
        }
    };

    return (
        <div className="relative group bg-card border border-foreground/[0.05] rounded-xl p-2.5 sm:p-4 hover:bg-muted/5 hover:border-primary/30 transition-all duration-200">
            {isEditing ? (
                <div className="space-y-3 sm:space-y-4 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Edit Item</span>
                        <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg" onClick={handleCancel}>
                                <X className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 sm:h-8 sm:w-8 text-primary hover:bg-primary/10 rounded-lg" onClick={handleSave}>
                                <Check className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-9 bg-background/50 border-foreground/5 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/40 font-bold px-3 text-xs"
                        autoFocus
                        placeholder="Item name..."
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    />
                    <div className="flex gap-2.5 sm:gap-3 items-end">
                        <div className="space-y-1 w-20 shrink-0">
                            <Label className="text-[10px] font-black uppercase text-foreground/60 tracking-widest pl-1">Quantity</Label>
                            <Input
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="h-9 bg-background/50 border-foreground/5 rounded-xl text-center font-bold text-xs"
                                type="number"
                                min={1}
                                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                            />
                        </div>
                        <div className="space-y-1 flex-1 min-w-0">
                            <Label className="text-[10px] font-black uppercase text-foreground/60 tracking-widest pl-1">Total Price</Label>
                            <CurrencyInput
                                value={price}
                                onChange={setPrice}
                                className="h-9 bg-background/50 border-foreground/5 rounded-xl text-right font-bold text-xs"
                                showCurrencySymbol={true}
                            />
                        </div>
                    </div>
                </div>
            ) : (
                    <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0 pr-1 sm:pr-4">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mb-1">
                                <span className="font-black text-sm tracking-tight text-foreground truncate flex-1 min-w-0" title={item.name}>
                                    {item.name}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                    {qty > 1 && (
                                        <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">
                                            ×{qty}
                                        </span>
                                    )}
                                    <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 tabular-nums">
                                        {formatCurrency(lineTotal)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                                {qty > 1 && (
                                    <span className="text-[10px] font-bold text-foreground/70 uppercase tracking-tighter">
                                        {formatCurrency(unitPrice)} PER UNIT
                                    </span>
                                )}
                                <div className="h-3 w-[1px] bg-foreground/10 mx-1 hidden xs:block" />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-90 flex items-center gap-1.5">
                                    {assignedPeopleIds.length > 0 ? (
                                        <>
                                            <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20 font-black tabular-nums">{assignedPeopleIds.length}</span> members sharing
                                        </>
                                    ) : (
                                        people.length > 0 ? "Default total split" : "Awaiting participants"
                                    )}
                                </span>
                            </div>
                        </div>
                        {!isReadOnly && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-xl transition-all shrink-0 touch-manipulation active:scale-95">
                                        <MoreHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-40 p-1.5 bg-background/95 backdrop-blur-xl border-primary/20 shadow-2xl" align="end">
                                    <div className="flex flex-col gap-1">
                                        <Button variant="ghost" size="sm" className="justify-start h-9 text-[10px] font-black uppercase tracking-widest gap-2 touch-manipulation active:scale-95" onClick={() => { setName(item.name); setPrice(item.price); setQuantity(item.quantity?.toString() || "1"); setIsEditing(true); }}>
                                            <Edit2 className="w-3.5 h-3.5" /> Edit Details
                                        </Button>
                                        <Button variant="ghost" size="sm" className="justify-start h-9 text-[10px] font-black uppercase tracking-widest gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive touch-manipulation active:scale-95" onClick={() => setShowDeleteModal(true)}>
                                            <Trash2 className="w-3.5 h-3.5" /> Delete Item
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
            )}

            {/* Splits row */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2 sm:mt-4 items-center">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 sm:h-8 text-[9px] font-black uppercase tracking-widest gap-1.5 border-foreground/10 bg-foreground/5 text-foreground hover:bg-foreground/10 rounded-full px-2.5 sm:px-3 transition-all shrink-0 touch-manipulation active:scale-95">
                            <Users className="w-3.5 h-3.5" />
                            {isReadOnly ? "View Splits" : (assignedPeopleIds.length > 0 ? "Modify Splits" : "Assign Shares")}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(340px,calc(100vw-2rem))] p-0 bg-background/95 backdrop-blur-xl border-primary/20 shadow-2xl" align="start">
                        <div className="p-3 sm:p-4 border-b border-foreground/5 bg-primary/5">
                            <div className="flex items-center justify-between gap-2">
                                <div className="space-y-0.5 min-w-0 flex-1">
                                    <div className="font-black text-[11px] uppercase tracking-widest text-foreground truncate" title={item.name}>{item.name}</div>
                                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter opacity-70">
                                        {formatCurrency(lineTotal)} · {qty} units
                                    </div>
                                </div>
                                {!isReadOnly && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 sm:h-8 text-[9px] font-black uppercase px-2.5 sm:px-3 text-primary hover:bg-primary/10 rounded-full border border-primary/20 shrink-0"
                                        onClick={toggleAll}
                                    >
                                        {people.length > 0 && assignedPeopleIds.length === people.length ? "Clear all" : "Split all"}
                                    </Button>
                                )}
                            </div>
                        </div>
                        <div className="h-64 sm:h-72">
                            <ScrollArea className="h-full w-full">
                                <div className="p-2 space-y-1">
                                    {people.map((p) => {
                                        const pQty = assignments[p.id];
                                        const isSelected = pQty !== undefined;
                                        return (
                                            <div
                                                key={p.id}
                                                className={cn(
                                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                                                    isSelected ? "bg-primary/10 border border-primary/10" : "hover:bg-foreground/5 border border-transparent"
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        "w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all",
                                                        !isReadOnly && "cursor-pointer",
                                                        isSelected
                                                            ? "border-primary bg-primary text-primary-foreground"
                                                            : "border-foreground/20 bg-background/50"
                                                    )}
                                                    onClick={() => !isReadOnly && togglePerson(p.id)}
                                                >
                                                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                </div>
                                                <div className={cn("flex-1 min-w-0 pr-2", !isReadOnly && "cursor-pointer")} onClick={() => !isReadOnly && togglePerson(p.id)}>
                                                    <div className={cn("text-xs font-black tracking-tight flex items-center gap-1.5", isSelected ? "text-foreground" : "text-muted-foreground")}>
                                                        <span className="truncate">{p.name}</span>
                                                        {!(p.userId || p.email) && (
                                                            <span className="text-[8px] font-black uppercase px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border shrink-0">
                                                                Anon
                                                            </span>
                                                        )}
                                                    </div>
                                                    {isSelected && (
                                                        <div className="text-[10px] font-bold text-primary tabular-nums mt-0.5">
                                                            {formatCurrency(getPersonShare(pQty))}
                                                        </div>
                                                    )}
                                                </div>
                                                {isSelected && qty > 1 && (
                                                    <div
                                                        className="flex items-center gap-1 shrink-0 bg-background/80 px-2 py-1 rounded-xl border border-foreground/10 hover:border-foreground/20 transition-all shadow-sm"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {isReadOnly ? (
                                                            <span className="text-[11px] font-black text-foreground tabular-nums px-1">
                                                                ×{Math.round(pQty)}
                                                            </span>
                                                        ) : (
                                                            <div className="flex items-center gap-0.5">
                                                                <button
                                                                    type="button"
                                                                    disabled={Math.round(pQty) <= 1}
                                                                    className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all touch-manipulation"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        updatePersonQty(p.id, Math.round(pQty || 1) - 1);
                                                                    }}
                                                                    title="Decrease quantity"
                                                                >
                                                                    <Minus className="w-2.5 h-2.5" />
                                                                </button>
                                                                <Input
                                                                    type="number"
                                                                    value={Math.round(pQty)}
                                                                    onChange={(e) => {
                                                                        const parsed = parseInt(e.target.value, 10);
                                                                        updatePersonQty(p.id, isNaN(parsed) ? 1 : parsed);
                                                                    }}
                                                                    className="h-6 w-8 text-[11px] p-0 text-center font-black bg-transparent border-none focus-visible:ring-0 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                    step={1}
                                                                    min={1}
                                                                    max={qty}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    disabled={Math.round(pQty) >= qty}
                                                                    className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all touch-manipulation"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        updatePersonQty(p.id, Math.round(pQty || 1) + 1);
                                                                    }}
                                                                    title="Increase quantity"
                                                                >
                                                                    <Plus className="w-2.5 h-2.5" />
                                                                </button>
                                                            </div>
                                                        )}
                                                        <span className="text-[9px] font-black uppercase tracking-tighter text-muted-foreground/70 pr-0.5 select-none">
                                                            / {qty}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                    {people.length === 0 && (
                                        <div className="flex flex-col items-center justify-center py-10 gap-3 opacity-30">
                                            <Users className="w-8 h-8" />
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Awaiting participants</p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </PopoverContent>
                </Popover>

                {/* Person badges with click/tap Popover */}
                {people.length > 0 && assignedPeopleIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {people.filter(p => assignments[p.id] !== undefined).slice(0, 8).map(p => {
                            const pQty = assignments[p.id];
                            const pShare = getPersonShare(pQty);
                            const isAppMember = Boolean(p.userId || p.email);

                            return (
                                <Popover key={p.id}>
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            title={`${p.name}: ${formatCurrency(pShare)} ${qty > 1 && Math.round(pQty) > 1 ? `(${Math.round(pQty)} of ${qty} portions)` : ''}`}
                                            className="px-2.5 py-1 rounded-lg text-[10px] border font-bold uppercase tracking-tight transition-all flex items-center gap-1.5 bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/20 border-foreground/10 text-muted-foreground hover:text-foreground cursor-pointer touch-manipulation active:scale-95"
                                        >
                                            <span className="truncate max-w-[70px] sm:max-w-[100px]">{p.name}</span>
                                            {!isAppMember && (
                                                <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border shrink-0">
                                                    Anon
                                                </span>
                                            )}
                                            {qty > 1 && Math.round(pQty) > 1 && (
                                                <span className="text-amber-500 font-black">×{Math.round(pQty)}</span>
                                            )}
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent side="top" align="center" sideOffset={6} className="w-auto min-w-[140px] max-w-xs text-xs p-2.5 space-y-1 shadow-2xl border-border bg-popover/95 backdrop-blur-md rounded-xl z-[200]">
                                        <div className="flex items-center gap-1.5 font-bold">
                                            <span className="text-foreground">{p.name}</span>
                                            {isAppMember ? (
                                                <span className="text-[8px] font-black uppercase px-1 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                                                    Member
                                                </span>
                                            ) : (
                                                <span className="text-[8px] font-black uppercase px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border shrink-0">
                                                    Anon
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-primary font-black text-xs tabular-nums">
                                            {formatCurrency(pShare)}
                                            {qty > 1 && Math.round(pQty) > 1 && (
                                                <span className="text-muted-foreground font-normal ml-1.5 text-[11px]">
                                                    ({Math.round(pQty)} of {qty} portions)
                                                </span>
                                            )}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            );
                        })}
                        {assignedPeopleIds.length > 8 && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="px-2 py-1 rounded-lg text-[10px] font-black bg-primary/10 text-primary border border-primary/20 cursor-pointer hover:bg-primary/20 transition-colors"
                                    >
                                        +{assignedPeopleIds.length - 8}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent side="top" align="center" sideOffset={6} className="w-auto min-w-[160px] max-w-xs text-xs p-2.5 space-y-1.5 shadow-2xl border-border bg-popover/95 backdrop-blur-md rounded-xl z-[200]">
                                    <div className="font-bold text-muted-foreground text-[10px] uppercase">
                                        +{assignedPeopleIds.length - 8} More Participants:
                                    </div>
                                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                        {people.filter(p => assignments[p.id] !== undefined).slice(8).map(extra => (
                                            <div key={extra.id} className="flex justify-between items-center gap-3 text-xs">
                                                <span className="truncate text-foreground font-medium">{extra.name}</span>
                                                <span className="font-bold text-primary tabular-nums">{formatCurrency(getPersonShare(assignments[extra.id]))}</span>
                                            </div>
                                        ))}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                )}
            </div>

            <DeleteConfirmationModal
                open={showDeleteModal}
                onOpenChange={setShowDeleteModal}
                title="Delete Item?"
                itemName={item.name}
                description={`Are you sure you want to delete "${item.name}"? This action cannot be undone.`}
                confirmText="Delete Item"
                onConfirm={() => {
                    removeItem(item.id);
                    setShowDeleteModal(false);
                }}
            />
        </div>
    );
}
