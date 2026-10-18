package at.htl.config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Disposes;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Singleton;
import org.apache.http.HttpHost;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import org.opensearch.client.RestClient;
import org.opensearch.client.json.jackson.JacksonJsonpMapper;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.transport.rest_client.RestClientTransport;

import java.io.IOException;

@ApplicationScoped
public class OpenSearchClientConfig {

    private static final Logger LOG = Logger.getLogger(OpenSearchClientConfig.class);

    @ConfigProperty(name = "opensearch.host")
    String host;

    @ConfigProperty(name = "opensearch.port")
    Integer port;

    /**
     * One shared client. Not @ApplicationScoped: ArC cannot proxy OpenSearchClient (no no-args constructor), so the
     * build fails with a normal scope. @Singleton keeps a single instance without a client proxy.
     */
    @Produces
    @Singleton
    public OpenSearchClient createClient() {
        RestClient restClient = RestClient.builder(
                new HttpHost(host, port, "http")
        ).build();

        RestClientTransport transport = new RestClientTransport(
                restClient,
                new JacksonJsonpMapper()
        );

        return new OpenSearchClient(transport);
    }

    /** Closes the transport and its low-level REST client once when the application shuts down. */
    void closeClient(@Disposes OpenSearchClient client) {
        try {
            client._transport().close();
        } catch (IOException exception) {
            LOG.warn("OpenSearch transport could not be closed cleanly", exception);
        }
    }
}
