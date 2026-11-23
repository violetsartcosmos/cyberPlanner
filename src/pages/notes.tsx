import { NotesEditor } from "@/features/planner/components/notes-editor";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";

export default function NotesRoute() {
  const { page, selected, onSelectDate } = usePlannerContext();
  return (
    <div className="dashboard-grid">
      <aside className="left-column" />
      <div className="main-column">
        <NotesEditor selected={selected} note={page.note} onSelect={onSelectDate} />
      </div>
      <aside className="right-column" />
    </div>
  );
}
