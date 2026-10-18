package at.htl.config;

import at.htl.repository.CategoryRepository;
import at.htl.service.CategoryService;
import at.htl.service.ProductIndexDefinition;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.opensearch.indices.CreateIndexRequest;
import org.opensearch.client.opensearch.indices.ExistsRequest;
import org.opensearch.client.opensearch.indices.GetIndexRequest;
import org.opensearch.client.opensearch.indices.GetIndexResponse;

import java.io.IOException;

/**
 * Prepares the OpenSearch indices (layouts, categories, products) and the category seed at start-up, so that
 * request paths never create indices. Until a full preparation succeeds, {@link #isReady()} is false and
 * {@link #retry()} runs the preparation again every 30 seconds.
 */
@ApplicationScoped
public class OpenSearchStartup {

    private static final Logger LOG = Logger.getLogger(OpenSearchStartup.class);
    private static final String ALREADY_EXISTS = "resource_already_exists_exception";

    @Inject
    OpenSearchClient client;

    @Inject
    CategoryRepository categoryRepository;

    @Inject
    CategoryService categoryService;

    @ConfigProperty(name = "opensearch.index")
    String productIndexName;

    @ConfigProperty(name = "opensearch.index-prefix")
    String productIndexPrefix;

    @ConfigProperty(name = "opensearch.alias")
    String productAlias;

    @ConfigProperty(name = "opensearch.layout-index")
    String layoutIndexName;

    /** False in %test so that @QuarkusTest boots do not contact a real OpenSearch. */
    @ConfigProperty(name = "indooro.opensearch.startup-prepare.enabled", defaultValue = "true")
    boolean enabled;

    private volatile boolean ready;

    void onStart(@Observes StartupEvent event) {
        if (!enabled) {
            LOG.info("OpenSearch start-up preparation is disabled");
            return;
        }
        try {
            prepare();
        } catch (RuntimeException e) {
            LOG.warn("OpenSearch start-up preparation failed; the backend keeps running and retries", e);
        }
    }

    /**
     * Ensures all indices exist and the category seed is present. Returns true and sets the ready flag only when
     * every step succeeded; an unreachable OpenSearch leaves the flag false.
     */
    public boolean prepare() {
        boolean prepared;
        try {
            ensureLayoutIndex();
            ensureCategoryIndex();
            categoryService.seedIfEmpty();
            ensureProductIndex();
            prepared = true;
            LOG.info("OpenSearch indices are prepared");
        } catch (IOException | OpenSearchException e) {
            LOG.warn("OpenSearch indices are not prepared yet: " + e.getMessage());
            prepared = false;
        }
        ready = prepared;
        return prepared;
    }

    public boolean isReady() {
        return ready;
    }

    @Scheduled(every = "30s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void retry() {
        if (!enabled || ready) {
            return;
        }
        prepare();
    }

    /** Layouts are created with an explicit mapping only when the index is missing; an existing index is left alone. */
    private void ensureLayoutIndex() throws IOException {
        if (exists(layoutIndexName)) {
            return;
        }
        try {
            client.indices().create(CreateIndexRequest.of(b -> b
                    .index(layoutIndexName)
                    .mappings(m -> m
                            // Element arrays are stored in _source only; no dynamic mapping explosion.
                            .properties("elements", p -> p.object(o -> o.enabled(false)))
                            // Legacy history filters recordType.keyword.
                            .properties("recordType", p -> p.text(t -> t
                                    .fields("keyword", f -> f.keyword(k -> k.ignoreAbove(256)))))
                            .properties("savedAt", p -> p.date(d -> d)))));
            LOG.info("Created layout index " + layoutIndexName);
        } catch (OpenSearchException e) {
            if (!alreadyExists(e)) {
                throw e;
            }
        }
    }

    private void ensureCategoryIndex() throws IOException {
        try {
            categoryRepository.ensureIndex();
        } catch (OpenSearchException e) {
            if (!alreadyExists(e)) {
                throw e;
            }
        }
    }

    /**
     * Creates the product index only when nothing of that name, no alias and no versioned index ({@code products_vN})
     * exists. Creating a plain index next to a versioned index or an alias would split the catalog.
     */
    private void ensureProductIndex() throws IOException {
        if (exists(productIndexName) || exists(productAlias) || versionedProductIndexExists()) {
            return;
        }
        try {
            client.indices().create(ProductIndexDefinition.createIndexRequest(productIndexName));
            LOG.info("Created product index " + productIndexName);
        } catch (OpenSearchException e) {
            if (!alreadyExists(e)) {
                throw e;
            }
        }
    }

    private boolean versionedProductIndexExists() throws IOException {
        try {
            GetIndexResponse response = client.indices().get(GetIndexRequest.of(g -> g.index(productIndexPrefix + "*")));
            return response.result() != null && !response.result().isEmpty();
        } catch (OpenSearchException e) {
            if (e.status() == 404) {
                return false;
            }
            throw e;
        }
    }

    private boolean exists(String name) throws IOException {
        return client.indices().exists(ExistsRequest.of(e -> e.index(name))).value();
    }

    private static boolean alreadyExists(OpenSearchException e) {
        return e.error() != null && ALREADY_EXISTS.equals(e.error().type());
    }
}
