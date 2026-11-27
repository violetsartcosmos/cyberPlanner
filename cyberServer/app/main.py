"""Start the parallel FastAPI app; Node's server/app.ts still serves the React app."""

from fastapi import FastAPI

# Routers collect related endpoints, similar to grouping Hono routes by feature.
from app.journals import router as journals_router
from app.points import router as points_router
from app.tasks import router as tasks_router

app = FastAPI(title="CyberPlanner API")
app.include_router(journals_router)
app.include_router(tasks_router)
app.include_router(points_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Report that the web process responds; this does not check PostgreSQL."""
    return {"status": "ok"}
