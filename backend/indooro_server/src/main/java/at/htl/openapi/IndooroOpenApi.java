package at.htl.openapi;

import org.eclipse.microprofile.openapi.annotations.OpenAPIDefinition;
import org.eclipse.microprofile.openapi.annotations.enums.SecuritySchemeIn;
import org.eclipse.microprofile.openapi.annotations.enums.SecuritySchemeType;
import org.eclipse.microprofile.openapi.annotations.info.Info;
import org.eclipse.microprofile.openapi.annotations.security.SecurityScheme;
import org.eclipse.microprofile.openapi.annotations.security.SecuritySchemes;

import jakarta.ws.rs.core.Application;

/**
 * OpenAPI document metadata only. Overrides neither getClasses() nor getSingletons() and sets no
 * @ApplicationPath, so resource discovery and route paths stay unchanged.
 */
@OpenAPIDefinition(info = @Info(title = "Indooro API", version = "2026.10.12"))
@SecuritySchemes({
        @SecurityScheme(securitySchemeName = "oidcSession",
                type = SecuritySchemeType.APIKEY,
                apiKeyName = "q_session",
                in = SecuritySchemeIn.COOKIE,
                description = "Quarkus OIDC web-app session cookie (split tokens) created by the Keycloak authorization code flow."),
        @SecurityScheme(securitySchemeName = "bearerAuth",
                type = SecuritySchemeType.HTTP,
                scheme = "bearer",
                bearerFormat = "JWT",
                description = "Keycloak access token of realm `indooro` with realm roles in `realm_access.roles`.")
})
public class IndooroOpenApi extends Application {
}
