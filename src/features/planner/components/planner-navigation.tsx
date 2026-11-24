import { useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Gift,
  LayoutDashboard,
  NotebookPen,
  ScrollText,
  Swords,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import cyberplannerLogo from "@/assets/images/cyberplanner-logo.png";
import { levelProgress } from "../../../../shared/planner/profile";

type NavigationItem = readonly [string, string, LucideIcon];
const dashboardNavigation: NavigationItem = ["", "Dashboard", LayoutDashboard];
const calendarNavigation: NavigationItem = ["calendar", "Calendar", CalendarDays];
const questBoardNavigation: NavigationItem = ["quest-board", "Create Quest", Swords];
const questLogNavigation: NavigationItem = ["quest-log", "Quest Log", ScrollText];
const journalNavigation: NavigationItem = ["journal", "Journal", NotebookPen];
const booksNavigation: NavigationItem = ["books", "Library", BookOpen];
const rewardsNavigation: NavigationItem = ["rewards", "Shop", Gift];
const profileNavigation: NavigationItem = ["profile", "Profile", UserRound];

export const navigationSections: readonly NavigationItem[] = [
  dashboardNavigation,
  calendarNavigation,
  questBoardNavigation,
  questLogNavigation,
  journalNavigation,
  booksNavigation,
  rewardsNavigation,
  profileNavigation,
];

type NavigationLinkProps = {
  item: NavigationItem;
  selected: string;
  section: string;
  onNavigate: () => void;
};

function NavigationLink({
  item,
  selected,
  section,
  onNavigate,
}: NavigationLinkProps) {
  const [path, label, Icon] = item;
  return (
    <Link
      className="nav-link"
      to={`${path ? `/${path}` : "/"}?date=${selected}`}
      aria-label={label}
      title={label}
      aria-current={section === path || (path === "calendar" && section === "quests") ? "page" : undefined}
      onClick={onNavigate}
    >
      <Icon aria-hidden="true" size={17} />
      <span className="sidebar-label">{label}</span>
    </Link>
  );
}

type NavigationGroupProps = {
  title: string;
  children: ReactNode;
};

function NavigationGroup({ title, children }: NavigationGroupProps) {
  return (
    <div className="navigation-group">
      <p>{title}</p>
      {children}
    </div>
  );
}

type PlannerNavigationProps = {
  selected: string;
  section: string;
  expanded: boolean;
  totalXp: number;
  setExpanded: Dispatch<SetStateAction<boolean>>;
};

export function PlannerNavigation({
  selected,
  section,
  expanded,
  totalXp,
  setExpanded,
}: PlannerNavigationProps) {
  function getInitialNarrowScreen() {
    return window.matchMedia("(max-width: 991.98px)").matches;
  }
  const [narrowScreen, setNarrowScreen] = useState(getInitialNarrowScreen);
  const menuRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(function syncNarrowScreen() {
    const media = window.matchMedia("(max-width: 991.98px)");
    function onChange(event: MediaQueryListEvent) {
      setNarrowScreen(event.matches);
    }
    media.addEventListener("change", onChange);
    function cleanupNarrowScreen() {
      media.removeEventListener("change", onChange);
    }
    return cleanupNarrowScreen;
  }, []);

  useEffect(function syncMenuKeyboardBehavior() {
    if (!expanded) return;
    if (narrowScreen && !menuRef.current?.contains(document.activeElement)) {
      menuButtonRef.current?.focus();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpanded(false);
        menuButtonRef.current?.focus();
      }
      if (event.key === "Tab" && narrowScreen) {
        const items = menuRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        );
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    function cleanupMenuKeyboardBehavior() {
      document.removeEventListener("keydown", onKeyDown);
    }
    return cleanupMenuKeyboardBehavior;
  }, [expanded, narrowScreen, setExpanded]);

  function closeMenu() {
    setExpanded(false);
    menuButtonRef.current?.focus();
  }

  function handleBrandNavigation() {
    if (expanded && narrowScreen) closeMenu();
  }

  function toggleMenu() {
    setExpanded((current) => !current);
  }

  function handleNavigation() {
    if (expanded && narrowScreen) closeMenu();
  }

  return (
    <>
      {expanded && narrowScreen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Collapse menu"
          tabIndex={-1}
          onClick={closeMenu}
        />
      )}
      <aside
        className={`sidebar ${expanded ? "sidebar-open" : ""}`}
        id="planner-sidebar"
        ref={menuRef}
        role={expanded && narrowScreen ? "dialog" : undefined}
        aria-modal={expanded && narrowScreen ? true : undefined}
        aria-label="Planner navigation"
      >
        <div className="sidebar-heading">
          <Link
            className="brand"
            to={`/?date=${selected}`}
            aria-label="CyberPlanner home"
            title="CyberPlanner home"
            onClick={handleBrandNavigation}
          >
            <span className="brand-logo-frame">
              <img
                className="brand-logo"
                src={cyberplannerLogo}
                alt=""
              />
            </span>
          </Link>
          <button
            ref={menuButtonRef}
            className="sidebar-toggle btn"
            type="button"
            aria-label={expanded ? "Collapse menu" : "Expand menu"}
            title={expanded ? "Collapse menu" : "Expand menu"}
            aria-expanded={expanded}
            aria-controls="planner-navigation"
            onClick={toggleMenu}
          >
            {expanded ? (
              <ChevronsLeft aria-hidden="true" size={20} />
            ) : (
              <ChevronsRight aria-hidden="true" size={20} />
            )}
          </button>
        </div>
        <div className="sidebar-level" aria-label={`Level ${levelProgress(totalXp).level}`}>
          <strong>LVL {levelProgress(totalXp).level}</strong>
          <span className="sidebar-label">{totalXp} XP</span>
        </div>
        <nav
          className="section-navigation nav flex-column flex-nowrap"
          id="planner-navigation"
          aria-label="Planner sections"
        >
          <NavigationGroup title="YOUR SPACE">
            <NavigationLink item={dashboardNavigation} selected={selected} section={section} onNavigate={handleNavigation} />
            <NavigationLink item={calendarNavigation} selected={selected} section={section} onNavigate={handleNavigation} />
          </NavigationGroup>
          <NavigationGroup title="PLANNER">
            <NavigationLink item={questBoardNavigation} selected={selected} section={section} onNavigate={handleNavigation} />
            <NavigationLink item={questLogNavigation} selected={selected} section={section} onNavigate={handleNavigation} />
            <NavigationLink item={journalNavigation} selected={selected} section={section} onNavigate={handleNavigation} />
            <NavigationLink item={booksNavigation} selected={selected} section={section} onNavigate={handleNavigation} />
          </NavigationGroup>
          <NavigationGroup title="YOUR REWARDS">
            <NavigationLink item={rewardsNavigation} selected={selected} section={section} onNavigate={handleNavigation} />
          </NavigationGroup>
          <Link
            className="sidebar-profile"
            to={`/profile?date=${selected}`}
            aria-label="Profile"
            title="Profile"
            aria-current={section === "profile" ? "page" : undefined}
            onClick={handleNavigation}
          >
            <span className="sidebar-avatar" aria-hidden="true">
              V
            </span>
            <span className="sidebar-label">
              <strong>Violet</strong>
              <small>VIEW PROFILE</small>
            </span>
          </Link>
        </nav>
      </aside>
    </>
  );
}
