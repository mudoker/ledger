import { describe, expect, it } from 'bun:test';
import { parseReceiptText } from '../src/lib/receipt-parser';
import { calculateBill } from '../src/hooks/useBillState';
import type { Person, GlobalCharge } from '../src/store/useBillStore';

describe('Receipt OCR Parser & Calculation Pipeline Integration', () => {
  describe('Receipt Text Parsing & Extraction', () => {
    it('parses typical Vietnamese restaurant receipt with VND prices and quantities', () => {
      const receiptText = `
        NHÀ HÀNG SEN VÀNG
        Địa chỉ: 123 Nguyễn Huệ, Q1, TP.HCM
        Bàn: 05 - Thu ngân: Mai - Giờ: 19:30
        -----------------------------------
        Món ăn              SL      Đơn giá
        Phở Bò Tái Nạm       2      120.000
        Nem Rán Hà Nội       1       85,000
        Bia Saigon Special   4       25k
        Trà Đá Đường         3        5.000
        -----------------------------------
        Tạm tính: 420.000
        VAT (10%) 42.000
        Phí dịch vụ 20.000
        Tổng cộng: 482.000
        Tiền mặt: 500.000
        Trả lại: 18.000
        Cảm ơn quý khách!
      `;

      const result = parseReceiptText(receiptText);

      // Verify items extracted
      expect(result.items.length).toBe(4);

      const pho = result.items.find(i => i.name.toLowerCase().includes('phở'));
      expect(pho).toBeDefined();
      expect(pho?.quantity).toBe(2);
      expect(pho?.price).toBe(120000);

      const nem = result.items.find(i => i.name.toLowerCase().includes('nem'));
      expect(nem).toBeDefined();
      expect(nem?.quantity).toBe(1);
      expect(nem?.price).toBe(85000);

      const beer = result.items.find(i => i.name.toLowerCase().includes('bia'));
      expect(beer).toBeDefined();
      expect(beer?.quantity).toBe(4);
      expect(beer?.price).toBe(25000); // 25k -> 25000

      const tea = result.items.find(i => i.name.toLowerCase().includes('trà đá'));
      expect(tea).toBeDefined();
      expect(tea?.quantity).toBe(3);
      expect(tea?.price).toBe(5000);

      // Verify charges extracted (VAT and service charge)
      expect(result.globalCharges.length).toBe(2);
      const vat = result.globalCharges.find(c => c.name.toLowerCase().includes('vat'));
      expect(vat).toBeDefined();
      expect(vat?.amount).toBe(42000);
      expect(vat?.type).toBe('fixed');

      const svc = result.globalCharges.find(c => c.name.toLowerCase().includes('service'));
      expect(svc).toBeDefined();
      expect(svc?.amount).toBe(20000);
      expect(svc?.type).toBe('fixed');
    });

    it('extracts items with leading multipliers like "2x Burger" or "3 x Pizza"', () => {
      const receiptText = `
        2x Gourmet Cheeseburger 180000
        1x Truffle French Fries 65000
        3 x Coca Cola Zero 30k
      `;

      const result = parseReceiptText(receiptText);
      expect(result.items.length).toBe(3);

      expect(result.items[0].name).toBe('Gourmet Cheeseburger');
      expect(result.items[0].quantity).toBe(2);
      expect(result.items[0].price).toBe(180000);

      expect(result.items[1].name).toBe('Truffle French Fries');
      expect(result.items[1].quantity).toBe(1);
      expect(result.items[1].price).toBe(65000);

      expect(result.items[2].name).toBe('Coca Cola Zero');
      expect(result.items[2].quantity).toBe(3);
      expect(result.items[2].price).toBe(30000);
    });

    it('filters out receipt metadata, header lines, timestamps, and payment lines', () => {
      const noisyText = `
        CHECK #98234
        BÀN: VIP 2
        THU NGÂN: TRANG
        GIỜ: 12:45 - NGÀY: 28/10/2026
        THÀNH TIỀN
        Gỏi Cuốn Tôm Thịt 75.000
        TỔNG CỘNG: 75.000
        TIỀN MẶT: 100.000
        THỐI LẠI: 25.000
        PHIẾU TẠM TÍNH
      `;

      const result = parseReceiptText(noisyText);
      // Only the genuine dish line should survive
      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('Gỏi Cuốn Tôm Thịt');
      expect(result.items[0].price).toBe(75000);
    });

    it('ignores prices under 500 VND to prevent noise and line-number interference', () => {
      const text = `
        Line 01 200
        Actual Spring Rolls 45000
        Item 99 150
      `;

      const result = parseReceiptText(text);
      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('Actual Spring Rolls');
      expect(result.items[0].price).toBe(45000);
    });

    it('returns empty lists for empty or whitespace-only inputs without crashing', () => {
      expect(parseReceiptText('')).toEqual({ items: [], globalCharges: [] });
      expect(parseReceiptText('   \n  \n\t  ')).toEqual({ items: [], globalCharges: [] });
      expect(parseReceiptText('RANDOM TEXT WITHOUT ANY NUMBERS OR PRICES')).toEqual({ items: [], globalCharges: [] });
    });
  });

  describe('End-to-End Receipt-to-Settlement Pipeline Integration', () => {
    it('seamlessly pipes parsed receipt items into calculateBill for accurate participant settlements', () => {
      // 1. Raw OCR receipt string
      const rawOcr = `
        QUÁN NƯỚNG BBQ
        ----------------------
        Bò Wagyu Nướng       2    500.000
        Hải Sản Thập Cẩm     1    300.000
        Salad Dưa Chuột      1     60.000
        Bia Craft IPA        4     40k
        ----------------------
        Thuế GTGT 102.000
        Phí dịch vụ 50.000
      `;

      // 2. Parse receipt
      const parsed = parseReceiptText(rawOcr);
      expect(parsed.items.length).toBe(4);
      expect(parsed.globalCharges.length).toBe(2);

      // 3. Setup participants
      const people: Person[] = [
        { id: 'p_alice', name: 'Alice', sponsorAmount: 0, paidAmount: 0 },
        { id: 'p_bob', name: 'Bob', sponsorAmount: 0, paidAmount: 0 },
        { id: 'p_charlie', name: 'Charlie', sponsorAmount: 0, paidAmount: 0 },
      ];

      // Host is Alice (who pays the full bill initially)
      const hostId = 'p_alice';

      // 4. Assign item consumption:
      // Item 0 (Wagyu 500k): Alice and Bob ate it (1 each)
      // Item 1 (Seafood 300k): Bob and Charlie ate it (0.5 each)
      // Item 2 (Salad 60k): Communal (empty assignment -> auto split equally)
      // Item 3 (Bia Craft 160k total = 4 x 40k): Alice had 1, Bob had 1, Charlie had 2
      const itemsWithAssignments = parsed.items.map((item, idx) => {
        if (idx === 0) {
          return { ...item, assignments: { p_alice: 1, p_bob: 1 } };
        }
        if (idx === 1) {
          return { ...item, assignments: { p_bob: 1, p_charlie: 1 } };
        }
        if (idx === 2) {
          // Communal: empty assignments -> distributed across all active splitters
          return { ...item, assignments: {} };
        }
        // Beer
        return { ...item, assignments: { p_alice: 1, p_bob: 1, p_charlie: 2 } };
      });

      // 5. Convert global charges to store types
      const globalCharges: GlobalCharge[] = parsed.globalCharges.map((gc, i) => ({
        id: `charge_${i}`,
        name: gc.name,
        amount: gc.amount,
        type: gc.type,
      }));

      // 6. Run calculation engine
      const calculation = calculateBill({
        people,
        items: itemsWithAssignments,
        globalCharges,
        hostId,
      });

      // Item total: 500k + 300k + 60k + 40k = 900,000 VND (Note: price in parsed item is unit price 40k)
      // Total Extras: 102k (VAT) + 50k (Service) = 152,000 VND
      expect(calculation.totalExtras).toBe(152000);
      expect(calculation.totalBill).toBe(calculation.totalItemCost + 152000);

      // Verify zero discrepancy and conservation of total
      expect(Math.abs(calculation.discrepancy)).toBeLessThan(0.01);

      const sumOfPayables = Object.values(calculation.finalPayables).reduce((a, b) => a + b, 0);
      expect(Math.abs(sumOfPayables - calculation.totalBill)).toBeLessThan(0.01);

      // Alice is Host, Bob and Charlie owe money to Alice
      expect(calculation.settlementFlows.length).toBe(2);
      const bobFlow = calculation.settlementFlows.find(f => f.from === 'p_bob');
      const charlieFlow = calculation.settlementFlows.find(f => f.from === 'p_charlie');

      expect(bobFlow).toBeDefined();
      expect(bobFlow?.to).toBe('p_alice');
      expect(bobFlow!.amount).toBeGreaterThan(0);

      expect(charlieFlow).toBeDefined();
      expect(charlieFlow?.to).toBe('p_alice');
      expect(charlieFlow!.amount).toBeGreaterThan(0);

      // Total received by Alice from Bob + Charlie equals total bill minus Alice's own share
      const totalOwedToAlice = bobFlow!.amount + charlieFlow!.amount;
      expect(Math.abs(totalOwedToAlice - (calculation.totalBill - calculation.finalPayables['p_alice']))).toBeLessThan(0.01);
    });
  });
});
