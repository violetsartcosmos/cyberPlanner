import { Hono } from "hono";
import { dateKey } from "../../shared/planner/utils";
import { noStore, reportServerError, requireSignIn } from "../http";
import {
  acceptTemplate, completeQuest, createQuest, deleteQuest, getQuest, listAchievements, listQuests,
  getProfileSummary, listAcceptedTemplateIds, listQuestTemplates, saveAchievement, updateQuest,
  type AchievementInput, type QuestInput,
} from "./service";

export const gamificationRoutes = new Hono();

gamificationRoutes.get("/profile", noStore, requireSignIn, async (context) => {
  try {
    return context.json(await getProfileSummary(dateKey(new Date())));
  } catch (error) {
    return reportServerError(context, error, "Could not load profile.");
  }
});

gamificationRoutes.get("/quests", noStore, requireSignIn, async (context) => {
  try {
    return context.json(await listQuests());
  } catch (error) {
    return reportServerError(context, error, "Could not load quests.");
  }
});

gamificationRoutes.get("/quests/:id", noStore, requireSignIn, async (context) => {
  try {
    const quest = await getQuest(context.req.param("id"));
    if (!quest) return context.json({ error: "That quest no longer exists." }, 404);
    return context.json(quest);
  } catch (error) {
    return reportServerError(context, error, "Could not load quest.");
  }
});

gamificationRoutes.post("/quests", noStore, requireSignIn, async (context) => {
  const input = await context.req.json<QuestInput>();
  try {
    return context.json(await createQuest(input), 201);
  } catch (error) {
    return reportServerError(context, error, "Could not create quest.");
  }
});

gamificationRoutes.patch("/quests/:id", noStore, requireSignIn, async (context) => {
  const input = await context.req.json<Partial<QuestInput>>();
  try {
    return context.json(await updateQuest(context.req.param("id"), input));
  } catch (error) {
    if (error instanceof Error && error.message === "Provide at least one quest field.") {
      return context.json({ error: error.message }, 400);
    }
    if (error instanceof Error && error.message === "That quest no longer exists.") {
      return context.json({ error: error.message }, 404);
    }
    return reportServerError(context, error, "Could not update quest.");
  }
});

gamificationRoutes.delete("/quests/:id", noStore, requireSignIn, async (context) => {
  try {
    await deleteQuest(context.req.param("id"));
    return context.body(null, 204);
  } catch (error) {
    if (error instanceof Error && error.message === "That quest no longer exists.") {
      return context.json({ error: error.message }, 404);
    }
    return reportServerError(context, error, "Could not delete quest.");
  }
});

gamificationRoutes.post("/quests/:id/complete", noStore, requireSignIn, async (context) => {
  try {
    await completeQuest(context.req.param("id"));
    return context.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "That quest no longer exists.") {
      return context.json({ error: error.message }, 404);
    }
    if (error instanceof Error && error.message === "That quest is already complete.") {
      return context.json({ error: error.message }, 409);
    }
    return reportServerError(context, error, "Could not complete quest.");
  }
});

gamificationRoutes.post("/quest-templates/:id/accept", noStore, requireSignIn, async (context) => {
  try {
    await acceptTemplate(context.req.param("id"));
    return context.json({ ok: true }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "That quest template no longer exists.") {
      return context.json({ error: error.message }, 404);
    }
    if (error instanceof Error && error.message === "That quest is already in your quest list.") {
      return context.json({ error: error.message }, 409);
    }
    return reportServerError(context, error, "Could not accept quest.");
  }
});

gamificationRoutes.get("/achievements", noStore, requireSignIn, async (context) => {
  try {
    return context.json(await listAchievements());
  } catch (error) {
    return reportServerError(context, error, "Could not load achievements.");
  }
});

gamificationRoutes.post("/achievements", noStore, requireSignIn, async (context) => {
  const input = await context.req.json<AchievementInput>();
  try {
    return context.json(await saveAchievement(null, input), 201);
  } catch (error) {
    if (error instanceof Error && error.message === "Choose a valid routine task.") {
      return context.json({ error: error.message }, 400);
    }
    return reportServerError(context, error, "Could not create achievement.");
  }
});

gamificationRoutes.get("/quest-templates", noStore, requireSignIn, async (context) => {
  try {
    return context.json(await listQuestTemplates());
  } catch (error) {
    return reportServerError(context, error, "Could not load quest templates.");
  }
});

gamificationRoutes.get("/quest-templates/accepted", noStore, requireSignIn, async (context) => {
  try {
    return context.json({ templateIds: await listAcceptedTemplateIds() });
  } catch (error) {
    return reportServerError(context, error, "Could not load accepted quest templates.");
  }
});
