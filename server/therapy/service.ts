import { databaseDate, getDatabase, serializableTransaction } from "../db/client";
import { refreshAchievements } from "../gamification/service";
import { awardTaskPoints } from "../points/service";
import { dateKey } from "../../shared/planner/utils";

/**
 * Loads therapy sessions, their exercises and completed checks, and earned points for a date.
 * @param date - Selected planner date in YYYY-MM-DD format.
 * @returns Therapy sessions with exercise completion states and the date's earned points.
 */
export async function getTherapyPlan(date: string) {
  const db = getDatabase();
  const [therapySessions, completions, earned] = await db.$transaction([
    db.therapySession.findMany({
      orderBy: { position: "asc" },
      include: { exercises: { orderBy: { position: "asc" }, include: { exercise: true } } },
    }),
    db.therapyCompletion.findMany({ where: { day: databaseDate(date) } }),
    db.pointLedger.aggregate({
      where: { entryType: "earn", taskDate: databaseDate(date), taskKey: { startsWith: `pt:${date}:` } },
      _sum: { amount: true },
    }),
  ], { isolationLevel: "RepeatableRead" });
  const checked = new Set(completions.map((item) => `${item.sessionId}:${item.exerciseId}`));
  return {
    therapySessions: therapySessions.map((session) => ({
      id: session.id,
      label: session.label,
      title: session.title,
      exercises: session.exercises.map(({ exercise, points }) => ({
        ...exercise,
        points,
        completed: checked.has(`${session.id}:${exercise.id}`),
      })),
    })),
    earnedPoints: earned._sum.amount ?? 0,
  };
}

/**
 * Checks or unchecks a session exercise and refreshes today's achievements.
 * Each exercise earns points once per session and date; unchecking keeps those points.
 * @param date - Exercise completion date in YYYY-MM-DD format.
 * @param sessionId - The therapy session containing the exercise.
 * @param exerciseId - The exercise to check or uncheck.
 * @param completed - Whether the exercise should be checked.
 * @returns An object containing the names of newly earned achievements.
 */
export async function setTherapyCompletion(date: string, sessionId: string, exerciseId: string, completed: boolean) {
  return serializableTransaction(async (client) => {
    const assignment = await client.therapySessionExercise.findUnique({
      where: { sessionId_exerciseId: { sessionId, exerciseId } },
    });
    if (!assignment) throw new Error("That physical therapy exercise is invalid.");
    const day = databaseDate(date);
    if (completed) {
      await client.therapyCompletion.upsert({
        where: { day_sessionId_exerciseId: { day, sessionId, exerciseId } },
        create: { day, sessionId, exerciseId },
        update: {},
      });
      await awardTaskPoints(client, `pt:${date}:${sessionId}:${exerciseId}`, date, assignment.points);
    } else {
      await client.therapyCompletion.deleteMany({ where: { day, sessionId, exerciseId } });
    }
    const earnedAchievements = await refreshAchievements(client, dateKey(new Date()));
    return { earnedAchievements };
  });
}
