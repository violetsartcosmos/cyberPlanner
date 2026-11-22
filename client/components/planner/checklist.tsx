import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUpRight, Check } from "lucide-react";

type ChecklistProps = {
  title: string;
  eyebrow: string;
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

export function Checklist({
  title,
  eyebrow,
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
  const taskIds = items.map((_, index) => ids?.[index] ?? `${prefix}-${index}`);
  const done = taskIds.filter((id) => checked.includes(id)).length;
  return (
    <section className={`panel checklist ${illustration ? "checklist-illustrated" : ""}`}>
      <div className="panel-heading">
        <Link className="heading-group section-heading-link" to={sectionHref}>
          <span className="heading-icon" aria-hidden="true">
            {icon}
          </span>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
        </Link>
        <span className="count">
          {String(done).padStart(2, "0")} /{" "}
          {String(items.length).padStart(2, "0")}
        </span>
      </div>
      <div className="checklist-body">
        <div className="checklist-items">
          {items.map((item, index) => {
            const id = taskIds[index];
            const earned = earnedIds.includes(id);
            return (
              <div className="task-row" key={id}>
                <label
                  className={`task ${checked.includes(id) ? "task-done" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked.includes(id)}
                    disabled={disabled}
                    onChange={() => onToggle(id)}
                  />
                  <span className="checkmark" aria-hidden="true">
                    <Check size={12} />
                  </span>
                  <span>{item}</span>
                  <span className="task-xp">
                    {earned ? "EARNED" : "+10 PTS"}
                  </span>
                </label>
                {taskLinks?.[index] && (
                  <a
                    className="task-source-link"
                    href={taskLinks[index] ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open source email for ${item}`}
                  >
                    EMAIL <ArrowUpRight aria-hidden="true" size={12} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
        {illustration && <img className="checklist-art" src={illustration} alt="" />}
      </div>
    </section>
  );
}
