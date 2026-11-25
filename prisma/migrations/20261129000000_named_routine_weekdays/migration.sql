BEGIN;

-- Reject unexpected existing values instead of assigning the wrong schedule.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM routine_tasks
    WHERE NOT (
      (list IN ('morning', 'night') AND weekday = -1)
      OR (list = 'daily' AND weekday BETWEEN 0 AND 6)
    )
  ) OR EXISTS (
    SELECT 1 FROM routine_groups WHERE weekday NOT BETWEEN 0 AND 6
  ) THEN
    RAISE EXCEPTION 'Cannot migrate an invalid routine weekday.';
  END IF;
END $$;

-- NULL means no weekday restriction; named weekdays identify daily tasks.
ALTER TABLE routine_tasks
  ALTER COLUMN weekday DROP NOT NULL,
  ALTER COLUMN weekday TYPE TEXT USING (
    CASE WHEN weekday = -1 THEN NULL
         ELSE (ARRAY['monday', 'tuesday', 'wednesday', 'thursday',
                     'friday', 'saturday', 'sunday'])[weekday + 1]
    END
  );
ALTER TABLE routine_tasks ADD CONSTRAINT routine_tasks_weekday_check CHECK (
  (list IN ('morning', 'night') AND weekday IS NULL)
  OR (list = 'daily' AND weekday IS NOT NULL AND weekday IN (
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ))
);

ALTER TABLE routine_groups
  ALTER COLUMN weekday TYPE TEXT USING (
    (ARRAY['monday', 'tuesday', 'wednesday', 'thursday',
           'friday', 'saturday', 'sunday'])[weekday + 1]
  );
ALTER TABLE routine_groups ADD CONSTRAINT routine_groups_weekday_check CHECK (
  weekday IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
);

COMMIT;
