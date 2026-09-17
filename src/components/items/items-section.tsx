import { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Receipt, ScanLine } from "lucide-react";
import { useBillStore } from "@/store/useBillStore";
import { cn } from "@/lib/utils";
import { BillUploader } from "./bill-uploader";
import { ItemRow } from "./item-row";
import { CurrencyInput } from "@/components/shared/currency-input";
import { formatCurrency } from "@/lib/format";
import { calculateBillTotals } from "@/lib/common-data-model";

export function ItemsSection() {
    const { items, addItem, isReadOnly } = useBillStore();
    const [newItemName, setNewItemName] = useState("");
    const [newItemPrice, setNewItemPrice] = useState(0);
    const [newItemQuantity, setNewItemQuantity] = useState("1");
    const [showScanner, setShowScanner] = useState(false);

    const handleAdd = () => {
        const quantity = Math.max(1, parseInt(newItemQuantity) || 1);
        if (newItemName.trim() && newItemPrice > 0) {
            addItem(newItemName.trim(), newItemPrice, quantity);
            setNewItemName("");
            setNewItemPrice(0);
            setNewItemQuantity("1");
        }
    };

    const totalItemsCost = calculateBillTotals({ items }).subtotal;

    return (
        <Card className="w-full h-full flex flex-col min-h-0 border-0 md:border md:border-foreground/[0.05] bg-transparent md:bg-card/20 overflow-hidden shadow-none rounded-none md:rounded-2xl">
            {/* Header: compact single-line on mobile with money and OCR scan to save space */}
            <div className="pb-1.5 pt-0 px-1 sm:px-4 md:px-6 md:pt-4 flex items-center justify-between shrink-0 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="hidden md:flex items-center gap-2 text-foreground font-black uppercase tracking-widest text-lg">
                        <Receipt className="w-4 h-4 text-primary shrink-0" />
                        <span>Bill Items</span>
                    </div>
                    {items.length > 0 && (
                        <div className="text-xs font-black text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20 shrink-0 flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 md:hidden text-primary shrink-0" />
                            <span className="tabular-nums">{items.length} items</span>
                            <span className="text-primary/40">·</span>
                            <span className="text-foreground font-black tabular-nums">{formatCurrency(totalItemsCost)}</span>
                        </div>
                    )}
                </div>
                {!isReadOnly && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowScanner(!showScanner)}
                        className={cn(
                            "h-8 px-2.5 sm:h-9 sm:px-3 text-xs font-bold text-muted-foreground hover:text-primary transition-all rounded-xl shrink-0 border border-foreground/10 gap-1.5",
                            showScanner && "text-primary bg-primary/10 border-primary/20"
                        )}
                        title="Scan receipt image"
                    >
                        <ScanLine className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span className="text-[11px] font-bold">Scan Receipt</span>
                    </Button>
                )}
            </div>

            <CardContent className="flex-1 min-h-0 p-0 overflow-hidden flex flex-col">
                <ScrollArea className="flex-1 min-h-0 h-full px-1 sm:px-4 md:px-6">
                    <div className="space-y-2 sm:space-y-4 py-1 sm:py-4 pr-1 sm:pr-3">
                        {showScanner && !isReadOnly && (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                <BillUploader onScanComplete={() => setShowScanner(false)} />
                            </div>
                        )}

                        {/* Add Item Form - compact scale */}
                        {!isReadOnly && (
                            <div className="relative group p-2.5 sm:p-3.5 rounded-xl bg-card border border-foreground/[0.08] overflow-hidden shadow-sm">
                                <div className="absolute inset-0 bg-primary/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
                                <div className="relative space-y-2">
                                    <Input
                                        placeholder="Item name (e.g. Wagyu Beef)..."
                                        value={newItemName}
                                        onChange={(e) => setNewItemName(e.target.value)}
                                        className="h-8 sm:h-9 bg-background/60 border-foreground/10 rounded-lg focus-visible:ring-1 focus-visible:ring-primary/40 font-semibold px-2.5 sm:px-3 text-xs placeholder:text-muted-foreground/60 placeholder:text-xs"
                                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                    />
                                    <div className="flex gap-2 items-end">
                                        <div className="flex flex-col gap-0.5 w-12 sm:w-16 shrink-0">
                                            <label className="text-[9px] font-bold uppercase text-muted-foreground tracking-wider pl-0.5">Qty</label>
                                            <Input
                                                type="number"
                                                placeholder="1"
                                                value={newItemQuantity}
                                                onChange={(e) => setNewItemQuantity(e.target.value)}
                                                className="h-8 bg-background/60 border-foreground/10 rounded-lg text-center font-bold text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none px-1"
                                                min={1}
                                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                            <label className="text-[9px] font-bold uppercase text-muted-foreground tracking-wider pl-0.5">Total Price</label>
                                            <CurrencyInput
                                                value={newItemPrice}
                                                onChange={setNewItemPrice}
                                                className="h-8 bg-background/60 border-foreground/10 rounded-lg text-right font-bold text-xs"
                                                showCurrencySymbol={true}
                                            />
                                        </div>
                                        <Button
                                            onClick={handleAdd}
                                            size="icon"
                                            className="h-8 w-8 bg-foreground text-background hover:bg-foreground/90 rounded-lg shadow-sm active:scale-95 transition-all disabled:opacity-30 shrink-0"
                                            disabled={!newItemName.trim() || newItemPrice <= 0}
                                        >
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Item List */}
                        <div className="space-y-2 pb-2 sm:pb-6">
                            {items.length === 0 && (
                                <div className="text-center text-muted-foreground py-10 text-sm border-2 border-dashed rounded-xl bg-muted/10">
                                    No items added yet.<br />
                                    <span className="text-xs opacity-70">Add manually or click the scan icon above.</span>
                                </div>
                            )}
                            {items.map((item) => (
                                <ItemRow key={item.id} item={item} />
                            ))}
                        </div>
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
