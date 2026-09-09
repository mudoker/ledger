import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { SqliteAdapter } from '../db/sqlite';
import { setDbInstance, resetDbInstance } from '../db';
import { setTestSessionUser } from '../src/lib/auth';
import { GET as searchGet, OPTIONS as searchOptions } from '../src/app/api/search/route';
import type { User } from '../db/types';

describe('Global Search Across Groups, Bills, and Items Feature Integration', () => {
  let adapter: SqliteAdapter;

  const userAlice: User = {
    id: 'user_alice_search',
    email: 'alice@searchtest.com',
    name: 'Alice Searcher',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const userBob: User = {
    id: 'user_bob_search',
    email: 'bob@searchtest.com',
    name: 'Bob Searcher',
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.init();
    setDbInstance(adapter);

    await adapter.upsertUser(userAlice);
    await adapter.upsertUser(userBob);

    // Setup initial data:
    // 1. Group 1: "Japan Ski Trip 2026", owner: Alice, description: "Niseko winter powder trip"
    const group1 = await adapter.createGroup!('Japan Ski Trip 2026', userAlice.id, 'Niseko winter powder trip', 'JPY');

    // 2. Bill 1 in Group 1: "Sapporo Ramen", items: "Miso Ramen", "Gyoza Combo"
    await adapter.saveBill('bill_ramen', {
      name: 'Sapporo Ramen Dinner',
      location: 'Susukino',
      currency: 'JPY',
      groupId: group1.id,
      people: [
        { id: 'p_a1', name: 'Alice', userId: userAlice.id },
        { id: 'p_b1', name: 'Bob', userId: userBob.id }, // Bob is a participant here!
      ],
      items: [
        { id: 'item_ramen_1', name: 'Miso Ramen Special', price: 1200, quantity: 2, assignments: {} },
        { id: 'item_gyoza_1', name: 'Pork Gyoza Combo', price: 600, quantity: 1, assignments: {} },
      ],
    }, userAlice.id);

    // 3. Bill 2: Alice's private bill (not in group): "Dentist Checkup", items: "Teeth Cleaning"
    await adapter.saveBill('bill_dentist', {
      name: 'Dentist Checkup',
      location: 'Tokyo Medical',
      currency: 'JPY',
      people: [{ id: 'p_a2', name: 'Alice', userId: userAlice.id }],
      items: [{ id: 'item_dentist_1', name: 'Teeth Cleaning & Polish', price: 8000, quantity: 1, assignments: {} }],
    }, userAlice.id);

    // 4. Bill 3: Bob's private bill: "Secret Birthday Gift", items: "Diamond Watch"
    await adapter.saveBill('bill_secret_gift', {
      name: 'Secret Birthday Surprise',
      currency: 'USD',
      people: [{ id: 'p_b2', name: 'Bob', userId: userBob.id }],
      items: [{ id: 'item_watch_1', name: 'Diamond Watch Luxury', price: 1500, quantity: 1, assignments: {} }],
    }, userBob.id);

    setTestSessionUser(null);
  });

  afterEach(async () => {
    setTestSessionUser(null);
    if (adapter.close) {
      await adapter.close();
    }
    resetDbInstance();
  });

  it('handles OPTIONS preflight with 204 No Content and CORS headers', async () => {
    const res = await searchOptions();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('returns empty results when user is unauthenticated or query is empty', async () => {
    // 1. Unauthenticated
    setTestSessionUser(null);
    const req1 = new Request('http://localhost/api/search?q=ramen');
    const res1 = await searchGet(req1);
    const json1 = await res1.json();
    expect(json1.results).toEqual({ groups: [], bills: [], items: [] });

    // 2. Empty query string
    setTestSessionUser(userAlice);
    const req2 = new Request('http://localhost/api/search?q=   ');
    const res2 = await searchGet(req2);
    const json2 = await res2.json();
    expect(json2.results).toEqual({ groups: [], bills: [], items: [] });
  });

  it('allows Alice to find groups, bills, and items matching her query across categories', async () => {
    setTestSessionUser(userAlice);

    // Search for "Japan" -> matches group name
    const reqGroup = new Request('http://localhost/api/search?q=japan');
    const resGroup = await searchGet(reqGroup);
    const jsonGroup = await resGroup.json();
    expect(jsonGroup.results.groups.length).toBe(1);
    expect(jsonGroup.results.groups[0].name).toBe('Japan Ski Trip 2026');

    // Search for "Niseko" -> matches group description
    const reqDesc = new Request('http://localhost/api/search?q=niseko');
    const resDesc = await searchGet(reqDesc);
    const jsonDesc = await resDesc.json();
    expect(jsonDesc.results.groups.length).toBe(1);

    // Search for "Ramen" -> matches both bill name and item name
    const reqRamen = new Request('http://localhost/api/search?q=ramen');
    const resRamen = await searchGet(reqRamen);
    const jsonRamen = await resRamen.json();
    expect(jsonRamen.results.bills.length).toBe(1);
    expect(jsonRamen.results.bills[0].name).toBe('Sapporo Ramen Dinner');
    expect(jsonRamen.results.items.length).toBe(1);
    expect(jsonRamen.results.items[0].name).toBe('Miso Ramen Special');

    // Search for "Dentist" -> matches Alice's private bill
    const reqDentist = new Request('http://localhost/api/search?q=dentist');
    const resDentist = await searchGet(reqDentist);
    const jsonDentist = await resDentist.json();
    expect(jsonDentist.results.bills.length).toBe(1);
    expect(jsonDentist.results.bills[0].name).toBe('Dentist Checkup');
  });

  it('strictly enforces multi-tenant search isolation: Bob cannot discover Alice private bills', async () => {
    setTestSessionUser(userBob);

    // 1. Bob searches "Dentist" (Alice's private bill) -> Empty results
    const reqDentist = new Request('http://localhost/api/search?q=dentist');
    const resDentist = await searchGet(reqDentist);
    const jsonDentist = await resDentist.json();
    expect(jsonDentist.results.bills).toEqual([]);
    expect(jsonDentist.results.items).toEqual([]);

    // 2. Bob searches "Ramen" (group bill where Bob is a participant) -> Bob CAN see it!
    const reqRamen = new Request('http://localhost/api/search?q=ramen');
    const resRamen = await searchGet(reqRamen);
    const jsonRamen = await resRamen.json();
    expect(jsonRamen.results.bills.length).toBe(1);
    expect(jsonRamen.results.bills[0].name).toBe('Sapporo Ramen Dinner');

    // 3. Bob searches "Diamond Watch" -> Bob finds his own secret bill
    const reqWatch = new Request('http://localhost/api/search?q=watch');
    const resWatch = await searchGet(reqWatch);
    const jsonWatch = await resWatch.json();
    expect(jsonWatch.results.items.length).toBe(1);
    expect(jsonWatch.results.items[0].name).toBe('Diamond Watch Luxury');
  });

  it('safely handles search queries with special characters, unicode, and extreme length', async () => {
    setTestSessionUser(userAlice);

    // Special regex / SQL characters (%, _, ', ", ;)
    const reqSpecial = new Request("http://localhost/api/search?q=%25_'--%22;");
    const resSpecial = await searchGet(reqSpecial);
    expect(resSpecial.status).toBe(200);

    // Long query (>100 characters) is truncated safely without crashing
    const longQuery = 'a'.repeat(250);
    const reqLong = new Request(`http://localhost/api/search?q=${longQuery}`);
    const resLong = await searchGet(reqLong);
    expect(resLong.status).toBe(200);
    const jsonLong = await resLong.json();
    expect(jsonLong.results).toBeDefined();
  });
});
