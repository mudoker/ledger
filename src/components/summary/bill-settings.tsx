import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings, Plus, Trash2 } from "lucide-react";
import { useBillStore, type Person, type GlobalCharge } from "@/store/useBillStore";
import { getCurrencySymbol } from "@/lib/currency";
import { DeleteConfirmationModal } from "@/components/shared/delete-confirmation-modal";

interface BillSettingsProps {
    people: Person[];
    hostId: string | null;
    globalCharges: GlobalCharge[];
    setHostId: (id: string) => void;
    addGlobalCharge: (charge: Omit<GlobalCharge, 'id'>) => void;
    updateGlobalCharge: (id: string, data: Partial<GlobalCharge>) => void;
    removeGlobalCharge: (id: string) => void;
}

export function BillSettings({
    people,
    hostId,
    globalCharges,
    setHostId,
    addGlobalCharge,
    updateGlobalCharge,
    removeGlobalCharge,
}: BillSettingsProps) {
    const [chargeToDelete, setChargeToDelete] = useState<GlobalCharge | null>(null);
    const currency = useBillStore((state) => state.currency);
    const currSymbol = getCurrencySymbol(currency);

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                    <Settings className="w-4 h-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 sm:w-96">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Bill Settings</h4>
                        <p className="text-sm text-muted-foreground">Configure payer and extra charges.</p>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="host">Payer (Host)</Label>
                        <Select value={hostId || ""} onValueChange={setHostId}>
                            <SelectTrigger className="w-full h-8">
                                <SelectValue placeholder="Select who paid" />
                            </SelectTrigger>
                            <SelectContent>
                                {people.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Extra Charges</Label>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => addGlobalCharge({ name: "Tax", amount: 10, type: 'percent' })}>
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {globalCharges.map((charge) => (
                                <div key={charge.id} className="flex items-center gap-2">
                                    <Input value={charge.name} onChange={(e) => updateGlobalCharge(charge.id, { name: e.target.value })} className="h-8 text-xs flex-1" placeholder="Name" />
                                    <div className="flex items-center gap-1 w-28">
                                        <Input type="number" value={charge.amount} onChange={(e) => updateGlobalCharge(charge.id, { amount: parseFloat(e.target.value) || 0 })} className="h-8 text-xs w-16" />
                                        <Button variant="ghost" size="sm" className="h-8 w-8 px-0 text-xs font-bold" onClick={() => updateGlobalCharge(charge.id, { type: charge.type === 'percent' ? 'fixed' : 'percent' })}>
                                            {charge.type === 'percent' ? '%' : currSymbol}
                                        </Button>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setChargeToDelete(charge)}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                            {globalCharges.length === 0 && (
                                <div className="text-xs text-muted-foreground text-center py-2 border border-dashed rounded bg-muted/20">
                                    No extra charges added.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </PopoverContent>

            <DeleteConfirmationModal
                open={Boolean(chargeToDelete)}
                onOpenChange={(open) => !open && setChargeToDelete(null)}
                title="Delete Charge?"
                itemName={chargeToDelete?.name}
                description={`Are you sure you want to remove the "${chargeToDelete?.name}" charge?`}
                confirmText="Delete Charge"
                onConfirm={() => {
                    if (chargeToDelete) {
                        removeGlobalCharge(chargeToDelete.id);
                        setChargeToDelete(null);
                    }
                }}
            />
        </Popover>
    );
}
