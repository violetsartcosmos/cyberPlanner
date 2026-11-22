import { randomBytes } from "node:crypto";

console.log("# Copy these values into your .env file and keep them private.");
console.log(`SESSION_SECRET="${randomBytes(32).toString("base64")}"`);
console.log(`GOOGLE_TOKEN_ENCRYPTION_KEY="${randomBytes(32).toString("base64")}"`);
