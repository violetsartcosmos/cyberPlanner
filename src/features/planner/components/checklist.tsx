import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";

type ChecklistProps = {
  title: string;
  label: string;
  icon: ReactNode;
  sectionHref: string;
  items: readonly string[];
  prefix: string;
  checked: string[];
  onToggle: (id: string) => void;
  ids?: readonly string[];
  earnedIds?: readonly string[];
  disabled?: boolean;
  taskLinks?: readonly (string | null)[];
  illustration?: string;
};

function ChecklistItem({
  item,
  id,
  checked,
  earned,
  disabled,
  taskLink,
  onToggle,
}: {
  item: string;
  id: string;
  checked: boolean;
  earned: boolean;
  disabled: boolean;
  taskLink?: string | null;
  onToggle: (id: string) => void;
}) {
  function handleTaskToggle() {
    onToggle(id);
  }

  return (
    <div className="task-row" key={id}>
      <label className={`task ${checked ? "task-done" : ""}`}>
        <input
          className="form-check-input"
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={handleTaskToggle}
        />
        <span>{item}</span>
        <span className="task-xp">
          {earned ? "EARNED" : "+10 PTS"}
        </span>
      </label>
      {taskLink && (
        <a
          className="task-source-link"
          href={taskLink}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open source email for ${item}`}
        >
          EMAIL <ArrowUpRight aria-hidden="true" size={12} />
        </a>
      )}
    </div>
  );
}

function buildTaskIds(items: readonly string[], ids: readonly string[] | undefined, prefix: string) {
  const taskIds: string[] = [];
  for (let index = 0; index < items.length; index += 1) {
    taskIds.push(ids?.[index] ?? `${prefix}-${index}`);
  }
  return taskIds;
}

function countCompleted(ids: readonly string[], checked: readonly string[]) {
  let count = 0;
  for (const id of ids) {
    if (checked.includes(id)) count += 1;
  }
  return count;
}

export function Checklist({
  title,
  label,
  icon,
  sectionHref,
  items,
  prefix,
  checked,
  onToggle,
  ids,
  earnedIds = [],
  disabled = false,
  taskLinks,
  illustration,
}: ChecklistProps) {
  const taskIds = buildTaskIds(items, ids, prefix);
  const done = countCompleted(taskIds, checked);
  const taskRows: ReactNode[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const id = taskIds[index];
    taskRows.push(
      <ChecklistItem
        key={id}
        item={items[index]}
        id={id}
        checked={checked.includes(id)}
        earned={earnedIds.includes(id)}
        disabled={disabled}
        taskLink={taskLinks?.[index]}
        onToggle={onToggle}
      />,
    );
  }

  return (
    <section className={`card p-3 checklist ${illustration ? "checklist-illustrated" : ""}`}>
      <div className="panel-heading">
        <Link className="heading-group section-heading-link" to={sectionHref}>
          <span className="heading-icon" aria-hidden="true">
            {icon}
          </span>
          <div>
            <p className="text-label">{label}</p>
            <h2 className="h5">{title}</h2>
          </div>
        </Link>
        <span className="count">
          {String(done).padStart(2, "0")} /{" "}
          {String(items.length).padStart(2, "0")}
        </span>
      </div>
      <div className="checklist-body">
        <div className="checklist-items">
          {taskRows}
        </div>
        {illustration && <img className="checklist-art" src={illustration} alt="" />}
      </div>
    </section>
  );
}
