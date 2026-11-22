# Setup guide

Follow these steps to run CyberPlanner locally.

## Requirements

- [Node.js](https://nodejs.org/en/download) 22.22 or newer and npm (included with Node.js).
- A running [PostgreSQL](https://www.postgresql.org/download/) database. You can install it locally or use a hosted PostgreSQL provider.
- A Google account and a [Google Cloud](https://console.cloud.google.com/) project for sign-in, Google Tasks, and Gmail.

Check Node.js and npm in a terminal:

```powershell
node --version
npm --version
```

The commands below use PowerShell on Windows. Run them in the project folder. On macOS or Linux, use your shell's equivalent commands.

## Set up from scratch

### 1. Install the project

Open a terminal in the CyberPlanner project folder and run:

```powershell
npm install
```

This installs the packages from `package-lock.json`. The `postinstall` script also generates Prisma Client from [the database schema](../prisma/schema.prisma).

If you don't already have a `.env` file, create one from the template:

```powershell
Copy-Item .env.example .env
```

Open `.env` in your editor. The following steps explain every value. Keep the file private: it contains passwords and secrets, and is ignored by Git. Never paste it into an issue, screenshot, or chat.

### 2. Create a PostgreSQL database

`DATABASE_URL` tells the server where your PostgreSQL database is and how to authenticate. It is **not** a Google URL. Prisma does not create a PostgreSQL server or provider account for you.

#### Option A: PostgreSQL on your computer

1. Download and install PostgreSQL for your operating system from [postgresql.org](https://www.postgresql.org/download/). The Windows installer offers pgAdmin, a graphical database manager; include it if you want to follow these steps.
2. During installation, choose and save a password for the PostgreSQL administrator, commonly named `postgres`. Keep the default port `5432` unless you have a reason to change it. Start the PostgreSQL service.
3. Open **pgAdmin**, connect to your local server, and enter that administrator password if prompted. In the browser tree, expand **Servers** and your PostgreSQL server. If no server is listed, right-click **Servers** > **Register** > **Server**; give it a name, then on **Connection** enter host `localhost`, port `5432`, maintenance database `postgres`, username `postgres`, and the password chosen during installation.
4. Right-click **Databases** > **Create** > **Database**. Enter `cyberplanner` as the database name and click **Save**.
5. In `.env`, set the connection string using your actual PostgreSQL username, password, port, and database name:

   ```dotenv
   DATABASE_URL="postgresql://postgres:YOUR_URL_ENCODED_PASSWORD@localhost:5432/cyberplanner"
   ```

`postgres` is the database user, the password is the one you set during PostgreSQL installation, `localhost` means this computer, `5432` is the server port, and `cyberplanner` is the database name. Replace the placeholder; it is not a real password.

Special characters in a username or password must be URL-encoded. For example, `@` becomes `%40`. To see how encoding works without exposing your real password in terminal history, try:

```powershell
node -e "console.log(encodeURIComponent('example@password'))"
```

The output is `example%40password`. Apply the same encoding to special characters in your actual credentials; don't change your database password to the example.

#### Option B: Hosted PostgreSQL

Create a PostgreSQL database with your chosen provider. In its dashboard, find **Connect**, **Connection string**, or **Connection details**, and copy its PostgreSQL connection URI into `DATABASE_URL` in `.env`. It usually begins with `postgresql://` and may include provider-required SSL parameters such as `?sslmode=require`. Keep the entire URI secret.

Some providers offer separate **pooled** and **direct** URLs. Prisma migration commands may require a direct connection: temporarily supply the direct URL as `DATABASE_URL` when running migrations, and use the provider's recommended runtime URL for the application. See [Prisma&#39;s PostgreSQL connection guide](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql).

### 3. Enable Google APIs and set up consent

Google Cloud controls which APIs are enabled, which account may authorize the app, and the credentials used by the server. Keep the same Cloud project selected for all these steps.

1. Open the [Google Cloud Console](https://console.cloud.google.com/). Use the project selector at the top to create or select a project.
2. Open [Google Tasks API](https://console.cloud.google.com/apis/library/tasks.googleapis.com) and click **Enable**.
3. Open [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) and click **Enable**. The current sign-in flow requests both Tasks and Gmail access, even if you only plan to use Tasks.
4. Open [Google Auth platform](https://console.cloud.google.com/auth/overview). If it says the platform is not configured, click **Get started**:
   - Enter an app name, such as `CyberPlanner`, and choose your email as the support email.
   - Choose **External** for a personal Google account. A Workspace organization may use **Internal** if available.
   - Enter your contact email, review Google's policy, and complete the setup.
5. On [Audience](https://console.cloud.google.com/auth/audience), leave the app in **Testing**. Under **Test users**, click **Add users**, enter the Google account you will use, and save.
6. On [Data Access](https://console.cloud.google.com/auth/scopes), choose **Add or remove scopes**, find the following scopes (or enter their URIs manually if needed), and save:

   | Scope | What CyberPlanner requests it for |
   | --- | --- |
   | `openid` | Identify the signed-in account. |
   | `email` (may appear as `https://www.googleapis.com/auth/userinfo.email`) | Check the account's email against your allowed account. |
   | `https://www.googleapis.com/auth/tasks` | Read and update Google Tasks. |
   | `https://www.googleapis.com/auth/gmail.readonly` | Search Gmail for follow-ups. This permission allows reading mail, not just metadata. |

The Gmail scope is restricted. Public publishing can require Google verification and a security assessment; see [Google's consent-screen instructions](https://developers.google.com/workspace/guides/configure-oauth-consent) and [Gmail scope requirements](https://developers.google.com/workspace/gmail/api/auth/scopes). An external app in Testing can receive refresh tokens that expire after seven days; sign in again if sync stops working.

### 4. Create OAuth credentials

Use an **OAuth client ID**, not an API key or service account: CyberPlanner needs your permission to access your personal Tasks and Gmail.

1. In the same Cloud project, open [Google Auth platform > Clients](https://console.cloud.google.com/auth/clients) and click **Create client**. You may also reach this from **APIs & Services > Credentials**.
2. For **Application type**, select **Web application**. Name it `CyberPlanner local` or another name you recognize.
3. Leave **Authorized JavaScript origins** empty. CyberPlanner's server initiates OAuth; it does not use Google's browser JavaScript OAuth library.
4. Under **Authorized redirect URIs**, click **Add URI** and enter `http://localhost:5173/auth/callback` for `npm run dev`. This is the address Google returns your browser to after consent. Google requires an exact match; don't add a trailing slash.
5. Click **Create**. Copy the **Client ID** and **Client secret** shown by Google into your private `.env` file:

   ```dotenv
   GOOGLE_CLIENT_ID="PASTE_CLIENT_ID_HERE"
   GOOGLE_CLIENT_SECRET="PASTE_CLIENT_SECRET_HERE"
   GOOGLE_REDIRECT_URI="http://localhost:5173/auth/callback"
   GOOGLE_ALLOWED_EMAIL="your-google-account@example.com"
   ```

The client ID identifies your app; the client secret authenticates its server to Google. Neither is your Google password. Save the secret when Google shows it: Google says it cannot be viewed or downloaded again later. If needed, create a new client secret in the client details and replace the old one in `.env`. Keep any downloaded credentials file outside the project.

`GOOGLE_ALLOWED_EMAIL` is your actual Google email, matching the test user above. `GOOGLE_REDIRECT_URI` must exactly match your Google Cloud entry, including scheme, hostname, port, and path. For this example, open the app at `localhost`, not `127.0.0.1`.

The development client listens on port `5173` and forwards sign-in and API requests to the server on port `3000`. If testing the production build locally, add `http://localhost:3000/auth/callback` to the same client's redirect URIs and change `GOOGLE_REDIRECT_URI` to match before starting it. For a hosted app, use an HTTPS address on your own domain instead, for example `https://YOUR_DOMAIN/auth/callback`, in both places. You can create separate clients for local and hosted use. See [Google's web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

#### Is the redirect URI secret?

No. The example callback in this guide is not a credential, and changing or hiding its path does not secure it. `localhost` means the computer running the browser; it is not an internet address that a remote bot can use to reach your computer. Google sends the browser there, and CyberPlanner checks a random OAuth `state` against the initiating browser's signed session cookie before exchanging the code. It also checks the returned account against `GOOGLE_ALLOWED_EMAIL`.

For development, both servers listen only on localhost, not your network interfaces. This does **not** protect against malicious software or other users on the same computer, browser extensions, or other local processes attempting to use or occupy the port. A website may also try to cause your browser to contact local services; state validation and same-origin checks protect specific flows, not a compromised computer. Use a trusted computer and do not expose the development server through a tunnel or port forwarding.

Keep the **client secret**, session secret, encryption key, database credentials, tokens, and `.env` private; the client ID and redirect URI are not secrets. `.env` is ignored by Git, but that does not remove a secret that was already committed. Rotate any exposed secret. A hosted production server is network-accessible: use HTTPS and protect its host and credentials rather than relying on a hidden callback path.

### 5. Generate the app's two secrets

These are created by **you**, not provided by Google:

- `SESSION_SECRET` signs the browser's login session cookie.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` encrypts the stored Google refresh token. It must be a base64-encoded 32-byte key.

Run this command **twice**, independently:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Copy the first output into `SESSION_SECRET` and the second, different output into `GOOGLE_TOKEN_ENCRYPTION_KEY`:

```dotenv
SESSION_SECRET="FIRST_GENERATED_VALUE"
GOOGLE_TOKEN_ENCRYPTION_KEY="SECOND_GENERATED_VALUE"
```

Keep both values private and stable across restarts and deployments. Changing the session secret signs users out. Losing or changing the encryption key prevents the app from reading the saved Google token; sign in and reconnect Google with the new key.

### 6. Create the tables and start

With `.env` saved and PostgreSQL running, apply the migrations to your **new, empty** database:

```powershell
npm run db:migrate
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), sign in with `GOOGLE_ALLOWED_EMAIL`, and approve the requested permissions. Select **Sync Google Tasks** to import tasks. Leave the terminal running while you use the app; press `Ctrl+C` to stop it.

`npm run dev` starts both processes. Make sure ports `5173` and `3000` are available. If port `3000` is occupied, set `PORT` in `.env` to a free port; both the API and development proxy will use it.

For an existing Prisma-managed CyberPlanner database, back it up and run `npm run db:migrate` to apply pending migrations.

## Troubleshooting

- **Missing configuration on the sign-in page:** Check that all seven entries in `.env` have values, save the file, and restart the server. The template `.env.example` is not loaded as your configuration.
- **Database connection fails:** Confirm PostgreSQL is running, the database exists, and the URL contains the right host, port, user, encoded password, and any provider-required SSL settings. A hosted database must also allow your connection.
- **`redirect_uri_mismatch`:** The URI in `.env` must exactly match an authorized redirect URI in the Google OAuth client, including scheme, hostname, port, and `/auth/callback`.
- **Google denies access or says the app is unverified:** Confirm the correct Cloud project, enabled APIs, test-user email, consent scopes, and account. Testing and public publishing have different verification requirements.
- **Google sync stops after working:** An external OAuth app in Testing can receive seven-day refresh tokens. Sign in again to reconnect. If the encryption key was changed, the old token cannot be decrypted.
- **Database tests refuse to run:** Create a separate empty database and set `TEST_DATABASE_URL` to it; the test deliberately refuses databases with existing tables.

