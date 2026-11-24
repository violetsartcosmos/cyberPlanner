import { RouterProvider } from "react-router";
import { router } from "./routes/router";
import { NotificationProvider } from "./components/notifications";

export default function App() {
  return <NotificationProvider><RouterProvider router={router} /></NotificationProvider>;
}
