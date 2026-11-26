import { useOutletContext } from "react-router";
import type {
  PlannerCalendarOutletContext,
  PlannerOutletContext,
} from "../types/planner-outlet-context";

export function usePlannerContext() {
  return useOutletContext<PlannerOutletContext>();
}

export function usePlannerCalendarContext() {
  return useOutletContext<PlannerCalendarOutletContext>();
}
