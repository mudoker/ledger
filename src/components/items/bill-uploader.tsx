import { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Upload, FileText, Check, X, Trash2, Plus, ToggleRight, ToggleLeft } from "lucide-react";
import Tesseract from 'tesseract.js';
import { useBillStore } from '@/store/useBillStore';
import { Progress } from "@/components/ui/progress";
import { parseReceiptText, type DetectedItem } from '@/lib/receipt-parser';
import { DeleteConfirmationModal } from "@/components/shared/delete-confirmation-modal";

export interface BillUploaderProps {
    onScanComplete?: () => void;
}

export function BillUploader({ onScanComplete }: BillUploaderProps) {
    const { addItem, addGlobalCharge } = useBillStore();
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState("");
    const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
    const [detectedCharges, setDetectedCharges] = useState<{ id: string, name: string, amount: number, type: 'fixed' | 'percent' }[]>([]);
    const [priceMode, setPriceMode] = useState<'total' | 'per-item'>('total');
    const [showDiscardAllModal, setShowDiscardAllModal] = useState(false);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsProcessing(true);
        setStatus("Initializing...");
        setProgress(0);
        setDetectedItems([]);
        setDetectedCharges([]);

        try {
            const worker = await Tesseract.createWorker('eng', 1, {
                logger: (m: any) => {
                    if (m.status === 'recognizing text') {
                        setProgress(Math.floor(m.progress * 100));
                        setStatus(`Scanning... ${Math.floor(m.progress * 100)}%`);
                    } else {
                        setStatus(m.status);
                    }
                }
            });

            setStatus("Processing Image...");
            const { data: { text } } = await worker.recognize(file);

            const result = parseReceiptText(text);
            setDetectedItems(result.items);
            setDetectedCharges(result.globalCharges.map(c => ({ ...c, id: crypto.randomUUID() })));

            await worker.terminate();
            setStatus("Complete");
        } catch (error) {
            console.error(error);
            setStatus("Error scanning file.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleItemChange = (id: string, field: keyof DetectedItem, value: string | number) => {
        setDetectedItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            return { ...item, [field]: value };
        }));
    };

    const handleDeleteItem = (id: string) => {
        setDetectedItems(prev => prev.filter(i => i.id !== id));
    };

    const handleAddNewRow = () => {
        setDetectedItems(prev => [
            ...prev,
            { id: crypto.randomUUID(), name: "New Item", price: 0, quantity: 1 }
        ]);
    };

    const confirmItems = () => {
        detectedItems.forEach(item => {
            addItem(item.name, item.price, item.quantity);
        });
        detectedCharges.forEach(charge => {
            if (charge.amount > 0) {
                addGlobalCharge({ name: charge.name, amount: charge.amount, type: charge.type });
            }
        });

        setDetectedItems([]);
        setDetectedCharges([]);
        if (onScanComplete) onScanComplete();
    };

    return (
        <Card className="w-full bg-muted/20 border-dashed mb-4 relative overflow-hidden">
            {onScanComplete && (
                <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={onScanComplete}>
                    <X className="w-4 h-4" />
                </Button>
            )}
            <CardContent className="p-4 flex flex-col items-center gap-4">
                {!isProcessing && detectedItems.length === 0 && (
                    <div className="flex flex-col items-center gap-2 text-center">
                        <div className="p-3 bg-primary/10 rounded-full animate-bounce">
                            <Upload className="w-6 h-6 text-primary" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-semibold text-sm">Scan Receipt</h3>
                            <p className="text-xs text-muted-foreground p-2">Upload an image to auto-detect items</p>
                        </div>
                        <label className="cursor-pointer">
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                            <Button variant="outline" size="sm" className="mt-2 pointer-events-none">
                                Choose File
                            </Button>
                        </label>
                    </div>
                )}

                {isProcessing && (
                    <div className="w-full space-y-2 text-center py-4">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                        <p className="text-xs text-muted-foreground">{status}</p>
                        <Progress value={progress} className="h-1 w-2/3 mx-auto" />
                    </div>
                )}

                {detectedItems.length > 0 && (
                    <div className="w-full space-y-3 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center justify-between pb-2 border-b border-border/50 flex-wrap gap-2">
                            <h4 className="font-medium text-sm flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Confirm Bill
                            </h4>
                            <div className="flex gap-1.5 sm:gap-2">
                                <Button size="sm" variant="outline" onClick={handleAddNewRow} className="h-7 text-xs gap-1 border-dashed hover:border-solid hover:bg-secondary">
                                    <Plus className="w-3 h-3" /> Add Item
                                </Button>
                                <Button size="sm" onClick={confirmItems} className="h-7 text-xs gap-1">
                                    <Check className="w-3 h-3" /> Confirm All
                                </Button>
                            </div>
                        </div>

                        {/* Global Charges */}
                        <div className="space-y-2">
                            {detectedCharges.map((charge, idx) => (
                                <div key={charge.id} className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="space-y-1">
                                        <label className="text-muted-foreground ml-1">Charge Name</label>
                                        <Input
                                            value={charge.name}
                                            onChange={(e) => {
                                                const newCharges = [...detectedCharges];
                                                newCharges[idx].name = e.target.value;
                                                setDetectedCharges(newCharges);
                                            }}
                                            className="h-8"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-muted-foreground ml-1">Amount</label>
                                        <Input
                                            type="number"
                                            value={charge.amount}
                                            onChange={(e) => {
                                                const newCharges = [...detectedCharges];
                                                newCharges[idx].amount = parseFloat(e.target.value) || 0;
                                                setDetectedCharges(newCharges);
                                            }}
                                            className="h-8"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Per-item / Total toggle */}
                        <div className="flex items-center justify-end gap-2 text-xs">
                            <span className="text-muted-foreground">Price is:</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] px-2 gap-1"
                                onClick={() => setPriceMode(prev => prev === 'total' ? 'per-item' : 'total')}
                            >
                                {priceMode === 'total' ? <ToggleLeft className="w-3.5 h-3.5" /> : <ToggleRight className="w-3.5 h-3.5" />}
                                {priceMode === 'total' ? 'Total for row' : 'Per item'}
                            </Button>
                        </div>

                        {/* Mobile Card List (sm:hidden) */}
                        <div className="sm:hidden space-y-2 max-h-64 overflow-y-auto pr-1">
                            {detectedItems.map((item) => (
                                <div key={item.id} className="p-2.5 rounded-xl border border-foreground/10 bg-background/50 space-y-2">
                                    <Input
                                        className="h-8 text-xs px-2 w-full font-bold"
                                        value={item.name}
                                        onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                                        placeholder="Item name"
                                    />
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 shrink-0">
                                            <Input
                                                type="number"
                                                className="h-8 text-center p-1 text-xs font-bold"
                                                value={item.quantity}
                                                onChange={(e) => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 1)}
                                                min={1}
                                                placeholder="Qty"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <Input
                                                type="number"
                                                className="h-8 text-right p-1 text-xs font-mono font-bold"
                                                value={priceMode === 'total' ? item.price : (item.quantity > 0 ? Math.round(item.price / item.quantity) : item.price)}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    if (priceMode === 'per-item') {
                                                        handleItemChange(item.id, 'price', val * item.quantity);
                                                    } else {
                                                        handleItemChange(item.id, 'price', val);
                                                    }
                                                }}
                                                step={1000}
                                                placeholder="Price"
                                            />
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                                            onClick={() => handleDeleteItem(item.id)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table (hidden sm:block) */}
                        <ScrollArea className="hidden sm:block h-64 rounded-lg border bg-background/50">
                            <div className="min-w-[500px]">
                                <div className="flex text-[10px] uppercase tracking-wider font-semibold text-muted-foreground p-2 bg-muted/30 sticky top-0 z-10 backdrop-blur-sm border-b items-center gap-1">
                                    <div className="flex-1 px-1">Item Name</div>
                                    <div className="w-14 text-center">Qty</div>
                                    <div className="w-28 text-right px-1">{priceMode === 'total' ? 'Total' : 'Per Item'}</div>
                                    <div className="w-10"></div>
                                </div>
                                <div className="divide-y divide-border/40">
                                    {detectedItems.map((item) => (
                                        <div key={item.id} className="flex items-center gap-1 p-1 hover:bg-muted/40 transition-colors">
                                            <Input
                                                className="h-8 text-xs flex-1 px-2 min-w-[120px]"
                                                value={item.name}
                                                onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                                                placeholder="Item name"
                                            />
                                            <Input
                                                type="number"
                                                className="h-8 w-14 text-center p-1 text-xs"
                                                value={item.quantity}
                                                onChange={(e) => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 1)}
                                                min={1}
                                                placeholder="Qty"
                                            />
                                            <Input
                                                type="number"
                                                className="h-8 w-28 text-right p-1 text-xs font-mono"
                                                value={priceMode === 'total' ? item.price : (item.quantity > 0 ? Math.round(item.price / item.quantity) : item.price)}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value) || 0;
                                                    if (priceMode === 'per-item') {
                                                        handleItemChange(item.id, 'price', val * item.quantity);
                                                    } else {
                                                        handleItemChange(item.id, 'price', val);
                                                    }
                                                }}
                                                step={1000}
                                                placeholder="Price"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                                                onClick={() => handleDeleteItem(item.id)}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </ScrollArea>
                        <div className="flex justify-between items-center text-xs text-muted-foreground px-1 pt-1">
                            <span>Check quantities and prices before confirming.</span>
                            <Button variant="ghost" size="sm" onClick={() => setShowDiscardAllModal(true)} className="h-7 text-destructive hover:bg-destructive/10 hover:text-destructive gap-1 px-2">
                                <Trash2 className="w-3 h-3" /> Discard All
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>

            <DeleteConfirmationModal
                open={showDiscardAllModal}
                onOpenChange={setShowDiscardAllModal}
                title="Discard All Scanned Items?"
                description={`Are you sure you want to discard all ${detectedItems.length} scanned items?`}
                confirmText="Discard All"
                onConfirm={() => {
                    setDetectedItems([]);
                    setShowDiscardAllModal(false);
                }}
            />
        </Card>
    );
}
