import { Pool as PgPool } from 'pg';
import type {
  DatabaseAdapter,
  BillDetail,
  BillPayload,
  BillSummary,
  User,
  BillGroupDetail,
  BillGroupSummary,
  GroupBillOverview,
  GroupItemOverview,
  SearchResults,
  PersonData,
  GlobalChargeData,
} from './types';

export class PostgresAdapter implements DatabaseAdapter {
  readonly type: 'neon' | 'postgres';
  private connectionString: string;
  private pool: PgPool | null = null;

  constructor(connectionString: string) {
    this.connectionString = connectionString.trim();
    const isNeon = this.connectionString.includes('neon.tech');
    this.type = isNeon ? 'neon' : 'postgres';
  }

  async init(): Promise<void> {
    const isLocal =
      this.connectionString.includes('localhost') ||
      this.connectionString.includes('127.0.0.1');

    const pgPool = new PgPool({
      connectionString: this.connectionString,
      ssl: isLocal
        ? false
        : {
            rejectUnauthorized: false,
          },
      connectionTimeoutMillis: 5000,
    });

    pgPool.on('error', (err) => {
      console.warn(`[PostgreSQL Pool Error]: ${err.message}`);
    });

    try {
      const client = await pgPool.connect();
      await client.query('SELECT 1');
      client.release();
      this.pool = pgPool;
    } catch (err: unknown) {
      await pgPool.end().catch(() => {});
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Connection failed: ${msg}`);
    }

    // Initialize Schema and Migrations
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          avatar_url TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bill_groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          currency TEXT DEFAULT 'VND',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_bill_groups_owner ON bill_groups(owner_id);

        CREATE TABLE IF NOT EXISTS bills (
          id TEXT PRIMARY KEY,
          name TEXT,
          location TEXT,
          host_id TEXT,
          qr_code TEXT,
          owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          group_id TEXT REFERENCES bill_groups(id) ON DELETE SET NULL,
          currency TEXT DEFAULT 'VND',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS people (
          id TEXT PRIMARY KEY,
          bill_id TEXT REFERENCES bills(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          sponsor_amount DOUBLE PRECISION DEFAULT 0,
          paid_amount DOUBLE PRECISION DEFAULT 0,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          email TEXT
        );

        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          bill_id TEXT REFERENCES bills(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          price DOUBLE PRECISION NOT NULL,
          quantity DOUBLE PRECISION DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS item_assignments (
          item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
          person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
          quantity DOUBLE PRECISION DEFAULT 1,
          PRIMARY KEY (item_id, person_id)
        );

        CREATE TABLE IF NOT EXISTS global_charges (
          id TEXT PRIMARY KEY,
          bill_id TEXT REFERENCES bills(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL
        );

        -- Safe column migrations for existing databases
        ALTER TABLE bills ADD COLUMN IF NOT EXISTS owner_id TEXT;
        ALTER TABLE bills ADD COLUMN IF NOT EXISTS group_id TEXT REFERENCES bill_groups(id) ON DELETE SET NULL;
        ALTER TABLE bills ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'VND';
        ALTER TABLE people ADD COLUMN IF NOT EXISTS user_id TEXT;
        ALTER TABLE people ADD COLUMN IF NOT EXISTS email TEXT;
        CREATE INDEX IF NOT EXISTS idx_bills_group_id ON bills(group_id);
      `);
    } finally {
      client.release();
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
      if (res.rows.length === 0) return null;
      const u = res.rows[0];
      return {
        id: String(u.id),
        email: String(u.email),
        name: u.name ? String(u.name) : null,
        avatar_url: u.avatar_url ? String(u.avatar_url) : null,
        created_at: typeof u.created_at === 'string' ? u.created_at : new Date(u.created_at).toISOString(),
        updated_at: typeof u.updated_at === 'string' ? u.updated_at : new Date(u.updated_at).toISOString(),
      };
    } finally {
      client.release();
    }
  }

  async getUserById(id: string): Promise<User | null> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT * FROM users WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const u = res.rows[0];
      return {
        id: String(u.id),
        email: String(u.email),
        name: u.name ? String(u.name) : null,
        avatar_url: u.avatar_url ? String(u.avatar_url) : null,
        created_at: typeof u.created_at === 'string' ? u.created_at : new Date(u.created_at).toISOString(),
        updated_at: typeof u.updated_at === 'string' ? u.updated_at : new Date(u.updated_at).toISOString(),
      };
    } finally {
      client.release();
    }
  }

  async upsertUser(user: { id?: string; email: string; name?: string | null; avatar_url?: string | null }): Promise<User> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const cleanEmail = user.email.trim().toLowerCase();
      const userId = user.id || crypto.randomUUID();

      const res = await client.query(`
        INSERT INTO users (id, email, name, avatar_url, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (email) DO UPDATE SET
          name = COALESCE(EXCLUDED.name, users.name),
          avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [userId, cleanEmail, user.name || null, user.avatar_url || null]);

      const u = res.rows[0];

      // Auto-link any existing bill participants with matching email to this user_id
      await client.query('UPDATE people SET user_id = $1 WHERE LOWER(email) = LOWER($2) AND user_id IS NULL', [u.id, cleanEmail]);

      return {
        id: String(u.id),
        email: String(u.email),
        name: u.name ? String(u.name) : null,
        avatar_url: u.avatar_url ? String(u.avatar_url) : null,
        created_at: typeof u.created_at === 'string' ? u.created_at : new Date(u.created_at).toISOString(),
        updated_at: typeof u.updated_at === 'string' ? u.updated_at : new Date(u.updated_at).toISOString(),
      };
    } finally {
      client.release();
    }
  }

  async searchUsers(query: string): Promise<Array<{ id: string; email: string; name: string | null; avatar_url: string | null }>> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const term = `%${query.trim().toLowerCase()}%`;
      const res = await client.query(
        'SELECT id, email, name, avatar_url FROM users WHERE LOWER(email) LIKE $1 OR LOWER(name) LIKE $1 LIMIT 10',
        [term]
      );
      return res.rows.map(u => ({
        id: String(u.id),
        email: String(u.email),
        name: u.name ? String(u.name) : null,
        avatar_url: u.avatar_url ? String(u.avatar_url) : null,
      }));
    } finally {
      client.release();
    }
  }

  async getBill(id: string, userId?: string | null, isShare: boolean = false): Promise<BillDetail | null> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const billRes = await client.query(`
        SELECT b.*, bg.name as group_name
        FROM bills b
        LEFT JOIN bill_groups bg ON bg.id = b.group_id
        WHERE b.id = $1
      `, [id]);
      if (billRes.rows.length === 0) return null;
      const bill = billRes.rows[0];

      // Check user email if userId provided
      let userEmail: string | null = null;
      if (userId) {
        const uRes = await client.query('SELECT email FROM users WHERE id = $1', [userId]);
        if (uRes.rows.length > 0) {
          userEmail = uRes.rows[0].email;
        }
      }

      // Check if user is owner
      const isOwner = Boolean(userId && bill.owner_id === userId);

      // Check if user is a participant
      const participantCheck = await client.query(
        'SELECT id FROM people WHERE bill_id = $1 AND (user_id = $2 OR (email IS NOT NULL AND LOWER(email) = LOWER($3)))',
        [id, userId || 'none', userEmail || 'none']
      );
      const isParticipant = participantCheck.rows.length > 0;

      // Access control check:
      // 1. Shared access: strictly read-only for anyone
      // 2. Logged in Owner: full edit
      // 3. Logged in Participant: view-only
      // 4. Otherwise: access denied
      if (!isShare && !isOwner && !isParticipant) {
        return null;
      }

      const role: 'owner' | 'participant' | 'viewer' = isOwner ? 'owner' : (isParticipant ? 'participant' : 'viewer');
      const isReadOnly = isShare || !isOwner;

      const peopleRes = await client.query(
        'SELECT id, name, sponsor_amount as "sponsorAmount", paid_amount as "paidAmount", user_id as "userId", email FROM people WHERE bill_id = $1',
        [id]
      );
      const people = peopleRes.rows.map(p => ({
        id: String(p.id),
        name: String(p.name),
        sponsorAmount: Number(p.sponsorAmount || 0),
        paidAmount: Number(p.paidAmount || 0),
        userId: p.userId ? String(p.userId) : null,
        email: p.email ? String(p.email) : null,
      }));

      const globalChargesRes = await client.query(
        'SELECT id, name, type, amount FROM global_charges WHERE bill_id = $1',
        [id]
      );
      const globalCharges = globalChargesRes.rows.map(gc => ({
        id: String(gc.id),
        name: String(gc.name),
        type: String(gc.type),
        amount: Number(gc.amount || 0),
      }));

      const itemsRes = await client.query(
        'SELECT id, name, price, quantity FROM items WHERE bill_id = $1',
        [id]
      );

      const assignmentsRes = await client.query(
        'SELECT ia.item_id, ia.person_id, ia.quantity FROM item_assignments ia JOIN items i ON ia.item_id = i.id WHERE i.bill_id = $1',
        [id]
      );

      const assignmentsByItem: Record<string, Record<string, number>> = {};
      for (const row of assignmentsRes.rows) {
        if (!assignmentsByItem[row.item_id]) {
          assignmentsByItem[row.item_id] = {};
        }
        assignmentsByItem[row.item_id][row.person_id] = Number(row.quantity || 0);
      }

      const items = itemsRes.rows.map(item => ({
        id: String(item.id),
        name: String(item.name),
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1),
        assignments: assignmentsByItem[item.id] || {},
      }));

      return {
        id: String(bill.id),
        owner_id: bill.owner_id ? String(bill.owner_id) : null,
        role,
        isReadOnly,
        group_id: bill.group_id ? String(bill.group_id) : null,
        group_name: bill.group_name ? String(bill.group_name) : null,
        data: {
          name: bill.name ?? null,
          location: bill.location ?? null,
          currency: bill.currency ?? 'VND',
          ownerId: bill.owner_id ? String(bill.owner_id) : null,
          groupId: bill.group_id ? String(bill.group_id) : null,
          groupName: bill.group_name ? String(bill.group_name) : null,
          people,
          items,
          globalCharges,
          hostId: bill.host_id ?? null,
          qrCode: bill.qr_code ?? null,
        },
        created_at: typeof bill.created_at === 'string' ? bill.created_at : new Date(bill.created_at).toISOString(),
        updated_at: typeof bill.updated_at === 'string' ? bill.updated_at : new Date(bill.updated_at).toISOString(),
      };
    } finally {
      client.release();
    }
  }

  async saveBill(billId: string, data: BillPayload, userId?: string | null): Promise<void> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const {
      name = null,
      location = null,
      people = [],
      items = [],
      globalCharges = data.charges || data.globalCharges || [],
      hostId = null,
      qrCode = null,
      currency = 'VND',
    } = data;
    const rawGroupId = data.groupId !== undefined ? data.groupId : data.group_id;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check ownership if bill already exists
      const existingRes = await client.query('SELECT owner_id, group_id FROM bills WHERE id = $1', [billId]);
      if (existingRes.rows.length > 0) {
        const existingOwnerId = existingRes.rows[0].owner_id;
        // If the bill has an owner and the current user is not that owner, forbid modification
        if (existingOwnerId && userId && existingOwnerId !== userId) {
          throw new Error('Forbidden: Only the bill owner can edit this bill');
        }
      }

      const ownerId = existingRes.rows.length > 0
        ? (existingRes.rows[0].owner_id || userId || null)
        : (userId || data.ownerId || null);

      const targetGroupId = rawGroupId !== undefined ? (rawGroupId || null) : (existingRes.rows[0]?.group_id || null);

      // Upsert bill
      await client.query(`
        INSERT INTO bills (id, name, location, host_id, qr_code, currency, owner_id, group_id, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          location = EXCLUDED.location,
          host_id = EXCLUDED.host_id,
          qr_code = EXCLUDED.qr_code,
          currency = EXCLUDED.currency,
          owner_id = COALESCE(bills.owner_id, EXCLUDED.owner_id),
          group_id = EXCLUDED.group_id,
          updated_at = CURRENT_TIMESTAMP
      `, [billId, name, location, hostId, qrCode, currency, ownerId, targetGroupId]);

      // Delete existing children
      await client.query('DELETE FROM item_assignments WHERE item_id IN (SELECT id FROM items WHERE bill_id = $1)', [billId]);
      await client.query('DELETE FROM people WHERE bill_id = $1', [billId]);
      await client.query('DELETE FROM items WHERE bill_id = $1', [billId]);
      await client.query('DELETE FROM global_charges WHERE bill_id = $1', [billId]);

      // Insert people with user_id and email resolution
      for (const p of people) {
        let pUserId = p.userId || null;
        const pEmail = p.email ? p.email.trim().toLowerCase() : null;

        // If email provided but no userId, try to resolve to registered user
        if (pEmail && !pUserId) {
          const uRes = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [pEmail]);
          if (uRes.rows.length > 0) {
            pUserId = uRes.rows[0].id;
          }
        }

        // If this person is the host or current logged-in user, auto-link to current user
        if (userId && (p.id === hostId || (!hostId && people.length === 1 && !pUserId && !pEmail))) {
          pUserId = userId;
          if (!pEmail) {
            const uRes = await client.query('SELECT email FROM users WHERE id = $1', [userId]);
            if (uRes.rows.length > 0) {
              p.email = uRes.rows[0].email;
            }
          }
        }

        await client.query(
          'INSERT INTO people (id, bill_id, name, sponsor_amount, paid_amount, user_id, email) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [p.id, billId, p.name, Number(p.sponsorAmount || 0), Number(p.paidAmount || 0), pUserId, p.email || null]
        );
      }

      // Insert items & assignments
      for (const item of items) {
        await client.query(
          'INSERT INTO items (id, bill_id, name, price, quantity) VALUES ($1, $2, $3, $4, $5)',
          [item.id, billId, item.name, Number(item.price || 0), Number(item.quantity || 1)]
        );

        if (item.assignments) {
          for (const [pId, qty] of Object.entries(item.assignments)) {
            await client.query(
              'INSERT INTO item_assignments (item_id, person_id, quantity) VALUES ($1, $2, $3)',
              [item.id, pId, Number(qty || 0)]
            );
          }
        }
      }

      // Insert global charges
      for (const gc of globalCharges) {
        await client.query(
          'INSERT INTO global_charges (id, bill_id, name, type, amount) VALUES ($1, $2, $3, $4, $5)',
          [gc.id, billId, gc.name, gc.type, Number(gc.amount || 0)]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteBill(billId: string, userId?: string | null): Promise<boolean> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      if (userId) {
        const billRes = await client.query('SELECT owner_id FROM bills WHERE id = $1', [billId]);
        if (billRes.rows.length > 0) {
          const ownerId = billRes.rows[0].owner_id;
          if (ownerId && ownerId !== userId) {
            throw new Error('Forbidden: Only the bill owner can delete this bill');
          }
        }
      }

      const res = await client.query('DELETE FROM bills WHERE id = $1', [billId]);
      return (res.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  async listBills(userId?: string | null): Promise<BillSummary[]> {
    if (!this.pool) throw new Error('Database pool not initialized');
    // If not logged in, return empty list (RBAC: users must login to view their saved bills)
    if (!userId) {
      return [];
    }

    const client = await this.pool.connect();
    try {
      // Find user email
      const uRes = await client.query('SELECT email FROM users WHERE id = $1', [userId]);
      const userEmail = uRes.rows.length > 0 ? uRes.rows[0].email : null;

      const res = await client.query(`
        SELECT
          b.id,
          b.created_at,
          b.updated_at,
          b.name as custom_name,
          b.location,
          b.owner_id,
          b.group_id,
          bg.name as group_name,
          (SELECT name FROM items WHERE bill_id = b.id LIMIT 1) as first_item_name,
          (SELECT COUNT(*) FROM items WHERE bill_id = b.id) as item_count,
          (SELECT COALESCE(SUM(price * quantity), 0) FROM items WHERE bill_id = b.id) as subtotal,
          (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'fixed') as fixed_extras,
          (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'percent') as percent_extras
        FROM bills b
        LEFT JOIN bill_groups bg ON bg.id = b.group_id
        WHERE b.owner_id = $1
           OR EXISTS (
             SELECT 1 FROM people p
             WHERE p.bill_id = b.id
             AND (p.user_id = $1 OR (p.email IS NOT NULL AND LOWER(p.email) = LOWER($2)))
           )
        ORDER BY b.updated_at DESC
      `, [userId, userEmail || '']);

      return res.rows.map(b => {
        let total = Number(b.subtotal || 0);
        const percentSum = Number(b.percent_extras || 0);
        total += (percentSum / 100) * total;
        total += Number(b.fixed_extras || 0);
        const itemCount = Number(b.item_count || 0);
        const isOwner = b.owner_id === userId;

        return {
          id: String(b.id),
          created_at: typeof b.created_at === 'string' ? b.created_at : new Date(b.created_at).toISOString(),
          updated_at: typeof b.updated_at === 'string' ? b.updated_at : new Date(b.updated_at).toISOString(),
          name: b.custom_name || (b.first_item_name ? b.first_item_name + (itemCount > 1 ? ` & ${itemCount - 1} more` : '') : 'Empty Bill'),
          location: b.location ?? null,
          totalAmount: total,
          owner_id: b.owner_id ? String(b.owner_id) : null,
          group_id: b.group_id ? String(b.group_id) : null,
          group_name: b.group_name ? String(b.group_name) : null,
          role: isOwner ? 'owner' : 'participant',
          is_owner: isOwner,
        };
      });
    } finally {
      client.release();
    }
  }

  async createGroup(name: string, ownerId: string, description: string | null = null, currency: string = 'VND'): Promise<BillGroupDetail> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const id = crypto.randomUUID();
      await client.query(
        'INSERT INTO bill_groups (id, name, description, owner_id, currency) VALUES ($1, $2, $3, $4, $5)',
        [id, name.trim(), description ? description.trim() : null, ownerId, currency]
      );
      const group = await this.getGroup(id, ownerId);
      if (!group) throw new Error('Failed to create group');
      return group;
    } finally {
      client.release();
    }
  }

  async getGroup(id: string, userId?: string | null): Promise<BillGroupDetail | null> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const groupRes = await client.query(`
        SELECT g.*, u.name as owner_name, u.email as owner_email
        FROM bill_groups g
        LEFT JOIN users u ON u.id = g.owner_id
        WHERE g.id = $1
      `, [id]);

      if (groupRes.rows.length === 0) return null;
      const group = groupRes.rows[0];

      const isOwner = Boolean(userId && group.owner_id === userId);

      const billsRes = await client.query(`
        SELECT id, name, location, currency, host_id, created_at, updated_at
        FROM bills
        WHERE group_id = $1
        ORDER BY updated_at DESC
      `, [id]);

      let totalGroupAmount = 0;
      let totalItemsCount = 0;
      const bills: GroupBillOverview[] = [];

      for (const b of billsRes.rows) {
        const peopleRes = await client.query(
          'SELECT id, name, sponsor_amount as "sponsorAmount", paid_amount as "paidAmount", user_id as "userId", email FROM people WHERE bill_id = $1',
          [b.id]
        );
        const people: PersonData[] = peopleRes.rows.map(p => ({
          id: String(p.id),
          name: String(p.name),
          sponsorAmount: Number(p.sponsorAmount || 0),
          paidAmount: Number(p.paidAmount || 0),
          userId: p.userId ? String(p.userId) : null,
          email: p.email ? String(p.email) : null,
        }));

        const hostPerson = people.find(p => p.id === b.host_id);
        const hostName = hostPerson?.name || null;

        const chargesRes = await client.query(
          'SELECT id, name, type, amount FROM global_charges WHERE bill_id = $1',
          [b.id]
        );
        const globalCharges: GlobalChargeData[] = chargesRes.rows.map(gc => ({
          id: String(gc.id),
          name: String(gc.name),
          type: String(gc.type),
          amount: Number(gc.amount || 0),
        }));

        const itemsRes = await client.query(
          'SELECT id, name, price, quantity FROM items WHERE bill_id = $1',
          [b.id]
        );

        const items: GroupItemOverview[] = [];
        for (const it of itemsRes.rows) {
          const assignRes = await client.query(
            'SELECT person_id, quantity FROM item_assignments WHERE item_id = $1',
            [it.id]
          );
          const assignments: Record<string, number> = {};
          assignRes.rows.forEach(row => {
            assignments[row.person_id] = Number(row.quantity);
          });
          items.push({
            id: String(it.id),
            name: String(it.name),
            price: Number(it.price || 0),
            quantity: Number(it.quantity || 1),
            totalPrice: Number(it.price || 0) * Number(it.quantity || 1),
            assignments,
          });
        }

        const subtotal = items.reduce((s, it) => s + it.totalPrice, 0);
        let fixedCharges = 0;
        let percentCharges = 0;
        chargesRes.rows.forEach(c => {
          if (c.type === 'fixed') fixedCharges += Number(c.amount || 0);
          if (c.type === 'percent') percentCharges += Number(c.amount || 0);
        });
        const billTotal = Math.round(subtotal * (1 + percentCharges / 100) + fixedCharges);

        totalGroupAmount += billTotal;
        totalItemsCount += items.length;

        bills.push({
          id: String(b.id),
          name: b.name || `Bill ${b.id.slice(0, 8)}`,
          location: b.location ?? null,
          currency: b.currency || 'VND',
          totalAmount: billTotal,
          host_id: b.host_id ? String(b.host_id) : null,
          host_name: hostName,
          created_at: typeof b.created_at === 'string' ? b.created_at : new Date(b.created_at).toISOString(),
          updated_at: typeof b.updated_at === 'string' ? b.updated_at : new Date(b.updated_at).toISOString(),
          items,
          people,
          globalCharges,
        });
      }

      return {
        id: String(group.id),
        name: String(group.name),
        description: group.description ? String(group.description) : null,
        owner_id: String(group.owner_id),
        owner_name: group.owner_name ? String(group.owner_name) : null,
        owner_email: group.owner_email ? String(group.owner_email) : null,
        is_owner: isOwner,
        currency: group.currency ? String(group.currency) : 'VND',
        total_amount: totalGroupAmount,
        total_bills: bills.length,
        total_items: totalItemsCount,
        created_at: typeof group.created_at === 'string' ? group.created_at : new Date(group.created_at).toISOString(),
        updated_at: typeof group.updated_at === 'string' ? group.updated_at : new Date(group.updated_at).toISOString(),
        bills,
      };
    } finally {
      client.release();
    }
  }

  async listGroups(userId?: string | null): Promise<BillGroupSummary[]> {
    if (!this.pool) throw new Error('Database pool not initialized');
    if (!userId) return [];

    const client = await this.pool.connect();
    try {
      const uRes = await client.query('SELECT email FROM users WHERE id = $1', [userId]);
      const userEmail = uRes.rows.length > 0 ? uRes.rows[0].email : '';

      const groupsRes = await client.query(`
        SELECT DISTINCT
          g.id,
          g.name,
          g.description,
          g.owner_id,
          g.currency,
          g.created_at,
          g.updated_at,
          u.name as owner_name,
          u.email as owner_email
        FROM bill_groups g
        LEFT JOIN users u ON u.id = g.owner_id
        WHERE g.owner_id = $1
           OR EXISTS (
             SELECT 1 FROM bills b
             JOIN people p ON p.bill_id = b.id
             WHERE b.group_id = g.id
               AND (b.owner_id = $1 OR p.user_id = $1 OR (p.email IS NOT NULL AND LOWER(p.email) = LOWER($2)))
           )
        ORDER BY g.updated_at DESC
      `, [userId, userEmail]);

      const results: BillGroupSummary[] = [];

      for (const g of groupsRes.rows) {
        const billStats = await client.query(`
          SELECT b.id,
            (SELECT COALESCE(SUM(price * quantity), 0) FROM items WHERE bill_id = b.id) as subtotal,
            (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'fixed') as fixed_extras,
            (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'percent') as percent_extras,
            (SELECT COUNT(*) FROM items WHERE bill_id = b.id) as item_count
          FROM bills b
          WHERE b.group_id = $1
        `, [g.id]);

        let totalAmount = 0;
        let totalItems = 0;
        billStats.rows.forEach(bs => {
          const billTotal = Math.round(Number(bs.subtotal || 0) * (1 + Number(bs.percent_extras || 0) / 100) + Number(bs.fixed_extras || 0));
          totalAmount += billTotal;
          totalItems += Number(bs.item_count || 0);
        });

        results.push({
          id: String(g.id),
          name: String(g.name),
          description: g.description ? String(g.description) : null,
          owner_id: String(g.owner_id),
          owner_name: g.owner_name ? String(g.owner_name) : null,
          owner_email: g.owner_email ? String(g.owner_email) : null,
          is_owner: g.owner_id === userId,
          currency: g.currency ? String(g.currency) : 'VND',
          total_amount: totalAmount,
          total_bills: billStats.rows.length,
          total_items: totalItems,
          created_at: typeof g.created_at === 'string' ? g.created_at : new Date(g.created_at).toISOString(),
          updated_at: typeof g.updated_at === 'string' ? g.updated_at : new Date(g.updated_at).toISOString(),
        });
      }

      return results;
    } finally {
      client.release();
    }
  }

  async updateGroup(id: string, data: { name?: string; description?: string | null; currency?: string }, userId?: string | null): Promise<void> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const existing = await client.query('SELECT owner_id FROM bill_groups WHERE id = $1', [id]);
      if (existing.rows.length === 0) throw new Error('Group not found');
      if (userId && existing.rows[0].owner_id !== userId) {
        throw new Error('Forbidden: Only the group owner can update this group');
      }

      const { name, description, currency } = data;
      await client.query(`
        UPDATE bill_groups
        SET name = COALESCE($1, name),
            description = COALESCE($2, description),
            currency = COALESCE($3, currency),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [name !== undefined ? name.trim() : null, description !== undefined ? description : null, currency || null, id]);
    } finally {
      client.release();
    }
  }

  async deleteGroup(id: string, userId?: string | null): Promise<boolean> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const existing = await client.query('SELECT owner_id FROM bill_groups WHERE id = $1', [id]);
      if (existing.rows.length === 0) return false;
      if (userId && existing.rows[0].owner_id !== userId) {
        throw new Error('Forbidden: Only the group owner can delete this group');
      }

      await client.query('UPDATE bills SET group_id = NULL WHERE group_id = $1', [id]);
      const res = await client.query('DELETE FROM bill_groups WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }

  async transferGroupOwnership(id: string, newOwnerId: string, userId?: string | null): Promise<void> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const existing = await client.query('SELECT owner_id FROM bill_groups WHERE id = $1', [id]);
      if (existing.rows.length === 0) throw new Error('Group not found');
      if (userId && existing.rows[0].owner_id !== userId) {
        throw new Error('Forbidden: Only the group owner can transfer ownership of this group');
      }

      const targetUser = await this.getUserById(newOwnerId);
      if (!targetUser) throw new Error('New owner user not found');

      await client.query('UPDATE bill_groups SET owner_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newOwnerId, id]);
    } finally {
      client.release();
    }
  }

  async transferBillOwnership(billId: string, newOwnerId: string, userId?: string | null): Promise<void> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const existing = await client.query('SELECT owner_id FROM bills WHERE id = $1', [billId]);
      if (existing.rows.length === 0) throw new Error('Bill not found');
      if (userId && existing.rows[0].owner_id && existing.rows[0].owner_id !== userId) {
        throw new Error('Forbidden: Only the bill owner can transfer ownership of this bill');
      }

      const targetUser = await this.getUserById(newOwnerId);
      if (!targetUser) throw new Error('New owner user not found');

      await client.query('UPDATE bills SET owner_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newOwnerId, billId]);

      // Ensure new owner is in people table
      const existingPerson = await client.query(
        'SELECT id FROM people WHERE bill_id = $1 AND (user_id = $2 OR (email IS NOT NULL AND LOWER(email) = LOWER($3)))',
        [billId, newOwnerId, targetUser.email]
      );

      if (existingPerson.rows.length > 0) {
        await client.query('UPDATE people SET user_id = $1 WHERE id = $2', [newOwnerId, existingPerson.rows[0].id]);
      } else {
        const personId = crypto.randomUUID();
        await client.query(
          'INSERT INTO people (id, bill_id, name, sponsor_amount, paid_amount, user_id, email) VALUES ($1, $2, $3, 0, 0, $4, $5)',
          [personId, billId, targetUser.name || targetUser.email.split('@')[0], newOwnerId, targetUser.email]
        );
      }
    } finally {
      client.release();
    }
  }

  async linkBillToGroup(billId: string, groupId: string | null, userId?: string | null): Promise<void> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const existing = await client.query('SELECT owner_id FROM bills WHERE id = $1', [billId]);
      if (existing.rows.length === 0) throw new Error('Bill not found');
      if (userId && existing.rows[0].owner_id && existing.rows[0].owner_id !== userId) {
        throw new Error('Forbidden: Only the bill owner can link or unlink this bill');
      }

      await client.query('UPDATE bills SET group_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [groupId, billId]);
    } finally {
      client.release();
    }
  }

  async search(query: string, userId?: string | null): Promise<SearchResults> {
    if (!this.pool) throw new Error('Database pool not initialized');
    if (!query || query.trim().length === 0 || !userId) {
      return { groups: [], bills: [], items: [] };
    }

    const client = await this.pool.connect();
    try {
      let userEmail: string | null = null;
      if (userId) {
        const u = await this.getUserById(userId);
        if (u) userEmail = u.email ? u.email.trim().toLowerCase() : null;
      }

      const term = `%${query.trim().toLowerCase()}%`;
      const emailParam = userEmail || 'none';

      const groupsRes = await client.query(`
        SELECT g.id, g.name, g.description,
          (SELECT COUNT(*) FROM bills WHERE group_id = g.id) as total_bills,
          (SELECT COALESCE(SUM(i.price * i.quantity), 0) FROM items i JOIN bills b ON b.id = i.bill_id WHERE b.group_id = g.id) as total_amount
        FROM bill_groups g
        WHERE (LOWER(g.name) LIKE $1 OR LOWER(COALESCE(g.description, '')) LIKE $1)
          AND (
            g.owner_id = $2
            OR EXISTS (
              SELECT 1 FROM bills b
              JOIN people p ON p.bill_id = b.id
              WHERE b.group_id = g.id
                AND (b.owner_id = $2 OR p.user_id = $2 OR (p.email IS NOT NULL AND LOWER(p.email) = $3))
            )
          )
        LIMIT 10
      `, [term, userId, emailParam]);

      const billsRes = await client.query(`
        SELECT b.id, b.name, b.location, b.group_id, bg.name as group_name,
          (SELECT COALESCE(SUM(i.price * i.quantity), 0) FROM items i WHERE i.bill_id = b.id) as total_amount
        FROM bills b
        LEFT JOIN bill_groups bg ON bg.id = b.group_id
        WHERE (LOWER(COALESCE(b.name, '')) LIKE $1 OR LOWER(COALESCE(b.location, '')) LIKE $1)
          AND (
            b.owner_id = $2
            OR EXISTS (
              SELECT 1 FROM people p
              WHERE p.bill_id = b.id
                AND (p.user_id = $2 OR (p.email IS NOT NULL AND LOWER(p.email) = $3))
            )
          )
        LIMIT 15
      `, [term, userId, emailParam]);

      const itemsRes = await client.query(`
        SELECT i.id, i.name, i.price, i.quantity, i.bill_id, b.name as bill_name
        FROM items i
        JOIN bills b ON b.id = i.bill_id
        WHERE LOWER(i.name) LIKE $1
          AND (
            b.owner_id = $2
            OR EXISTS (
              SELECT 1 FROM people p
              WHERE p.bill_id = b.id
                AND (p.user_id = $2 OR (p.email IS NOT NULL AND LOWER(p.email) = $3))
            )
          )
        LIMIT 20
      `, [term, userId, emailParam]);

      return {
        groups: groupsRes.rows.map(g => ({
          id: String(g.id),
          name: String(g.name),
          description: g.description ? String(g.description) : null,
          total_amount: Number(g.total_amount || 0),
          total_bills: Number(g.total_bills || 0),
        })),
        bills: billsRes.rows.map(b => ({
          id: String(b.id),
          name: b.name || `Bill ${b.id.slice(0, 8)}`,
          location: b.location ?? null,
          totalAmount: Number(b.total_amount || 0),
          group_id: b.group_id ? String(b.group_id) : null,
          group_name: b.group_name ? String(b.group_name) : null,
        })),
        items: itemsRes.rows.map(i => ({
          id: String(i.id),
          name: String(i.name),
          price: Number(i.price || 0),
          quantity: Number(i.quantity || 1),
          bill_id: String(i.bill_id),
          bill_name: i.bill_name || `Bill ${i.bill_id.slice(0, 8)}`,
        })),
      };
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
