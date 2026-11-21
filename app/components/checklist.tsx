type ChecklistProps = {
  title: string;
  eyebrow: string;
  icon: string;
  items: readonly string[];
  prefix: string;
  checked: string[];
  onToggle: (id: string) => void;
};

export function Checklist({
  title,
  eyebrow,
  icon,
  items,
  prefix,
  checked,
  onToggle,
}: ChecklistProps) {
  const done = items.filter((_, index) =>
    checked.includes(`${prefix}-${index}`),
  ).length;
  return (
    <section className="panel checklist">
      <div className="panel-heading">
        <div className="heading-group">
          <span className="heading-icon" aria-hidden="true">
            {icon}
          </span>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
        </div>
        <span className="count">
          {String(done).padStart(2, "0")} /{" "}
          {String(items.length).padStart(2, "0")}
        </span>
      </div>
      <div className="checklist-items">
        {items.map((item, index) => {
          const id = `${prefix}-${index}`;
          return (
            <label
              className={`task ${checked.includes(id) ? "task-done" : ""}`}
              key={id}
            >
              <input
                type="checkbox"
                checked={checked.includes(id)}
                onChange={() => onToggle(id)}
              />
              <span className="checkmark" aria-hidden="true" />
              <span>{item}</span>
              <span className="task-xp">+10 XP</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
