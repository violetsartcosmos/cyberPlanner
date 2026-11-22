import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  ChevronsLeft,
  ChevronsRight,
  Cloud,
  Gift,
  Heart,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  NotebookPen,
  Repeat2,
  Sparkles,
  Swords,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";

type NavigationItem = readonly [string, string, LucideIcon];
type NavigationGroup = {
  title: string;
  items: readonly NavigationItem[];
};

const navigationGroups: readonly NavigationGroup[] = [
  {
    title: "YOUR SPACE",
    items: [
      ["", "Dashboard", LayoutDashboard],
      ["calendar", "Calendar", CalendarDays],
      ["quest-board", "Quest board", Swords],
    ],
  },
  {
    title: "PLANNER",
    items: [
      ["quests", "Daily quests", ListChecks],
      ["routines", "Routines", Repeat2],
      ["weekly", "Weekly protocol", CalendarRange],
      ["synced-tasks", "Synced tasks", ListTodo],
      ["notes", "Notes", NotebookPen],
    ],
  },
  {
    title: "YOUR PROGRESS",
    items: [
      ["progress", "Progress", ChartNoAxesCombined],
      ["rewards", "Rewards", Gift],
      ["reminder", "Reminder", Heart],
      ["google", "Google sync", Cloud],
    ],
  },
];

export const navigationSections: readonly NavigationItem[] = [
  ...navigationGroups.flatMap((group) => group.items),
  ["profile", "Profile", UserRound],
];

type PlannerNavigationProps = {
  selected: string;
  section: string;
  expanded: boolean;
  setExpanded: Dispatch<SetStateAction<boolean>>;
};

export function PlannerNavigation({
  selected,
  section,
  expanded,
  setExpanded,
}: PlannerNavigationProps) {
  const [narrowScreen, setNarrowScreen] = useState(() =>
    window.matchMedia("(max-width: 850px)").matches,
  );
  const menuRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 850px)");
    function onChange(event: MediaQueryListEvent) {
      setNarrowScreen(event.matches);
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
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
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded, narrowScreen, setExpanded]);

  function closeMenu() {
    setExpanded(false);
    menuButtonRef.current?.focus();
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
            onClick={() => {
              if (expanded && narrowScreen) closeMenu();
            }}
          >
            <span className="brand-mark">
              <Sparkles aria-hidden="true" size={24} />
            </span>
            <span className="sidebar-brand-text">
              CYBER<span>PLANNER</span>
              <small>LIFE MANAGEMENT SYSTEM</small>
            </span>
          </Link>
          <button
            ref={menuButtonRef}
            className="sidebar-toggle"
            type="button"
            aria-label={expanded ? "Collapse menu" : "Expand menu"}
            title={expanded ? "Collapse menu" : "Expand menu"}
            aria-expanded={expanded}
            aria-controls="planner-navigation"
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? (
              <ChevronsLeft aria-hidden="true" size={20} />
            ) : (
              <ChevronsRight aria-hidden="true" size={20} />
            )}
          </button>
        </div>
        <nav
          className="section-navigation"
          id="planner-navigation"
          aria-label="Planner sections"
        >
          {navigationGroups.map((group) => (
            <div className="navigation-group" key={group.title}>
              <p>{group.title}</p>
              {group.items.map(([path, label, Icon]) => (
                <Link
                  key={path}
                  to={`${path ? `/${path}` : "/"}?date=${selected}`}
                  aria-label={label}
                  title={label}
                  aria-current={section === path ? "page" : undefined}
                  onClick={() => {
                    if (expanded && narrowScreen) closeMenu();
                  }}
                >
                  <Icon aria-hidden="true" size={17} />
                  <span className="sidebar-label">{label}</span>
                </Link>
              ))}
            </div>
          ))}
          <Link
            className="sidebar-profile"
            to={`/profile?date=${selected}`}
            aria-label="Profile"
            title="Profile"
            aria-current={section === "profile" ? "page" : undefined}
            onClick={() => {
              if (expanded && narrowScreen) closeMenu();
            }}
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
