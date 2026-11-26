import { useEffect, useRef, useState } from "react";
import {
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";
import type { PlannerCalendarData, RoutineActionResult } from "../../../../shared/planner/types";
import {
  dateKey,
  externalTaskId,
  isExternalTaskId,
  parseDate,
  weekdayIndex,
} from "../../../../shared/planner/utils";
import type { PlannerOutletContext } from "../types/planner-outlet-context";
import type { AuthenticatedPlannerPage } from "../types/planner-outlet-context";

/**
 * Coordinates selected-date state shared by planner pages.
 * @param page - The authenticated planner shell from the root loader.
 * @returns The selected date, current day and navigation callbacks.
 */
export function usePlannerController(page: AuthenticatedPlannerPage) {
  const navigate = useNavigate();
  const location = useLocation();
  const [today, setToday] = useState(page.today);
  const selected = page.selected;
  const date = parseDate(selected);
  const weekday = weekdayIndex(date);

  useEffect(function syncTodayWithServer() {
    const serverToday = page.today;
    let timer: ReturnType<typeof setTimeout>;
    function updateToday() {
      const now = new Date();
      const localToday = dateKey(now);
      setToday(localToday);
      if (!new URLSearchParams(window.location.search).has("date")) {
        if (localToday !== serverToday) {
          navigate(`${location.pathname}?date=${localToday}${location.hash}`, { replace: true });
        }
      }
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      clearTimeout(timer);
      timer = setTimeout(updateToday, midnight.getTime() - now.getTime());
    }
    updateToday();
    window.addEventListener("focus", updateToday);
    function cleanupTodaySync() {
      clearTimeout(timer);
      window.removeEventListener("focus", updateToday);
    }
    return cleanupTodaySync;
  }, [navigate, page, location.pathname, location.hash]);

  /**
   * Navigates to a selected planner date.
   * @param nextDate - The target date in YYYY-MM-DD format.
   * @returns Nothing; the router updates the selected-date URL.
   */
  function selectDate(nextDate: string) {
    navigate(`${location.pathname}?date=${nextDate}`);
  }

  function selectToday() {
    selectDate(today);
  }

  const outletContext: PlannerOutletContext = {
    page,
    selected,
    today: today || page.today,
    date,
    weekday,
    onSelectDate: selectDate,
    onSelectToday: selectToday,
  };

  return {
    date,
    selected,
    today: today || page.today,
    weekday,
    outletContext,
  };
}

/**
 * Submits task completion changes for the selected dashboard or calendar date.
 * @param page - The calendar resources loaded for the current route.
 * @param context - Shared selected-date navigation and shell data.
 * @returns Task checks, write state and the nested page outlet context.
 */
export function usePlannerTaskController(
  page: PlannerCalendarData,
  context: PlannerOutletContext,
) {
  const location = useLocation();
  const toggleFetcher = useFetcher<RoutineActionResult>();
  const [celebration, setCelebration] = useState(0);
  const pendingCelebration = useRef(false);
  const toggleInFlight = useRef(false);
  const checked = page.checks[context.selected] ?? [];
  const externalChecked: string[] = [];
  for (const task of page.tasks) {
    if (task.completed) externalChecked.push(externalTaskId(task.source, task.externalId));
  }

  useEffect(function syncToggleFetcher() {
    if (toggleFetcher.state !== "idle") {
      toggleInFlight.current = true;
    } else if (toggleInFlight.current) {
      toggleInFlight.current = false;
      if (pendingCelebration.current && toggleFetcher.data &&
          toggleFetcher.data.status >= 200 && toggleFetcher.data.status < 300 && location.pathname === "/") {
        setCelebration((previous) => previous + 1);
      }
      pendingCelebration.current = false;
    }
  }, [toggleFetcher.state, toggleFetcher.data, location.pathname]);

  useEffect(function clearCelebrationTimer() {
    if (!celebration) return;
    function clearCelebration() {
      setCelebration(0);
    }
    const timer = setTimeout(clearCelebration, 1800);
    function cleanupCelebrationTimer() {
      clearTimeout(timer);
    }
    return cleanupCelebrationTimer;
  }, [celebration]);

  /**
   * Saves the checked state through the task's resource URL.
   * @param taskId - The routine ID or source-prefixed external task ID.
   * @returns Nothing; the fetcher revalidates the calendar loader.
   */
  function toggleTask(taskId: string) {
    const isExternalTask = isExternalTaskId(taskId);
    const completed = isExternalTask
      ? !externalChecked.includes(taskId)
      : !checked.includes(taskId);
    pendingCelebration.current = location.pathname === "/" && completed;
    if (isExternalTask) {
      const separator = taskId.indexOf(":");
      const source = taskId.slice(0, separator);
      const externalId = taskId.slice(separator + 1);
      toggleFetcher.submit(
        { completed: String(completed) },
        { method: "put", action: `/external-tasks/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}/completions/${context.selected}` },
      );
      return;
    }
    toggleFetcher.submit(
      { completed: String(completed) },
      { method: "put", action: `/routines/${encodeURIComponent(taskId)}/completions/${context.selected}` },
    );
  }

  const outletContext = {
    ...context,
    ...page,
    checked,
    externalChecked,
    tasksDisabled: toggleFetcher.state !== "idle",
    celebration,
    onToggleTask: toggleTask,
  };

  return { outletContext, celebration, toggleFetcher };
}
