export const dailyQuests = [
  {
    title: "Reset & trash",
    message: "Fresh week, fresh start.",
    tasks: [
      "Take out trash",
      "Clean the fridge",
      "Pay bills",
      "Wipe down the kitchen",
    ],
  },
  {
    title: "Laundry & clothes",
    message: "Future you loves prepared you.",
    tasks: [
      "Wash clothes",
      "Fold clothes",
      "Put clothes away",
      "Set out weekly clothes",
    ],
  },
  {
    title: "Bathroom",
    message: "You are enough, exactly as you are.",
    tasks: [
      "Clean the toilet",
      "Clean the mirror",
      "Clean the shower",
      "Restock supplies",
    ],
  },
  {
    title: "Floors & surfaces",
    message: "Clean space, clear brain.",
    tasks: ["Wipe counters", "Sweep or vacuum", "Clean desk", "Random clean"],
  },
  {
    title: "Life admin & restock",
    message: "Tiny steps add up.",
    tasks: [
      "Make grocery list",
      "Check budget",
      "Plan the week",
      "Order essentials",
    ],
  },
  {
    title: "Deep reset",
    message: "Progress matters.",
    tasks: [
      "Make or change the bed",
      "Refresh towels",
      "Clean the car",
      "Clean the main room",
      "Declutter one area",
    ],
  },
  {
    title: "Prep & self-care",
    message: "Prepare gently for the week ahead.",
    tasks: [
      "Prep bag",
      "Prep outfits",
      "Meal prep",
      "Plan the week",
      "Self-care",
    ],
  },
] as const;

export const morningRoutine = [
  "Stretch & PT",
  "Affirmations",
  "Water",
  "Meds",
  "Lights",
  "Music",
  "Brush teeth",
  "Wash face",
  "Shower",
  "Hair",
  "Lotion",
  "Get dressed (shirt, pants or dress, socks, shoes)",
  "Breakfast",
  "Make bed",
  "Prep bag (laptop, task list, lunch)",
  "Workout",
] as const;

export const nightRoutine = [
  "Dim lights",
  "Calm playlist",
  "Brain dump",
  "Clothes",
  "Dishes",
  "Trash",
  "Prep bag",
  "Prep clothes",
  "Task prep",
  "Shower",
  "Brush teeth",
  "Meds",
  "PJs",
  "Read",
  "Yoga & PT",
  "Music",
  "Journaling",
] as const;

export const rewards = [
  { id: "snacks", title: "Snacks", cost: 50 },
  { id: "game-time", title: "Game time", cost: 100 },
  { id: "tv-time", title: "TV time", cost: 80 },
  { id: "scroll-time", title: "Scroll time", cost: 50 },
  { id: "small-treat", title: "Buy something small", cost: 300 },
  { id: "takeout", title: "Order pizza or food", cost: 400 },
  { id: "paint", title: "Paint", cost: 150 },
  { id: "self-care", title: "Self-care", cost: 150 },
  { id: "movie-night", title: "Movie night", cost: 200 },
  { id: "planner-supplies", title: "Planner supplies", cost: 250 },
  { id: "day-trip", title: "Day trip", cost: 800 },
  { id: "stickers", title: "Stickers", cost: 100 },
] as const;
