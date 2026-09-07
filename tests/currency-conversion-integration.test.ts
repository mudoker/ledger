import { describe, expect, it, beforeEach } from 'bun:test';
import {
  convertCurrency,
  fetchExchangeRate,
  ZERO_DECIMAL_CURRENCIES,
} from '../src/lib/currency';
import { formatCurrency } from '../src/lib/format';
import { useBillStore } from '../src/store/useBillStore';
import { calculateBill } from '../src/hooks/useBillState';

describe('Currency Conversion, Precision & Financial Formatting Integration Suite', () => {
  describe('convertCurrency Numerical & Zero-Decimal Rounding Invariants', () => {
    it('returns exact amount without mutation when source and target currencies match', () => {
      expect(convertCurrency(12345.67, 'USD', 'USD', 1.0)).toBe(12345.67);
      expect(convertCurrency(500000, 'VND', 'VND', 1.0)).toBe(500000);
      expect(convertCurrency(0, 'USD', 'EUR', 0.92)).toBe(0);
    });

    it('rounds to whole integers with no decimal places for zero-decimal currencies (VND, JPY, KRW)', () => {
      for (const cur of ['VND', 'JPY', 'KRW', 'IDR']) {
        expect(ZERO_DECIMAL_CURRENCIES.has(cur)).toBe(true);
      }

      // $10.45 USD * 25400 = 265,430 VND (exact integer, no decimal drift)
      const vndAmount = convertCurrency(10.45, 'USD', 'VND', 25400);
      expect(vndAmount).toBe(265430);
      expect(Number.isInteger(vndAmount)).toBe(true);

      // $10.333 USD * 155.5 JPY = 1606.7815 -> rounded to 1607 JPY
      const jpyAmount = convertCurrency(10.333, 'USD', 'JPY', 155.5);
      expect(jpyAmount).toBe(1607);
      expect(Number.isInteger(jpyAmount)).toBe(true);
    });

    it('rounds to 2 decimal places for standard fiat currencies (USD, EUR, GBP, SGD)', () => {
      // 500,000 VND / 25400 = 19.685039... -> 19.69 USD
      const usdAmount = convertCurrency(500000, 'VND', 'USD', 1 / 25400);
      expect(usdAmount).toBe(19.69);

      // 100 EUR * 1.0855 = 108.55 USD
      const usdFromEur = convertCurrency(100, 'EUR', 'USD', 1.0855);
      expect(usdFromEur).toBe(108.55);
    });
  });

  describe('fetchExchangeRate Multitier Fallback & Bridging', () => {
    it('uses static fallback table when offline or network fails', async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (() => Promise.reject(new Error('Network offline'))) as any;
        const rateUsdVnd = await fetchExchangeRate('USD', 'VND');
        expect(rateUsdVnd).toBeGreaterThanOrEqual(20000);

        const rateVndUsd = await fetchExchangeRate('VND', 'USD');
        expect(rateVndUsd).toBeLessThan(0.001);
        expect(rateVndUsd).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('bridges exchange rates through USD when direct pair is absent but both exist against USD', async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = (() => Promise.reject(new Error('Network offline'))) as any;
        // e.g. JPY to VND bridged through USD
        const rateJpyVnd = await fetchExchangeRate('JPY', 'VND');
        expect(rateJpyVnd).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  describe('Store-Level Bill Currency Conversion Integration', () => {
    beforeEach(() => {
      useBillStore.setState({
        currency: 'USD',
        items: [
          { id: 'i1', name: 'Steak', price: 50, quantity: 2, assignments: { p1: 1, p2: 1 } },
          { id: 'i2', name: 'Wine', price: 30, quantity: 1, assignments: { p1: 1 } },
        ],
        people: [
          { id: 'p1', name: 'Alice', sponsorAmount: 100, paidAmount: 0 },
          { id: 'p2', name: 'Bob', sponsorAmount: 0, paidAmount: 0 },
        ],
        globalCharges: [
          { id: 'c1', name: '10% VAT', amount: 10, type: 'percent' },
          { id: 'c2', name: 'Fixed Tip', amount: 15, type: 'fixed' },
        ],
        hostId: 'p1',
      });
    });

    it('converts prices, fixed charges, sponsor amounts, and preserves percent charges without scaling', async () => {
      const setCurrency = useBillStore.getState().setCurrency;

      // Convert USD -> VND
      await setCurrency('VND');

      const convertedState = useBillStore.getState();
      expect(convertedState.currency).toBe('VND');

      // 1. Items scaled by rate
      expect(convertedState.items[0].price).toBeGreaterThan(500000);
      expect(convertedState.items[1].price).toBeGreaterThan(300000);

      // 2. Fixed charge scaled by rate
      const fixedCharge = convertedState.globalCharges.find(c => c.type === 'fixed');
      expect(fixedCharge).toBeDefined();
      expect(fixedCharge!.amount).toBeGreaterThan(150000);

      // 3. Percent charge MUST NOT be scaled by exchange rate! 10% is still 10%!
      const percentCharge = convertedState.globalCharges.find(c => c.type === 'percent');
      expect(percentCharge).toBeDefined();
      expect(percentCharge!.amount).toBe(10); // Still 10%!

      // 4. Sponsor amount scaled by rate
      const alice = convertedState.people.find(p => p.id === 'p1');
      expect(alice!.sponsorAmount).toBeGreaterThan(1000000);

      // 5. Settlement calculations on converted state run cleanly with zero discrepancy
      const calc = calculateBill({
        people: convertedState.people,
        items: convertedState.items,
        globalCharges: convertedState.globalCharges,
        hostId: convertedState.hostId,
      });

      expect(Math.abs(calc.discrepancy)).toBeLessThan(0.01);
      expect(calc.totalBill).toBeGreaterThan(1000000);
    });

    it('round-trips conversion from USD -> VND -> USD with minimal rounding loss', async () => {
      const setCurrency = useBillStore.getState().setCurrency;

      await setCurrency('VND');
      await setCurrency('USD');

      const finalState = useBillStore.getState();
      expect(finalState.currency).toBe('USD');

      // Item prices should be back near 50 and 30
      expect(finalState.items[0].price).toBeCloseTo(50, 0);
      expect(finalState.items[1].price).toBeCloseTo(30, 0);

      // Percent charge still 10
      const percentCharge = finalState.globalCharges.find(c => c.type === 'percent');
      expect(percentCharge!.amount).toBe(10);
    });
  });

  describe('formatCurrency Formatting Helper', () => {
    it('formats VND without decimal places and with proper grouping', () => {
      const formatted = formatCurrency(500000, 'VND');
      expect(formatted).toContain('500.000');
      expect(formatted).toContain('₫');
    });

    it('formats USD with 2 decimal places and dollar sign', () => {
      const formatted = formatCurrency(1234.5, 'USD');
      expect(formatted).toContain('1,234.50');
      expect(formatted).toContain('$');
    });

    it('formats negative currency amounts cleanly', () => {
      const formatted = formatCurrency(-50, 'USD');
      expect(formatted).toContain('-');
      expect(formatted).toContain('50.00');
    });
  });
});
