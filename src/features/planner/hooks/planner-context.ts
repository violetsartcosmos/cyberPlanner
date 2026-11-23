import { useOutletContext } from "react-router";
import type { PlannerOutletContext } from "../types/planner-outlet-context";

export function usePlannerContext() {
  return useOutletContext<PlannerOutletContext>();
}
