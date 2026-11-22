import { isValidDateKey } from "../../shared/planner/utils";
import type { ActionHandler } from "../planner/dispatch";
import { importGmailMessage, searchGmail, syncGoogleTasks } from "./service";

export const googleFormActions = {
  async sync_google_tasks(form) {
    const date = form.get("date");
    if (typeof date !== "string" || !isValidDateKey(date)) {
      return { ok: false, error: "That planner date is invalid." };
    }
    const count = await syncGoogleTasks(date);
    return { ok: true, message: `Google Tasks sync complete. ${count} records checked.` };
  },
  async search_gmail(form) {
    const value = form.get("query");
    if (typeof value !== "string") {
      return { ok: false, error: "Enter a Gmail search query (up to 256 characters)." };
    }
    const query = value.trim();
    if (!query || query.length > 256) {
      return { ok: false, error: "Enter a Gmail search query (up to 256 characters)." };
    }
    return { ok: true, emails: await searchGmail(query) };
  },
  async import_gmail(form) {
    const date = form.get("date");
    const messageId = form.get("messageId");
    if (typeof messageId !== "string" || !messageId || messageId.length > 512 ||
        typeof date !== "string" || !isValidDateKey(date)) {
      return { ok: false, error: "Choose an email and planner date first." };
    }
    const created = await importGmailMessage(messageId, date);
    return {
      ok: true,
      message: created ? "Email added as a task." : "That email is already in your planner.",
    };
  },
} satisfies Record<string, ActionHandler>;
