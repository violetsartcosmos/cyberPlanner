import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT || 3000);
const hostname = process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost";
serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`CyberPlanner server listening on port ${info.port}`);
});
