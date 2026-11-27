"""Start the parallel FastAPI app; Node's server/app.ts still serves the React app."""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

# Routers collect related endpoints, similar to grouping Hono routes by feature.
from app.journals import router as journals_router
from app.points import router as points_router
from app.tasks import router as tasks_router

app = FastAPI(title="CyberPlanner API")


@app.exception_handler(HTTPException)
# Return journal errors with Node's error body while retaining FastAPI errors elsewhere.
# @param request - The incoming request used to scope journal-only responses.
# @param error - FastAPI's original HTTP error.
# @returns The matching JSON error response.
async def journal_http_error(request: Request, error: HTTPException) -> Response:
    if request.url.path.startswith("/api/journals"):
        return JSONResponse(status_code=error.status_code, content={"error": error.detail})
    return await http_exception_handler(request, error)


@app.exception_handler(RequestValidationError)
# Translate journal request validation into Node's documented status and error message.
# @param request - The incoming request whose journal body was invalid.
# @param error - FastAPI's collected request validation errors.
# @returns The matching Node-shaped validation response.
async def journal_request_validation_error(
    request: Request, error: RequestValidationError
) -> Response:
    if not request.url.path.startswith("/api/journals"):
        return await request_validation_exception_handler(request, error)
    fields = {detail["loc"][-1] for detail in error.errors()}
    if request.method == "POST" and "date" in fields:
        return JSONResponse(status_code=400, content={"error": "That planner date is invalid."})
    if "content" in fields:
        return JSONResponse(status_code=422, content={"error": "Journal content must be a string."})
    return JSONResponse(status_code=400, content={"error": "Invalid journal request."})


app.include_router(journals_router)
app.include_router(tasks_router)
app.include_router(points_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Report that the web process responds; this does not check PostgreSQL."""
    return {"status": "ok"}
