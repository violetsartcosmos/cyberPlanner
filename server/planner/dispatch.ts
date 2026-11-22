import type { PlannerActionResult } from "../../shared/planner/types";
import { getSignedInEmail } from "../auth/service";
import { googleFormActions } from "../google/actions";
import { pointsFormActions } from "../points/actions";
import { plannerFormActions } from "./actions";
import { gamificationActions } from "../gamification/actions";

export type ActionHandler = (form: FormData) => Promise<PlannerActionResult>;

const actions: Record<string, ActionHandler> = {
  ...plannerFormActions,
  ...googleFormActions,
  ...pointsFormActions,
  ...gamificationActions,
};

export async function handlePlannerAction(request: Request): Promise<PlannerActionResult> {
  if (!(await getSignedInEmail(request))) {
    return { ok: false, error: "Sign in with your configured Google account first." };
  }
  const form = await request.formData();
  const intent = form.get("intent");
  if (typeof intent !== "string" || !Object.hasOwn(actions, intent)) {
    return { ok: false, error: "Unknown planner action." };
  }
  try {
    return await actions[intent](form);
  } catch (error) {
    if (error instanceof Error) return { ok: false, error: error.message };
    throw error;
  }
}
