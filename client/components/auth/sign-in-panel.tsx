type SignInPanelProps = {
  missingConfiguration: readonly string[];
  authError: string;
};

export function SignInPanel({
  missingConfiguration,
  authError,
}: SignInPanelProps) {
  return (
    <main className="app-shell sign-in-shell">
      <section className="panel sign-in-panel">
        <a className="brand" href="/" aria-label="CyberPlanner home">
          <span className="brand-mark">✳</span>
          <span>
            CYBER<span>PLANNER</span>
            <small>LIFE MANAGEMENT SYSTEM</small>
          </span>
        </a>
        <p className="eyebrow accent">YOUR PERSONAL COMMAND CENTER</p>
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
              {missingConfiguration.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p>
              Sign in with the Google account configured for this private
              planner.
            </p>
            <a className="google-login" href="/auth/google">
              SIGN IN WITH GOOGLE
            </a>
          </>
        )}
      </section>
    </main>
  );
}
