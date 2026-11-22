import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";

let prisma: PrismaClient | undefined;

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to use CyberPlanner.");
  }
  prisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  return prisma;
}

export function databaseDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function serializableTransaction<T>(
  run: (client: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDatabase().$transaction(run, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 5_000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 5
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
    }
  }
}
