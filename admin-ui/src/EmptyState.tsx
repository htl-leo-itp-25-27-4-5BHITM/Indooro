import type { ReactNode } from "react";

/** "Nothing here yet" or "nothing matches", with the page's next step as action. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state" role="status"><p>{children}</p>{action ?? <a className="button primary" href="/admin/next/stores/">Stores öffnen</a>}</div>;
}
