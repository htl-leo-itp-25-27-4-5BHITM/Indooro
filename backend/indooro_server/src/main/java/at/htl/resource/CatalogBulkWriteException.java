package at.htl.resource;

import at.htl.service.CatalogBulkResult;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

public class CatalogBulkWriteException extends WebApplicationException {

    private final CatalogBulkResult result;

    public CatalogBulkWriteException(CatalogBulkResult result, Throwable cause) {
        super(result.message(), cause, Response.Status.SERVICE_UNAVAILABLE);
        this.result = result;
    }

    public CatalogBulkResult result() {
        return result;
    }
}
