## Decisions

1. **Storage** in PostgreSQL table `layout_underlays(store_id PK, content_type, bytes, width_px, height_px, scale_m_per_px, offset_x_m, offset_y_m, rotation_deg, opacity, updated_at, updated_by)` via Flyway `V14__layout_underlay.sql` (number after the newest existing migration on `main`).
2. **PDF**: rendered client-side to PNG with a vendored PDF renderer only if license-compatible and small; otherwise PNG/JPEG only and a hint to export the PDF page as image.
3. **Calibration**: user clicks two points on the image and enters the real distance; scale = meters / pixel distance; rotation from an optional second pair or manual slider.
4. **Security**: content type sniffing (magic bytes), 10 MB limit, image dimensions ≤ 8000 px, audit log entry on change; never public.

## Risks / Trade-offs

- Large images can make the canvas slow: downscale on upload to ≤ 4000 px longest side.
