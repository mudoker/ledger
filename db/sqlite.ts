import { DatabaseSync } from 'node:sqlite';
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

interface BillRow {
  id: string;
  name: string | null;
  location: string | null;
  host_id: string | null;
  qr_code: string | null;
  owner_id: string | null;
  group_id: string | null;
  group_name?: string | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
}

interface BillGroupRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

interface PersonRow {
  id: string;
  name: string;
  sponsorAmount?: number;
  paidAmount?: number;
  userId?: string | null;
  email?: string | null;
}

interface ChargeRow {
  id: string;
  name: string;
  type: string;
  amount: number;
}

interface ItemRow {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface AssignmentRow {
  person_id: string;
  quantity: number;
}

interface BillSummaryRow {
  id: string;
  created_at: string;
  updated_at: string;
  custom_name: string | null;
  location: string | null;
  owner_id: string | null;
  group_id: string | null;
  group_name: string | null;
  first_item_name: string | null;
  item_count: number;
  subtotal: number | null;
  fixed_extras: number | null;
  percent_extras: number | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteAdapter implements DatabaseAdapter {
  readonly type = 'sqlite' as const;
  private db: DatabaseSync;

  constructor(filePath = 'bills.sqlite') {
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        avatar_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bill_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        owner_id TEXT NOT NULL,
        currency TEXT DEFAULT 'VND',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_bill_groups_owner ON bill_groups(owner_id);

      CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        name TEXT,
        location TEXT,
        host_id TEXT,
        qr_code TEXT,
        owner_id TEXT,
        group_id TEXT,
        currency TEXT DEFAULT 'VND',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(group_id) REFERENCES bill_groups(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        bill_id TEXT,
        name TEXT NOT NULL,
        sponsor_amount REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        user_id TEXT,
        email TEXT,
        FOREIGN KEY(bill_id) REFERENCES bills(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        bill_id TEXT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        quantity REAL DEFAULT 1,
        FOREIGN KEY(bill_id) REFERENCES bills(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS item_assignments (
        item_id TEXT,
        person_id TEXT,
        quantity REAL DEFAULT 1,
        PRIMARY KEY (item_id, person_id),
        FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE,
        FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS global_charges (
        id TEXT PRIMARY KEY,
        bill_id TEXT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        FOREIGN KEY(bill_id) REFERENCES bills(id) ON DELETE CASCADE
      );
    `);

    // Check and add missing columns if upgrading an existing SQLite database
    const billColumns = this.db.prepare("PRAGMA table_info(bills)").all() as Array<{ name: string }>;
    const billColNames = new Set(billColumns.map(c => c.name));
    if (!billColNames.has('owner_id')) {
      this.db.exec('ALTER TABLE bills ADD COLUMN owner_id TEXT;');
    }
    if (!billColNames.has('group_id')) {
      this.db.exec('ALTER TABLE bills ADD COLUMN group_id TEXT REFERENCES bill_groups(id) ON DELETE SET NULL;');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_bills_group_id ON bills(group_id);');
    }
    if (!billColNames.has('currency')) {
      this.db.exec("ALTER TABLE bills ADD COLUMN currency TEXT DEFAULT 'VND';");
    }

    const peopleColumns = this.db.prepare("PRAGMA table_info(people)").all() as Array<{ name: string }>;
    const peopleColNames = new Set(peopleColumns.map(c => c.name));
    if (!peopleColNames.has('user_id')) {
      this.db.exec('ALTER TABLE people ADD COLUMN user_id TEXT;');
    }
    if (!peopleColNames.has('email')) {
      this.db.exec('ALTER TABLE people ADD COLUMN email TEXT;');
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim()) as UserRow | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      email: String(row.email),
      name: row.name ? String(row.name) : null,
      avatar_url: row.avatar_url ? String(row.avatar_url) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  async getUserById(id: string): Promise<User | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      email: String(row.email),
      name: row.name ? String(row.name) : null,
      avatar_url: row.avatar_url ? String(row.avatar_url) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }

  async upsertUser(user: { id?: string; email: string; name?: string | null; avatar_url?: string | null }): Promise<User> {
    const cleanEmail = user.email.trim().toLowerCase();
    const existing = await this.getUserByEmail(cleanEmail);
    const userId = existing?.id || user.id || crypto.randomUUID();

    this.db.exec('BEGIN TRANSACTION;');
    try {
      if (existing) {
        this.db.prepare(`
          UPDATE users
          SET name = COALESCE(?, name),
              avatar_url = COALESCE(?, avatar_url),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(user.name || null, user.avatar_url || null, existing.id);
      } else {
        this.db.prepare(`
          INSERT INTO users (id, email, name, avatar_url, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(userId, cleanEmail, user.name || null, user.avatar_url || null);
      }

      // Auto-link existing participants with matching email
      this.db.prepare('UPDATE people SET user_id = ? WHERE LOWER(email) = LOWER(?) AND user_id IS NULL').run(userId, cleanEmail);
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }

    const saved = await this.getUserById(userId);
    if (!saved) throw new Error('Failed to retrieve user after upsert');
    return saved;
  }

  async searchUsers(query: string): Promise<Array<{ id: string; email: string; name: string | null; avatar_url: string | null }>> {
    const term = `%${query.trim().toLowerCase()}%`;
    const rows = this.db.prepare(
      'SELECT id, email, name, avatar_url FROM users WHERE LOWER(email) LIKE ? OR LOWER(name) LIKE ? LIMIT 10'
    ).all(term, term) as unknown as UserRow[];

    return rows.map(r => ({
      id: String(r.id),
      email: String(r.email),
      name: r.name ? String(r.name) : null,
      avatar_url: r.avatar_url ? String(r.avatar_url) : null,
    }));
  }

  async getBill(id: string, userId?: string | null, isShare: boolean = false): Promise<BillDetail | null> {
    const bill = this.db.prepare(`
      SELECT b.*, bg.name as group_name
      FROM bills b
      LEFT JOIN bill_groups bg ON bg.id = b.group_id
      WHERE b.id = ?
    `).get(id) as unknown as BillRow | undefined;
    if (!bill) return null;

    let userEmail: string | null = null;
    if (userId) {
      const u = await this.getUserById(userId);
      if (u) userEmail = u.email;
    }

    const isOwner = Boolean(userId && bill.owner_id === userId);

    const participantCheck = this.db.prepare(
      'SELECT id FROM people WHERE bill_id = ? AND (user_id = ? OR (email IS NOT NULL AND LOWER(email) = LOWER(?)))'
    ).all(id, userId || 'none', userEmail || 'none');
    const isParticipant = participantCheck.length > 0;

    if (!isShare && !isOwner && !isParticipant) {
      return null;
    }

    const role: 'owner' | 'participant' | 'viewer' = isOwner ? 'owner' : (isParticipant ? 'participant' : 'viewer');
    const isReadOnly = isShare || !isOwner;

    const people = (
      this.db.prepare(
        'SELECT id, name, sponsor_amount as sponsorAmount, paid_amount as paidAmount, user_id as userId, email FROM people WHERE bill_id = ?'
      ).all(id) as unknown as PersonRow[]
    ).map(p => ({
      id: String(p.id),
      name: String(p.name),
      sponsorAmount: Number(p.sponsorAmount || 0),
      paidAmount: Number(p.paidAmount || 0),
      userId: p.userId ? String(p.userId) : null,
      email: p.email ? String(p.email) : null,
    }));

    const globalCharges = (
      this.db.prepare(
        'SELECT id, name, type, amount FROM global_charges WHERE bill_id = ?'
      ).all(id) as unknown as ChargeRow[]
    ).map(gc => ({
      id: String(gc.id),
      name: String(gc.name),
      type: String(gc.type),
      amount: Number(gc.amount || 0),
    }));

    const itemsRaw = this.db.prepare('SELECT id, name, price, quantity FROM items WHERE bill_id = ?').all(id) as unknown as ItemRow[];
    const items = itemsRaw.map(item => {
      const assignmentsRows = this.db.prepare(
        'SELECT person_id, quantity FROM item_assignments WHERE item_id = ?'
      ).all(item.id) as unknown as AssignmentRow[];
      const assignments: Record<string, number> = {};
      assignmentsRows.forEach(row => {
        assignments[row.person_id] = Number(row.quantity);
      });
      return {
        id: String(item.id),
        name: String(item.name),
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1),
        assignments,
      };
    });

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
  }

  async saveBill(billId: string, data: BillPayload, userId?: string | null): Promise<void> {
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

    this.db.exec('BEGIN TRANSACTION;');
    try {
      const existing = this.db.prepare('SELECT id, owner_id, group_id FROM bills WHERE id = ?').get(billId) as BillRow | undefined;
      if (existing) {
        if (existing.owner_id && userId && existing.owner_id !== userId) {
          throw new Error('Forbidden: Only the bill owner can edit this bill');
        }
      }

      const ownerId = existing
        ? (existing.owner_id || userId || null)
        : (userId || data.ownerId || null);

      const rawGroupId = data.groupId !== undefined ? data.groupId : data.group_id;
      const targetGroupId = rawGroupId !== undefined ? (rawGroupId || null) : (existing?.group_id || null);

      if (existing) {
        this.db.prepare(
          'UPDATE bills SET name = ?, location = ?, host_id = ?, qr_code = ?, currency = ?, owner_id = COALESCE(owner_id, ?), group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(name, location, hostId, qrCode, currency, ownerId, targetGroupId, billId);
      } else {
        this.db.prepare(
          'INSERT INTO bills (id, name, location, host_id, qr_code, currency, owner_id, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(billId, name, location, hostId, qrCode, currency, ownerId, targetGroupId);
      }

      this.db.prepare('DELETE FROM item_assignments WHERE item_id IN (SELECT id FROM items WHERE bill_id = ?)').run(billId);
      this.db.prepare('DELETE FROM people WHERE bill_id = ?').run(billId);
      this.db.prepare('DELETE FROM items WHERE bill_id = ?').run(billId);
      this.db.prepare('DELETE FROM global_charges WHERE bill_id = ?').run(billId);

      const insertPerson = this.db.prepare(
        'INSERT INTO people (id, bill_id, name, sponsor_amount, paid_amount, user_id, email) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const p of people) {
        let pUserId = p.userId || null;
        const pEmail = p.email ? p.email.trim().toLowerCase() : null;

        if (pEmail && !pUserId) {
          const registered = await this.getUserByEmail(pEmail);
          if (registered) {
            pUserId = registered.id;
          }
        }

        if (userId && (p.id === hostId || (!hostId && people.length === 1 && !pUserId && !pEmail))) {
          pUserId = userId;
          if (!pEmail) {
            const u = await this.getUserById(userId);
            if (u) p.email = u.email;
          }
        }

        insertPerson.run(p.id, billId, p.name, Number(p.sponsorAmount || 0), Number(p.paidAmount || 0), pUserId, p.email || null);
      }

      const insertItem = this.db.prepare(
        'INSERT INTO items (id, bill_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)'
      );
      const insertAssignment = this.db.prepare(
        'INSERT INTO item_assignments (item_id, person_id, quantity) VALUES (?, ?, ?)'
      );
      for (const item of items) {
        insertItem.run(item.id, billId, item.name, Number(item.price || 0), Number(item.quantity || 1));

        if (item.assignments) {
          for (const [pId, qty] of Object.entries(item.assignments)) {
            insertAssignment.run(item.id, pId, Number(qty || 0));
          }
        }
      }

      const insertCharge = this.db.prepare(
        'INSERT INTO global_charges (id, bill_id, name, type, amount) VALUES (?, ?, ?, ?, ?)'
      );
      for (const gc of globalCharges) {
        insertCharge.run(gc.id, billId, gc.name, gc.type, Number(gc.amount || 0));
      }

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  async deleteBill(billId: string, userId?: string | null): Promise<boolean> {
    if (userId) {
      const bill = this.db.prepare('SELECT owner_id FROM bills WHERE id = ?').get(billId) as BillRow | undefined;
      if (bill && bill.owner_id && bill.owner_id !== userId) {
        throw new Error('Forbidden: Only the bill owner can delete this bill');
      }
    }
    const res = this.db.prepare('DELETE FROM bills WHERE id = ?').run(billId);
    return Number(res.changes || 0) > 0;
  }

  async listBills(userId?: string | null): Promise<BillSummary[]> {
    if (!userId) {
      return [];
    }

    const u = await this.getUserById(userId);
    const userEmail = u?.email ? u.email.toLowerCase() : '';

    const query = this.db.prepare(`
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
      WHERE b.owner_id = ?
         OR EXISTS (
           SELECT 1 FROM people p
           WHERE p.bill_id = b.id
           AND (p.user_id = ? OR (p.email IS NOT NULL AND LOWER(p.email) = ?))
         )
      ORDER BY b.updated_at DESC
    `);

    const bills = query.all(userId, userId, userEmail) as unknown as BillSummaryRow[];

    return bills.map(b => {
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
  }

  async createGroup(name: string, ownerId: string, description: string | null = null, currency: string = 'VND'): Promise<BillGroupDetail> {
    const id = crypto.randomUUID();
    this.db.prepare(
      'INSERT INTO bill_groups (id, name, description, owner_id, currency) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name.trim(), description ? description.trim() : null, ownerId, currency);

    const group = await this.getGroup(id, ownerId);
    if (!group) throw new Error('Failed to create group');
    return group;
  }

  async getGroup(id: string, userId?: string | null): Promise<BillGroupDetail | null> {
    const group = this.db.prepare(`
      SELECT g.*, u.name as owner_name, u.email as owner_email
      FROM bill_groups g
      LEFT JOIN users u ON u.id = g.owner_id
      WHERE g.id = ?
    `).get(id) as unknown as (BillGroupRow & { owner_name?: string | null; owner_email?: string | null }) | undefined;

    if (!group) return null;

    const isOwner = Boolean(userId && group.owner_id === userId);

    const billsRaw = this.db.prepare(`
      SELECT id, name, location, currency, host_id, created_at, updated_at
      FROM bills
      WHERE group_id = ?
      ORDER BY updated_at DESC
    `).all(id) as unknown as Array<{
      id: string;
      name: string | null;
      location: string | null;
      currency: string | null;
      host_id: string | null;
      created_at: string;
      updated_at: string;
    }>;

    let totalGroupAmount = 0;
    let totalItemsCount = 0;

    const bills: GroupBillOverview[] = [];

    const stmtPeople = this.db.prepare(
      'SELECT id, name, sponsor_amount as sponsorAmount, paid_amount as paidAmount, user_id as userId, email FROM people WHERE bill_id = ?'
    );
    const stmtCharges = this.db.prepare(
      'SELECT id, name, type, amount FROM global_charges WHERE bill_id = ?'
    );
    const stmtItems = this.db.prepare(
      'SELECT id, name, price, quantity FROM items WHERE bill_id = ?'
    );
    const stmtAssignments = this.db.prepare(
      'SELECT person_id, quantity FROM item_assignments WHERE item_id = ?'
    );

    for (const b of billsRaw) {
      const peopleRaw = stmtPeople.all(b.id) as unknown as PersonRow[];
      const people: PersonData[] = peopleRaw.map(p => ({
        id: String(p.id),
        name: String(p.name),
        sponsorAmount: Number(p.sponsorAmount || 0),
        paidAmount: Number(p.paidAmount || 0),
        userId: p.userId ? String(p.userId) : null,
        email: p.email ? String(p.email) : null,
      }));

      const hostPerson = people.find(p => p.id === b.host_id);
      const hostName = hostPerson?.name || null;

      const chargesRaw = stmtCharges.all(b.id) as unknown as ChargeRow[];
      const globalCharges: GlobalChargeData[] = chargesRaw.map(gc => ({
        id: String(gc.id),
        name: String(gc.name),
        type: String(gc.type),
        amount: Number(gc.amount || 0),
      }));

      const itemsRaw = stmtItems.all(b.id) as unknown as Array<{ id: string; name: string; price: number; quantity: number }>;

      const items: GroupItemOverview[] = itemsRaw.map(it => {
        const assignmentsRows = stmtAssignments.all(it.id) as unknown as AssignmentRow[];
        const assignments: Record<string, number> = {};
        assignmentsRows.forEach(row => {
          assignments[row.person_id] = Number(row.quantity);
        });

        return {
          id: String(it.id),
          name: String(it.name),
          price: Number(it.price || 0),
          quantity: Number(it.quantity || 1),
          totalPrice: Number(it.price || 0) * Number(it.quantity || 1),
          assignments,
        };
      });

      const subtotal = items.reduce((s, it) => s + it.totalPrice, 0);
      let fixedCharges = 0;
      let percentCharges = 0;
      chargesRaw.forEach(c => {
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
  }

  async listGroups(userId?: string | null): Promise<BillGroupSummary[]> {
    if (!userId) return [];

    const u = await this.getUserById(userId);
    const userEmail = u?.email ? u.email.toLowerCase() : '';

    const groupsRaw = this.db.prepare(`
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
      WHERE g.owner_id = ?
         OR EXISTS (
           SELECT 1 FROM bills b
           LEFT JOIN people p ON p.bill_id = b.id
           WHERE b.group_id = g.id
             AND (b.owner_id = ? OR p.user_id = ? OR (p.email IS NOT NULL AND LOWER(p.email) = ?))
         )
      ORDER BY g.updated_at DESC
    `).all(userId, userId, userId, userEmail) as unknown as Array<BillGroupRow & { owner_name?: string | null; owner_email?: string | null }>;

    const results: BillGroupSummary[] = [];

    for (const g of groupsRaw) {
      const billStats = this.db.prepare(`
        SELECT b.id,
          (SELECT COALESCE(SUM(price * quantity), 0) FROM items WHERE bill_id = b.id) as subtotal,
          (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'fixed') as fixed_extras,
          (SELECT COALESCE(SUM(amount), 0) FROM global_charges WHERE bill_id = b.id AND type = 'percent') as percent_extras,
          (SELECT COUNT(*) FROM items WHERE bill_id = b.id) as item_count
        FROM bills b
        WHERE b.group_id = ?
      `).all(g.id) as unknown as Array<{ id: string; subtotal: number; fixed_extras: number; percent_extras: number; item_count: number }>;

      let totalAmount = 0;
      let totalItems = 0;
      billStats.forEach(bs => {
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
        total_bills: billStats.length,
        total_items: totalItems,
        created_at: typeof g.created_at === 'string' ? g.created_at : new Date(g.created_at).toISOString(),
        updated_at: typeof g.updated_at === 'string' ? g.updated_at : new Date(g.updated_at).toISOString(),
      });
    }

    return results;
  }

  async updateGroup(id: string, data: { name?: string; description?: string | null; currency?: string }, userId?: string | null): Promise<void> {
    const existing = this.db.prepare('SELECT owner_id FROM bill_groups WHERE id = ?').get(id) as { owner_id: string } | undefined;
    if (!existing) throw new Error('Group not found');
    if (userId && existing.owner_id !== userId) {
      throw new Error('Forbidden: Only the group owner can update this group');
    }

    const { name, description, currency } = data;
    this.db.prepare(`
      UPDATE bill_groups
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          currency = COALESCE(?, currency),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name !== undefined ? name.trim() : null, description !== undefined ? description : null, currency || null, id);
  }

  async deleteGroup(id: string, userId?: string | null): Promise<boolean> {
    const existing = this.db.prepare('SELECT owner_id FROM bill_groups WHERE id = ?').get(id) as { owner_id: string } | undefined;
    if (!existing) return false;
    if (userId && existing.owner_id !== userId) {
      throw new Error('Forbidden: Only the group owner can delete this group');
    }

    this.db.exec('BEGIN TRANSACTION;');
    try {
      // Bills are automatically unlinked because FOREIGN KEY has ON DELETE SET NULL, but let's be explicit
      this.db.prepare('UPDATE bills SET group_id = NULL WHERE group_id = ?').run(id);
      const res = this.db.prepare('DELETE FROM bill_groups WHERE id = ?').run(id);
      this.db.exec('COMMIT;');
      return Number(res.changes || 0) > 0;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  async transferGroupOwnership(id: string, newOwnerId: string, userId?: string | null): Promise<void> {
    const existing = this.db.prepare('SELECT owner_id FROM bill_groups WHERE id = ?').get(id) as { owner_id: string } | undefined;
    if (!existing) throw new Error('Group not found');
    if (userId && existing.owner_id !== userId) {
      throw new Error('Forbidden: Only the group owner can transfer ownership of this group');
    }

    const targetUser = await this.getUserById(newOwnerId);
    if (!targetUser) throw new Error('New owner user not found');

    this.db.prepare('UPDATE bill_groups SET owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newOwnerId, id);
  }

  async transferBillOwnership(billId: string, newOwnerId: string, userId?: string | null): Promise<void> {
    const existing = this.db.prepare('SELECT owner_id FROM bills WHERE id = ?').get(billId) as { owner_id: string | null } | undefined;
    if (!existing) throw new Error('Bill not found');
    if (userId && existing.owner_id && existing.owner_id !== userId) {
      throw new Error('Forbidden: Only the bill owner can transfer ownership of this bill');
    }

    const targetUser = await this.getUserById(newOwnerId);
    if (!targetUser) throw new Error('New owner user not found');

    this.db.exec('BEGIN TRANSACTION;');
    try {
      this.db.prepare('UPDATE bills SET owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newOwnerId, billId);

      // Ensure new owner is in people table
      const existingPerson = this.db.prepare(
        'SELECT id FROM people WHERE bill_id = ? AND (user_id = ? OR (email IS NOT NULL AND LOWER(email) = LOWER(?)))'
      ).get(billId, newOwnerId, targetUser.email) as { id: string } | undefined;

      if (existingPerson) {
        this.db.prepare('UPDATE people SET user_id = ? WHERE id = ?').run(newOwnerId, existingPerson.id);
      } else {
        const personId = crypto.randomUUID();
        this.db.prepare(
          'INSERT INTO people (id, bill_id, name, sponsor_amount, paid_amount, user_id, email) VALUES (?, ?, ?, 0, 0, ?, ?)'
        ).run(personId, billId, targetUser.name || targetUser.email.split('@')[0], newOwnerId, targetUser.email);
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  async linkBillToGroup(billId: string, groupId: string | null, userId?: string | null): Promise<void> {
    const existing = this.db.prepare('SELECT owner_id FROM bills WHERE id = ?').get(billId) as { owner_id: string | null } | undefined;
    if (!existing) throw new Error('Bill not found');
    if (userId && existing.owner_id && existing.owner_id !== userId) {
      throw new Error('Forbidden: Only the bill owner can link or unlink this bill');
    }

    this.db.prepare('UPDATE bills SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(groupId, billId);
  }

  async search(query: string, userId?: string | null): Promise<SearchResults> {
    if (!query || query.trim().length === 0 || !userId) {
      return { groups: [], bills: [], items: [] };
    }

    let userEmail: string | null = null;
    if (userId) {
      const u = await this.getUserById(userId);
      if (u) userEmail = u.email ? u.email.trim().toLowerCase() : null;
    }

    const term = `%${query.trim().toLowerCase()}%`;
    const emailParam = userEmail || 'none';

    // Search groups
    const groupsRaw = this.db.prepare(`
      SELECT g.id, g.name, g.description,
        (SELECT COUNT(*) FROM bills WHERE group_id = g.id) as total_bills,
        (SELECT COALESCE(SUM(i.price * i.quantity), 0) FROM items i JOIN bills b ON b.id = i.bill_id WHERE b.group_id = g.id) as total_amount
      FROM bill_groups g
      WHERE (LOWER(g.name) LIKE ? OR LOWER(COALESCE(g.description, '')) LIKE ?)
        AND (
          g.owner_id = ?
          OR EXISTS (
            SELECT 1 FROM bills b
            JOIN people p ON p.bill_id = b.id
            WHERE b.group_id = g.id
              AND (b.owner_id = ? OR p.user_id = ? OR (p.email IS NOT NULL AND LOWER(p.email) = ?))
          )
        )
      LIMIT 10
    `).all(term, term, userId, userId, userId, emailParam) as unknown as Array<{ id: string; name: string; description: string | null; total_bills: number; total_amount: number }>;

    // Search bills
    const billsRaw = this.db.prepare(`
      SELECT b.id, b.name, b.location, b.group_id, bg.name as group_name,
        (SELECT COALESCE(SUM(i.price * i.quantity), 0) FROM items i WHERE i.bill_id = b.id) as total_amount
      FROM bills b
      LEFT JOIN bill_groups bg ON bg.id = b.group_id
      WHERE (LOWER(COALESCE(b.name, '')) LIKE ? OR LOWER(COALESCE(b.location, '')) LIKE ?)
        AND (
          b.owner_id = ?
          OR EXISTS (
            SELECT 1 FROM people p
            WHERE p.bill_id = b.id
              AND (p.user_id = ? OR (p.email IS NOT NULL AND LOWER(p.email) = ?))
          )
        )
      LIMIT 15
    `).all(term, term, userId, userId, emailParam) as unknown as Array<{ id: string; name: string | null; location: string | null; group_id: string | null; group_name: string | null; total_amount: number }>;

    // Search items
    const itemsRaw = this.db.prepare(`
      SELECT i.id, i.name, i.price, i.quantity, i.bill_id, b.name as bill_name
      FROM items i
      JOIN bills b ON b.id = i.bill_id
      WHERE LOWER(i.name) LIKE ?
        AND (
          b.owner_id = ?
          OR EXISTS (
            SELECT 1 FROM people p
            WHERE p.bill_id = b.id
              AND (p.user_id = ? OR (p.email IS NOT NULL AND LOWER(p.email) = ?))
          )
        )
      LIMIT 20
    `).all(term, userId, userId, emailParam) as unknown as Array<{ id: string; name: string; price: number; quantity: number; bill_id: string; bill_name: string | null }>;

    return {
      groups: groupsRaw.map(g => ({
        id: String(g.id),
        name: String(g.name),
        description: g.description ? String(g.description) : null,
        total_amount: Number(g.total_amount || 0),
        total_bills: Number(g.total_bills || 0),
      })),
      bills: billsRaw.map(b => ({
        id: String(b.id),
        name: b.name || `Bill ${b.id.slice(0, 8)}`,
        location: b.location ?? null,
        totalAmount: Number(b.total_amount || 0),
        group_id: b.group_id ? String(b.group_id) : null,
        group_name: b.group_name ? String(b.group_name) : null,
      })),
      items: itemsRaw.map(i => ({
        id: String(i.id),
        name: String(i.name),
        price: Number(i.price || 0),
        quantity: Number(i.quantity || 1),
        bill_id: String(i.bill_id),
        bill_name: i.bill_name || `Bill ${i.bill_id.slice(0, 8)}`,
      })),
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
