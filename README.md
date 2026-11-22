# CyberPlanner

A personal planner for daily quests, routines, notes, journal entries, Google Tasks, and Gmail follow-ups. Complete tasks to earn points and redeem them for rewards.

CyberPlanner is designed for one Google account. It stores planner data and an encrypted Google refresh token in PostgreSQL; Gmail message bodies are not stored.

## Getting started

You need Node.js 22.22 or newer, PostgreSQL, and a Google Cloud project. Follow the [setup guide](docs/setup.md) for database creation, OAuth credentials, and secrets.

Once configured, run:

```powershell
npm run db:migrate
npm run dev
```

Open [localhost:5173](http://localhost:5173) and sign in.

Use the icons in the left sidebar to open each part of the dashboard, including Violet's profile and the Quest Board. Use the double arrows to expand or minimize the sidebar. After updating, run `npx prisma generate` and `npm run db:migrate`, then restart the server. The migration creates the achievement and quest tables and seeds the supplied achievements.

The profile displays level, lifetime XP, activity, and achievements. Every 100 XP gains one level. Lifetime XP includes all earned task points (including existing awards) and one-time achievement XP; spending points never lowers XP. Achievement XP is separate from the spendable points balance. The supplied achievements are self-reported: use **Unlock** or **+1 progress**, and observe any time limits described yourself. Create or edit achievements to change their target, rarity, XP, and optional personal reward. For automatic consecutive-day tracking, choose a morning or night routine task; Workout Queen starts with a five-day target. Streaks use the server's current local date, so configure its time zone to match yours. Earned badges and XP remain unlocked even if past checks are removed or the achievement is deleted. Editing an unfinished achievement's tracking method or routine task resets its progress.

Existing daily quests, routines, and synced tasks are Side Quests worth 10 points each. On the Quest Board, create additional Side Quests, Main Quests, and End-Game Bosses with your own rarity and point value. Completing a custom quest awards its points and equal XP once; deleting it does not remove earned points or XP.

On the calendar page, select a date and choose **Add journal** to write or edit that day's journal entry. Journal entries are stored separately from notes; the calendar marks dates with entries. Use **Today** beneath the month or week heading to return to the current date.

## Commands

Run commands in the project folder.

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies and generate Prisma Client. |
| `npm run dev` | Start the API on localhost:3000 and the Vite development server on localhost:5173. The client proxies API and sign-in requests to the API. |
| `npm run build` | Build the browser client and API server. |
| `npm run start` | Serve the production client and API together at localhost:3000; build first. |
| `npm run db:migrate` | Apply committed database migrations. |
| `npm run db:studio` | Open Prisma Studio to browse and edit the configured database; also available as `npx prisma studio`. |
| `npm run generate-secrets` | Print new secret entries to copy into `.env`; keep the output private. |
| `npx prisma generate` | Regenerate Prisma Client after changing the schema. |
| `npx prisma migrate dev --name describe_your_change` | Create and apply a migration on a development database; review reset prompts carefully. |
| `npm run typecheck` | Check TypeScript. |
| `npm run test:profile` | Test profile stats and achievement streaks. |
| `npm run test:server` | Test API authentication, request validation, and form validation without a database. |
| `npm run test:database` | Run integration tests against a separate, empty, disposable database specified by `TEST_DATABASE_URL`. |

### Run the API separately

Normally, `npm run dev` starts both the browser app and API. If the browser app is already running and you need to start just the API, open another terminal in the project folder and run:

```powershell
npx tsx server/index.ts
```

The API listens on port `3000`. Leave this terminal open while using the app.

For production, use HTTPS and your host's secret settings, apply migrations as a release step, and start the built server. The included [Dockerfile](Dockerfile) starts the server but does not apply migrations.

## Project layout

- [client](client): React pages, components, styles, and static assets.
- [server](server): API, authentication, and database logic grouped by feature.
- [shared/planner](shared/planner): task definitions, request types, and date utilities shared by client and server.
- [prisma](prisma): database schema and migrations.
- [tests](tests): integration tests.

Edit built-in tasks and rewards in [definitions.ts](shared/planner/definitions.ts).

## Libraries

Direct dependencies and their purposes:

| Library | Purpose |
| --- | --- |
| [React and React DOM](https://react.dev/learn) | User interface. |
| [React Router](https://reactrouter.com/) | Client-side navigation and server-side session cookies. |
| [Hono](https://hono.dev/) and [@hono/node-server](https://github.com/honojs/node-server) | API routing, request protection, and HTTP serving. |
| [Prisma](https://www.prisma.io/docs/orm) (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) and [pg](https://node-postgres.com/) | PostgreSQL queries, migrations, and driver. |
| [googleapis](https://github.com/googleapis/google-api-nodejs-client) | Google OAuth, Tasks, and Gmail. |
| [dotenv](https://github.com/motdotla/dotenv#readme) | Local environment configuration. |
| [TypeScript](https://www.typescriptlang.org/docs/) and [type definitions](https://github.com/DefinitelyTyped/DefinitelyTyped) | Type checking. |
| [Vite](https://vite.dev/guide/), [Sass](https://sass-lang.com/documentation/), and [Tailwind CSS](https://tailwindcss.com/docs) | Build and styling tools. |
| [tsx](https://tsx.is/) and [concurrently](https://github.com/open-cli-tools/concurrently) | Run the development API and client together. |

Exact versions are recorded in [package-lock.json](package-lock.json).
