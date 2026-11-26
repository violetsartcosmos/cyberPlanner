import "dotenv/config";
import { pathToFileURL } from "node:url";
import pg from "pg";

/**
 * Empties the disposable test database's public schema before integration tests.
 * @param testUrl - Connection URL for the disposable test database.
 * @param appUrl - Connection URL for the normal app database.
 * @returns Resolves after the public schema has been recreated.
 */
export async function resetTestDatabase(testUrl, appUrl) {
  if (!testUrl || !appUrl) {
    throw new Error("Set both TEST_DATABASE_URL and DATABASE_URL before resetting the test database.");
  }
  let testDatabase;
  let appDatabase;
  try {
    const testConnection = new URL(testUrl);
    const appConnection = new URL(appUrl);
    if (![testConnection.protocol, appConnection.protocol].every((protocol) =>
      protocol === "postgresql:" || protocol === "postgres:"
    )) throw new Error("Invalid protocol.");
    testDatabase = decodeURIComponent(testConnection.pathname.slice(1));
    appDatabase = decodeURIComponent(appConnection.pathname.slice(1));
  } catch {
    throw new Error("DATABASE_URL and TEST_DATABASE_URL must be valid PostgreSQL connection URLs.");
  }
  if (!testDatabase.endsWith("_test")) {
    throw new Error("Automatic reset requires a disposable database name ending in _test.");
  }
  if (!appDatabase || testDatabase === appDatabase) {
    throw new Error("Refusing to reset a database with the same name as the app database.");
  }

  const client = new pg.Client({ connectionString: testUrl });
  try {
    await client.connect();
    const { rows: [database] } = await client.query(`
      SELECT current_database() AS name, current_schema() AS schema,
        pg_get_userbyid(datdba) = current_user AS owned
      FROM pg_database WHERE datname = current_database()
    `);
    if (database.name !== testDatabase || database.schema !== "public" || !database.owned) {
      throw new Error("The test user must own the expected test database and use its public schema.");
    }
    await client.query("BEGIN");
    try {
      await client.query("DROP SCHEMA public CASCADE");
      await client.query("CREATE SCHEMA public AUTHORIZATION CURRENT_USER");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await resetTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  console.log("Reset the disposable test database's public schema.");
}
