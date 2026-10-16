## Decisions

1. **Storage** in PostgreSQL table `layout_underlays(store_id PK, content_type, bytes, width_px, height_px, scale_m_per_px, offset_x_m, offset_y_m, rotation_deg, opacity, locked, updated_at, updated_by)` via Flyway `V15__layout_underlay.sql`. `scale_m_per_px` is nullable until two-point calibration. The highest merged migration is V11, but `harden-platform-security-baseline` allocates V12/V13 and `optimize-backend-data-access` allocates V14. V15 is the next unallocated version across active changes; this corrects the earlier V14 plan and avoids a cross-branch collision.
2. **PDF**: rendered client-side to PNG with a vendored PDF renderer only if license-compatible and small; otherwise PNG/JPEG only and a hint to export the PDF page as image.
3. **Calibration**: user clicks two points on the image and enters the real distance; scale = meters / pixel distance; rotation from an optional second pair or manual slider.
4. **Security**: content type sniffing (magic bytes), 10 MB limit, image dimensions ≤ 8000 px, audit log entry on change; never public.

## Risks / Trade-offs

- Large images can make the canvas slow: downscale on upload to ≤ 4000 px longest side.
