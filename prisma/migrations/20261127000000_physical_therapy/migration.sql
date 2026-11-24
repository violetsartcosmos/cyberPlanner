CREATE TABLE "therapy_exercises" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prescription" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    CONSTRAINT "therapy_exercises_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "therapy_sessions" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "therapy_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "therapy_session_exercises" (
    "session_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    CONSTRAINT "therapy_session_exercises_pkey" PRIMARY KEY ("session_id", "exercise_id"),
    CONSTRAINT "therapy_session_exercises_points_check" CHECK ("points" > 0)
);

CREATE TABLE "therapy_completions" (
    "day" DATE NOT NULL,
    "session_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    CONSTRAINT "therapy_completions_pkey" PRIMARY KEY ("day", "session_id", "exercise_id")
);

CREATE UNIQUE INDEX "therapy_sessions_position_key" ON "therapy_sessions"("position");
CREATE UNIQUE INDEX "therapy_session_exercises_session_id_position_key" ON "therapy_session_exercises"("session_id", "position");

ALTER TABLE "therapy_session_exercises" ADD CONSTRAINT "therapy_session_exercises_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "therapy_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "therapy_session_exercises" ADD CONSTRAINT "therapy_session_exercises_exercise_id_fkey"
    FOREIGN KEY ("exercise_id") REFERENCES "therapy_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "therapy_completions" ADD CONSTRAINT "therapy_completions_session_id_exercise_id_fkey"
    FOREIGN KEY ("session_id", "exercise_id") REFERENCES "therapy_session_exercises"("session_id", "exercise_id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "therapy_exercises" ("id", "name", "prescription", "instructions", "purpose") VALUES
  ('glute', 'Standing glute squeezes', '20 reps · hold 3 sec · 1 set', 'Stand with feet straight. Squeeze and release your buttock muscles. Do not squeeze your abs, inner thighs or hamstrings.', 'Promotes even weight distribution when standing and strengthens the glutes.'),
  ('bridge', 'Bridge', '10 reps · hold 3 sec · 1 set', 'Lie on your back with knees bent. Tighten your lower abs, squeeze your buttocks and lift your hips off the floor. Hold, then lower and repeat.', 'Strengthens the glutes and deep core that support the pelvic floor.'),
  ('sitrev', 'Seated reverse clamshell', '10 reps · hold 3 sec · 1 set', 'Sit upright with a small pillow between your knees. Push your knees into the pillow while gently swinging both feet apart. Return to start.', 'Works the hip muscles that help stabilize the pelvis.'),
  ('bal', 'Single-leg balance', '5 reps · hold 5 sec · 2 sets per leg', 'Hold a chair back with both hands. Slowly lift one leg and balance for 5 seconds, then lower. Repeat, then switch legs. Try to build up your hold time.', 'Builds balance and hip stability.'),
  ('ta', 'TA muscle activation', '10 reps · hold 5 sec · 1–2 sets/day', 'Lie on your back, knees bent. Place two fingers beside your navel, off the six-pack muscles. Inhale, then exhale while tilting your pelvis slightly and drawing your belly button toward your spine, like zipping tight pants. Hold, relax, repeat.', 'These deep muscles work closely with the pelvic floor and support the lower back.'),
  ('heel', 'TA heel slides', '5–10 reps per leg · 3 sec out, 3 sec in · 1–2 sets/day', 'Lie on your back, both knees bent. Inhale, then engage your TA muscles. Exhale and slowly slide one leg straight, keeping the other knee bent. Inhale and slide it back. Relax, then switch legs.', 'Restores function to the deep core system that stabilizes your pelvis.'),
  ('hip', 'Hip internal rotation hold', '20 reps · hold 6 sec · 1 set · 2×/day', 'Lie on your back, legs straight, toes pulled back. Have someone place their hands on the affected leg and press into them for 6 seconds. A pillow between your legs also works. The handout allows 20–30 reps.', 'Strengthens hip rotators that influence pelvic floor effort.'),
  ('squat', 'Squats + pelvic floor lift', '10 reps · 5 sec down, 5 sec up · 2–3 sets/day', 'Stand shoulder-width apart (use a chair for support if needed). Contract your pelvic floor and lower slowly to a count of five, knees in line with toes, weight in heels, back straight. Rise to a count of five, then release.', 'Helps prevent leaking when you stand up from a chair or get out of the car.'),
  ('knee', 'Knee squeezes', '5–10 reps · hold 5 sec, work up to 10 · 1–2 sets/day', 'Sit tall with feet flat and a ball or firm pillow between your thighs. Inhale, then exhale as you squeeze and contract your pelvic floor. Hold 5 seconds, relax 5 seconds. For a challenge, sit without leaning back.', 'Strengthens inner thighs and abs, which work with the pelvic floor for bladder control.'),
  ('side', 'Sideways walking', 'Up to 10 minutes, or until you need a break', 'Stand beside a counter or stable surface. Step sideways with feet and hips facing forward, then return the other way. Keep a chair nearby for rest breaks.', 'Builds hip strength and balance.'),
  ('clam', 'Side-lying clamshell', '10 reps · hold 3 sec · 1–2 sets per side', 'Lie on your side, hips stacked, knees bent. Lift your pelvic floor and breathe out gently. Raise your top knee while your feet stay together, pause 3 seconds, then lower and release. Don’t let your pelvis roll back.', 'Strengthens the gluteus medius, which stabilizes your pelvis.'),
  ('rclam', 'Side-lying reverse clamshell', '10 reps · hold 3 sec · 1–2 sets per side', 'Lie on your side, hips stacked, knees bent. Lift your pelvic floor and breathe out gently. Keeping knees together, raise your top foot as high as is comfortable. Pause 3 seconds, then lower and release.', 'Targets the inner thighs and helps stabilize the pelvic muscles.'),
  ('bird', 'Bird dog', '6–10 reps · hold 2 sec · 1–2 sets/day', 'Start on all fours, wrists under shoulders, knees under hips. Brace your abs. Raise your left leg and right arm together without moving your pelvis or head. Hold 2 seconds, lower, then switch sides.', 'Strengthens the lower back, abs and pelvic floor.');

INSERT INTO "therapy_sessions" ("id", "label", "title", "position") VALUES
  ('am', 'Morning', 'Wake up the deep core', 0),
  ('mid', 'Midday', 'Strength and movement', 1),
  ('pm', 'Evening', 'Hips and stability', 2);

INSERT INTO "therapy_session_exercises" ("session_id", "exercise_id", "position", "points") VALUES
  ('am', 'ta', 0, 10), ('am', 'heel', 1, 10), ('am', 'hip', 2, 10),
  ('am', 'glute', 3, 10), ('am', 'bridge', 4, 10), ('am', 'sitrev', 5, 10), ('am', 'bal', 6, 10),
  ('mid', 'squat', 0, 10), ('mid', 'knee', 1, 10), ('mid', 'side', 2, 10),
  ('mid', 'glute', 3, 10), ('mid', 'bridge', 4, 10), ('mid', 'sitrev', 5, 10), ('mid', 'bal', 6, 10),
  ('pm', 'clam', 0, 10), ('pm', 'rclam', 1, 10), ('pm', 'bird', 2, 10), ('pm', 'hip', 3, 10), ('pm', 'squat', 4, 10),
  ('pm', 'glute', 5, 10), ('pm', 'bridge', 6, 10), ('pm', 'sitrev', 7, 10), ('pm', 'bal', 8, 10);
