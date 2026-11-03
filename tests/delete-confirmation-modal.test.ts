import { describe, it, expect } from "bun:test";
import { DeleteConfirmationModal } from "@/components/shared/delete-confirmation-modal";
import * as AlertDialogPrimitive from "@/components/ui/alert-dialog";
import fs from "fs";
import path from "path";

describe("Custom Shadcn Delete Modal System", () => {
  it("exports DeleteConfirmationModal and shadcn AlertDialog primitives", () => {
    expect(DeleteConfirmationModal).toBeDefined();
    expect(typeof DeleteConfirmationModal).toBe("function");

    expect(AlertDialogPrimitive.AlertDialog).toBeDefined();
    expect(AlertDialogPrimitive.AlertDialogContent).toBeDefined();
    expect(AlertDialogPrimitive.AlertDialogHeader).toBeDefined();
    expect(AlertDialogPrimitive.AlertDialogFooter).toBeDefined();
    expect(AlertDialogPrimitive.AlertDialogTitle).toBeDefined();
    expect(AlertDialogPrimitive.AlertDialogDescription).toBeDefined();
    expect(AlertDialogPrimitive.AlertDialogAction).toBeDefined();
    expect(AlertDialogPrimitive.AlertDialogCancel).toBeDefined();
  });

  it("ensures default browser confirm() is completely eliminated from components", () => {
    const srcDir = path.resolve(__dirname, "../src/components");

    function scanFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...scanFiles(fullPath));
        } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const files = scanFiles(srcDir);
    const offendingFiles: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      // Check for window.confirm or bare confirm(
      if (/window\.confirm\s*\(/.test(content) || /(?<![a-zA-Z0-9_])confirm\s*\([^)]*\)/.test(content)) {
        offendingFiles.push(path.relative(srcDir, file));
      }
    }

    expect(offendingFiles).toEqual([]);
  });

  it("verifies all destructive operations across items, people, charges, bills, and groups use DeleteConfirmationModal", () => {
    const landingPage = fs.readFileSync(path.resolve(__dirname, "../src/components/layout/landing-page.tsx"), "utf8");
    const billConfig = fs.readFileSync(path.resolve(__dirname, "../src/components/summary/bill-configuration.tsx"), "utf8");
    const groupOverview = fs.readFileSync(path.resolve(__dirname, "../src/components/groups/group-overview.tsx"), "utf8");
    const itemRow = fs.readFileSync(path.resolve(__dirname, "../src/components/items/item-row.tsx"), "utf8");
    const personRow = fs.readFileSync(path.resolve(__dirname, "../src/components/people/person-row.tsx"), "utf8");
    const billUploader = fs.readFileSync(path.resolve(__dirname, "../src/components/items/bill-uploader.tsx"), "utf8");

    expect(landingPage.includes("DeleteConfirmationModal")).toBe(true);
    expect(billConfig.includes("DeleteConfirmationModal")).toBe(true);
    expect(groupOverview.includes("DeleteConfirmationModal")).toBe(true);
    expect(itemRow.includes("DeleteConfirmationModal")).toBe(true);
    expect(personRow.includes("DeleteConfirmationModal")).toBe(true);
    expect(billUploader.includes("DeleteConfirmationModal")).toBe(true);
  });

  it("verifies reusable SwipeableCard is used for bill and group cards on root page and group view", async () => {
    const { SwipeableCard } = await import("@/components/shared/swipeable-card");
    expect(SwipeableCard).toBeDefined();
    expect(typeof SwipeableCard).toBe("function");

    const landingCardSrc = fs.readFileSync(path.resolve(__dirname, "../src/components/layout/landing-card.tsx"), "utf8");
    const groupOverviewSrc = fs.readFileSync(path.resolve(__dirname, "../src/components/groups/group-overview.tsx"), "utf8");
    const participantCardSrc = fs.readFileSync(path.resolve(__dirname, "../src/components/shared/participant-card.tsx"), "utf8");
    const personRowSrc = fs.readFileSync(path.resolve(__dirname, "../src/components/people/person-row.tsx"), "utf8");

    // Root LandingCard, group SwipeableBillCard, and ParticipantCard all use SwipeableCard
    expect(landingCardSrc.includes("SwipeableCard")).toBe(true);
    expect(groupOverviewSrc.includes("SwipeableCard")).toBe(true);
    expect(participantCardSrc.includes("SwipeableCard")).toBe(true);
    expect(participantCardSrc.includes("Trash2")).toBe(false);
    expect(participantCardSrc.includes("onSetHost")).toBe(true);

    // PersonRow removes 'Pays remaining' & 'Set Host' text pills and allows host to add sponsor without upfront paid input
    expect(personRowSrc.includes("Pays remaining")).toBe(false);
    expect(personRowSrc.includes("<span>Set Host</span>")).toBe(false);
    expect(personRowSrc.includes('isHost ? "Add sponsor" : "Add sponsor / paid"')).toBe(true);

    // Visible trash button on the surface of LandingCard is eliminated in favor of swipe-to-delete
    expect(landingCardSrc.includes("<button\n                                type=\"button\"\n                                onClick={(e) => {\n                                    e.stopPropagation();\n                                    onDelete();")).toBe(false);
  });
});
