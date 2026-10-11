import React from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) throw new Error("Admin root element is missing");

createRoot(root).render(
  <React.StrictMode>
    <main>
      <h1>Indooro Admin</h1>
    </main>
  </React.StrictMode>
);
