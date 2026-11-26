import { getDatabase } from "../db/client";

/**
 * Loads the Google account details needed to connect to Google services.
 * @returns The saved email and encrypted refresh token, or null if no account is connected.
 */
export async function getGoogleConnection() {
  const connection = await getDatabase().googleConnection.findUnique({
    where: { singleton: true },
  });
  return connection
    ? { email: connection.email, encrypted_refresh_token: connection.encryptedRefreshToken }
    : null;
}

/**
 * Saves the Google account's email and encrypted refresh token after sign-in.
 * @param email - Email address of the connected Google account.
 * @param encryptedRefreshToken - Refresh token encrypted before saving.
 * @returns A promise that resolves when the connection is saved; no response data.
 */
export async function saveGoogleConnection(email: string, encryptedRefreshToken: string) {
  await getDatabase().googleConnection.upsert({
    where: { singleton: true },
    create: { singleton: true, email, encryptedRefreshToken },
    update: { email, encryptedRefreshToken, updatedAt: new Date() },
  });
}
