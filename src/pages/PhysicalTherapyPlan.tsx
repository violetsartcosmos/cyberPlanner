import { useState } from "react";
import { useFetcher } from "react-router";
import { useActionNotifications, useNotification } from "@/components/notifications";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";
import africanBeautyTree from "@/assets/images/africanbeautytree.jpg";
import type { PlannerActionResult, TherapyPlan } from "../../shared/planner/types";

const pad = (n: number) => String(n).padStart(2, "0");

export default function PhysicalTherapyPlan() {
  const { page, selected, date } = usePlannerContext();
  const { therapySessions, earnedPoints } = page.therapy;
  const fetcher = useFetcher<PlannerActionResult>();
  useActionNotifications(fetcher);
  useNotification(fetcher.state === "idle" && fetcher.data?.earnedAchievements?.length
    ? `Achievement milestone earned: ${fetcher.data.earnedAchievements.join(", ")}!` : "", "notice");
  const [sessionIdx, setSessionIdx] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const session = therapySessions[sessionIdx] ?? therapySessions[0];
  const countFor = (therapySession: TherapyPlan["therapySessions"][number]) => therapySession.exercises.filter((exercise) => exercise.completed).length;
  const total = therapySessions.reduce((n, s) => n + s.exercises.length, 0);
  const complete = therapySessions.reduce((n, s) => n + countFor(s), 0);
  const pct = total ? Math.round((complete / total) * 100) : 0;
  const shortDate = date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).replace(".", "");

  if (!session) return <p>No physical therapy sessions are configured.</p>;

  const sessionDone = countFor(session);
  const toggle = (exerciseId: string, completed: boolean) => {
    fetcher.submit({
      intent: "toggle_physical_therapy",
      date: selected,
      sessionId: session.id,
      exerciseId,
      completed: String(completed),
    }, { method: "post" });
  };

  return (
    <div className="pt-page container-fluid px-3 px-lg-5 py-4">
      <div className="row g-4">
        <div className="col-12 col-xl-8">
          {/* Hero / mission progress */}
          <section className="pt-card pt-hero p-4 mb-4">
            <div className="pt-label mb-3">Your daily Therapy Session</div>
            <h2 className="pt-hero-title">{shortDate}</h2>
            <p className="pt-muted mb-4">Short sessions, done gently. A little progress is still progress.</p>
            <div className="d-flex justify-content-between align-items-end mb-2">
              <span className="pt-label pt-ink">Mission progress</span>
              <span className="pt-pct">{pct}%</span>
            </div>
            <div className="pt-bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="pt-label mt-2">{complete} / {total} exercises complete</div>
          </section>

          {/* Session toggle */}
          <div className="pt-seg mb-4" role="tablist" aria-label="Session">
            {therapySessions.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === sessionIdx}
                className={i === sessionIdx ? "active" : ""}
                onClick={() => { setSessionIdx(i); setOpen(null); }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Quest list */}
          <section className="pt-card p-4">
            <div className="d-flex justify-content-between align-items-center pb-3 pt-rule">
              <div>
                <div className="pt-label pt-pink">Your daily quests</div>
                <h2 className="pt-h2 mb-0">{session.title}</h2>
              </div>
              <div className="pt-label">{pad(sessionDone)} / {pad(session.exercises.length)}</div>
            </div>

            <ul className="list-unstyled mb-0">
              {session.exercises.map((ex) => {
                const k = `${session.id}:${ex.id}`;
                const checked = ex.completed;
                const isOpen = open === k;
                return (
                  <li key={k} className="pt-rule py-3">
                    <div className="d-flex align-items-start gap-3">
                      <input
                        id={k}
                        type="checkbox"
                        className="pt-check"
                        checked={checked}
                        disabled={fetcher.state !== "idle"}
                        onChange={(event) => toggle(ex.id, event.target.checked)}
                      />
                      <label htmlFor={k} className={`flex-grow-1 ${checked ? "pt-struck" : ""}`}>
                        <span className="pt-name">{ex.name}</span>
                        <span className="pt-rx d-block">{ex.prescription}</span>
                      </label>
                      <span className="pt-label text-nowrap">+{ex.points} pts</span>
                    </div>
                    <button
                      type="button"
                      className="pt-link ms-5 mt-1"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : k)}
                    >
                      {isOpen ? "Hide guide" : "How to do it"}
                    </button>
                    {isOpen && (
                      <div className="pt-guide ms-5 mt-2">
                        <p className="mb-2">{ex.instructions}</p>
                        <p className="mb-0 pt-muted"><strong className="pt-ink">Why:</strong> {ex.purpose}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Side column */}
        <aside className="col-12 col-xl-4">
          <section className="pt-card p-4 mb-4">
            <div className="pt-label mb-1">Your timeline</div>
            <h2 className="pt-h2 mb-3">Sessions for this date</h2>
            <ul className="list-unstyled mb-0">
              {therapySessions.map((s, i) => (
                <li key={s.id} className="pt-rule py-3 d-flex justify-content-between align-items-center">
                  <button type="button" className="pt-linkplain" onClick={() => { setSessionIdx(i); setOpen(null); }}>
                    {s.label}
                  </button>
                  <span className="pt-label">{countFor(s)} / {s.exercises.length}</span>
                </li>
              ))}
            </ul>
            <div className="pt-label mt-3 pt-cyan">{earnedPoints} pts earned on this date</div>
          </section>

          <section className="pt-card pt-note p-4">
           <img className="img-fluid" src={africanBeautyTree} alt="Black beauty tree" />
          </section>
        </aside>
      </div>
    </div>
  );
}
