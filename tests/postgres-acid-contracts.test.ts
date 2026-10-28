import { describe, expect, it } from 'bun:test';
import { PostgresAdapter } from '../db/postgres';

interface MockQueryCall {
  sql: string;
  params?: unknown[];
}

function createMockPoolClient(handlers?: {
  onQuery?: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number }> | { rows: any[]; rowCount: number };
}) {
  const queryLog: MockQueryCall[] = [];
  let isReleased = false;

  const client = {
    queryLog,
    get isReleased() {
      return isReleased;
    },
    async query(sql: string, params?: unknown[]) {
      queryLog.push({ sql: sql.trim(), params });

      if (handlers?.onQuery) {
        return handlers.onQuery(sql, params);
      }

      // Default responses for common transactions queries
      if (sql.includes('SELECT owner_id, group_id FROM bills WHERE id = $1')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('SELECT owner_id FROM bills WHERE id = $1')) {
        return { rows: [{ owner_id: 'user_alice' }], rowCount: 1 };
      }
      if (sql.includes('SELECT owner_id FROM bill_groups WHERE id = $1')) {
        return { rows: [{ owner_id: 'user_alice' }], rowCount: 1 };
      }
      if (sql.includes('FROM users WHERE id = $1')) {
        return {
          rows: [{
            id: params?.[0],
            email: 'user@example.com',
            name: 'Test User',
            avatar_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT id FROM users WHERE LOWER(email) = LOWER($1)')) {
        return { rows: [{ id: 'user_found', email: params?.[0] }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO users')) {
        return {
          rows: [{
            id: params?.[0] || 'new_user',
            email: params?.[1] || 'new@example.com',
            name: params?.[2] || 'New User',
            avatar_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('DELETE FROM bill_groups')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('DELETE FROM bills')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('SELECT id FROM people WHERE bill_id = $1')) {
        return { rows: [], rowCount: 0 };
      }

      return { rows: [], rowCount: 1 };
    },
    release() {
      isReleased = true;
    },
  };

  const pool = {
    client,
    async connect() {
      return client;
    },
    async end() {
      // closed
    },
  };

  return { client, pool };
}

describe('PostgreSQL Adapter ACID Transaction Contracts & Connection Safety', () => {
  it('saveBill follows strict ACID: BEGIN -> upsert/inserts -> COMMIT -> release on success', async () => {
    const adapter = new PostgresAdapter('postgresql://localhost/mockdb');
    const { client, pool } = createMockPoolClient();
    (adapter as any).pool = pool;

    await adapter.saveBill(
      'bill_pg_test_1',
      {
        name: 'Postgres Feast',
        currency: 'VND',
        people: [{ id: 'p1', name: 'Alice' }],
        items: [{ id: 'i1', name: 'Steak', price: 100000, quantity: 1, assignments: { p1: 1 } }],
        charges: [{ id: 'c1', name: 'VAT', type: 'percent', amount: 10 }],
      },
      'user_alice'
    );

    const sqlCommands = client.queryLog.map(q => q.sql);

    // 1. Transaction must start with BEGIN
    expect(sqlCommands[0]).toBe('BEGIN');

    // 2. Contains upsert and child insertions
    expect(sqlCommands.some(s => s.includes('INSERT INTO bills'))).toBe(true);
    expect(sqlCommands.some(s => s.includes('INSERT INTO people'))).toBe(true);
    expect(sqlCommands.some(s => s.includes('INSERT INTO items'))).toBe(true);
    expect(sqlCommands.some(s => s.includes('INSERT INTO global_charges'))).toBe(true);

    // 3. Transaction must end with COMMIT
    expect(sqlCommands[sqlCommands.length - 1]).toBe('COMMIT');

    // 4. Must release client back to pool
    expect(client.isReleased).toBe(true);
  });

  it('saveBill rolls back completely (ROLLBACK) and releases client on intermediate failure', async () => {
    const adapter = new PostgresAdapter('postgresql://localhost/mockdb');

    const { client, pool } = createMockPoolClient({
      onQuery: (sql) => {
        if (sql.includes('INSERT INTO items')) {
          throw new Error('Simulated PG constraint violation: item price negative');
        }
        return { rows: [], rowCount: 1 };
      },
    });
    (adapter as any).pool = pool;

    let errorThrown = false;
    try {
      await adapter.saveBill(
        'bill_pg_fail_1',
        {
          name: 'Failing Bill',
          currency: 'VND',
          people: [{ id: 'p1', name: 'Alice' }],
          items: [{ id: 'i1', name: 'Bad Item', price: -500, quantity: 1, assignments: {} }],
        },
        'user_alice'
      );
    } catch (err: unknown) {
      errorThrown = true;
      expect((err as Error).message).toContain('Simulated PG constraint violation');
    }

    expect(errorThrown).toBe(true);

    const sqlCommands = client.queryLog.map(q => q.sql);

    // 1. Transaction started
    expect(sqlCommands[0]).toBe('BEGIN');

    // 2. Transaction must have ROLLBACK and NEVER COMMIT
    expect(sqlCommands.includes('ROLLBACK')).toBe(true);
    expect(sqlCommands.includes('COMMIT')).toBe(false);

    // 3. Client MUST still be released to prevent connection pool exhaustion!
    expect(client.isReleased).toBe(true);
  });

  it('upsertUser runs within an atomic transaction and auto-links participants safely', async () => {
    const adapter = new PostgresAdapter('postgresql://localhost/mockdb');
    const { client, pool } = createMockPoolClient();
    (adapter as any).pool = pool;

    const user = await adapter.upsertUser({
      email: 'alex@example.com',
      name: 'Alex Developer',
    });

    expect(user.email).toBe('alex@example.com');

    const sqlCommands = client.queryLog.map(q => q.sql);

    // Verified BEGIN and COMMIT
    expect(sqlCommands[0]).toBe('BEGIN');
    expect(sqlCommands.some(s => s.includes('INSERT INTO users'))).toBe(true);
    expect(sqlCommands.some(s => s.includes('UPDATE people SET user_id'))).toBe(true);
    expect(sqlCommands[sqlCommands.length - 1]).toBe('COMMIT');
    expect(client.isReleased).toBe(true);
  });

  it('upsertUser rolls back and releases client if user upsert query fails', async () => {
    const adapter = new PostgresAdapter('postgresql://localhost/mockdb');
    const { client, pool } = createMockPoolClient({
      onQuery: (sql) => {
        if (sql.includes('UPDATE people SET user_id')) {
          throw new Error('Simulated dead-lock or serialization failure');
        }
        if (sql.includes('INSERT INTO users')) {
          return {
            rows: [{ id: 'u1', email: 'test@example.com', name: 'Test', avatar_url: null, created_at: new Date(), updated_at: new Date() }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      },
    });
    (adapter as any).pool = pool;

    let errorThrown = false;
    try {
      await adapter.upsertUser({ email: 'test@example.com', name: 'Test' });
    } catch (err: unknown) {
      errorThrown = true;
      expect((err as Error).message).toContain('Simulated dead-lock');
    }

    expect(errorThrown).toBe(true);

    const sqlCommands = client.queryLog.map(q => q.sql);
    expect(sqlCommands[0]).toBe('BEGIN');
    expect(sqlCommands.includes('ROLLBACK')).toBe(true);
    expect(sqlCommands.includes('COMMIT')).toBe(false);
    expect(client.isReleased).toBe(true);
  });

  it('deleteGroup runs unlinking and deletion atomically inside a transaction', async () => {
    const adapter = new PostgresAdapter('postgresql://localhost/mockdb');
    const { client, pool } = createMockPoolClient();
    (adapter as any).pool = pool;

    const result = await adapter.deleteGroup('group_pg_1', 'user_alice');
    expect(result).toBe(true);

    const sqlCommands = client.queryLog.map(q => q.sql);
    expect(sqlCommands.includes('BEGIN')).toBe(true);
    expect(sqlCommands.some(s => s.includes('UPDATE bills SET group_id = NULL'))).toBe(true);
    expect(sqlCommands.some(s => s.includes('DELETE FROM bill_groups'))).toBe(true);
    expect(sqlCommands.includes('COMMIT')).toBe(true);
    expect(client.isReleased).toBe(true);
  });

  it('transferBillOwnership runs bill owner update and participant update/insert inside a transaction', async () => {
    const adapter = new PostgresAdapter('postgresql://localhost/mockdb');
    const { client, pool } = createMockPoolClient();
    (adapter as any).pool = pool;

    await adapter.transferBillOwnership('bill_pg_transfer_1', 'user_bob', 'user_alice');

    const sqlCommands = client.queryLog.map(q => q.sql);
    expect(sqlCommands.includes('BEGIN')).toBe(true);
    expect(sqlCommands.some(s => s.includes('UPDATE bills SET owner_id'))).toBe(true);
    expect(sqlCommands.some(s => s.includes('INSERT INTO people'))).toBe(true);
    expect(sqlCommands.includes('COMMIT')).toBe(true);
    expect(client.isReleased).toBe(true);
  });

  it('close() cleanly terminates the postgres pool connection', async () => {
    const adapter = new PostgresAdapter('postgresql://localhost/mockdb');
    let poolEnded = false;
    const pool = {
      async end() {
        poolEnded = true;
      },
    };
    (adapter as any).pool = pool;

    await adapter.close();
    expect(poolEnded).toBe(true);
    expect((adapter as any).pool).toBeNull();
  });
});
