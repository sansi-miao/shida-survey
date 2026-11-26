import { createRoot } from "react-dom/client";
import { Admin } from "./Admin";
import { PublicSurvey } from "./PublicSurvey";
import "./styles.css";

const match = /^\/s\/([a-zA-Z0-9-]+)\/?$/.exec(location.pathname);
createRoot(document.getElementById("root")!).render(match ? <PublicSurvey id={match[1]} /> : <Admin />);
