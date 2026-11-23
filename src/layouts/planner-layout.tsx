import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Outlet, useLoaderData, useLocation } from "react-router";
import {
  navigationSections,
  PlannerNavigation,
} from "@/features/planner/components/planner-navigation";
import { DailyAffirmation } from "@/features/planner/components/dashboard-widgets";
import { SignInPanel } from "@/features/auth/components/sign-in-panel";
import { usePlannerController } from "@/features/planner/hooks/use-planner-controller";
import { plannerLoader } from "@/features/planner/services/planner-route";
import type { AuthenticatedPlannerPage } from "@/features/planner/types/planner-outlet-context";
import witchyAction from "@/assets/images/witchyaction.png";
import { dailyQuests } from "../../shared/planner/definitions";
import { dayProgress } from "../../shared/planner/utils";

function getNavigationLabel(section: string) {
  for (const [path, label] of navigationSections) {
    if (path === section) return label;
  }
  return "Page not found";
}

export default function PlannerLayout() {
  const page = useLoaderData<typeof plannerLoader>();

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

function AuthenticatedPlannerLayout({ page }: { page: AuthenticatedPlannerPage }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    date,
    selected,
    today,
    weekday,
    checked,
    outletContext,
    celebration,
    setCelebration,
    toggleFetcher,
  } = usePlannerController(page);
  const section = location.pathname === "/" ? "" : location.pathname.slice(1);
  const isDashboard = section === "";
  const isRewards = section === "rewards";
  const { total, completed, percent } = dayProgress(date, checked);
  const pageHeadingSection = section === "quests" ? "calendar" : section;

  return (
    <div className={`app-shell authenticated-shell ${menuOpen ? "menu-expanded" : ""}`}>
      {isDashboard && celebration > 0 && (
        <div className="task-celebration" key={celebration} aria-hidden="true">
          <img src={witchyAction} alt="" />
        </div>
      )}
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
          {isDashboard && <>
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
              <div>
                <p className="text-label">YOUR LIFE, YOUR QUEST</p>
                <h1>
                  {selected === today
                    ? "Today"
                    : date.toLocaleDateString("en-US", { weekday: "long" })}
                </h1>
                <p>{dailyQuests[weekday].message}</p>
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
        {toggleFetcher.data?.error && (
          <div className="alert alert-danger" role="alert">
            {toggleFetcher.data.error}
          </div>
        )}
        {toggleFetcher.data?.earnedAchievements && toggleFetcher.data.earnedAchievements.length > 0 && (
          <div className="alert alert-info" role="status">
            Achievement milestone earned: {toggleFetcher.data.earnedAchievements.join(", ")}!
          </div>
        )}
        {page.newlyEarned.length > 0 && (
          <div className="alert alert-info" role="status">
            Achievement milestone earned: {page.newlyEarned.join(", ")}!
          </div>
        )}
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
