-- Remove the old manual/streak constraints before converting existing rows.
DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'achievements'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%tracking%'
  LOOP
    EXECUTE format('ALTER TABLE achievements DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE achievements ADD COLUMN milestone_interval INTEGER;
ALTER TABLE achievements ALTER COLUMN tracking SET DEFAULT 'points';

-- Existing unlocked streaks keep their XP and advance to the next milestone.
UPDATE achievements
SET milestone_interval = target,
    target = CASE WHEN unlocked_at IS NOT NULL THEN target * 2 ELSE target END
WHERE tracking = 'streak';

UPDATE achievements
SET tracking = 'streak', task_id = 'morning-2', milestone_interval = 3,
    title = 'Hydration Streak',
    description = 'Complete Water in your morning routine on consecutive days.',
    target = CASE WHEN unlocked_at IS NOT NULL THEN 6 ELSE 3 END,
    current = 0
WHERE id = 'daily-hydration';

UPDATE achievements
SET tracking = 'activity_streak', task_id = NULL,
    milestone_interval = CASE WHEN id = 'daily-7-day-streak' THEN 7 ELSE 30 END,
    target = CASE WHEN id = 'daily-7-day-streak'
      THEN CASE WHEN unlocked_at IS NOT NULL THEN 14 ELSE 7 END
      ELSE CASE WHEN unlocked_at IS NOT NULL THEN 60 ELSE 30 END END,
    current = 0,
    description = 'Complete at least one built-in task on consecutive days.'
WHERE id IN ('daily-7-day-streak', 'explore-30-day-unbroken');

-- Seeded goals that cannot be verified become explicit lifetime-points milestones.
WITH milestones AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) * 100 AS points
  FROM achievements
  WHERE tracking = 'manual' AND id IN (
    'daily-early-bird', 'daily-clean-slate', 'daily-no-scroll', 'daily-tab-slayer',
    'skill-hello-world', 'skill-bug-squasher', 'skill-ship-it', 'skill-deep-work',
    'skill-tutorial-grad', 'skill-open-source', 'career-dragon-slayer', 'career-app-blitz',
    'career-mock-interview', 'career-paperwork-paladin', 'career-inbox-zero',
    'health-touch-grass', 'health-iron-consistency', 'health-sleep-architect',
    'health-chefs-kiss', 'health-digital-detox', 'explore-uncharted',
    'explore-side-quest', 'explore-polymath', 'explore-completionist'
  )
)
UPDATE achievements AS a
SET title = milestones.points || '-Point Milestone',
    description = 'Earn ' || milestones.points || ' lifetime task points.',
    category = 'Daily & Routine', tracking = 'points', task_id = NULL,
    target = milestones.points, current = CASE WHEN a.unlocked_at IS NULL THEN 0 ELSE milestones.points END
FROM milestones WHERE a.id = milestones.id;

-- Preserve custom manual achievements and earned XP, but make their new criteria explicit.
UPDATE achievements
SET tracking = 'points', task_id = NULL,
    description = 'Earn ' || target || ' lifetime task points. Previous manual goal: ' || description,
    current = CASE WHEN unlocked_at IS NULL THEN 0 ELSE target END
WHERE tracking = 'manual';

ALTER TABLE achievements ADD CONSTRAINT achievements_tracking_check
  CHECK (tracking IN ('points', 'streak', 'activity_streak'));
ALTER TABLE achievements ADD CONSTRAINT achievements_tracking_task_check
  CHECK ((tracking = 'streak' AND task_id IS NOT NULL) OR
         (tracking IN ('points', 'activity_streak') AND task_id IS NULL));
ALTER TABLE achievements ADD CONSTRAINT achievements_milestone_interval_check
  CHECK ((tracking = 'points' AND milestone_interval IS NULL) OR
         (tracking IN ('streak', 'activity_streak') AND milestone_interval IS NOT NULL AND milestone_interval > 0));
