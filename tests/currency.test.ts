import { describe, expect, it } from 'bun:test';
import { formatCurrency } from '../src/lib/format';
import { useBillStore } from '../src/store/useBillStore';

describe('Currency Support', () => {
  it('formats VND properly', () => {
    useBillStore.setState({ currency: 'VND' });
    const formatted = formatCurrency(25400);
    expect(formatted).toContain('25.400');
    expect(formatted).toContain('₫');
  });

  it('formats USD properly', () => {
    useBillStore.setState({ currency: 'USD' });
    const formatted = formatCurrency(10.5);
    expect(formatted).toBe('$10.50');
  });

  it('converts prices when switching from VND to USD and back', async () => {
    useBillStore.setState({
      currency: 'VND',
      items: [{ id: '1', name: 'Steak', price: 254000, quantity: 1, assignments: {} }],
      people: [{ id: 'p1', name: 'Alice', sponsorAmount: 25400, paidAmount: 254000 }],
      globalCharges: [{ id: 'c1', name: 'Delivery', amount: 50800, type: 'fixed' }]
    });

    const setCurrency = useBillStore.getState().setCurrency;

    // Switch to USD
    await setCurrency('USD');
    const stateUSD = useBillStore.getState();
    expect(stateUSD.currency).toBe('USD');
    expect(stateUSD.items[0].price).toBeGreaterThan(9);
    expect(stateUSD.items[0].price).toBeLessThan(11);
    expect(stateUSD.people[0].sponsorAmount).toBeGreaterThan(0.9);
    expect(stateUSD.people[0].paidAmount).toBeGreaterThan(9);
    expect(stateUSD.globalCharges[0].amount).toBeGreaterThan(1.8);

    // Switch back to VND
    await setCurrency('VND');
    const stateVND = useBillStore.getState();
    expect(stateVND.currency).toBe('VND');
    expect(stateVND.items[0].price).toBeGreaterThan(240000);
    expect(stateVND.people[0].sponsorAmount).toBeGreaterThan(24000);
    expect(stateVND.people[0].paidAmount).toBeGreaterThan(240000);
    expect(stateVND.globalCharges[0].amount).toBeGreaterThan(48000);
  }, 15000);
});
