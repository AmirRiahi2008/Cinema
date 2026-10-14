import { createRoot } from "react-dom/client";
import { CinemaApp } from "../components/cinema-app";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("The cinema root element is missing.");
createRoot(root).render(<CinemaApp />);
