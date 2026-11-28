package at.htl.config;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.container.PreMatching;
import jakarta.ws.rs.ext.Provider;

import java.net.URI;

@Provider
@PreMatching
public class ApiVersionFilter implements ContainerRequestFilter {

    private static final String API_PATH = "/api";
    private static final String V1_PATH = API_PATH + "/v1";

    @Override
    public void filter(ContainerRequestContext request) {
        URI uri = request.getUriInfo().getRequestUri();
        String path = uri.getRawPath();
        String canonical = canonicalPath(path);
        if (!path.equals(canonical)) {
            String query = uri.getRawQuery();
            request.setRequestUri(URI.create(canonical + (query == null ? "" : "?" + query)));
        }
    }

    static String canonicalPath(String path) {
        return path.equals(V1_PATH) || path.startsWith(V1_PATH + "/")
                ? API_PATH + path.substring(V1_PATH.length())
                : path;
    }
}
