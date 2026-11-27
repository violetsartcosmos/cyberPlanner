import { Hono } from "hono";
import { noStore } from "../http";
import { getSessionPage } from "./page";

export const sessionRoutes = new Hono();

/**
 * GET /api/session loads sign-in and shared app-shell state.
 * Input: the optional selected `date` and OAuth `authError` query parameters.
 * Output: JSON containing sign-in configuration or authenticated shell data.
 */
sessionRoutes.get("/session", noStore, async (context) => {
  return context.json(await getSessionPage(context.req.raw));
});
