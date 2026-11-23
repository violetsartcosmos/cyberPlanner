import { createBrowserRouter, useRouteError } from "react-router";
import { plannerAction, plannerLoader } from "../features/planner/services/planner-route";
import PlannerLayout from "../layouts/planner-layout";
import BooksPage from "../pages/books";
import CalendarPage from "../pages/calendar";
import DashboardPage from "../pages/dashboard";
import JournalPage from "../pages/journal";
import ProfilePage from "../pages/profile";
import QuestBoardPage from "../pages/quest-board";
import RewardsPage from "../pages/rewards";

function PageError() {
  const error = useRouteError();
  return (
    <main className="app-shell sign-in-shell">
      <p role="alert">{error instanceof Error ? error.message : "Could not load the planner."}</p>
    </main>
  );
}

function HydrateFallback() {
  return <main className="app-shell sign-in-shell">Loading planner...</main>;
}

export const router = createBrowserRouter([{
  id: "planner",
  path: "/",
  Component: PlannerLayout,
  loader: plannerLoader,
  action: plannerAction,
  HydrateFallback,
  ErrorBoundary: PageError,
  children: [
    { index: true, Component: DashboardPage, action: plannerAction },
    { path: "calendar", Component: CalendarPage, action: plannerAction },
    { path: "quests", Component: CalendarPage, action: plannerAction },
    { path: "quest-board", Component: QuestBoardPage, action: plannerAction },
    { path: "journal", Component: JournalPage, action: plannerAction },
    { path: "books", Component: BooksPage, action: plannerAction },
    { path: "rewards", Component: RewardsPage, action: plannerAction },
    { path: "profile", Component: ProfilePage, action: plannerAction },
  ],
}]);
