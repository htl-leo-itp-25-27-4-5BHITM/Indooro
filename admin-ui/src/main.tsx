import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ApiClientError, createApiClient } from "./api/client";
import { Dashboard } from "./Dashboard";
import { StoresPage } from "./StoresPage";
import { EditorRoute } from "./EditorRoute";
import { StoreDetailPage } from "./StoreDetailPage";
import { AnchorPrintPage } from "./AnchorPrintPage";
import { ReadinessPage } from "./ReadinessPage";
import { RegionsPage } from "./RegionsPage";
import { StoreCreatePage } from "./StoreCreatePage";
import { BeaconsPage } from "./BeaconsPage";
import { RecipesPage } from "./RecipesPage";
import { DiagnosticsPage } from "./DiagnosticsPage";
import { LegacyEditorRoute } from "./LegacyEditorRoute";
import { ProductsPage } from "./ProductsPage";
import { CategoriesPage } from "./CategoriesPage";
import { candidateAccess, candidateNavigationPath, visibleRoutes, type CurrentUser } from "./routes";
import "./style.css";

const api = createApiClient();

function AdminCandidate() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    api.get<CurrentUser>("/api/admin/me", { signal: controller.signal })
      .then(setUser)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiClientError ? cause : new ApiClientError("server", null, "Profil konnte nicht geladen werden."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const access = user ? candidateAccess(window.location.pathname, user.role, new URLSearchParams(window.location.search).get("storeId"), user.scope?.storeId) : null;
  const navigation = user ? visibleRoutes(user.role).map((route) => ({ route, href: candidateNavigationPath(route, user) })) : [];
  const currentPath = window.location.pathname.replace(/\/$/, "");
  const currentNavigation = navigation.find(({ href }) => {
    const targetPath = new URL(href, window.location.origin).pathname.replace(/\/$/, "");
    return currentPath === targetPath || (targetPath !== "/admin/next" && currentPath.startsWith(`${targetPath}/`));
  })?.route;
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">Zum Hauptinhalt springen</a>
      <header className="masthead">
        <a className="brand" href="/admin/next/" aria-label="Indooro Admin Startseite">Indooro <span>Admin</span></a>
        {user && <div className="account"><span>{user.username}</span><span className="scope">{user.scope?.storeName ?? user.scope?.regionName ?? user.role}</span><a href="/admin/logout">Logout</a></div>}
      </header>
      <div className="workspace">
        {user && <nav aria-label="Admin Navigation" className="sidebar">
          <p className="sidebar-title">Arbeitsbereiche</p>
          {navigation.map(({ route, href }) => <a href={href} key={route.path} aria-current={route === currentNavigation ? "page" : undefined}>{route.label}</a>)}
        </nav>}
        <main id="main-content" tabIndex={-1} className={`content ${window.location.pathname.includes("/next/editor") ? "editor-content" : ""}`}>
          <h1>Indooro Admin</h1>
          {loading && <p role="status">Berechtigungen werden geladen …</p>}
          {error && <section role="alert" className="notice">
            <h2>{error.kind === "unauthorized" ? "Sitzung abgelaufen" : error.kind === "forbidden" ? "Zugriff verweigert" : "Profil nicht verfügbar"}</h2>
            <p>{error.message}</p>
            <a href="/admin/">{error.kind === "unauthorized" ? "Erneut anmelden" : "Zur bisherigen Administration"}</a>
          </section>}
          {user && access === "forbidden" && <section role="alert" className="notice"><h2>Zugriff verweigert</h2><p>Für diesen Bereich fehlt die Berechtigung.</p></section>}
          {user && access === "missing" && <section role="alert" className="notice"><h2>Seite nicht gefunden</h2><p>Dieser Kandidatenpfad ist nicht eingerichtet.</p></section>}
          {user && access === "allowed" && (window.location.pathname.includes("/editor")
            ? new URLSearchParams(window.location.search).has("storeId") ? <EditorRoute api={api} /> : <LegacyEditorRoute api={api} role={user.role} />
            : window.location.pathname.includes("/stores/new")
            ? <StoreCreatePage api={api} user={user} />
            : window.location.pathname.includes("/stores/anchors")
            ? <AnchorPrintPage api={api} />
            : window.location.pathname.includes("/stores/detail")
            ? <StoreDetailPage api={api} user={user} />
            : window.location.pathname.includes("/stores/readiness")
            ? <ReadinessPage api={api} user={user} />
            : window.location.pathname.includes("/stores") ? <StoresPage api={api} user={user} />
            : window.location.pathname.includes("/regions") ? <RegionsPage api={api} user={user} />
            : window.location.pathname.includes("/beacons") ? <BeaconsPage api={api} user={user} />
            : window.location.pathname.includes("/recipes") ? <RecipesPage api={api} user={user} />
            : window.location.pathname.includes("/products") ? <ProductsPage api={api} user={user} />
            : window.location.pathname.includes("/categories") ? <CategoriesPage api={api} />
            : window.location.pathname.includes("/server-logs") ? <DiagnosticsPage api={api} user={user} />
            : <Dashboard api={api} user={user} />)}
        </main>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Admin root element is missing");

createRoot(root).render(<React.StrictMode><AdminCandidate /></React.StrictMode>);
