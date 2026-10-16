package at.htl.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch.OpenSearchClient;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class LayoutServiceValidationTest {

    @Test
    void invalidLegacyLayoutIsRejectedBeforeAnyOpenSearchWrite() throws IOException {
        LayoutService service = new LayoutService();
        service.layoutDocumentValidator = new LayoutDocumentValidator();
        service.client = mock(OpenSearchClient.class);

        WebApplicationException exception = assertThrows(WebApplicationException.class,
                () -> service.saveCurrentLayout(new ObjectMapper().readTree("{\"gridSize\":{\"width\":40,\"height\":60},\"elements\":[{\"type\":\"shelf\",\"x\":\"bad\",\"y\":1,\"width\":1,\"height\":1}]}")));

        assertEquals(400, exception.getResponse().getStatus());
        verifyNoInteractions(service.client);
    }
}
