import { useEffect, useRef, useState } from "react";
import {
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";
import type { ExternalTask, PlannerActionResult } from "../../../../shared/planner/types";
import {
  dateKey,
  externalTaskId,
  isExternalTaskId,
  parseDate,
  weekdayIndex,
} from "../../../../shared/planner/utils";
import type { PlannerOutletContext } from "../types/planner-outlet-context";
import type { AuthenticatedPlannerPage } from "../types/planner-outlet-context";

function incrementCelebration(previous: number) {
  return previous + 1;
}

function getCompletedExternalTaskIds(tasks: readonly ExternalTask[]) {
  const ids: string[] = [];
  for (const task of tasks) {
    if (task.completed) {
      ids.push(externalTaskId(task.source, task.externalId));
    }
  }
  return ids;
}

export function usePlannerController(page: AuthenticatedPlannerPage) {
  const navigate = useNavigate();
  const location = useLocation();
  const toggleFetcher = useFetcher<PlannerActionResult>();
  const [today, setToday] = useState(page.today);
  const [celebration, setCelebration] = useState(0);
  const pendingCelebration = useRef(false);
  const toggleInFlight = useRef(false);
  const selected = page.selected;
  const date = parseDate(selected);
  const weekday = weekdayIndex(date);
  const checked = page.checks[selected] ?? [];
  const externalChecked = getCompletedExternalTaskIds(page.tasks);

  useEffect(function syncToggleFetcher() {
    if (toggleFetcher.state !== "idle") {
      toggleInFlight.current = true;
    } else if (toggleInFlight.current) {
      toggleInFlight.current = false;
      if (pendingCelebration.current && toggleFetcher.data?.ok && location.pathname === "/") {
        setCelebration(incrementCelebration);
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

  function toggleTask(taskId: string) {
    const completed = isExternalTaskId(taskId)
      ? !externalChecked.includes(taskId)
      : !checked.includes(taskId);
    pendingCelebration.current = location.pathname === "/" && completed;
    if (isExternalTaskId(taskId)) {
      const separator = taskId.indexOf(":");
      const source = taskId.slice(0, separator);
      const externalId = taskId.slice(separator + 1);
      toggleFetcher.submit(
        {
          intent: "toggle_external",
          source,
          externalId,
          date: selected,
          completed: String(completed),
        },
        { method: "post" },
      );
      return;
    }
    toggleFetcher.submit(
      {
        intent: "toggle_builtin",
        taskId,
        date: selected,
        completed: String(completed),
      },
      { method: "post" },
    );
  }

  function selectDate(next: string) {
    navigate(`${location.pathname}?date=${next}`);
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
    checked,
    externalChecked,
    tasksDisabled: toggleFetcher.state !== "idle",
    onToggleTask: toggleTask,
    onSelectDate: selectDate,
    onSelectToday: selectToday,
  };

  return {
    date,
    selected,
    today: today || page.today,
    weekday,
    checked,
    externalChecked,
    outletContext,
    celebration,
    setCelebration,
    toggleFetcher,
  };
}
