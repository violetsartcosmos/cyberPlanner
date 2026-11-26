import type { Context, MiddlewareHandler } from "hono";
import { getSignedInEmail } from "./auth/service";

export const noStore: MiddlewareHandler = async (context, next) => {
  await next();
  if (!context.res.headers.has("Cache-Control")) context.header("Cache-Control", "no-store");
};

export const requireSignIn: MiddlewareHandler = async (context, next) => {
  if (!(await getSignedInEmail(context.req.raw))) {
    return context.json({ error: "Sign in with your configured Google account first." }, 401);
  }
  await next();
};

export function reportServerError(
  context: Context,
  error: unknown,
  logMessage: string,
  responseMessage = logMessage,
) {
  console.error(logMessage, error);
  return context.json({ error: responseMessage }, 500);
}
