DROP INDEX "external_tasks_due_date_idx";

CREATE INDEX "external_tasks_due_date_idx"
  ON "external_tasks"("due_date") WHERE "is_deleted" = false;
