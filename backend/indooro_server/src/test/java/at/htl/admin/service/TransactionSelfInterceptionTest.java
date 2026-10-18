package at.htl.admin.service;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards the pattern used by UpsellSuggestionService: a public method without a transaction calls package-private
 * {@code @Transactional} helpers of the same bean. ArC must intercept those self-invocations, otherwise the short
 * read and write transactions would silently not exist.
 */
@QuarkusTest
class TransactionSelfInterceptionTest {

    @ApplicationScoped
    public static class Probe {
        public boolean[] run() {
            boolean outer = io.quarkus.narayana.jta.QuarkusTransaction.isActive();
            return new boolean[] {outer, required(), requiresNew()};
        }

        @Transactional
        boolean required() {
            return io.quarkus.narayana.jta.QuarkusTransaction.isActive();
        }

        @Transactional(Transactional.TxType.REQUIRES_NEW)
        boolean requiresNew() {
            return io.quarkus.narayana.jta.QuarkusTransaction.isActive();
        }
    }

    @Inject
    Probe probe;

    @Test
    void packagePrivateTransactionalHelpersRunInTheirOwnTransaction() {
        boolean[] result = probe.run();
        assertFalse(result[0], "caller has no transaction");
        assertTrue(result[1], "@Transactional helper is intercepted on self-invocation");
        assertTrue(result[2], "REQUIRES_NEW helper is intercepted on self-invocation");
    }
}
