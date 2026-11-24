import { Link, useFetcher } from "react-router";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { PlannerActionResult } from "../../../../shared/planner/types";
import { useActionNotifications } from "@/components/notifications";

type GoogleIntegrationPanelProps = {
  email: string;
  selected: string;
};

export function GoogleIntegrationPanel({
  email,
  selected,
}: GoogleIntegrationPanelProps) {
  const syncFetcher = useFetcher<PlannerActionResult>();
  const searchFetcher = useFetcher<PlannerActionResult>();
  const importFetcher = useFetcher<PlannerActionResult>();
  useActionNotifications(syncFetcher);
  useActionNotifications(searchFetcher);
  useActionNotifications(importFetcher);
  const emailResults: ReactNode[] = [];
  for (const message of searchFetcher.data?.emails ?? []) {
    emailResults.push(
      <div className="email-result" key={message.id}>
        <strong>{message.subject}</strong>
        <small>{message.from}</small>
        <p>{message.snippet}</p>
        <importFetcher.Form method="post">
          <input type="hidden" name="intent" value="import_gmail" />
          <input type="hidden" name="messageId" value={message.id} />
          <input type="hidden" name="date" value={selected} />
          <button
            className="btn btn-outline-primary btn-sm rounded-pill"
            type="submit"
            disabled={importFetcher.state !== "idle"}
          >
            ADD TO {selected}
          </button>
        </importFetcher.Form>
      </div>,
    );
  }

  return (
    <section className="card p-3 google-panel" id="google">
      <Link className="section-label section-link" to={`/calendar?date=${selected}#google`}>
        <span>05 / GOOGLE SYNC</span>
        <RefreshCw aria-hidden="true" size={12} />
      </Link>
      <h2 className="h5">Bring in your tasks.</h2>
      <p>Signed in as {email}. Google Tasks syncs when you ask it to.</p>
      <syncFetcher.Form method="post">
        <input type="hidden" name="intent" value="sync_google_tasks" />
        <input type="hidden" name="date" value={selected} />
        <button
          className="btn btn-outline-primary btn-sm rounded-pill"
          type="submit"
          disabled={syncFetcher.state !== "idle"}
        >
          {syncFetcher.state === "idle"
            ? "SYNC GOOGLE TASKS"
            : "SYNCING..."}
        </button>
      </syncFetcher.Form>
      <div className="email-capture">
        <h3>Create a task from an email</h3>
        <p>
          Search Gmail, then choose individual messages to add. The app stores
          the subject, sender, and Gmail link—not the message body. Google
          grants read-only access to the mailbox.
        </p>
        <searchFetcher.Form method="post">
          <input type="hidden" name="intent" value="search_gmail" />
          <label className="visually-hidden" htmlFor="gmail-query">
            Gmail search
          </label>
          <input
            className="form-control"
            id="gmail-query"
            name="query"
            type="search"
            placeholder="in:inbox newer_than:14d"
            required
            maxLength={256}
          />
          <button
            className="btn btn-outline-primary btn-sm rounded-pill"
            type="submit"
            disabled={searchFetcher.state !== "idle"}
          >
            SEARCH EMAIL
          </button>
        </searchFetcher.Form>
        {emailResults}
      </div>
    </section>
  );
}
