# Coding instructions

- Write direct, idiomatic code that is easy to read and learn from.
- Use TypeScript types for expected inputs instead of treating every field as `unknown`.
- Avoid repeated per-field type and range checks. Check values in one place when necessary, and let the database enforce its constraints.
- Keep essential business rules, such as awarding points only once, intact.
- Put one-off logic in the relevant route or action instead of creating reusable helpers for it.
- Avoid unnecessary fallbacks, defensive wrappers, and redundant error handling.
- Add concise comments when needed to explain non-obvious logic.
- Respond directly without introductory disclaimers, safety caveats, or trailing summaries.
