package at.htl.resource;

import jakarta.annotation.security.PermitAll;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.WebApplicationException;

/** Test-only Endpunkte, die gezielt Fehlerantworten erzeugen (Fehler-Policy und 5xx-Körper). */
@PermitAll
@Path("/api/test-error-probe")
public class ErrorPolicyProbeResource {

    @GET
    @Path("/status/{code}")
    public String status(@PathParam("code") int code) {
        throw new WebApplicationException("probe-" + code + " detail", code);
    }

    @GET
    @Path("/boom")
    public String boom() {
        throw new IllegalStateException("secret internal detail");
    }
}
