/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import mysql2 from "mysql2/promise";
import type { Pool } from "mysql2/promise";

// MySQL2 connection pool for crm database
export function createDbPool(): Pool {
  return mysql2.createPool({
    host: "192.168.1.2",
    user: "root",
    password: "123456",
    database: "crm",
    waitForConnections: true,
    connectionLimit: 10,
  });
}
