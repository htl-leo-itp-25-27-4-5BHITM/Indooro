import { initializeTheme, ThemeControl } from "./ThemeControl";
import { describeError, LoadingState } from "./PageState";
import "../../design-tokens/dist/admin-ui.css";
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ApiClientError, createApiClient } from "./api/client";
import { Dashboard } from "./Dashboard";
import { StoresPage } from "./StoresPage";
// Keep route styles eager and in their original cascade order while deferring route JavaScript.
import "./editor/LayoutEditor.css";
import "./editor/MobileCurrentPreview.css";
import { StoreDetailPage } from "./StoreDetailPage";
import "./AnchorPrintPage.css";
import { ReadinessPage } from "./ReadinessPage";
import { RegionsPage } from "./RegionsPage";
import { StoreCreatePage } from "./StoreCreatePage";
import { BeaconsPage } from "./BeaconsPage";
import "./RecipesPage.css";
import { DiagnosticsPage } from "./DiagnosticsPage";
import "./LegacyEditorRoute.css";
import { ProductsPage } from "./ProductsPage";
import { CategoriesPage } from "./CategoriesPage";
import { SearchIndexPage } from "./SearchIndexPage";
import { AccessAssignmentsPage } from "./AccessAssignmentsPage";
import { ForbiddenIdentity } from "./ForbiddenIdentity";
import { candidateAccess, candidateNavigationPath, visibleRoutes, type CurrentUser } from "./routes";
import "./style.css";

const EditorRoute = lazy(() => import("./EditorRoute").then((module) => ({ default: module.EditorRoute })));
const LegacyEditorRoute = lazy(() => import("./LegacyEditorRoute").then((module) => ({ default: module.LegacyEditorRoute })));
const RecipesPage = lazy(() => import("./RecipesPage").then((module) => ({ default: module.RecipesPage })));
const AnchorPrintPage = lazy(() => import("./AnchorPrintPage").then((module) => ({ default: module.AnchorPrintPage })));
const api = createApiClient();
const ROLE_TEXT: Record<string, string> = { admin: "Administrator", "region-manager": "Regionsmanager", "store-manager": "Marktleiter" };

function AdminCandidate() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    api.get<CurrentUser>("/api/admin/me", { signal: controller.signal })
      .then(setUser)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiClientError ? cause : new ApiClientError("server", null, "Profil konnte nicht geladen werden."));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

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
        {user && <button ref={menuButton} type="button" className="menu-toggle" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen((open) => !open)}><span aria-hidden="true">☰</span> Menü</button>}
        <a className="brand" href="/admin/next/" aria-label="Indooro Admin Startseite">Indooro <span>Admin</span></a>
        <div className="account">
          <ThemeControl />
          {user && <><span>{user.username}</span><span className="scope">{user.scope?.storeName ?? user.scope?.regionName ?? ROLE_TEXT[user.role] ?? user.role}</span><a href="/admin/logout">Abmelden</a></>}
        </div>
      </header>
      <div className="workspace">
        {user && <nav id="admin-navigation" aria-label="Admin Navigation" className={`sidebar ${menuOpen ? "open" : ""}`} onKeyDown={(event) => { if (event.key === "Escape" && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); } }}>
          <p className="sidebar-title">Arbeitsbereiche</p>
          {navigation.map(({ route, href }) => <a href={href} key={route.path} aria-current={route === currentNavigation ? "page" : undefined}>{route.label}</a>)}
        </nav>}
        <main id="main-content" tabIndex={-1} className={`content ${window.location.pathname.includes("/next/editor") ? "editor-content" : ""}`}>
          {/* Every page renders its own h1; these cover the states and routes that do not. */}
          {loading && <><h1 className="visually-hidden">Indooro Admin</h1><LoadingState>Berechtigungen werden geladen …</LoadingState></>}
          {user && access === "allowed" && window.location.pathname.includes("/editor") && <h1 className="visually-hidden">Layout-Editor</h1>}
          {error && <section role="alert" className="notice">
            <h1>{error.kind === "unauthorized" ? "Sitzung abgelaufen" : error.kind === "forbidden" ? "Zugriff verweigert" : "Profil nicht verfügbar"}</h1>
            <p>{describeError(error)}</p>
            {error.kind !== "unauthorized" && <button type="button" className="button primary" onClick={() => setRevision((value) => value + 1)}>Erneut versuchen</button>}
            {error.kind === "forbidden" && <ForbiddenIdentity api={api} />}
            <a href="/admin/">{error.kind === "unauthorized" ? "Erneut anmelden" : "Zur bisherigen Administration"}</a>
          </section>}
          {user && access === "forbidden" && <section role="alert" className="notice"><h1>Zugriff verweigert</h1><p>Für diesen Bereich fehlt die Berechtigung.</p></section>}
          {user && access === "missing" && <section role="alert" className="notice"><h1>Seite nicht gefunden</h1><p>Diese Seite gibt es nicht.</p><a className="button primary" href="/admin/next/">Zur Übersicht</a></section>}
          <Suspense fallback={<LoadingState>Seite wird geladen …</LoadingState>}>
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
            : window.location.pathname.includes("/search-index") ? <SearchIndexPage api={api} user={user} />
            : window.location.pathname.includes("/server-logs") ? <DiagnosticsPage api={api} user={user} />
            : window.location.pathname.includes("/access") ? <AccessAssignmentsPage api={api} user={user} />
            : <Dashboard api={api} user={user} />)}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Admin root element is missing");

initializeTheme();

createRoot(root).render(<React.StrictMode><AdminCandidate /></React.StrictMode>);
