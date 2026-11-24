-- AlterTable
ALTER TABLE "quests" ADD COLUMN "template_id" TEXT;

-- CreateTable
CREATE TABLE "routine_tasks" (
    "id" TEXT NOT NULL,
    "list" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "routine_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_groups" (
    "weekday" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "routine_groups_pkey" PRIMARY KEY ("weekday")
);

-- CreateTable
CREATE TABLE "quest_templates" (
    "id" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tier" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "quest_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "routine_tasks_list_weekday_slot_key" ON "routine_tasks"("list", "weekday", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "quests_template_id_key" ON "quests"("template_id");

-- Seed: morning and night checklists (weekday -1, slot = index in the old arrays)
INSERT INTO "routine_tasks" ("id", "list", "weekday", "slot", "title", "kind", "points") VALUES
  (gen_random_uuid()::text, 'morning', -1, 0, 'Stretch & PT', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 1, 'Affirmations', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 2, 'Water', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 3, 'Meds', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 4, 'Lights', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 5, 'Music', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 6, 'Brush teeth', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 7, 'Wash face', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 8, 'Shower', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 9, 'Hair', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 10, 'Lotion', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 11, 'Get dressed (shirt, pants or dress, socks, shoes)', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 12, 'Breakfast', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 13, 'Make bed', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 14, 'Prep bag (laptop, task list, lunch)', 'side', 10),
  (gen_random_uuid()::text, 'morning', -1, 15, 'Workout', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 0, 'Dim lights', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 1, 'Calm playlist', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 2, 'Brain dump', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 3, 'Clothes', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 4, 'Dishes', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 5, 'Trash', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 6, 'Prep bag', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 7, 'Prep clothes', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 8, 'Task prep', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 9, 'Shower', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 10, 'Brush teeth', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 11, 'Meds', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 12, 'PJs', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 13, 'Read', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 14, 'Yoga & PT', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 15, 'Music', 'side', 10),
  (gen_random_uuid()::text, 'night', -1, 16, 'Journaling', 'side', 10);

-- Seed: weekly list, one set of rows per weekday (0 = Monday)
INSERT INTO "routine_tasks" ("id", "list", "weekday", "slot", "title", "kind", "points") VALUES
  (gen_random_uuid()::text, 'daily', 0, 0, 'Take out trash', 'side', 10),
  (gen_random_uuid()::text, 'daily', 0, 1, 'Clean the fridge', 'side', 10),
  (gen_random_uuid()::text, 'daily', 0, 2, 'Pay bills', 'side', 10),
  (gen_random_uuid()::text, 'daily', 0, 3, 'Wipe down the kitchen', 'side', 10),
  (gen_random_uuid()::text, 'daily', 1, 0, 'Wash clothes', 'side', 10),
  (gen_random_uuid()::text, 'daily', 1, 1, 'Fold clothes', 'side', 10),
  (gen_random_uuid()::text, 'daily', 1, 2, 'Put clothes away', 'side', 10),
  (gen_random_uuid()::text, 'daily', 1, 3, 'Set out weekly clothes', 'side', 10),
  (gen_random_uuid()::text, 'daily', 2, 0, 'Clean the toilet', 'side', 10),
  (gen_random_uuid()::text, 'daily', 2, 1, 'Clean the mirror', 'side', 10),
  (gen_random_uuid()::text, 'daily', 2, 2, 'Clean the shower', 'side', 10),
  (gen_random_uuid()::text, 'daily', 2, 3, 'Restock supplies', 'side', 10),
  (gen_random_uuid()::text, 'daily', 3, 0, 'Wipe counters', 'side', 10),
  (gen_random_uuid()::text, 'daily', 3, 1, 'Sweep or vacuum', 'side', 10),
  (gen_random_uuid()::text, 'daily', 3, 2, 'Clean desk', 'side', 10),
  (gen_random_uuid()::text, 'daily', 3, 3, 'Random clean', 'side', 10),
  (gen_random_uuid()::text, 'daily', 4, 0, 'Make grocery list', 'side', 10),
  (gen_random_uuid()::text, 'daily', 4, 1, 'Check budget', 'side', 10),
  (gen_random_uuid()::text, 'daily', 4, 2, 'Plan the week', 'side', 10),
  (gen_random_uuid()::text, 'daily', 4, 3, 'Order essentials', 'side', 10),
  (gen_random_uuid()::text, 'daily', 5, 0, 'Make or change the bed', 'side', 10),
  (gen_random_uuid()::text, 'daily', 5, 1, 'Refresh towels', 'side', 10),
  (gen_random_uuid()::text, 'daily', 5, 2, 'Clean the car', 'side', 10),
  (gen_random_uuid()::text, 'daily', 5, 3, 'Clean the main room', 'side', 10),
  (gen_random_uuid()::text, 'daily', 5, 4, 'Declutter one area', 'side', 10),
  (gen_random_uuid()::text, 'daily', 6, 0, 'Prep bag', 'side', 10),
  (gen_random_uuid()::text, 'daily', 6, 1, 'Prep outfits', 'side', 10),
  (gen_random_uuid()::text, 'daily', 6, 2, 'Meal prep', 'side', 10),
  (gen_random_uuid()::text, 'daily', 6, 3, 'Plan the week', 'side', 10),
  (gen_random_uuid()::text, 'daily', 6, 4, 'Self-care', 'side', 10);

-- Seed: weekday headers (title and message)
INSERT INTO "routine_groups" ("weekday", "title", "message") VALUES
  (0, 'Reset & trash', 'Fresh week, fresh start.'),
  (1, 'Laundry & clothes', 'Future you loves prepared you.'),
  (2, 'Bathroom', 'You are enough, exactly as you are.'),
  (3, 'Floors & surfaces', 'Clean space, clear brain.'),
  (4, 'Life admin & restock', 'Tiny steps add up.'),
  (5, 'Deep reset', 'Progress matters.'),
  (6, 'Prep & self-care', 'Prepare gently for the week ahead.');

-- Seed: suggested quest compendium
INSERT INTO "quest_templates" ("id", "track", "kind", "title", "description", "tier", "points", "position") VALUES
  ('cyber-security-course', 'cyber', 'main', 'Finish a hands-on security course and keep the notes', '', 'Rare', 50, 0),
  ('cyber-threat-model', 'cyber', 'main', 'Threat-model one app you actually use', '', 'Rare', 50, 1),
  ('cyber-ship-project', 'cyber', 'main', 'Ship a personal project with tests and a README', '', 'Rare', 50, 2),
  ('cyber-open-source-pr', 'cyber', 'main', 'Get one open-source pull request merged', '', 'Rare', 50, 3),
  ('cyber-home-lab', 'cyber', 'main', 'Stand up a small home lab and write up three exercises', '', 'Rare', 50, 4),
  ('cyber-new-language', 'cyber', 'main', 'Learn one new language or framework by shipping a tiny app', '', 'Rare', 50, 5),
  ('cyber-certification', 'cyber', 'boss', 'Earn a recognized certification, such as Security+ or OSCP', '', 'Epic', 150, 6),
  ('cyber-career-role', 'cyber', 'boss', 'Land a role or promotion that uses these skills', '', 'Epic', 150, 7),
  ('cyber-publish-talk', 'cyber', 'boss', 'Publish a security write-up or give a short talk', '', 'Epic', 150, 8),
  ('life-sonography-prereqs', 'life', 'main', 'Finish the prerequisites for a diagnostic medical sonography program', '', 'Rare', 50, 9),
  ('life-semester-rotation', 'life', 'main', 'Complete a semester or clinical rotation', '', 'Rare', 50, 10),
  ('life-study-plan', 'life', 'main', 'Build a study plan and pass a licensing practice exam', '', 'Rare', 50, 11),
  ('life-clinic-volunteer', 'life', 'main', 'Shadow or volunteer in a clinic', '', 'Rare', 50, 12),
  ('life-sonography-degree', 'life', 'boss', 'Earn the sonography degree', '', 'Epic', 150, 13),
  ('life-registry-exam', 'life', 'boss', 'Pass the sonography registry exam', '', 'Epic', 150, 14),
  ('life-sonographer-job', 'life', 'boss', 'Start work as a sonographer', '', 'Epic', 150, 15);
