import "dotenv/config";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { createCookieSessionStorage, redirect } from "react-router";
import { google } from "googleapis";
import {
  getGoogleConnection,
  saveGoogleConnection,
} from "../planner/service";

const requiredEnvironment = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_ALLOWED_EMAIL",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
] as const;

const scopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/gmail.readonly",
];

type CyberPlannerSession = {
  email?: string;
  oauthState?: string;
};

let sessionStorage:
  | ReturnType<typeof createCookieSessionStorage<CyberPlannerSession>>
  | undefined;

export function getMissingConfiguration() {
  return requiredEnvironment.filter((key) => !process.env[key]);
}

function getSessionStorage() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required.");
  sessionStorage ??= createCookieSessionStorage<CyberPlannerSession>({
    cookie: {
      name: "cyberplanner_session",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      secrets: [secret],
    },
  });
  return sessionStorage;
}

function createOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } =
    process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth environment variables are required.");
  }
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
  );
}

export async function getSignedInEmail(request: Request) {
  const storage = getSessionStorage();
  const session = await storage.getSession(request.headers.get("Cookie"));
  const email = session.get("email");
  if (
    typeof email !== "string" ||
    email.toLowerCase() !== process.env.GOOGLE_ALLOWED_EMAIL?.toLowerCase()
  ) {
    return null;
  }
  return email;
}

export async function beginGoogleAuthorization() {
  const storage = getSessionStorage();
  const session = await storage.getSession();
  const state = randomBytes(32).toString("hex");
  session.set("oauthState", state);
  const allowedEmail = process.env.GOOGLE_ALLOWED_EMAIL;
  const location = createOAuthClient().generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: scopes,
    state,
    ...(allowedEmail
      ? { login_hint: allowedEmail, hd: allowedEmail.split("@")[1] }
      : {}),
  });
  return redirect(location, {
    headers: {
      "Set-Cookie": await storage.commitSession(session),
    },
  });
}

function encryptRefreshToken(refreshToken: string) {
  const rawKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!rawKey) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is required.");
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptRefreshToken(value: string) {
  const rawKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!rawKey) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is required.");
  const key = Buffer.from(rawKey, "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  const [encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (!encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error("Stored Google refresh token is malformed.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encodedIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function completeGoogleAuthorization(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    throw new Response("Google authorization was not completed.", {
      status: 401,
    });
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storage = getSessionStorage();
  const session = await storage.getSession(request.headers.get("Cookie"));
  if (!code || !state || session.get("oauthState") !== state) {
    throw new Response("Google authorization state validation failed.", {
      status: 400,
    });
  }
  session.unset("oauthState");

  const oauth = createOAuthClient();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);
  const userInfo = await google.oauth2({ version: "v2", auth: oauth }).userinfo.get();
  const email = userInfo.data.email?.toLowerCase();
  const allowedEmail = process.env.GOOGLE_ALLOWED_EMAIL?.toLowerCase();
  if (!email || !allowedEmail || email !== allowedEmail) {
    throw new Response("This Google account is not allowed to use CyberPlanner.", {
      status: 403,
    });
  }

  let refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    const existing = await getGoogleConnection();
    if (existing?.email.toLowerCase() === email) {
      refreshToken = decryptRefreshToken(existing.encrypted_refresh_token);
    }
  }
  if (!refreshToken) {
    throw new Response(
      "Google did not provide a refresh token. Revoke CyberPlanner in your Google account and sign in again.",
      { status: 400 },
    );
  }
  await saveGoogleConnection(email, encryptRefreshToken(refreshToken));
  session.set("email", email);
  return redirect("/", {
    headers: {
      "Set-Cookie": await storage.commitSession(session),
    },
  });
}

export async function endSession(request: Request) {
  const storage = getSessionStorage();
  const session = await storage.getSession(request.headers.get("Cookie"));
  return redirect("/", {
    headers: {
      "Set-Cookie": await storage.destroySession(session),
    },
  });
}
