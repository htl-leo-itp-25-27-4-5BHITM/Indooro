package at.htl.admin.service;

import at.htl.admin.dto.UpsellDtos;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards the transaction layout of UpsellSuggestionService: no transaction spans the OpenSearch or OpenAI calls, and
 * the DB access sits in short transactional helpers.
 */
class UpsellSuggestionTransactionTest {

    @Test
    void suggestionsAndPlanRunWithoutATransaction() throws NoSuchMethodException {
        assertNull(UpsellSuggestionService.class.getAnnotation(Transactional.class), "class must not be transactional");
        assertNoTransactional(method("suggestions", UpsellDtos.UpsellSuggestionRequest.class));
        assertNoTransactional(method("plan", UpsellDtos.UpsellPlanRequest.class));
    }

    @Test
    void recordEventAndDismissStayTransactional() throws NoSuchMethodException {
        assertTrue(method("recordEvent", UpsellDtos.UpsellEventRequest.class).isAnnotationPresent(Transactional.class));
        assertTrue(method("dismiss", UpsellDtos.UpsellDismissRequest.class).isAnnotationPresent(Transactional.class));
    }

    @Test
    void cacheReadsAndDismissalReadAreShortRequiredTransactions() throws NoSuchMethodException {
        assertRequired(method("activeDismissals", UpsellDtos.UpsellSuggestionRequest.class));
        assertRequired(method("findCachedResponse", String.class));
        assertRequired(method("findCachedPlanResponse", String.class));
    }

    @Test
    void cacheWritesUseRequiresNew() throws NoSuchMethodException {
        assertRequiresNew(method("storeCachedResponse",
                UpsellDtos.UpsellSuggestionRequest.class, String.class, UpsellDtos.UpsellSuggestionResponse.class));
        assertRequiresNew(method("storeCachedPlanResponse",
                UpsellDtos.UpsellPlanRequest.class, String.class, UpsellDtos.UpsellPlanResponse.class));
    }

    @Test
    void externalRankingCallsAreNotDirectlyTransactional() throws NoSuchMethodException {
        assertNoTransactional(method("rankWithOpenAi", at.htl.model.Product.class, java.util.List.class));
        assertNoTransactional(method("rankPlanWithOpenAi", java.util.List.class, String.class));
    }

    private static Method method(String name, Class<?>... parameterTypes) throws NoSuchMethodException {
        Method method = UpsellSuggestionService.class.getDeclaredMethod(name, parameterTypes);
        assertNotNull(method, name);
        return method;
    }

    private static void assertNoTransactional(Method method) {
        assertFalse(method.isAnnotationPresent(Transactional.class), method.getName() + " must not be @Transactional");
    }

    private static void assertRequired(Method method) {
        Transactional transactional = method.getAnnotation(Transactional.class);
        assertNotNull(transactional, method.getName() + " must be @Transactional");
        assertEquals(Transactional.TxType.REQUIRED, transactional.value(), method.getName());
    }

    private static void assertRequiresNew(Method method) {
        Transactional transactional = method.getAnnotation(Transactional.class);
        assertNotNull(transactional, method.getName() + " must be @Transactional");
        assertEquals(Transactional.TxType.REQUIRES_NEW, transactional.value(), method.getName());
    }
}
