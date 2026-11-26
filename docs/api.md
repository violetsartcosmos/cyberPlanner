# API reference

The API is served by the same origin as the app. Book and calendar endpoints require a session for the configured Google account. Planner, calendar, and book responses are marked non-cacheable. Requests that change data must pass the server's same-origin CSRF check.

JSON request bodies should use the types shown below. Invalid values rejected by the database can return `500`.

The optional `library` parameter accepts `ebooks` (the default) or `audiblebooks`.
Book requests that take a `path` require a non-empty path of at most 2,048 characters. Calendar requests require a valid `start` and `end` range.

## Planner

| Method and path | Description |
| --- | --- |
| `GET /api/planner` | Loads planner data for the current request. |
| `POST /api/planner` | Validates and dispatches a planner action. |

`GET /api/planner` returns all earned task keys by default. Set `taskKeys=visible` to return only keys for the selected date's built-in tasks and its visible synced tasks.

For a signed-in user, the response also includes `therapy.therapySessions` with exercise definitions, point values, and completion states for the selected date, plus `therapy.earnedPoints` from the points ledger. Submit the `toggle_physical_therapy` planner action with form fields `date` (`YYYY-MM-DD`), `sessionId`, `exerciseId`, and `completed` (`true` or `false`). The server validates the session assignment and determines the point value; an award occurs at most once for that date, session, and exercise. Unchecking does not reverse an award.

## Journals

These endpoints require a signed-in session. Dates use `YYYY-MM-DD`.

| Method and path | Description |
| --- | --- |
| `GET /api/journals/{date}` | Returns `{"date":"YYYY-MM-DD","content":"..."}`; returns `404` if no journal has been saved for that date. |
| `PUT /api/journals/{date}` | Creates or replaces the entry using `{"content":"..."}` and returns the saved date and content. Content can be empty. |

These endpoints share journal data with `/api/planner`.

## Quests

These endpoints require a signed-in session. Quest objects contain the stored fields, including `id`, `completedAt`, and `templateId`.

| Method and path | Description |
| --- | --- |
| `GET /api/quests` | Lists non-deleted quests, newest first. |
| `GET /api/quests/{id}` | Returns a non-deleted quest, or `404`. |
| `POST /api/quests` | Creates a quest and returns it with status `201`. |
| `PATCH /api/quests/{id}` | Updates the supplied quest fields and returns the quest. |
| `DELETE /api/quests/{id}` | Soft-deletes the quest and returns `204`; earned points are retained. |
| `POST /api/quests/{id}/complete` | Completes the quest and awards its points once; a repeated completion returns `409`. |
| `POST /api/quest-templates/{id}/accept` | Accepts a template once; repeated acceptance returns `409`. |

Creation accepts `{"title":"...", "description":"...", "kind":"side", "tier":"Common", "points":10}`. A patch accepts any non-empty subset of those fields. `kind` is `side`, `main`, or `boss`; `tier` is `Common`, `Rare`, `Epic`, or `Legendary`; points must be a positive whole number. The planner form limits points to 100,000. These routes use the same quest operations as planner actions.

## Routines and therapy

These endpoints require a signed-in session. Dates use `YYYY-MM-DD`.

| Method and path | Description |
| --- | --- |
| `GET /api/routines` | Returns routine definitions and weekday groups. |
| `GET /api/routines/completions?date=...` | Returns the date and checked task IDs for that day. |
| `PATCH /api/routines/{id}` | Changes a routine's kind with `{"kind":"main"}`; its point value is set by the server. |
| `PUT /api/routines/{id}/completions/{date}` | Sets a task's check state with `{"completed":true}`. Returns the day's checks and newly earned achievements. |
| `GET /api/therapy/sessions?date=...` | Returns the therapy plan and completion states for that day. |
| `PUT /api/therapy/sessions/{sessionId}/exercises/{exerciseId}/completions/{date}` | Sets an exercise's check state with `{"completed":true}` and returns newly earned achievements. |

Routine and therapy completions award points at most once per date and task. Unchecking does not reverse the award. The server validates the task's weekday or therapy assignment and refreshes achievements as in the planner.

Extra request fields are ignored; point values and achievement progress are determined by the server.

## Achievements, synced tasks, and points

These endpoints require a signed-in session. Dates use `YYYY-MM-DD`.

| Method and path | Description |
| --- | --- |
| `GET /api/achievements` | Lists non-deleted stored achievements. It does not recalculate progress. |
| `POST /api/achievements` | Creates an achievement, refreshes progress, and returns the achievement and newly earned achievements. |
| `GET /api/quest-templates` | Lists quest templates by track and position. |
| `GET /api/external-tasks?date=...` | Lists active Google and Gmail tasks due on that date or without a due date. |
| `PUT /api/external-tasks/{source}/{id}/completion` | Sets completion using `{"date":"YYYY-MM-DD","completed":true}`. Google tasks are also updated in Google. |
| `GET /api/points?date=...` | Returns balance, points earned on the date, earned task keys, and recent redemptions. |
| `GET /api/rewards` | Lists rewards and their server-defined costs. |
| `POST /api/rewards/{id}/redemptions` | Redeems a reward; returns `409` if the balance is insufficient. |

To create an achievement, send `title`, `description`, `category`, `tier`, integer `xp` and `target`, and `tracking` (`points` or `streak`). A streak also requires a routine `taskId`; `reward` is optional. Existing achievements cannot be edited. Point awards and redemptions remain ledger operations rather than arbitrary ledger edits. Google synchronization remains a planner action.

## Books

| Method and path | Description |
| --- | --- |
| `GET /api/books` | Lists books from both configured libraries. |
| `GET /api/books/file?path=...&library=...` | Streams a book. Supports the HTTP `Range` header for partial reads. |
| `GET /api/books/details?path=...&library=...` | Loads saved Wikipedia details for a book. |
| `POST /api/books/details` | Saves book details from a JSON body containing `path`, `details`, and optional `library` and `cover`. A cover has base64 `data` and an image MIME `type`; only supported image formats and valid image signatures are accepted. |
| `GET /api/books/cover?path=...&library=...` | Loads the book's saved cover image. |
| `GET /api/books/bookmarks?path=...&library=...` | Lists bookmarks for a book. |
| `POST /api/books/bookmarks` | Adds a bookmark using `path`, `position`, `label`, and optional `library`. |
| `DELETE /api/books/bookmarks?path=...&id=...&library=...` | Removes a bookmark. |
| `GET /api/books/progress?path=...&library=...` | Loads a book's saved reading position and revision. |
| `PUT /api/books/progress` | Saves a reading position using `path`, `position`, `revision`, and optional `library`. A stale revision returns `409` with the current progress. |
| `GET /api/books/chapters?path=...&library=...` | Loads the chapter list for a book. |
| `POST /api/books/rename` | Renames a book using `path`, `title`, and optional `library`, preserving its saved planner data. |

The `details` value is a Wikipedia details object described in the [models guide](models.md). Book progress positions are format-specific: EPUB uses a CFI, audiobooks use a non-negative time, and PDFs do not support saved progress.

## Calendar

| Method and path | Description |
| --- | --- |
| `GET /api/calendar?start=...&end=...` | Loads Google Calendar events for a valid date range. |

## Sign-in

| Method and path | Description |
| --- | --- |
| `GET /auth/google` | Starts Google sign-in. |
| `GET /auth/callback` | Completes sign-in and returns to the app. |
| `POST /auth/logout` | Ends the current session. |

Unknown `/api/*` and `/auth/*` routes return `404`.
