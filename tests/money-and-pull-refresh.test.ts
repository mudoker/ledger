import { describe, it, expect } from 'bun:test';
import { MoneyDisplay } from '@/components/shared/money-display';
import { CountDisplay } from '@/components/shared/count-display';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';

describe('UI Polish: MoneyDisplay, CountDisplay and PullToRefresh', () => {
  it('exports MoneyDisplay, CountDisplay and PullToRefresh as valid React components', () => {
    expect(MoneyDisplay).toBeDefined();
    expect(typeof MoneyDisplay).toBe('function');

    expect(CountDisplay).toBeDefined();
    expect(typeof CountDisplay).toBe('function');

    expect(PullToRefresh).toBeDefined();
    expect(typeof PullToRefresh).toBe('function');
  });
});
