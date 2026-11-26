import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useActionNotifications, useNotification } from "@/components/notifications";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";
import africanBeautyTree from "@/assets/images/africanbeautytree.jpg";
import type { RoutineActionResult, TherapyPlan } from "../../shared/planner/types";
import { therapyLoader } from "@/features/therapy/services/therapy-route";

/**
 * Formats an exercise count with at least two digits.
 * @param count - The number of exercises.
 * @returns The padded count label.
 */
const padCount = (count: number) => String(count).padStart(2, "0");

/**
 * Displays assigned therapy sessions and submits dated exercise completions.
 * @returns The therapy progress, exercise controls and instructions.
 */
export default function PhysicalTherapyPlan() {
  const { selected, date } = usePlannerContext();
  const { therapySessions, earnedPoints } = useLoaderData<typeof therapyLoader>();
  const fetcher = useFetcher<RoutineActionResult>();
  useActionNotifications(fetcher);
  useNotification(fetcher.state === "idle" && fetcher.data?.earnedAchievements?.length
    ? `Achievement milestone earned: ${fetcher.data.earnedAchievements.join(", ")}!` : "", "notice");
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const session = therapySessions[selectedSessionIndex] ?? therapySessions[0];
  const countFor = (therapySession: TherapyPlan["therapySessions"][number]) => therapySession.exercises.filter((exercise) => exercise.completed).length;
  const totalExerciseCount = therapySessions.reduce((exerciseCount, therapySession) => exerciseCount + therapySession.exercises.length, 0);
  const completedExerciseCount = therapySessions.reduce((exerciseCount, therapySession) => exerciseCount + countFor(therapySession), 0);
  const completionPercentage = totalExerciseCount ? Math.round((completedExerciseCount / totalExerciseCount) * 100) : 0;
  const shortDate = date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).replace(".", "");

  if (!session) return <p>No physical therapy sessions are configured.</p>;

  const sessionDone = countFor(session);
  /**
   * Saves the exercise's checked state for the selected session and date.
   * @param exerciseId - The exercise being checked or unchecked.
   * @param completed - Its new checked state.
   * @returns Nothing; the resource action revalidates the therapy plan.
   */
  function toggle(exerciseId: string, completed: boolean) {
    fetcher.submit({
      completed: String(completed),
    }, { method: "put", action: `/therapy/sessions/${encodeURIComponent(session.id)}/exercises/${encodeURIComponent(exerciseId)}/completions/${selected}` });
  }

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
              <span className="pt-pct">{completionPercentage}%</span>
            </div>
            <div className="pt-bar"><i style={{ width: `${completionPercentage}%` }} /></div>
            <div className="pt-label mt-2">{completedExerciseCount} / {totalExerciseCount} exercises complete</div>
          </section>

          {/* Session toggle */}
          <div className="pt-seg mb-4" role="tablist" aria-label="Session">
            {therapySessions.map((therapySession, sessionIndex) => (
              <button
                key={therapySession.id}
                type="button"
                role="tab"
                aria-selected={sessionIndex === selectedSessionIndex}
                className={sessionIndex === selectedSessionIndex ? "active" : ""}
                onClick={() => { setSelectedSessionIndex(sessionIndex); setExpandedExerciseId(null); }}
              >
                {therapySession.label}
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
              <div className="pt-label">{padCount(sessionDone)} / {padCount(session.exercises.length)}</div>
            </div>

            <ul className="list-unstyled mb-0">
              {session.exercises.map((exercise) => {
                const exerciseKey = `${session.id}:${exercise.id}`;
                const checked = exercise.completed;
                const isOpen = expandedExerciseId === exerciseKey;
                return (
                  <li key={exerciseKey} className="pt-rule py-3">
                    <div className="d-flex align-items-start gap-3">
                      <input
                        id={exerciseKey}
                        type="checkbox"
                        className="pt-check"
                        checked={checked}
                        disabled={fetcher.state !== "idle"}
                        onChange={(event) => toggle(exercise.id, event.target.checked)}
                      />
                      <label htmlFor={exerciseKey} className={`flex-grow-1 ${checked ? "pt-struck" : ""}`}>
                        <span className="pt-name">{exercise.name}</span>
                        <span className="pt-rx d-block">{exercise.prescription}</span>
                      </label>
                      <span className="pt-label text-nowrap">+{exercise.points} pts</span>
                    </div>
                    <button
                      type="button"
                      className="pt-link ms-5 mt-1"
                      aria-expanded={isOpen}
                      onClick={() => setExpandedExerciseId(isOpen ? null : exerciseKey)}
                    >
                      {isOpen ? "Hide guide" : "How to do it"}
                    </button>
                    {isOpen && (
                      <div className="pt-guide ms-5 mt-2">
                        <p className="mb-2">{exercise.instructions}</p>
                        <p className="mb-0 pt-muted"><strong className="pt-ink">Why:</strong> {exercise.purpose}</p>
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
              {therapySessions.map((therapySession, sessionIndex) => (
                <li key={therapySession.id} className="pt-rule py-3 d-flex justify-content-between align-items-center">
                  <button type="button" className="pt-linkplain" onClick={() => { setSelectedSessionIndex(sessionIndex); setExpandedExerciseId(null); }}>
                    {therapySession.label}
                  </button>
                  <span className="pt-label">{countFor(therapySession)} / {therapySession.exercises.length}</span>
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
