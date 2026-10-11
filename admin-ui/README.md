# Indooro Admin UI source workspace

This is the source for the staged React/Vite/TypeScript Admin Platform rebuild. It is not yet wired into Quarkus and does not replace any current `/admin/*` route. Production integration and route cutover are separate OpenSpec tasks.

Use the pinned Node 22.23.3 runtime (or a compatible Node 24 release) and run:

```bash
cd admin-ui
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

`dist/` stays local to this workspace for now. The API client is in `src/api/client.ts`; it accepts only same-origin `/api/*` paths and sends session cookies with `credentials: "same-origin"`.
