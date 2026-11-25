# Showcase GUI polish (task 6.1)

Screenshots of `pilot-showcase` before and after the polish pass, at 375x812, 768x1024 and 1440x900.
File names are `<width>-<section>.jpg` in `before/` and `after/`.
Sections: `top`, `problem`, `demo`, `so-funktionierts`, `betreiber`, `projektstand`, `pilot`, `kontakt`.

They were captured with headless Chromium and reduced motion, so the 2D fallbacks are shown instead of the 3D scenes.

## Fixed

- Hero headline: the descender in "Weg." was clipped.
- Hero buttons: cramped at 375 px, uneven wrap at 1440 px.
- Sections used two different gutters, eyebrow styles, heading sizes and vertical spacing.
- German copy: wrong step count ("drei" instead of "vier"), two awkward sentences.
- Demo panel: product names (375 px) and the "Einkaufsliste" tab (1440 px) were truncated.
- Operator demo at phone width: CSV columns were cut off, and the active step scrolled out of view.
- The floating tour button covered the footer copyright line.
- The chapter rail label overlapped content at 1440 px.
- Deep links such as `#so-funktionierts` landed about 200 px off on phones.
- SVG attribute errors from the animated hero phone.

## Not changed

- The site has one fixed light/dark section design and no `prefers-color-scheme` theme, so there is no separate dark mode to check.
- React logs "Attempted to synchronously unmount a root" while the 3D canvases load. It predates this change.
