# Coding instructions

- Write direct, idiomatic code that is easy to read and learn from.
- Use TypeScript types for expected inputs instead of treating every field as `unknown`.
- Avoid repeated per-field type and range checks. Check values in one place when necessary, and let the database enforce its constraints.
- Keep essential business rules, such as awarding points only once, intact.
- Put one-off logic in the relevant route or action instead of creating reusable helpers for it.
- Avoid unnecessary fallbacks, defensive wrappers, and redundant error handling.
- Use purpose-first JSDoc comments for function definitions added or changed.
  Explain what the function does in plain language, then document each input
  with `@param` and its output with `@returns`. Do not repeat TypeScript types.
- For type and router definitions, use a short JSDoc purpose description;
  do not add parameter or return tags where they do not apply.
- For HTTP handlers, describe the operation, request inputs, and response
  output. Keep storage details and failure cases out of the purpose summary.
- Add inline comments only when needed to explain non-obvious logic; do not
  narrate individual statements.
- Give the user Bash commands rather than PowerShell commands.
- Database integration test commands load `TEST_DATABASE_URL` from the ignored
  `.env` file. Never print credentials or run write tests against the app
  database. `npm run test:database` automatically resets the disposable test
  database's public schema; its name must end in `_test` and differ from the
  app database name.
- Respond directly without introductory disclaimers, safety caveats, or trailing summaries.
