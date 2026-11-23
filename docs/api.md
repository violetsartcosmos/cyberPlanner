# API reference

The API is served by the same origin as the app. Book and calendar endpoints require a session for the configured Google account. Planner, calendar, and book responses are marked non-cacheable. Requests that change data must pass the server's same-origin CSRF check.

The optional `library` parameter accepts `ebooks` (the default) or `audiblebooks`.
Book requests that take a `path` require a non-empty path of at most 2,048 characters. Calendar requests require a valid `start` and `end` range.

## Planner

| Method and path | Description |
| --- | --- |
| `GET /api/planner` | Loads planner data for the current request. |
| `POST /api/planner` | Validates and dispatches a planner action. |

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
