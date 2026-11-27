import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Outlet, useLoaderData, useLocation, useRouteLoaderData } from "react-router";
import {
  navigationSections,
  PlannerNavigation,
} from "@/features/planner/components/planner-navigation";
import { DailyAffirmation } from "@/features/planner/components/dashboard-widgets";
import { SignInPanel } from "@/features/auth/components/sign-in-panel";
import { usePlannerController } from "@/features/planner/hooks/use-planner-controller";
import { plannerCalendarLoader } from "@/features/planner/services/planner-calendar-route";
import { sessionLoader } from "@/features/planner/services/session-route";
import type { AuthenticatedPlannerPage } from "@/features/planner/types/planner-outlet-context";
import type { PlannerCalendarData } from "../../shared/planner/types";
import { dayProgress } from "../../shared/planner/utils";
import { routineGroupFor, routineWeekday } from "../../shared/planner/routines";
import { useNotification } from "@/components/notifications";

function getNavigationLabel(section: string) {
  for (const [path, label] of navigationSections) {
    if (path === section) return label;
  }
  return "Page not found";
}

export default function PlannerLayout() {
  const page = useLoaderData<typeof sessionLoader>();

  if (!page.authenticated) {
    return (
      <SignInPanel
        missingConfiguration={page.missingConfiguration}
        authError={page.authError}
      />
    );
  }

  return <AuthenticatedPlannerLayout page={page} />;
}

/**
 * Renders shared navigation and shell data around the active planner route.
 * @param props - The authenticated shell data.
 * @returns The authenticated planner application layout.
 */
function AuthenticatedPlannerLayout({ page }: { page: AuthenticatedPlannerPage }) {
  const location = useLocation();
  const calendarPage = useRouteLoaderData<typeof plannerCalendarLoader>("planner-calendar");
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    date,
    selected,
    today,
    weekday,
    outletContext,
  } = usePlannerController(page);
  const section = location.pathname === "/" ? "" : location.pathname.slice(1);
  const isDashboard = section === "";
  const isRewards = section === "rewards";
  const dashboardPage = isDashboard ? calendarPage : null;
  if (isDashboard && !dashboardPage) {
    throw new Error("Could not load dashboard task data.");
  }
  const pageHeadingSection = section === "quests" ? "calendar" : section;
  useNotification(page.newlyEarned.length
    ? `Achievement milestone earned: ${page.newlyEarned.join(", ")}!` : "", "notice");

  return (
    <div className={`app-shell authenticated-shell ${menuOpen ? "menu-expanded" : ""}`}>
      <PlannerNavigation
        selected={selected}
        section={section}
        expanded={menuOpen}
        totalXp={page.totalXp}
        setExpanded={setMenuOpen}
      />
      <main className={`dashboard container-fluid ${isDashboard ? "" : "section-page"}`}>
        <header className={`dashboard-header d-flex justify-content-between gap-3 ${isDashboard ? "dashboard-header-home" : ""}`}>
          {!isDashboard && section !== "profile" && (
            <div className="page-heading">
              {isRewards ? (
                <>
                  <p className="text-label accent">NYX'S LITTLE SHOP OF WINS</p>
                  <h1 id="shop-heading">Reward inventory</h1>
                </>
              ) : (
                <>
                  <p className="text-label accent">CYBER PLANNER</p>
                  <h1>{getNavigationLabel(pageHeadingSection)}</h1>
                </>
              )}
            </div>
          )}
          {isDashboard && dashboardPage && <>
            <div className="intro">
              <div>
                <p className="text-label accent">
                  CYBER PLANNER <span>// 001</span>
                </p>
                <h1>
                  YOUR LIFE, <em>YOUR QUEST.</em>
                </h1>
                <p className="intro-copy">
                  A little progress is still progress. Let's make today count.
                </p>
              </div>
            </div>
            <section className="mobile-welcome">
              <DashboardWelcome
                page={dashboardPage}
                selected={selected}
                today={today}
                date={date}
                weekday={weekday}
              />
            </section>
          </>}
          <div className="header-utilities">
            <div className="hero-actions">
              <span className="shop-balance"><Sparkles aria-hidden="true" size={15} /> {page.balance} PTS</span>
              {!isRewards && (
                <span className="hero-date">
                  {date
                    .toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                    .toUpperCase()}
                </span>
              )}
            </div>
            {isDashboard && <DailyAffirmation today={today} />}
          </div>
        </header>
        <Outlet context={outletContext} />
        <footer>
          <span>
            CYBERPLANNER <Sparkles aria-hidden="true" size={11} /> YOUR LIFE,
            YOUR QUEST.
          </span>
          <span>
            <form method="post" action="/auth/logout">
              <button className="btn btn-outline-primary btn-sm rounded-pill" type="submit">SIGN OUT</button>
            </form>
          </span>
        </footer>
      </main>
    </div>
  );
}

/**
 * Displays the selected-day mobile summary using dashboard-owned resources.
 * @param props - The selected date, current date, weekday and calendar data.
 * @returns The mobile welcome and progress summary.
 */
function DashboardWelcome({
  page,
  selected,
  today,
  date,
  weekday,
}: {
  page: PlannerCalendarData;
  selected: string;
  today: string;
  date: Date;
  weekday: number;
}) {
  const quest = routineGroupFor(page.routineGroups, routineWeekday(weekday));
  const { total, completed, percent } = dayProgress(date, page.checks[selected] ?? [], page.routines);
  return (
    <>
      <div>
        <p className="text-label">YOUR LIFE, YOUR QUEST</p>
        <h1>
          {selected === today
            ? "Today"
            : date.toLocaleDateString("en-US", { weekday: "long" })}
        </h1>
        <p>{quest?.message ?? ""}</p>
      </div>
      <div className="mobile-momentum">
        <strong>{percent}%</strong>
        <span>COMPLETE</span>
      </div>
      <div className="mobile-summary">
        <span>
          <b>{completed}</b> / {total} tasks complete
        </span>
        <span>
          <Sparkles aria-hidden="true" size={12} /> {page.todayPoints} PTS
          EARNED
        </span>
      </div>
    </>
  );
}
