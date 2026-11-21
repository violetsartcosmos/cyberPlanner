import { useEffect, useState } from "react";
import {
  dateKey,
  isPlannerData,
  STORAGE_KEY,
  type PlannerData,
} from "./planner-utils";

const emptyData: PlannerData = { checks: {}, notes: {} };

export function usePlanner() {
  const [selected, setSelected] = useState("");
  const [today, setToday] = useState("");
  const [data, setData] = useState<PlannerData>(emptyData);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    const now = dateKey(new Date());
    setToday(now);
    setSelected(now);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (!isPlannerData(parsed)) throw new Error("Invalid planner data");
        setData(parsed);
      }
    } catch {
      setStorageError(
        "Saved planner data could not be read. Changes will not be saved; check your browser storage.",
      );
      return;
    }
    setReady(true);
  }, []);

  function updateData(next: PlannerData) {
    setData(next);
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError("");
    } catch {
      setStorageError(
        "Changes could not be saved. Check your browser storage settings.",
      );
    }
  }

  function toggle(id: string) {
    const checked = data.checks[selected] ?? [];
    const next = checked.includes(id)
      ? checked.filter((item) => item !== id)
      : [...checked, id];
    updateData({ ...data, checks: { ...data.checks, [selected]: next } });
  }

  function setNote(note: string) {
    updateData({ ...data, notes: { ...data.notes, [selected]: note } });
  }

  function goToToday() {
    const now = dateKey(new Date());
    setToday(now);
    setSelected(now);
  }

  return {
    selected,
    setSelected,
    today,
    data,
    storageError,
    toggle,
    setNote,
    goToToday,
  };
}
