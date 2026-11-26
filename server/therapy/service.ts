import { databaseDate, getDatabase, serializableTransaction } from "../db/client";
import { refreshAchievements } from "../gamification/service";
import { awardTaskPoints } from "../points/service";
import { dateKey } from "../../shared/planner/utils";

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
