package at.htl.db;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Flyway ist in Tests deaktiviert; diese Pruefung liest V17 und die Demo-Seeds (V4, V5) vom Classpath,
 * damit neue Demo-Subjects nicht unbemerkt aus der Deaktivierung herausfallen.
 */
class DemoAccessMigrationTest {

    private static final String V4 = "db/migration/V4__user_access_assignments.sql";
    private static final String V5 = "db/migration/V5__seed_demo_user_access_assignments.sql";
    private static final String V17 = "db/migration/V17__disable_demo_access_outside_dev.sql";

    /** Zweite Spalte (keycloak_subject) je VALUES-Zeile: id, subject, username. */
    private static final Pattern DEMO_SUBJECT = Pattern.compile(
            "'[0-9a-f-]{36}',\\s*'([0-9a-f-]{36})',\\s*'[^']*',");
    private static final Pattern UUID_LITERAL = Pattern.compile("'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'");

    @Test
    void v17DisablesEveryDemoSubjectSeededByV4AndV5() throws IOException {
        Set<String> demoSubjects = new TreeSet<>();
        demoSubjects.addAll(subjects(V4));
        demoSubjects.addAll(subjects(V5));
        assertEquals(3, demoSubjects.size(), "V4 and V5 seed three demo subjects");

        String migration = read(V17);
        assertTrue(migration.contains("'${demoAccess}' = 'false'"), "V17 must be gated by the demoAccess placeholder");
        assertTrue(migration.contains("SET status = 'DISABLED'"));
        assertTrue(migration.contains("status = 'ACTIVE'"));

        Set<String> listedInMigration = new TreeSet<>();
        Matcher matcher = UUID_LITERAL.matcher(migration);
        while (matcher.find()) {
            listedInMigration.add(matcher.group(1));
        }
        assertEquals(demoSubjects, listedInMigration);
    }

    private static Set<String> subjects(String resource) throws IOException {
        Set<String> subjects = new TreeSet<>();
        Matcher matcher = DEMO_SUBJECT.matcher(read(resource));
        while (matcher.find()) {
            subjects.add(matcher.group(1));
        }
        return subjects;
    }

    private static String read(String resource) throws IOException {
        try (InputStream input = Thread.currentThread().getContextClassLoader().getResourceAsStream(resource)) {
            assertTrue(input != null, "missing classpath resource " + resource);
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
