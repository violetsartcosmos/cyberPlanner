import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, useRouteError } from "react-router";
import Home, { action, loader } from "./routes/home";
import "./styles/app.scss";

function PageError() {
  const error = useRouteError();
  return (
    <main className="app-shell sign-in-shell">
      <p role="alert">{error instanceof Error ? error.message : "Could not load the planner."}</p>
    </main>
  );
}

function HydrateFallback() {
  return <main className="app-shell sign-in-shell">Loading planner...</main>;
}

const router = createBrowserRouter([{
  path: "/:section?",
  Component: Home,
  loader,
  action,
  HydrateFallback,
  ErrorBoundary: PageError,
}]);

const root = document.getElementById("root");
if (!root) throw new Error("The application root element is missing.");
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
