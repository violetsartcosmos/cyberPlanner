import type { ActionFunctionArgs } from "react-router";
import type { QuestActionResult } from "../../../../shared/planner/types";

/**
 * Creates a quest submitted to POST /quest-board.
 * @param args - The action request containing the quest fields.
 * @returns The HTTP status and creation notification or API error.
 */
export async function createQuestAction({ request }: ActionFunctionArgs): Promise<QuestActionResult> {
  if (request.method !== "POST") return { status: 405, error: "Method not allowed." };
  const form = await request.formData();
  const response = await fetch("/api/quests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: form.get("title"),
      description: form.get("description"),
      kind: form.get("kind"),
      tier: form.get("tier"),
      points: Number(form.get("points")),
    }),
    signal: request.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    return { status: response.status, error: (await response.json() as { error: string }).error };
  }
  return { status: response.status, message: "Quest created." };
}

/**
 * Updates a quest submitted to PATCH /quest-board/:id.
 * @param args - The quest ID route parameter and edited form fields.
 * @returns The HTTP status and update notification or API error.
 */
export async function updateQuestAction({ request, params }: ActionFunctionArgs): Promise<QuestActionResult> {
  const form = await request.formData();
  const response = await fetch(`/api/quests/${encodeURIComponent(params.id as string)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: form.get("title"),
      description: form.get("description"),
      kind: form.get("kind"),
      tier: form.get("tier"),
      points: Number(form.get("points")),
    }),
    signal: request.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    return { status: response.status, error: (await response.json() as { error: string }).error };
  }
  return { status: response.status, message: "Quest updated." };
}

/**
 * Deletes a quest submitted to DELETE /quest-board/:id.
 * @param args - The action request and quest ID route parameter.
 * @returns The HTTP status and deletion notification or API error.
 */
export async function deleteQuestAction({ request, params }: ActionFunctionArgs): Promise<QuestActionResult> {
  const response = await fetch(`/api/quests/${encodeURIComponent(params.id as string)}`, {
    method: "DELETE",
    signal: request.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    return { status: response.status, error: (await response.json() as { error: string }).error };
  }
  return { status: response.status, message: "Quest deleted. Earned points and XP are kept." };
}

/**
 * Routes PATCH and DELETE requests for /quest-board/:id to their operations.
 * @param args - The HTTP request and quest ID route parameter.
 * @returns The operation's result, or status 405 for another HTTP method.
 */
export async function questResourceAction(args: ActionFunctionArgs): Promise<QuestActionResult> {
  switch (args.request.method) {
    case "PATCH":
      return updateQuestAction(args);
    case "DELETE":
      return deleteQuestAction(args);
    default:
      return { status: 405, error: "Method not allowed." };
  }
}

/**
 * Completes a quest submitted to POST /quest-board/:id/complete.
 * @param args - The action request and quest ID route parameter.
 * @returns The HTTP status and completion notification or API error.
 */
export async function completeQuestAction({ request, params }: ActionFunctionArgs): Promise<QuestActionResult> {
  if (request.method !== "POST") return { status: 405, error: "Method not allowed." };
  const response = await fetch(`/api/quests/${encodeURIComponent(params.id as string)}/complete`, {
    method: "POST",
    signal: request.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    return { status: response.status, error: (await response.json() as { error: string }).error };
  }
  return { status: response.status, message: "Quest complete! Points and XP earned." };
}

/**
 * Accepts a template submitted to POST /quest-log/templates/:templateId/accept.
 * @param args - The action request and template ID route parameter.
 * @returns The HTTP status and acceptance notification or API error.
 */
export async function acceptQuestTemplateAction({ request, params }: ActionFunctionArgs): Promise<QuestActionResult> {
  if (request.method !== "POST") return { status: 405, error: "Method not allowed." };
  const response = await fetch(`/api/quest-templates/${encodeURIComponent(params.templateId as string)}/accept`, {
    method: "POST",
    signal: request.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    return { status: response.status, error: (await response.json() as { error: string }).error };
  }
  return { status: response.status, message: "Quest accepted. It now appears on Create Quest." };
}
