package at.htl.config;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.Arrays;
import java.util.Properties;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ApiPermissionPathsTest {

    @Test
    void eachApiPermissionPathHasItsTwinInTheSameRule() throws IOException {
        Properties config = new Properties();
        try (var stream = getClass().getResourceAsStream("/application.properties")) {
            assertNotNull(stream);
            config.load(stream);
        }

        var permissionKeys = config.stringPropertyNames().stream()
                .filter(key -> key.contains("quarkus.http.auth.permission.") && key.endsWith(".paths"))
                .toList();
        assertFalse(permissionKeys.isEmpty());
        for (String key : permissionKeys) {
            Set<String> paths = Arrays.stream(config.getProperty(key).split(","))
                    .map(String::trim)
                    .collect(Collectors.toSet());
            for (String path : paths) {
                if (path.startsWith("/api/")) {
                    String canonical = ApiVersionFilter.canonicalPath(path);
                    String twin = path.equals(canonical) ? "/api/v1" + path.substring("/api".length()) : canonical;
                    assertTrue(paths.contains(twin), () -> key + ": " + path + " requires " + twin);
                }
            }
        }
    }
}
