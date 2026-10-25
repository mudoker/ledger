'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Share2, Eye, Copy, Check, ExternalLink } from "lucide-react";
import { generateShareUrl } from "@/lib/share";
import { useBillState } from "@/hooks/useBillState";
import { cn } from "@/lib/utils";

export function ShareButton() {
    const { people, items, globalCharges, hostId, currentBillId } = useBillState();
    const [copiedView, setCopiedView] = useState(false);

    const handleCopyShare = () => {
        const url = generateShareUrl({ people, items, globalCharges, hostId, currentBillId }, true);
        navigator.clipboard.writeText(url);
        setCopiedView(true);
        setTimeout(() => setCopiedView(false), 2000);
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl border-foreground/10 hover:bg-foreground/5 hover:text-primary transition-all shrink-0"
                    title="Share bill (read-only link)"
                >
                    <Share2 className="w-4 h-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3 bg-card/95 backdrop-blur-xl border-border rounded-2xl shadow-2xl" align="end">
                <div className="space-y-2.5">
                    <div className="space-y-0.5">
                        <div className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                            <Eye className="w-3.5 h-3.5 text-primary" /> Read-Only Share Link
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                            Anyone with this link can view the bill without logging in. Editing is strictly disabled.
                        </p>
                    </div>
                    <div className="flex gap-1.5">
                        <Button
                            size="sm"
                            className={cn(
                                "flex-1 h-9 text-xs gap-2 font-bold",
                                copiedView ? "bg-primary hover:bg-primary/90 text-primary-foreground" : "bg-foreground text-background"
                            )}
                            onClick={handleCopyShare}
                        >
                            {copiedView ? (
                                <>
                                    <Check className="w-3.5 h-3.5" /> Link Copied!
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3.5 h-3.5" /> Copy Share Link
                                </>
                            )}
                        </Button>
                        {currentBillId && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 px-2.5 text-xs font-bold rounded-xl"
                                onClick={() => {
                                    const url = generateShareUrl({ people, items, globalCharges, hostId, currentBillId }, true);
                                    window.open(url, '_blank');
                                }}
                                title="Open shared view in new tab"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
