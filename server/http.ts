import type { Context, MiddlewareHandler } from "hono";
import { getSignedInEmail } from "./auth/service";

/** Prevents authenticated API responses from being cached by browsers or proxies. */
export const noStore: MiddlewareHandler = async (context, next) => {
  await next();
  if (!context.res.headers.has("Cache-Control")) context.header("Cache-Control", "no-store");
};

/** Stops an API request when the configured Google account is not signed in. */
export const requireSignIn: MiddlewareHandler = async (context, next) => {
  if (!(await getSignedInEmail(context.req.raw))) {
    return context.json({ error: "Sign in with your configured Google account first." }, 401);
  }
  await next();
};

/** Logs an unexpected server failure and returns the API's standard error response. */
export function reportServerError(
  context: Context,
  error: unknown,
  logMessage: string,
  responseMessage = logMessage,
) {
  console.error(logMessage, error);
  return context.json({ error: responseMessage }, 500);
}
