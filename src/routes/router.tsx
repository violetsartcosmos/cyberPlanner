import { createBrowserRouter, Link, useRouteError } from "react-router";
import { plannerAction, plannerLoader } from "../features/planner/services/planner-route";
import PlannerLayout from "../layouts/planner-layout";
import BooksPage from "../pages/books";
import CalendarPage from "../pages/calendar";
import DashboardPage from "../pages/dashboard";
import JournalPage from "../pages/journal";
import ProfilePage from "../pages/profile";
import QuestBoardPage from "../pages/quest-board";
import RewardsPage from "../pages/rewards";
import { useNotification } from "../components/notifications";

function RouteError({ root = false }: { root?: boolean }) {
  const error = useRouteError();
  useNotification(error instanceof Error ? error.message : "Could not load the planner.");
  return (
    <main className="app-shell sign-in-shell">
      {!root && <Link className="btn btn-outline-primary" to="/">Return to dashboard</Link>}
      <button className="btn btn-outline-primary" type="button" onClick={() => window.location.reload()}>Reload planner</button>
    </main>
  );
}

function RootError() {
  return <RouteError root />;
}

function PageError() {
  return <RouteError />;
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
  ErrorBoundary: RootError,
  children: [
    { index: true, Component: DashboardPage, action: plannerAction, ErrorBoundary: PageError },
    { path: "calendar", Component: CalendarPage, action: plannerAction, ErrorBoundary: PageError },
    { path: "quests", Component: CalendarPage, action: plannerAction, ErrorBoundary: PageError },
    { path: "quest-board", Component: QuestBoardPage, action: plannerAction, ErrorBoundary: PageError },
    { path: "journal", Component: JournalPage, action: plannerAction, ErrorBoundary: PageError },
    { path: "books", Component: BooksPage, action: plannerAction, ErrorBoundary: PageError },
    { path: "rewards", Component: RewardsPage, action: plannerAction, ErrorBoundary: PageError },
    { path: "profile", Component: ProfilePage, action: plannerAction, ErrorBoundary: PageError },
  ],
}]);
