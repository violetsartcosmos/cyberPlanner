import type { ReactNode } from "react";
import cyberplannerLogo from "@/assets/images/cyberplanner-logo.png";

type SignInPanelProps = {
  missingConfiguration: readonly string[];
  authError: string;
};

export function SignInPanel({
  missingConfiguration,
  authError,
}: SignInPanelProps) {
  const configurationItems: ReactNode[] = [];
  for (const name of missingConfiguration) {
    configurationItems.push(<li key={name}>{name}</li>);
  }

  return (
    <main className="app-shell sign-in-shell">
      <section className="card p-3 sign-in-panel">
        <a className="brand" href="/" aria-label="CyberPlanner home">
          <span className="brand-logo-frame brand-logo-sign-in">
            <img
              className="brand-logo"
              src={cyberplannerLogo}
              alt=""
            />
          </span>
        </a>
        <p className="text-label accent">CYBER PLANNER</p>
        <h1>
          YOUR LIFE, <em>YOUR QUEST.</em>
        </h1>
        {authError && (
          <p className="inline-error" role="alert">
            Google sign-in failed: {authError}
          </p>
        )}
        {missingConfiguration.length ? (
          <>
            <p>
              Add the following server environment variables before signing in:
            </p>
            <ul className="configuration-list">
              {configurationItems}
            </ul>
          </>
        ) : (
          <>
            <p>
              Sign in with the Google account configured for this private
              planner.
            </p>
            <a className="btn btn-outline-primary rounded-pill mt-3" href="/auth/google">
              SIGN IN WITH GOOGLE
            </a>
          </>
        )}
      </section>
    </main>
  );
}
