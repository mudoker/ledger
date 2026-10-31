'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Share2, Globe, Users } from "lucide-react";
import { generateShareUrl } from "@/lib/share";
import { useBillStore } from "@/store/useBillStore";
import { EnableSharingModal } from "@/components/shared/enable-sharing-modal";
import { SharingManagementModal } from "@/components/shared/sharing-management-modal";
import { DisableSharingModal } from "@/components/shared/disable-sharing-modal";
import type { BillVisibility } from '@/lib/local-db/types';

export function ShareButton() {
    const {
        currentBillId,
        sharingStatus,
        visibility,
        shareToken,
        people,
        items,
        globalCharges,
        hostId,
        enableSharing,
        disableSharing,
        updateSharingVisibility,
    } = useBillStore();

    const [isEnableModalOpen, setIsEnableModalOpen] = useState(false);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
    const [isRevoking, setIsRevoking] = useState(false);
    const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);

    const isShared = sharingStatus === 'shared';

    const handleShareClick = () => {
        if (isShared) {
            setIsManageModalOpen(true);
        } else {
            setIsEnableModalOpen(true);
        }
    };

    const handleConfirmEnableSharing = async (selectedVisibility: BillVisibility) => {
        await enableSharing(selectedVisibility);
        setIsManageModalOpen(true);
    };

    const handleToggleVisibility = async (newVisibility: BillVisibility) => {
        setIsUpdatingVisibility(true);
        try {
            await updateSharingVisibility(newVisibility);
        } finally {
            setIsUpdatingVisibility(false);
        }
    };

    const handleConfirmDisableSharing = async () => {
        setIsRevoking(true);
        try {
            await disableSharing();
            setIsDisableModalOpen(false);
            setIsManageModalOpen(false);
        } finally {
            setIsRevoking(false);
        }
    };

    const shareUrl = generateShareUrl(
        { people, items, globalCharges, hostId, currentBillId, shareToken },
        true
    );

    return (
        <>
            <Button
                variant={isShared ? "default" : "outline"}
                size="icon"
                onClick={handleShareClick}
                className={
                    isShared
                        ? "h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shrink-0 relative shadow-sm"
                        : "h-8 w-8 sm:h-9 sm:w-9 rounded-xl border-foreground/10 hover:bg-foreground/5 hover:text-primary transition-all shrink-0 relative"
                }
                title={
                    isShared
                        ? `Shared bill (${visibility === 'public' ? 'Public' : 'Restricted'}). Click to manage.`
                        : "Share bill (Local only)"
                }
            >
                <Share2 className="w-4 h-4" />
                {isShared && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                )}
            </Button>

            {/* Modal 1: Enable Sharing Consent & Visibility Selector */}
            <EnableSharingModal
                open={isEnableModalOpen}
                onOpenChange={setIsEnableModalOpen}
                onConfirm={handleConfirmEnableSharing}
                participantCount={people.length}
            />

            {/* Modal 2: Sharing Management Interface */}
            <SharingManagementModal
                open={isManageModalOpen}
                onOpenChange={setIsManageModalOpen}
                visibility={visibility}
                shareUrl={shareUrl}
                people={people}
                onToggleVisibility={handleToggleVisibility}
                onRequestDisableSharing={() => {
                    setIsManageModalOpen(false);
                    setIsDisableModalOpen(true);
                }}
                isUpdatingVisibility={isUpdatingVisibility}
            />

            {/* Modal 3: Disable Sharing Confirmation */}
            <DisableSharingModal
                open={isDisableModalOpen}
                onOpenChange={setIsDisableModalOpen}
                onConfirm={handleConfirmDisableSharing}
                isRevoking={isRevoking}
            />
        </>
    );
}
