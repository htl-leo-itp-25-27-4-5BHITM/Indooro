package at.htl.config;

import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.transport.OpenSearchTransport;

import java.io.IOException;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class OpenSearchClientConfigTest {

    @Test
    void producedClientIsBuiltFromConfiguredHostAndPort() throws IOException {
        OpenSearchClientConfig config = new OpenSearchClientConfig();
        config.host = "localhost";
        config.port = 9200;

        OpenSearchClient client = config.createClient();
        assertNotNull(client);
        assertNotNull(client._transport());
        client._transport().close();
    }

    @Test
    void disposerClosesTheTransport() throws IOException {
        OpenSearchClientConfig config = new OpenSearchClientConfig();
        OpenSearchClient client = mock(OpenSearchClient.class);
        OpenSearchTransport transport = mock(OpenSearchTransport.class);
        when(client._transport()).thenReturn(transport);

        config.closeClient(client);

        verify(transport).close();
    }

    @Test
    void disposerSwallowsCloseFailures() throws IOException {
        OpenSearchClientConfig config = new OpenSearchClientConfig();
        OpenSearchClient client = mock(OpenSearchClient.class);
        OpenSearchTransport transport = mock(OpenSearchTransport.class);
        when(client._transport()).thenReturn(transport);
        org.mockito.Mockito.doThrow(new IOException("boom")).when(transport).close();

        config.closeClient(client);

        verify(transport).close();
    }
}
