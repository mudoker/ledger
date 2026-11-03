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
  DeviceSubscription,
  SaveSubscriptionInput,
} from './types';

function isPersonMatchingUser(
  personName: string,
  user?: { name?: string | null; email?: string | null } | null
): boolean {
  const normP = (personName || '').trim().toLowerCase();
  if (!normP) return false;
  if (normP === 'me' || normP === 'you') return true;
  if (!user) return false;
  if (user.name) {
    const normU = user.name.trim().toLowerCase();
    if (normU && (normP === normU || normU.includes(normP) || normP.includes(normU))) {
      return true;
    }
  }
  if (user.email) {
    const emailPrefix = user.email.split('@')[0].trim().toLowerCase();
    if (emailPrefix && (normP === emailPrefix || emailPrefix.includes(normP) || normP.includes(emailPrefix))) {
      return true;
    }
  }
  return false;
}

function resolveDbEffectivePayerName(
  people: PersonData[],
  hostId: string | null | undefined,
  billTotal: number
): string | null {
  if (!people || people.length === 0) return null;
  const nominalHost = hostId
    ? (people.find(p => p.id === hostId) || people.find(p => p.userId === hostId))
    : undefined;
  const topUpfrontPayer = [...people].sort((a, b) => (b.paidAmount || 0) - (a.paidAmount || 0))[0];

  if (nominalHost) {
    const othersPaid = people.reduce(
      (sum, p) => (p.id !== nominalHost.id ? sum + (p.paidAmount || 0) : sum),
      0
    );
    const nominalPaid = Math.max(0, billTotal - othersPaid);
    if (nominalPaid <= 0.01 && topUpfrontPayer && (topUpfrontPayer.paidAmount || 0) > 0.01) {
      return topUpfrontPayer.name;
    }
    return nominalHost.name;
  }

  if (topUpfrontPayer && (topUpfrontPayer.paidAmount || 0) > 0.01) {
    return topUpfrontPayer.name;
  }

  return people[0]?.name || null;
}

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

    // Fast path: check if schema and latest migrations already exist to avoid 25+ heavy DDL statements on cold start
    let schemaReady = false;
    try {
      await this.pool.query('SELECT 1 FROM device_subscriptions LIMIT 0');
      schemaReady = true;
    } catch {
      schemaReady = false;
    }

    if (!schemaReady) {
      // Initialize Schema and Migrations for fresh or unmigrated databases
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
          visibility VARCHAR(32) DEFAULT 'public',
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
          visibility VARCHAR(32) DEFAULT 'restricted',
          share_token VARCHAR(64),
          is_shared INTEGER DEFAULT 1,
          revoked_at TIMESTAMPTZ,
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
        ALTER TABLE bills ADD COLUMN IF NOT EXISTS visibility VARCHAR(32) DEFAULT 'restricted';
        ALTER TABLE bills ADD COLUMN IF NOT EXISTS share_token VARCHAR(64);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_share_token ON bills(share_token);
        ALTER TABLE bills ADD COLUMN IF NOT EXISTS is_shared INTEGER DEFAULT 1;
        ALTER TABLE bills ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
        ALTER TABLE bill_groups ADD COLUMN IF NOT EXISTS participants JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE bill_groups ADD COLUMN IF NOT EXISTS visibility VARCHAR(32) DEFAULT 'public';

        -- Performance Indexes
        CREATE INDEX IF NOT EXISTS idx_bills_owner ON bills(owner_id);
        CREATE INDEX IF NOT EXISTS idx_bills_updated ON bills(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_people_bill_id ON people(bill_id);
        CREATE INDEX IF NOT EXISTS idx_people_user_id ON people(user_id);
        CREATE INDEX IF NOT EXISTS idx_items_bill_id ON items(bill_id);
        CREATE INDEX IF NOT EXISTS idx_item_assignments_person ON item_assignments(person_id);
        CREATE INDEX IF NOT EXISTS idx_global_charges_bill_id ON global_charges(bill_id);

        CREATE TABLE IF NOT EXISTS device_subscriptions (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          device_id TEXT,
          endpoint TEXT UNIQUE NOT NULL,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          user_agent TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_device_subscriptions_user ON device_subscriptions(user_id);
        CREATE INDEX IF NOT EXISTS idx_device_subscriptions_device ON device_subscriptions(device_id);
      `);
      } finally {
        client.release();
      }
    }
  }

  async ping(): Promise<boolean> {
    if (!this.pool) return false;
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } catch {
      return false;
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
      await client.query('BEGIN');
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

      await client.query('COMMIT');

      return {
        id: String(u.id),
        email: String(u.email),
        name: u.name ? String(u.name) : null,
        avatar_url: u.avatar_url ? String(u.avatar_url) : null,
        created_at: typeof u.created_at === 'string' ? u.created_at : new Date(u.created_at).toISOString(),
        updated_at: typeof u.updated_at === 'string' ? u.updated_at : new Date(u.updated_at).toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
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

  async getBillMeta(id: string): Promise<{ id: string; owner_id: string | null; name: string | null; is_shared: boolean } | null> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT id, owner_id, name, is_shared FROM bills WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      const b = res.rows[0];
      return {
        id: String(b.id),
        owner_id: b.owner_id ? String(b.owner_id) : null,
        name: b.name ?? null,
        is_shared: b.is_shared !== 0,
      };
    } finally {
      client.release();
    }
  }

  async getBill(id: string, userId?: string | null, isShare: boolean = false, shareToken?: string | null): Promise<BillDetail | null> {
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

      // Check if cloud sharing has been revoked
      if (bill.is_shared === 0) {
        if (!userId || bill.owner_id !== userId) {
          return null;
        }
      }

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

      // Check group access if bill belongs to a group
      let isGroupAccessible = false;
      let isGroupOwner = false;
      let groupVisibility: string | null = null;
      if (bill.group_id) {
        const groupRes = await client.query(
          'SELECT id, owner_id, visibility, participants FROM bill_groups WHERE id = $1',
          [bill.group_id]
        );
        if (groupRes.rows.length > 0) {
          const group = groupRes.rows[0];
          groupVisibility = group.visibility || 'public';
          if (userId && group.owner_id === userId) {
            isGroupOwner = true;
            isGroupAccessible = true;
          }

          let groupParts: Array<{ userId?: string | null; email?: string | null; id?: string }> = [];
          try {
            if (group.participants) {
              groupParts = typeof group.participants === 'string' ? JSON.parse(group.participants) : group.participants;
            }
          } catch {
            // ignore malformed participants JSON
          }

          if (userId || userEmail) {
            const inGroup = groupParts.some(p =>
              (userId && p.userId === userId) ||
              (userEmail && p.email && p.email.toLowerCase() === userEmail.toLowerCase())
            );
            if (inGroup) {
              isGroupAccessible = true;
            }
          }

          // If the group is public, anyone with access to the group can view its synced bills
          if (groupVisibility === 'public' || groupVisibility !== 'restricted') {
            isGroupAccessible = true;
          }
        }
      }

      let role: 'owner' | 'participant' | 'viewer' = 'viewer';
      let isReadOnly = true;

      if (isOwner) {
        role = 'owner';
        isReadOnly = Boolean(isShare);
      } else if (isParticipant) {
        role = 'participant';
        isReadOnly = true;
      } else if (isGroupOwner) {
        role = 'viewer';
        isReadOnly = true;
      } else if (isGroupAccessible && (bill.is_shared === 1 || bill.is_shared === null || bill.is_shared === undefined || bill.is_shared !== 0)) {
        role = 'viewer';
        isReadOnly = true;
      } else if (isShare) {
        if (bill.visibility === 'restricted') {
          return null;
        }
        if (bill.visibility === 'public') {
          if (bill.share_token) {
            if (!shareToken || shareToken !== bill.share_token) {
              return null;
            }
          }
        }
        role = 'viewer';
        isReadOnly = true;
      } else {
        return null;
      }

      const peopleRes = await client.query(
        'SELECT id, name, sponsor_amount as "sponsorAmount", paid_amount as "paidAmount", user_id as "userId", email FROM people WHERE bill_id = $1',
        [id]
      );
      const rawPeople = peopleRes.rows.map(p => ({
        id: String(p.id),
        name: String(p.name),
        sponsorAmount: Number(p.sponsorAmount || 0),
        paidAmount: Number(p.paidAmount || 0),
        userId: p.userId ? String(p.userId) : null,
        email: p.email ? String(p.email) : null,
      }));

      let ownerUser: { id: string; name: string | null; email: string | null } | null = null;
      if (bill.owner_id) {
        const ownerRes = await client.query('SELECT id, name, email FROM users WHERE id = $1', [bill.owner_id]);
        if (ownerRes.rows.length > 0) {
          ownerUser = {
            id: String(ownerRes.rows[0].id),
            name: ownerRes.rows[0].name ? String(ownerRes.rows[0].name) : null,
            email: ownerRes.rows[0].email ? String(ownerRes.rows[0].email) : null,
          };
        }
      }
      const hasMatchingOwnerPerson = ownerUser
        ? rawPeople.some(rp => isPersonMatchingUser(rp.name, ownerUser))
        : false;
      const people = rawPeople.map(p => {
        if (
          ownerUser &&
          !isPersonMatchingUser(p.name, ownerUser) &&
          (p.userId === ownerUser.id || (p.email && ownerUser.email && p.email.trim().toLowerCase() === ownerUser.email.trim().toLowerCase())) &&
          (p.id === bill.host_id || hasMatchingOwnerPerson)
        ) {
          return { ...p, userId: null, email: null };
        }
        return p;
      });

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
        visibility: bill.is_shared === 0
          ? 'local'
          : ((isGroupAccessible && (groupVisibility === 'public' || !groupVisibility)) ? 'public' : (bill.visibility || 'restricted')),
        shareToken: bill.share_token || null,
        isShared: bill.is_shared !== 0,
        shareRevokedAt: bill.revoked_at ? String(bill.revoked_at) : null,
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
      const existingRes = await client.query('SELECT owner_id, group_id, visibility, share_token, is_shared FROM bills WHERE id = $1', [billId]);
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

      const visibility = data.visibility || existingRes.rows[0]?.visibility || 'public';
      const shareToken = data.shareToken !== undefined ? data.shareToken : (existingRes.rows[0]?.share_token || null);
      const isShared = data.isShared !== undefined ? (data.isShared ? 1 : 0) : (existingRes.rows[0]?.is_shared !== undefined ? existingRes.rows[0].is_shared : 1);

      // Upsert bill
      await client.query(`
        INSERT INTO bills (id, name, location, host_id, qr_code, currency, owner_id, group_id, visibility, share_token, is_shared, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          location = EXCLUDED.location,
          host_id = EXCLUDED.host_id,
          qr_code = EXCLUDED.qr_code,
          currency = EXCLUDED.currency,
          owner_id = COALESCE(bills.owner_id, EXCLUDED.owner_id),
          group_id = EXCLUDED.group_id,
          visibility = EXCLUDED.visibility,
          share_token = EXCLUDED.share_token,
          is_shared = EXCLUDED.is_shared,
          revoked_at = CASE WHEN EXCLUDED.is_shared = 1 THEN NULL ELSE bills.revoked_at END,
          updated_at = CURRENT_TIMESTAMP
      `, [billId, name, location, hostId, qrCode, currency, ownerId, targetGroupId, visibility, shareToken, isShared]);

      // Delete existing children
      await client.query('DELETE FROM item_assignments WHERE item_id IN (SELECT id FROM items WHERE bill_id = $1)', [billId]);
      await client.query('DELETE FROM people WHERE bill_id = $1', [billId]);
      await client.query('DELETE FROM items WHERE bill_id = $1', [billId]);
      await client.query('DELETE FROM global_charges WHERE bill_id = $1', [billId]);

      // Insert people with user_id and email resolution
      let currentUser: { id: string; name: string | null; email: string | null } | null = null;
      if (userId) {
        const cuRes = await client.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
        if (cuRes.rows.length > 0) {
          currentUser = {
            id: String(cuRes.rows[0].id),
            name: cuRes.rows[0].name ? String(cuRes.rows[0].name) : null,
            email: cuRes.rows[0].email ? String(cuRes.rows[0].email) : null,
          };
        }
      }
      const hasMatchingCurrentUserPerson = currentUser
        ? people.some(rp => isPersonMatchingUser(rp.name, currentUser))
        : false;

      for (const p of people) {
        let pUserId = p.userId || null;
        let pEmail = p.email ? p.email.trim().toLowerCase() : null;

        // Self-heal if a non-owner participant (e.g. another person selected as host) had their userId/email
        // polluted with the bill owner's identity
        if (
          currentUser &&
          !isPersonMatchingUser(p.name, currentUser) &&
          (pUserId === currentUser.id || (pEmail && currentUser.email && pEmail === currentUser.email.trim().toLowerCase())) &&
          (p.id === hostId || hasMatchingCurrentUserPerson)
        ) {
          pUserId = null;
          pEmail = null;
        }

        // If email provided but no userId, try to resolve to registered user
        if (pEmail && !pUserId) {
          const uRes = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [pEmail]);
          if (uRes.rows.length > 0) {
            pUserId = uRes.rows[0].id;
          }
        }

        if (
          userId &&
          !pUserId &&
          !pEmail &&
          ((people.length === 1 && !hostId) || (currentUser && isPersonMatchingUser(p.name, currentUser)))
        ) {
          pUserId = userId;
          if (currentUser?.email) {
            pEmail = currentUser.email.trim().toLowerCase();
          }
        }

        await client.query(
          'INSERT INTO people (id, bill_id, name, sponsor_amount, paid_amount, user_id, email) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [p.id, billId, p.name, Number(p.sponsorAmount || 0), Number(p.paidAmount || 0), pUserId, pEmail || null]
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

      await client.query('BEGIN');
      const res = await client.query('DELETE FROM bills WHERE id = $1', [billId]);
      await client.query('COMMIT');
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async revokeBillShare(billId: string, userId?: string | null): Promise<boolean> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      if (userId) {
        const billRes = await client.query('SELECT owner_id FROM bills WHERE id = $1', [billId]);
        if (billRes.rows.length > 0) {
          const ownerId = billRes.rows[0].owner_id;
          if (ownerId && ownerId !== userId) {
            throw new Error('Forbidden: Only the bill owner can revoke sharing');
          }
        }
      }

      await client.query('BEGIN');
      const res = await client.query(
        "UPDATE bills SET is_shared = 0, share_token = NULL, visibility = 'local', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [billId]
      );
      await client.query('COMMIT');
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
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
          b.currency,
          b.owner_id,
          b.group_id,
          bg.name as group_name,
          bg.visibility as group_visibility,
          b.visibility,
          b.share_token,
          b.is_shared,
          (SELECT name FROM items WHERE bill_id = b.id LIMIT 1) as first_item_name,
          (SELECT COUNT(*) FROM items WHERE bill_id = b.id) as item_count,
          (SELECT COALESCE(SUM(price * quantity), 0) FROM items WHERE bill_id = b.id) as subtotal,
          (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'fixed') as fixed_extras,
          (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'percent') as percent_extras
        FROM bills b
        LEFT JOIN bill_groups bg ON bg.id = b.group_id
        WHERE b.revoked_at IS NULL
          AND (
            b.owner_id = $1
            OR (
              (b.is_shared IS NULL OR b.is_shared = 1)
              AND EXISTS (
                SELECT 1 FROM people p
                WHERE p.bill_id = b.id
                AND (p.user_id = $1 OR (p.email IS NOT NULL AND LOWER(p.email) = LOWER($2)))
              )
            )
          )
        ORDER BY b.updated_at DESC
      `, [userId, userEmail || '']);

      return res.rows.map(b => {
        const subtotal = Number(b.subtotal || 0);
        const percentSum = Number(b.percent_extras || 0);
        const fixedExtras = Number(b.fixed_extras || 0);
        const total = Math.round(subtotal * (1 + percentSum / 100) + fixedExtras);
        const itemCount = Number(b.item_count || 0);
        const isOwner = b.owner_id === userId;
        const effectiveVisibility = (b.group_id && (b.group_visibility === 'public' || !b.group_visibility))
          ? 'public'
          : (b.visibility === 'local' ? 'restricted' : ((b.visibility as 'local' | 'restricted' | 'public') || 'restricted'));

        return {
          id: String(b.id),
          created_at: typeof b.created_at === 'string' ? b.created_at : new Date(b.created_at).toISOString(),
          updated_at: typeof b.updated_at === 'string' ? b.updated_at : new Date(b.updated_at).toISOString(),
          name: b.custom_name || (b.first_item_name ? b.first_item_name + (itemCount > 1 ? ` & ${itemCount - 1} more` : '') : 'Empty Bill'),
          location: b.location ?? null,
          currency: b.currency || 'VND',
          totalAmount: total,
          owner_id: b.owner_id ? String(b.owner_id) : null,
          group_id: b.group_id ? String(b.group_id) : null,
          group_name: b.group_name ? String(b.group_name) : null,
          role: isOwner ? 'owner' : 'participant',
          is_owner: isOwner,
          visibility: effectiveVisibility,
          shareToken: isOwner ? (b.share_token || null) : null,
          sharingStatus: 'shared',
        };
      });
    } finally {
      client.release();
    }
  }

  async createGroup(
    name: string,
    ownerId: string,
    description: string | null = null,
    currency: string = 'VND',
    visibility: 'public' | 'restricted' = 'public',
    customId?: string | null,
    participants?: PersonData[]
  ): Promise<BillGroupDetail> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const id = (customId && customId.trim().length > 0) ? customId.trim() : crypto.randomUUID();
      const participantsJson = JSON.stringify(Array.isArray(participants) ? participants : []);
      await client.query(
        `INSERT INTO bill_groups (id, name, description, owner_id, currency, visibility, participants)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           currency = EXCLUDED.currency,
           visibility = EXCLUDED.visibility,
           participants = CASE WHEN $8::boolean THEN EXCLUDED.participants ELSE bill_groups.participants END,
           updated_at = CURRENT_TIMESTAMP
         WHERE bill_groups.owner_id = EXCLUDED.owner_id`,
        [id, name.trim(), description ? description.trim() : null, ownerId, currency, visibility, participantsJson, Array.isArray(participants)]
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
      const groupVisibility = (group.visibility || 'public') as 'public' | 'restricted';
      const parsedParticipants: PersonData[] = Array.isArray(group.participants)
        ? group.participants
        : (typeof group.participants === 'string' ? JSON.parse(group.participants) : []);

      if (groupVisibility === 'restricted' && !isOwner) {
        if (!userId) return null;
        const uRes = await client.query('SELECT email FROM users WHERE id = $1', [userId]);
        const userEmail = uRes.rows.length > 0 && uRes.rows[0].email ? String(uRes.rows[0].email).toLowerCase() : '';
        const inGroupParticipants = parsedParticipants.some(p =>
          (p.userId && p.userId === userId) ||
          (userEmail && p.email && p.email.toLowerCase() === userEmail)
        );
        if (!inGroupParticipants) {
          const billAccessRes = await client.query(`
            SELECT 1 FROM bills b
            LEFT JOIN people p ON p.bill_id = b.id
            WHERE b.group_id = $1
              AND (
                b.owner_id = $2
                OR (b.is_shared = 1 AND b.revoked_at IS NULL AND (p.user_id = $2 OR (p.email IS NOT NULL AND LOWER(p.email) = $3)))
              )
            LIMIT 1
          `, [id, userId, userEmail]);
          if (billAccessRes.rows.length === 0) {
            return null;
          }
        }
      }

      const billsRes = await client.query(`
        SELECT id, name, location, currency, host_id, is_shared, created_at, updated_at
        FROM bills
        WHERE group_id = $1
          ${isOwner ? '' : 'AND is_shared = 1 AND revoked_at IS NULL'}
        ORDER BY created_at DESC, id ASC
      `, [id]);

      let totalGroupAmount = 0;
      let totalItemsCount = 0;
      const bills: GroupBillOverview[] = [];

      if (billsRes.rows.length > 0) {
        const billIds = billsRes.rows.map(b => b.id);

        const peopleRes = await client.query(
          'SELECT bill_id, id, name, sponsor_amount as "sponsorAmount", paid_amount as "paidAmount", user_id as "userId", email FROM people WHERE bill_id = ANY($1)',
          [billIds]
        );
        const chargesRes = await client.query(
          'SELECT bill_id, id, name, type, amount FROM global_charges WHERE bill_id = ANY($1)',
          [billIds]
        );
        const itemsRes = await client.query(
          'SELECT bill_id, id, name, price, quantity FROM items WHERE bill_id = ANY($1)',
          [billIds]
        );

        const itemIds = itemsRes.rows.map(it => it.id);
        const assignRes = itemIds.length > 0
          ? await client.query('SELECT item_id, person_id, quantity FROM item_assignments WHERE item_id = ANY($1)', [itemIds])
          : { rows: [] };

        const assignmentsByItem = new Map<string, Record<string, number>>();
        for (const row of assignRes.rows) {
          let map = assignmentsByItem.get(row.item_id);
          if (!map) {
            map = {};
            assignmentsByItem.set(row.item_id, map);
          }
          map[row.person_id] = Number(row.quantity);
        }

        const peopleByBill = new Map<string, PersonData[]>();
        for (const p of peopleRes.rows) {
          let list = peopleByBill.get(p.bill_id);
          if (!list) {
            list = [];
            peopleByBill.set(p.bill_id, list);
          }
          list.push({
            id: String(p.id),
            name: String(p.name),
            sponsorAmount: Number(p.sponsorAmount || 0),
            paidAmount: Number(p.paidAmount || 0),
            userId: p.userId ? String(p.userId) : null,
            email: p.email ? String(p.email) : null,
          });
        }

        const chargesByBill = new Map<string, GlobalChargeData[]>();
        for (const gc of chargesRes.rows) {
          let list = chargesByBill.get(gc.bill_id);
          if (!list) {
            list = [];
            chargesByBill.set(gc.bill_id, list);
          }
          list.push({
            id: String(gc.id),
            name: String(gc.name),
            type: String(gc.type),
            amount: Number(gc.amount || 0),
          });
        }

        const itemsByBill = new Map<string, GroupItemOverview[]>();
        for (const it of itemsRes.rows) {
          let list = itemsByBill.get(it.bill_id);
          if (!list) {
            list = [];
            itemsByBill.set(it.bill_id, list);
          }
          const price = Number(it.price || 0);
          const quantity = Number(it.quantity || 1);
          list.push({
            id: String(it.id),
            name: String(it.name),
            price,
            quantity,
            totalPrice: price * quantity,
            assignments: assignmentsByItem.get(it.id) || {},
          });
        }

        const groupOwnerUser = group.owner_id
          ? {
              id: String(group.owner_id),
              name: group.owner_name ? String(group.owner_name) : null,
              email: group.owner_email ? String(group.owner_email) : null,
            }
          : null;

        for (const b of billsRes.rows) {
          const rawBillPeople = peopleByBill.get(b.id) || [];
          const hasOwnerMatchInBill = groupOwnerUser
            ? rawBillPeople.some(rp => isPersonMatchingUser(rp.name, groupOwnerUser))
            : false;
          const people = rawBillPeople.map(p => {
            if (
              groupOwnerUser &&
              !isPersonMatchingUser(p.name, groupOwnerUser) &&
              (p.userId === groupOwnerUser.id || (p.email && groupOwnerUser.email && p.email.trim().toLowerCase() === groupOwnerUser.email.trim().toLowerCase())) &&
              (p.id === b.host_id || hasOwnerMatchInBill)
            ) {
              return { ...p, userId: null, email: null };
            }
            return p;
          });
          const globalCharges = chargesByBill.get(b.id) || [];
          const items = itemsByBill.get(b.id) || [];

          const subtotal = items.reduce((s, it) => s + it.totalPrice, 0);
          let fixedCharges = 0;
          let percentCharges = 0;
          globalCharges.forEach(c => {
            if (c.type === 'fixed') fixedCharges += Number(c.amount || 0);
            if (c.type === 'percent') percentCharges += Number(c.amount || 0);
          });
          const billTotal = Math.round(subtotal * (1 + percentCharges / 100) + fixedCharges);
          const hostName = resolveDbEffectivePayerName(people, b.host_id, billTotal);

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
            ...(b.is_shared === 0 ? { isLocal: true } : {}),
          });
        }
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
        visibility: groupVisibility,
        total_amount: totalGroupAmount,
        total_bills: bills.length,
        total_items: totalItemsCount,
        created_at: typeof group.created_at === 'string' ? group.created_at : new Date(group.created_at).toISOString(),
        updated_at: typeof group.updated_at === 'string' ? group.updated_at : new Date(group.updated_at).toISOString(),
        bills,
        participants: parsedParticipants,
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
      const userEmail = uRes.rows.length > 0 && uRes.rows[0].email ? String(uRes.rows[0].email).toLowerCase() : '';
      const userIdLike = `%"userId":"${userId}"%`;
      const userEmailLike = userEmail ? `%"email":"${userEmail}"%` : '__no_email_match__';

      const groupsRes = await client.query(`
        SELECT
          g.id,
          g.name,
          g.description,
          g.owner_id,
          g.currency,
          g.visibility,
          g.participants,
          g.created_at,
          g.updated_at,
          u.name as owner_name,
          u.email as owner_email
        FROM bill_groups g
        LEFT JOIN users u ON u.id = g.owner_id
        WHERE g.owner_id = $1
           OR (g.participants IS NOT NULL AND (g.participants::text LIKE $3 OR LOWER(g.participants::text) LIKE $4))
           OR EXISTS (
             SELECT 1 FROM bills b
             LEFT JOIN people p ON p.bill_id = b.id
             WHERE b.group_id = g.id
               AND (
                 b.owner_id = $1
                 OR ((b.is_shared IS NULL OR b.is_shared = 1) AND b.revoked_at IS NULL AND (p.user_id = $1 OR (p.email IS NOT NULL AND LOWER(p.email) = LOWER($2))))
               )
           )
        ORDER BY g.updated_at DESC
      `, [userId, userEmail, userIdLike, userEmailLike]);

      if (groupsRes.rows.length === 0) {
        return [];
      }

      const groupIds = groupsRes.rows.map(g => g.id);
      const billStatsRes = await client.query(`
        SELECT b.id, b.group_id,
          (SELECT COALESCE(SUM(price * quantity), 0) FROM items WHERE bill_id = b.id) as subtotal,
          (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'fixed') as fixed_extras,
          (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'percent') as percent_extras,
          (SELECT COUNT(*) FROM items WHERE bill_id = b.id) as item_count
        FROM bills b
        WHERE b.group_id = ANY($1)
          AND (b.owner_id = $2 OR (b.is_shared = 1 AND b.revoked_at IS NULL))
      `, [groupIds, userId || 'none']);

      const statsByGroup = new Map<string, {
        totalAmount: number;
        totalItems: number;
        billsCount: number;
        billIds: string[];
        billAmounts: Record<string, number>;
        billItemCounts: Record<string, number>;
      }>();
      for (const bs of billStatsRes.rows) {
        const gid = String(bs.group_id);
        let curr = statsByGroup.get(gid);
        if (!curr) {
          curr = { totalAmount: 0, totalItems: 0, billsCount: 0, billIds: [], billAmounts: {}, billItemCounts: {} };
          statsByGroup.set(gid, curr);
        }
        const billTotal = Math.round(Number(bs.subtotal || 0) * (1 + Number(bs.percent_extras || 0) / 100) + Number(bs.fixed_extras || 0));
        curr.totalAmount += billTotal;
        curr.totalItems += Number(bs.item_count || 0);
        curr.billsCount += 1;
        const bid = String(bs.id);
        curr.billIds.push(bid);
        curr.billAmounts[bid] = billTotal;
        curr.billItemCounts[bid] = Number(bs.item_count || 0);
      }

      const results: BillGroupSummary[] = groupsRes.rows.map(g => {
        const stats = statsByGroup.get(String(g.id)) || {
          totalAmount: 0,
          totalItems: 0,
          billsCount: 0,
          billIds: [],
          billAmounts: {},
          billItemCounts: {},
        };
        return {
          id: String(g.id),
          name: String(g.name),
          description: g.description ? String(g.description) : null,
          owner_id: String(g.owner_id),
          owner_name: g.owner_name ? String(g.owner_name) : null,
          owner_email: g.owner_email ? String(g.owner_email) : null,
          is_owner: g.owner_id === userId,
          currency: g.currency ? String(g.currency) : 'VND',
          visibility: (g.visibility || 'public') as 'public' | 'restricted',
          total_amount: stats.totalAmount,
          total_bills: stats.billsCount,
          total_items: stats.totalItems,
          bill_ids: stats.billIds,
          bill_amounts: stats.billAmounts,
          bill_item_counts: stats.billItemCounts,
          created_at: typeof g.created_at === 'string' ? g.created_at : new Date(g.created_at).toISOString(),
          updated_at: typeof g.updated_at === 'string' ? g.updated_at : new Date(g.updated_at).toISOString(),
          participants: Array.isArray((g as any).participants)
            ? (g as any).participants
            : (typeof (g as any).participants === 'string' ? JSON.parse((g as any).participants) : []),
        };
      });

      return results;
    } finally {
      client.release();
    }
  }

  async updateGroup(id: string, data: { name?: string; description?: string | null; currency?: string; visibility?: 'public' | 'restricted'; participants?: PersonData[] }, userId?: string | null): Promise<void> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const existing = await client.query('SELECT owner_id FROM bill_groups WHERE id = $1', [id]);
      if (existing.rows.length === 0) throw new Error('Group not found');
      if (userId && existing.rows[0].owner_id !== userId) {
        throw new Error('Forbidden: Only the group owner can update this group');
      }

      const { name, description, currency, visibility, participants } = data;
      await client.query(`
        UPDATE bill_groups
        SET name = COALESCE($1, name),
            description = COALESCE($2, description),
            currency = COALESCE($3, currency),
            visibility = COALESCE($4, visibility),
            participants = CASE WHEN $5::text IS NOT NULL THEN $5::jsonb ELSE participants END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `, [
        name !== undefined ? name.trim() : null,
        description !== undefined ? description : null,
        currency || null,
        visibility || null,
        participants !== undefined ? JSON.stringify(participants) : null,
        id
      ]);

      // When group is made public or shared, ensure only active cloud-synced bills are set to public
      if (visibility === 'public') {
        await client.query(`
          UPDATE bills
          SET visibility = 'public', updated_at = CURRENT_TIMESTAMP
          WHERE group_id = $1 AND is_shared = 1 AND revoked_at IS NULL
        `, [id]);
      } else if (visibility === 'restricted') {
        await client.query(`
          UPDATE bills
          SET visibility = 'restricted', updated_at = CURRENT_TIMESTAMP
          WHERE group_id = $1 AND is_shared = 1 AND revoked_at IS NULL AND share_token IS NULL
        `, [id]);
      }
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

      await client.query('BEGIN');
      await client.query('UPDATE bills SET group_id = NULL WHERE group_id = $1', [id]);
      const res = await client.query('DELETE FROM bill_groups WHERE id = $1', [id]);
      await client.query('COMMIT');
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
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

      await client.query('BEGIN');
      await client.query('UPDATE bill_groups SET owner_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newOwnerId, id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
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

      await client.query('BEGIN');
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
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
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

      if (groupId) {
        const groupRes = await client.query('SELECT id, visibility FROM bill_groups WHERE id = $1', [groupId]);
        if (groupRes.rows.length === 0) throw new Error('Group not found');
      }

      await client.query('BEGIN');
      await client.query('UPDATE bills SET group_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [groupId, billId]);
      if (groupId) {
        const groupRes = await client.query('SELECT visibility FROM bill_groups WHERE id = $1', [groupId]);
        if (groupRes.rows.length > 0) {
          const gVis = groupRes.rows[0].visibility;
          if (gVis === 'public' || !gVis || gVis !== 'restricted') {
            await client.query("UPDATE bills SET visibility = 'public' WHERE id = $1 AND is_shared = 1 AND revoked_at IS NULL", [billId]);
          }
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
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
      const userIdLike = `%"userId":"${userId}"%`;
      const userEmailLike = userEmail ? `%"email":"${userEmail}"%` : '__no_email_match__';

      const groupsRes = await client.query(`
        SELECT g.id, g.name, g.description, g.currency,
          (SELECT COUNT(*) FROM bills b WHERE b.group_id = g.id AND (b.owner_id = $2 OR (b.is_shared = 1 AND b.revoked_at IS NULL))) as total_bills,
          (
            SELECT COALESCE(SUM(
              ROUND(
                (SELECT COALESCE(SUM(i.price * i.quantity), 0) FROM items i WHERE i.bill_id = b.id) *
                (1 + (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'percent') / 100.0) +
                (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'fixed')
              )
            ), 0) FROM bills b WHERE b.group_id = g.id AND (b.owner_id = $2 OR (b.is_shared = 1 AND b.revoked_at IS NULL))
          ) as total_amount
        FROM bill_groups g
        WHERE (LOWER(g.name) LIKE $1 OR LOWER(COALESCE(g.description, '')) LIKE $1)
          AND (
            g.owner_id = $2
            OR (g.participants IS NOT NULL AND (g.participants::text LIKE $4 OR LOWER(g.participants::text) LIKE $5))
            OR EXISTS (
              SELECT 1 FROM bills b
              JOIN people p ON p.bill_id = b.id
              WHERE b.group_id = g.id
                AND (
                  b.owner_id = $2
                  OR ((b.is_shared IS NULL OR b.is_shared = 1) AND b.revoked_at IS NULL AND (p.user_id = $2 OR (p.email IS NOT NULL AND LOWER(p.email) = $3)))
                )
            )
          )
        LIMIT 10
      `, [term, userId, emailParam, userIdLike, userEmailLike]);

      const billsRes = await client.query(`
        SELECT b.id, b.name, b.location, b.currency, b.group_id, bg.name as group_name,
          ROUND(
            (SELECT COALESCE(SUM(i.price * i.quantity), 0) FROM items i WHERE i.bill_id = b.id) *
            (1 + (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'percent') / 100.0) +
            (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'fixed')
          ) as total_amount
        FROM bills b
        LEFT JOIN bill_groups bg ON bg.id = b.group_id
        WHERE (LOWER(COALESCE(b.name, '')) LIKE $1 OR LOWER(COALESCE(b.location, '')) LIKE $1)
          AND (
            b.owner_id = $2
            OR (
              (b.is_shared IS NULL OR b.is_shared = 1)
              AND b.revoked_at IS NULL
              AND EXISTS (
                SELECT 1 FROM people p
                WHERE p.bill_id = b.id
                  AND (p.user_id = $2 OR (p.email IS NOT NULL AND LOWER(p.email) = $3))
              )
            )
          )
        LIMIT 15
      `, [term, userId, emailParam]);

      const itemsRes = await client.query(`
        SELECT i.id, i.name, i.price, i.quantity, i.bill_id, b.name as bill_name, b.currency
        FROM items i
        JOIN bills b ON b.id = i.bill_id
        WHERE LOWER(i.name) LIKE $1
          AND (
            b.owner_id = $2
            OR (
              (b.is_shared IS NULL OR b.is_shared = 1)
              AND b.revoked_at IS NULL
              AND EXISTS (
                SELECT 1 FROM people p
                WHERE p.bill_id = b.id
                  AND (p.user_id = $2 OR (p.email IS NOT NULL AND LOWER(p.email) = $3))
              )
            )
          )
        LIMIT 20
      `, [term, userId, emailParam]);

      return {
        groups: groupsRes.rows.map(g => ({
          id: String(g.id),
          name: String(g.name),
          description: g.description ? String(g.description) : null,
          currency: g.currency || 'VND',
          total_amount: Number(g.total_amount || 0),
          total_bills: Number(g.total_bills || 0),
        })),
        bills: billsRes.rows.map(b => ({
          id: String(b.id),
          name: b.name || `Bill ${b.id.slice(0, 8)}`,
          location: b.location ?? null,
          currency: b.currency || 'VND',
          totalAmount: Number(b.total_amount || 0),
          group_id: b.group_id ? String(b.group_id) : null,
          group_name: b.group_name ? String(b.group_name) : null,
        })),
        items: itemsRes.rows.map(i => ({
          id: String(i.id),
          name: String(i.name),
          price: Number(i.price || 0),
          quantity: Number(i.quantity || 1),
          currency: i.currency || 'VND',
          bill_id: String(i.bill_id),
          bill_name: i.bill_name || `Bill ${i.bill_id.slice(0, 8)}`,
        })),
      };
    } finally {
      client.release();
    }
  }

  async saveDeviceSubscription(sub: SaveSubscriptionInput): Promise<DeviceSubscription> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const existing = await client.query('SELECT id FROM device_subscriptions WHERE endpoint = $1', [sub.endpoint]);
      const id = existing.rows.length > 0 ? existing.rows[0].id : crypto.randomUUID();
      const now = new Date().toISOString();

      const res = await client.query(`
        INSERT INTO device_subscriptions (id, user_id, device_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (endpoint) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          device_id = EXCLUDED.device_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          user_agent = EXCLUDED.user_agent,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `, [id, sub.userId || null, sub.deviceId || null, sub.endpoint, sub.keys.p256dh, sub.keys.auth, sub.userAgent || null, now, now]);

      const r = res.rows[0];
      return {
        id: String(r.id),
        user_id: r.user_id ? String(r.user_id) : null,
        device_id: r.device_id ? String(r.device_id) : null,
        endpoint: String(r.endpoint),
        p256dh: String(r.p256dh),
        auth: String(r.auth),
        user_agent: r.user_agent ? String(r.user_agent) : null,
        created_at: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
        updated_at: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
      };
    } finally {
      client.release();
    }
  }

  async getSubscriptionsByUser(userId: string): Promise<DeviceSubscription[]> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT * FROM device_subscriptions WHERE user_id = $1', [userId]);
      return res.rows.map(r => ({
        id: String(r.id),
        user_id: r.user_id ? String(r.user_id) : null,
        device_id: r.device_id ? String(r.device_id) : null,
        endpoint: String(r.endpoint),
        p256dh: String(r.p256dh),
        auth: String(r.auth),
        user_agent: r.user_agent ? String(r.user_agent) : null,
        created_at: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
        updated_at: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
      }));
    } finally {
      client.release();
    }
  }

  async getSubscriptionsByDevice(deviceId: string): Promise<DeviceSubscription[]> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT * FROM device_subscriptions WHERE device_id = $1', [deviceId]);
      return res.rows.map(r => ({
        id: String(r.id),
        user_id: r.user_id ? String(r.user_id) : null,
        device_id: r.device_id ? String(r.device_id) : null,
        endpoint: String(r.endpoint),
        p256dh: String(r.p256dh),
        auth: String(r.auth),
        user_agent: r.user_agent ? String(r.user_agent) : null,
        created_at: typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at).toISOString(),
        updated_at: typeof r.updated_at === 'string' ? r.updated_at : new Date(r.updated_at).toISOString(),
      }));
    } finally {
      client.release();
    }
  }

  async deleteSubscriptionByEndpoint(endpoint: string): Promise<boolean> {
    if (!this.pool) throw new Error('Database pool not initialized');
    const client = await this.pool.connect();
    try {
      const res = await client.query('DELETE FROM device_subscriptions WHERE endpoint = $1', [endpoint]);
      return (res.rowCount ?? 0) > 0;
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
