CREATE TABLE achievements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Daily & Routine', 'Skill & Mastery', 'Career & Boss Battles', 'Health & Mind', 'Exploration & Secrets')),
  tier TEXT NOT NULL CHECK (tier IN ('Common', 'Rare', 'Epic', 'Legendary')),
  xp INTEGER NOT NULL CHECK (xp > 0),
  target INTEGER NOT NULL CHECK (target > 0),
  current INTEGER NOT NULL DEFAULT 0 CHECK (current >= 0 AND current <= target),
  icon TEXT NOT NULL DEFAULT 'award',
  tracking TEXT NOT NULL DEFAULT 'manual' CHECK (tracking IN ('manual', 'streak')),
  task_id TEXT,
  reward TEXT NOT NULL DEFAULT '',
  unlocked_at TIMESTAMPTZ,
  awarded_xp INTEGER NOT NULL DEFAULT 0 CHECK (awarded_xp >= 0),
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((tracking = 'streak' AND task_id IS NOT NULL) OR (tracking = 'manual' AND task_id IS NULL)),
  CHECK ((unlocked_at IS NULL AND awarded_xp = 0) OR (unlocked_at IS NOT NULL AND awarded_xp > 0))
);

CREATE TABLE quests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('side', 'main', 'boss')),
  tier TEXT NOT NULL CHECK (tier IN ('Common', 'Rare', 'Epic', 'Legendary')),
  points INTEGER NOT NULL CHECK (points > 0),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO achievements (id, title, description, category, tier, xp, target, icon, tracking, task_id) VALUES
  ('workout', 'Workout Queen', 'Complete Workout on consecutive days.', 'Health & Mind', 'Rare', 100, 5, 'dumbbell', 'streak', 'morning-15'),
  ('water', 'Hydration Hero', 'Complete Water in your morning routine on consecutive days.', 'Daily & Routine', 'Common', 50, 5, 'droplet', 'streak', 'morning-2'),
  ('teeth', 'Nighttime Star', 'Complete Brush teeth in your nightly routine on consecutive days.', 'Daily & Routine', 'Common', 50, 5, 'moon', 'streak', 'night-10');

INSERT INTO achievements (id, title, description, category, tier, xp, target, icon) VALUES
  ('daily-early-bird', 'Early Bird', 'Wake up on your first alarm and get out of bed within 10 minutes.', 'Daily & Routine', 'Common', 25, 1, 'sunrise'),
  ('daily-hydration', 'Hydration Station', 'Hit your daily water intake goal for 3 consecutive days.', 'Daily & Routine', 'Common', 30, 3, 'droplet'),
  ('daily-clean-slate', 'Clean Slate', 'Clear all dirty dishes from the sink and wipe down the counters before bed.', 'Daily & Routine', 'Common', 25, 1, 'sparkles'),
  ('daily-no-scroll', 'No-Scroll Morning', 'Complete your morning routine without checking social media or news feeds first.', 'Daily & Routine', 'Common', 25, 1, 'shield'),
  ('daily-tab-slayer', 'Tab Slayer', 'Close or organize every open browser tab at the end of a work or study session.', 'Daily & Routine', 'Common', 20, 1, 'layers'),
  ('daily-7-day-streak', '7-Day Streak', 'Complete a core daily habit every single day for one full week.', 'Daily & Routine', 'Common', 50, 7, 'flame'),
  ('skill-hello-world', 'Hello, World', 'Set up a brand-new development environment, tool, or creative workspace and build a working prototype.', 'Skill & Mastery', 'Rare', 75, 1, 'terminal'),
  ('skill-bug-squasher', 'Bug Squasher', 'Track down and fix a frustrating issue or technical blocker without giving up.', 'Skill & Mastery', 'Rare', 75, 1, 'bug'),
  ('skill-ship-it', 'Ship It!', 'Finish, deploy, or publish a personal project, app, or creative piece.', 'Skill & Mastery', 'Rare', 100, 1, 'rocket'),
  ('skill-deep-work', 'Deep Work Session', 'Complete a 90-minute distraction-free block of focused coding, studying, or crafting.', 'Skill & Mastery', 'Rare', 75, 1, 'clock'),
  ('skill-tutorial-grad', 'Tutorial Graduate', 'Finish a full online course, textbook, or structured learning pathway from start to finish.', 'Skill & Mastery', 'Rare', 100, 1, 'graduation-cap'),
  ('skill-open-source', 'Open Source Hero', 'Submit a pull request, share a resource, or help someone else solve a technical problem.', 'Skill & Mastery', 'Rare', 85, 1, 'git-pull-request'),
  ('career-dragon-slayer', 'Dragon Slayer', 'Complete a dreaded, high-friction task you have been putting off for more than two weeks.', 'Career & Boss Battles', 'Epic', 150, 1, 'sword'),
  ('career-app-blitz', 'Application Blitz', 'Submit 10 tailored job applications or reach out to 5 new professional contacts in one week.', 'Career & Boss Battles', 'Epic', 175, 10, 'send'),
  ('career-mock-interview', 'Mock Interview Survivor', 'Complete a practice interview or technical coding challenge under timed conditions.', 'Career & Boss Battles', 'Epic', 150, 1, 'mic'),
  ('career-paperwork-paladin', 'Paperwork Paladin', 'Organize important files, taxes, medical records, or financial accounts into a clean system.', 'Career & Boss Battles', 'Epic', 150, 1, 'folder-check'),
  ('career-inbox-zero', 'Inbox Zero', 'Archive, reply to, or delete every pending email in your inbox.', 'Career & Boss Battles', 'Epic', 125, 1, 'mail-check'),
  ('health-touch-grass', 'Touch Grass', 'Spend at least 30 minutes walking, hiking, or relaxing outdoors in nature.', 'Health & Mind', 'Rare', 60, 1, 'trees'),
  ('health-iron-consistency', 'Iron Consistency', 'Complete 12 workouts or physical therapy sessions within a single month.', 'Health & Mind', 'Rare', 100, 12, 'dumbbell'),
  ('health-sleep-architect', 'Sleep Architect', 'Stick to a consistent bedtime and wake-up window for 5 nights in a row.', 'Health & Mind', 'Rare', 80, 5, 'moon'),
  ('health-chefs-kiss', 'Chef''s Kiss', 'Cook a brand-new recipe from scratch instead of ordering takeout.', 'Health & Mind', 'Rare', 70, 1, 'utensils'),
  ('health-digital-detox', 'Digital Detox', 'Spend an entire evening or weekend afternoon completely away from screens.', 'Health & Mind', 'Rare', 75, 1, 'power-off'),
  ('explore-uncharted', 'Uncharted Territory', 'Visit a new park, trail, museum, or local spot you have never been to before.', 'Exploration & Secrets', 'Legendary', 250, 1, 'compass'),
  ('explore-side-quest', 'Side Quest Accepted', 'Say yes to a spontaneous outing, local workshop, or new hobby on a whim.', 'Exploration & Secrets', 'Legendary', 250, 1, 'map-pin'),
  ('explore-30-day-unbroken', '30-Day Unbroken', 'Maintain a daily habit streak for an entire 30-day cycle without missing a beat.', 'Exploration & Secrets', 'Legendary', 350, 30, 'calendar-check'),
  ('explore-polymath', 'Polymath', 'Earn at least one Rare achievement across three completely different life categories in the same month.', 'Exploration & Secrets', 'Legendary', 300, 3, 'award'),
  ('explore-completionist', 'Completionist', 'Unlock every Common and Rare achievement on your personal board.', 'Exploration & Secrets', 'Legendary', 500, 1, 'trophy');
