package at.htl.resource;

import io.quarkus.security.Authenticated;
import jakarta.annotation.security.DenyAll;
import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HEAD;
import jakarta.ws.rs.OPTIONS;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.io.IOException;
import java.lang.annotation.Annotation;
import java.lang.reflect.AnnotatedElement;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Fails when a JAX-RS resource method has neither a method-level nor a class-level
 * security annotation. Mirrors quarkus.security.jaxrs.deny-unannotated-endpoints in prod.
 */
class ResourceAnnotationCoverageTest {

    private static final Path CLASS_ROOT = Path.of("target", "classes");
    private static final String PACKAGE_DIR = "at/htl";

    private static final List<Class<? extends Annotation>> HTTP_METHODS = List.of(
            GET.class, POST.class, PUT.class, DELETE.class, PATCH.class, HEAD.class, OPTIONS.class);

    private static final List<Class<? extends Annotation>> SECURITY_ANNOTATIONS = List.of(
            RolesAllowed.class, PermitAll.class, Authenticated.class, DenyAll.class);

    @Test
    void everyHttpResourceMethodHasASecurityAnnotation() throws IOException {
        Path packageRoot = CLASS_ROOT.resolve(PACKAGE_DIR);
        assertTrue(Files.isDirectory(packageRoot), "Kompilierte Klassen fehlen: " + packageRoot.toAbsolutePath());

        List<String> missing = new ArrayList<>();
        int checkedMethods = 0;

        List<Path> classFiles;
        try (Stream<Path> files = Files.walk(packageRoot)) {
            classFiles = files.filter(p -> p.toString().endsWith(".class")).sorted().toList();
        }

        for (Path classFile : classFiles) {
            Class<?> type = load(classFile);
            if (!type.isAnnotationPresent(jakarta.ws.rs.Path.class)) {
                continue;
            }
            boolean classSecured = hasSecurityAnnotation(type);
            for (Method method : type.getDeclaredMethods()) {
                if (method.isSynthetic() || !isHttpMethod(method)) {
                    continue;
                }
                checkedMethods++;
                if (!classSecured && !hasSecurityAnnotation(method)) {
                    missing.add(type.getName() + "#" + method.getName());
                }
            }
        }

        assertTrue(checkedMethods > 0, "Keine JAX-RS-Methoden gefunden; Test ist wirkungslos.");
        assertTrue(missing.isEmpty(),
                "JAX-RS-Methoden ohne @RolesAllowed/@PermitAll/@Authenticated/@DenyAll: " + missing);
    }

    private static Class<?> load(Path classFile) {
        String relative = CLASS_ROOT.relativize(classFile).toString();
        String className = relative.substring(0, relative.length() - ".class".length())
                .replace(File.separatorChar, '.');
        try {
            return Class.forName(className, false, ResourceAnnotationCoverageTest.class.getClassLoader());
        } catch (ClassNotFoundException | LinkageError e) {
            throw new IllegalStateException("Klasse konnte nicht geladen werden: " + className, e);
        }
    }

    private static boolean isHttpMethod(Method method) {
        return HTTP_METHODS.stream().anyMatch(method::isAnnotationPresent);
    }

    private static boolean hasSecurityAnnotation(AnnotatedElement element) {
        return SECURITY_ANNOTATIONS.stream().anyMatch(element::isAnnotationPresent);
    }
}
