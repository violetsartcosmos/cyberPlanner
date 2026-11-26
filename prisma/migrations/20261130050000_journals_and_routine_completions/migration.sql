BEGIN;

CREATE TABLE "routine_task_completions" (
  "day" DATE NOT NULL,
  "task_id" INTEGER NOT NULL,
  CONSTRAINT "routine_task_completions_pkey" PRIMARY KEY ("day", "task_id"),
  CONSTRAINT "routine_task_completions_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "routine_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "routine_task_completions_task_id_idx" ON "routine_task_completions"("task_id");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "planner_days" WHERE jsonb_typeof("checks") <> 'array') THEN
    RAISE EXCEPTION 'Cannot migrate planner checks: expected an array of routine task IDs';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "planner_days" d
    CROSS JOIN LATERAL jsonb_array_elements(d."checks") item
    WHERE jsonb_typeof(item) <> 'string'
       OR NOT EXISTS (SELECT 1 FROM "routine_tasks" t WHERE to_jsonb(t."id"::text) = item)
  ) THEN
    RAISE EXCEPTION 'Cannot migrate planner checks: invalid or unknown routine task ID';
  END IF;
END $$;

INSERT INTO "routine_task_completions" ("day", "task_id")
SELECT DISTINCT d."day", t."id"
FROM "planner_days" d
CROSS JOIN LATERAL jsonb_array_elements(d."checks") item
JOIN "routine_tasks" t ON to_jsonb(t."id"::text) = item;

ALTER TABLE "planner_days" DROP COLUMN "checks";
ALTER TABLE "planner_days" RENAME TO "journals";
ALTER TABLE "journals" RENAME COLUMN "journal" TO "content";
ALTER TABLE "journals" RENAME CONSTRAINT "planner_days_pkey" TO "journals_pkey";
ALTER INDEX "planner_days_day_key" RENAME TO "journals_day_key";

COMMIT;
