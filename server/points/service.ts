import type { Prisma } from "../generated/prisma/client";
import { databaseDate, getDatabase, serializableTransaction } from "../db/client";

export async function awardTaskPoints(
  client: Prisma.TransactionClient,
  taskKey: string,
  taskDate: string,
  amount = 10,
) {
  await client.pointLedger.createMany({
    data: [{ amount, entryType: "earn", taskKey, taskDate: databaseDate(taskDate) }],
    skipDuplicates: true,
  });
}

export async function getPointsSummary(date: string) {
  const db = getDatabase();
  const [total, today, earned, redemptions] = await db.$transaction([
    db.pointLedger.aggregate({ _sum: { amount: true } }),
    db.pointLedger.aggregate({
      where: { entryType: "earn", taskDate: databaseDate(date) },
      _sum: { amount: true },
    }),
    db.pointLedger.findMany({
      where: { entryType: "earn" },
      select: { taskKey: true },
    }),
    db.pointLedger.findMany({
      where: { entryType: "spend" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ], { isolationLevel: "RepeatableRead" });
  return {
    balance: total._sum.amount ?? 0,
    todayPoints: today._sum.amount ?? 0,
    earnedTaskKeys: earned.map((row) => {
      if (row.taskKey === null) throw new Error("Point award is missing its task key.");
      return row.taskKey;
    }),
    redemptions: redemptions.map((row) => {
      if (row.rewardId === null || row.rewardName === null) {
        throw new Error("Point redemption is missing its reward details.");
      }
      return {
        rewardId: row.rewardId,
        rewardName: row.rewardName,
        amount: -row.amount,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  };
}

export async function redeemReward(reward: {
  id: string;
  name: string;
  cost: number;
}) {
  return serializableTransaction(async (client) => {
    const result = await client.pointLedger.aggregate({ _sum: { amount: true } });
    const balance = result._sum.amount ?? 0;
    if (balance < reward.cost) return { balance, redeemed: false };
    await client.pointLedger.create({
      data: {
        amount: -reward.cost,
        entryType: "spend",
        rewardId: reward.id,
        rewardName: reward.name,
      },
    });
    return { balance: balance - reward.cost, redeemed: true };
  });
}
