import { Hono } from "hono";
import { noStore, requireSignIn } from "../http";
import { getCalendarData, validCalendarRange } from "./calendar";

export const googleRoutes = new Hono();

googleRoutes.get("/calendar", noStore, requireSignIn, async (context) => {
  const start = context.req.query("start");
  const end = context.req.query("end");
  if (!start || !end || !validCalendarRange(start, end)) {
    return context.json({ error: "Invalid calendar date range." }, 400);
  }
  try {
    return context.json(await getCalendarData(start, end));
  } catch (error) {
    console.error("Google Calendar load failed.", error);
    return context.json({ error: "Could not load Google Calendar. Check that the Calendar API is enabled and reconnect Google to grant calendar access." }, 502);
  }
});
