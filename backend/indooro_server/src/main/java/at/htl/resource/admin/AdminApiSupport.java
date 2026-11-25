package at.htl.resource.admin;

import jakarta.ws.rs.core.UriInfo;
import at.htl.admin.entity.RecordStatus;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

abstract class AdminApiSupport {

    protected RecordStatus parseStatus(String rawStatus) {
        if (rawStatus == null || rawStatus.isBlank()) {
            return null;
        }
        try {
            return RecordStatus.valueOf(rawStatus.trim().toUpperCase());
        } catch (IllegalArgumentException exception) {
            throw new WebApplicationException(
                    "Ungueltiger Status. Erlaubt sind ACTIVE oder ARCHIVED.",
                    Response.Status.BAD_REQUEST
            );
        }
    }

    /** 201 Created, empty body, Location = request path (public prefix included) + id. */
    static Response created(UriInfo uriInfo, Object id) {
        return Response.created(uriInfo.getAbsolutePathBuilder().path(String.valueOf(id)).build()).build();
    }

    protected int normalizePage(int page) {
        return Math.max(page, 0);
    }

    protected int normalizeSize(int size) {
        if (size < 1) {
            return 1;
        }
        return Math.min(size, 100);
    }
}
