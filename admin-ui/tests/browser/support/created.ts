import type { Route } from "@playwright/test";

/**
 * Answers a create POST like the backend does: `201 Created`, a `Location` header and no body.
 * The next GET on that path returns the entity. Later requests reach the test's own routes again.
 */
export async function fulfillCreated(route: Route, location: string, entity: unknown): Promise<void> {
  const request = route.request();
  if (request.method() !== "POST") throw new Error(`fulfillCreated expects a POST, got ${request.method()} ${request.url()}`);
  const page = request.frame().page();
  const target = new URL(location, request.url());
  const matches = (url: URL) => url.pathname === target.pathname;
  const read = async (next: Route) => {
    if (next.request().method() !== "GET") return next.fallback();
    await page.unroute(matches, read);
    return next.fulfill({ json: entity });
  };
  await page.route(matches, read);
  await route.fulfill({ status: 201, headers: { location: target.pathname + target.search } });
}

/** Create answer for `POST .../layout/versions`: the Location is the new version under the same path. */
export async function fulfillCreatedVersion(route: Route, version: { layoutId: string }): Promise<void> {
  const collection = new URL(route.request().url()).pathname;
  await fulfillCreated(route, `${collection}/${encodeURIComponent(version.layoutId)}`, version);
}
