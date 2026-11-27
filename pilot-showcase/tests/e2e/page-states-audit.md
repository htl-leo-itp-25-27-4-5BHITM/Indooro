# Showcase state audit

The showcase is one page with hash-linked sections and bundled, synchronous demo markets. It has no API, backend list routes or HTTP authorization contract. No fake API was added for tests.

- Landing sections, operator workflow, tour, routing and navigation use local data. Their existing validation and empty-route guidance remain local and synchronous.
- Product search and shopping list use the shared empty component. Both offer working next actions: clear search, suggestions, example list and product search.
- The optional 3D store view reserves its aspect ratio during lazy loading and catches failed module loads without unmounting the page. Retry reloads the document, causing the browser to fetch failed assets afresh. A module import failure does not expose an HTTP status to React, so a 403 and 500 share safe connection/unavailable copy.
- Unsupported WebGL uses the existing 2D fallback guidance. Decorative hero/how scenes keep their static visual fallback during loading or failure.

Functional tests intercept the actual 3D JavaScript request with `page.route` to delay loading and return 500/403, then verify retry recovery. Empty search and list tests exercise their primary actions on desktop/mobile. Existing empty-list visual cases remain; focused empty-list and unavailable 3D screenshots add component coverage. Linux baselines must come from CI artifacts.
