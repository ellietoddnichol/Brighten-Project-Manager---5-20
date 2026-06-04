import mysql from 'mysql2/promise';

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_NAME = 'brighten_pm',
  DB_USER = '',
  DB_PASSWORD = '',
  DB_SOCKET_PATH,
} = process.env;

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    const base = DB_SOCKET_PATH
      ? { socketPath: DB_SOCKET_PATH }
      : { host: DB_HOST, port: Number(DB_PORT) };

    pool = mysql.createPool({
      ...base,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      namedPlaceholders: false,
      // Cloud SQL Auth Proxy local dev often uses mysql_clear_password.
      enableCleartextPlugin: true,
    });
  }
  return pool;
}

export async function pingDatabase(): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.query('SELECT 1');
  } finally {
    conn.release();
  }
}

export async function queryRows<T extends mysql.RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await getPool().query<T[]>(sql, params);
  return rows;
}

export async function queryOne<T extends mysql.RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await queryRows<T>(sql, params);
  return rows[0] ?? null;
}

/** Run a set of writes inside a single transaction. Rolls back on any error. */
export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback failure; original error is rethrown
    }
    throw err;
  } finally {
    conn.release();
  }
}
