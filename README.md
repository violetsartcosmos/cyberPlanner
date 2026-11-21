# CyberPlanner

A cyberpunk-inspired life planner that turns a weekly whiteboard into a gentle daily quest. The dashboard combines a calendar, a rotating set of daily tasks, morning and nightly routines, notes, reward ideas, and an XP-style progress tracker. Select any calendar date to see and check off that day's tasks. Each completed task is worth 10 XP for that date; this is a visual progress counter, not a currency or a reward redemption system.

Switch the mission calendar between **Week** and **Month** to browse dates. The weekly view shows completed and total tasks for each day, while the monthly view marks dates with progress. Use the arrows to move between weeks or months, and select a date to view its quests, routines, and notes. The mobile layout opens in weekly view; desktop opens in monthly view.

Checks and notes are stored separately for each date in this browser's local storage. They stay on this device and browser, are not synced, and can be lost if browser data is cleared. The app will show an error if it cannot read or save its local data.

## Getting started

Requires Node.js 22.22 or newer and npm.

```sh
npm install
npm run dev
```

Open the local address printed in the terminal (usually http://localhost:5173). Run `npm run typecheck` to check types and `npm run build` to create a production build.

## Weekly quests

- **Monday — Reset & trash:** take out trash, clean the fridge, pay bills, wipe down the kitchen.
- **Tuesday — Laundry & clothes:** wash clothes, fold clothes, put clothes away, set out weekly clothes.
- **Wednesday — Bathroom:** clean the toilet, mirror, and shower; restock supplies.
- **Thursday — Floors & surfaces:** wipe counters, sweep or vacuum, clean the desk, random clean.
- **Friday — Life admin & restock:** make a grocery list, check the budget, plan the week, order essentials.
- **Saturday — Deep reset:** make or change the bed, refresh towels, clean the car and main room, declutter one area.
- **Sunday — Prep & self-care:** prep the bag and outfits, meal prep, plan the week, self-care.

## Morning routine

Stretch and PT; affirmations; water; meds; lights; music; brush teeth; wash face; shower; hair; lotion; get dressed (shirt, pants or dress, socks, shoes); breakfast; make bed; prep bag (laptop, task list, and lunch).

## Nightly routine

Dim lights; calm playlist; brain dump; clothes; dishes; trash; prep bag; prep clothes; task prep; shower; brush teeth; meds; PJs; read; yoga and PT; music; journaling.

## Reward ideas

Snacks, game time, TV time, scroll time, buying something small, ordering pizza or food, painting, self-care, movie night, planner supplies, a day trip, and stickers.

The lists are transcribed from the supplied whiteboard photos; a few phrases have been expanded for clarity. They can be edited in `app/planner.ts`.
