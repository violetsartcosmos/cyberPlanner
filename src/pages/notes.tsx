import { NotesEditor } from "@/features/planner/components/notes-editor";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";

export default function NotesRoute() {
  const { page, selected, onSelectDate } = usePlannerContext();
  return (
    <div className="row justify-content-center">
      <div className="col-12 col-lg-10 col-xl-8">
        <NotesEditor selected={selected} note={page.note} onSelect={onSelectDate} />
      </div>
    </div>
  );
}
