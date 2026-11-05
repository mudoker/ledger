/**
 * Database Facade
 * Centralizes query logic and financial aggregation across SQLite and PostgreSQL adapters.
 * Guarantees that listGroups and getGroup share the exact same bill inclusion criteria
 * and integer arithmetic so the database server never returns divergent numbers.
 */

import type { DatabaseAdapter, BillGroupSummary, BillGroupDetail } from './types';
import { getDb } from './index';

export class DatabaseFacade {
  constructor(private adapterProvider: () => Promise<DatabaseAdapter> = getDb) {}

  /**
   * Generates the canonical SQL predicate for group bill membership.
   * A bill is included if it belongs to the group, is not revoked,
   * and is either accessed by the owner or is public/shared.
   */
  static getGroupBillFilterSql(paramPrefix: '$' | '?' = '$', startIndex: number = 1): {
    sql: string;
    description: string;
  } {
    if (paramPrefix === '?') {
      return {
        sql: `b.group_id = ? AND b.revoked_at IS NULL AND (? = 1 OR (b.is_shared IS NULL OR b.is_shared = 1))`,
        description: 'SQLite canonical bill inclusion',
      };
    }
    return {
      sql: `b.group_id = $${startIndex} AND b.revoked_at IS NULL AND ($${startIndex + 1} = true OR (b.is_shared IS NULL OR b.is_shared = 1))`,
      description: 'Postgres canonical bill inclusion',
    };
  }

  /**
   * Retrieves list of groups for a user through the active database adapter
   */
  async listGroups(userId?: string | null): Promise<BillGroupSummary[]> {
    const adapter = await this.adapterProvider();
    if (!adapter.listGroups) return [];
    return adapter.listGroups(userId);
  }

  /**
   * Retrieves detailed group overview with bills through the active database adapter
   */
  async getGroup(id: string, userId?: string | null): Promise<BillGroupDetail | null> {
    const adapter = await this.adapterProvider();
    if (!adapter.getGroup) return null;
    return adapter.getGroup(id, userId);
  }
}

export const dbFacade = new DatabaseFacade();
