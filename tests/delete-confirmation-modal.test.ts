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

  it("verifies landing page, bill configuration, and group overview use DeleteConfirmationModal", () => {
    const landingPage = fs.readFileSync(path.resolve(__dirname, "../src/components/layout/landing-page.tsx"), "utf8");
    const billConfig = fs.readFileSync(path.resolve(__dirname, "../src/components/summary/bill-configuration.tsx"), "utf8");
    const groupOverview = fs.readFileSync(path.resolve(__dirname, "../src/components/groups/group-overview.tsx"), "utf8");

    expect(landingPage.includes("DeleteConfirmationModal")).toBe(true);
    expect(billConfig.includes("DeleteConfirmationModal")).toBe(true);
    expect(groupOverview.includes("DeleteConfirmationModal")).toBe(true);
  });
});
