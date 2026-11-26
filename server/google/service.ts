import { google } from "googleapis";
import {
  decryptRefreshToken,
} from "../auth/service";
import {
  createGmailTask,
  type ExternalTask,
  upsertGoogleTasks,
  getExternalTask,
  setExternalTaskCompletion,
  type ExternalTaskSource,
} from "../external-tasks/service";
import { getGoogleConnection } from "./connection";

export { decryptRefreshToken };

async function getGoogleClients() {
  const connection = await getGoogleConnection();
  if (!connection) {
    throw new Error("Connect your Google account before using Google sync.");
  }
  if (
    connection.email.toLowerCase() !==
    process.env.GOOGLE_ALLOWED_EMAIL?.toLowerCase()
  ) {
    throw new Error(
      "The stored Google connection does not match the configured account. Sign in again.",
    );
  }
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } =
    process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth environment variables are required.");
  }
  const oauth = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
  );
  oauth.setCredentials({
    refresh_token: decryptRefreshToken(connection.encrypted_refresh_token),
  });
  return {
    tasks: google.tasks({ version: "v1", auth: oauth }),
    gmail: google.gmail({ version: "v1", auth: oauth }),
    calendar: google.calendar({ version: "v3", auth: oauth }),
  };
}

export async function getGoogleCalendarClient() {
  const { calendar } = await getGoogleClients();
  return calendar;
}

export async function syncGoogleTasks(today: string) {
  const { tasks } = await getGoogleClients();
  let pageToken: string | undefined;
  let synced = 0;
  do {
    const lists = await tasks.tasklists.list({
      maxResults: 100,
      pageToken,
    });
    for (const list of lists.data.items ?? []) {
      if (!list.id) continue;
      let taskPageToken: string | undefined;
      do {
        const page = await tasks.tasks.list({
          tasklist: list.id,
          maxResults: 100,
          pageToken: taskPageToken,
          showCompleted: true,
          showDeleted: true,
          showHidden: true,
        });
        const records: ExternalTask[] = [];
        for (const task of page.data.items ?? []) {
          if (!task.id) continue;
          const dueDate = task.due?.slice(0, 10) ?? null;
          const record: ExternalTask = {
            source: "google",
            externalId: task.id,
            taskListId: list.id,
            title: task.title?.trim() || "Untitled Google Task",
            dueDate,
            completed: task.status === "completed",
            completedAt: task.completed ?? null,
            emailFrom: null,
            emailUrl: null,
            isDeleted: task.status === "deleted",
          };
          records.push(record);
          synced += 1;
        }
        for (let index = 0; index < records.length; index += 20) {
          await upsertGoogleTasks(records.slice(index, index + 20), today);
        }
        taskPageToken = page.data.nextPageToken ?? undefined;
      } while (taskPageToken);
    }
    pageToken = lists.data.nextPageToken ?? undefined;
  } while (pageToken);
  return synced;
}

export async function setGoogleTaskCompleted(
  taskListId: string,
  taskId: string,
  completed: boolean,
) {
  const { tasks } = await getGoogleClients();
  await tasks.tasks.patch({
    tasklist: taskListId,
    task: taskId,
    requestBody: completed
      ? {
          status: "completed",
          completed: new Date().toISOString(),
        }
      : {
          status: "needsAction",
          completed: null,
        },
  });
}

export async function updateExternalCompletion(
  source: ExternalTaskSource,
  externalId: string,
  completed: boolean,
  date: string,
) {
  const task = await getExternalTask(source, externalId);
  if (!task) return false;
  if (source === "google") {
    if (!task.taskListId) throw new Error("The Google Task is missing its task-list ID.");
    await setGoogleTaskCompleted(task.taskListId, externalId, completed);
  }
  await setExternalTaskCompletion(task, completed, date);
  return true;
}

export type GmailSearchResult = {
  id: string;
  subject: string;
  from: string;
  snippet: string;
};

// Gmail's "me" alias refers to the account authenticated by the access token.
const authenticatedGmailUser = "me";

export async function searchGmail(query: string) {
  const search = query.trim();
  if (!search) return [];
  const { gmail } = await getGoogleClients();
  const listed = await gmail.users.messages.list({
    userId: authenticatedGmailUser,
    q: search,
    maxResults: 10,
  });
  const messages = listed.data.messages ?? [];
  return Promise.all(
    messages.flatMap((message) => {
      if (!message.id) return [];
      return [
        gmail.users.messages
          .get({
            userId: authenticatedGmailUser,
            id: message.id,
            format: "metadata",
            metadataHeaders: ["Subject", "From"],
          })
          .then(({ data }): GmailSearchResult => {
            const headers = data.payload?.headers ?? [];
            const header = (name: string) =>
              headers.find(
                (item) => item.name?.toLowerCase() === name.toLowerCase(),
              )?.value ?? "";
            return {
              id: message.id!,
              subject: header("Subject") || "(no subject)",
              from: header("From"),
              snippet: data.snippet ?? "",
            };
          }),
      ];
    }),
  );
}

export async function importGmailMessage(messageId: string, date: string) {
  const { gmail } = await getGoogleClients();
  const { data } = await gmail.users.messages.get({
    userId: authenticatedGmailUser,
    id: messageId,
    format: "metadata",
    metadataHeaders: ["Subject", "From"],
  });
  const headers = data.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find(
      (item) => item.name?.toLowerCase() === name.toLowerCase(),
    )?.value ?? "";
  const title = header("Subject") || data.snippet?.trim() || "Email follow-up";
  return createGmailTask({
    source: "gmail",
    externalId: messageId,
    taskListId: null,
    title,
    dueDate: date,
    completed: false,
    emailFrom: header("From"),
    emailUrl: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(messageId)}`,
  });
}
