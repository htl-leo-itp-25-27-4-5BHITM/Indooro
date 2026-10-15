package at.htl.repository;

import at.htl.model.Category;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.Refresh;
import org.opensearch.client.opensearch.core.BulkRequest;
import org.opensearch.client.opensearch.core.BulkResponse;
import org.opensearch.client.opensearch.core.CountResponse;
import org.opensearch.client.opensearch.core.GetResponse;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;

import java.io.IOException;
import java.util.Comparator;
import java.util.List;

@ApplicationScoped
public class CategoryRepository {

    @Inject
    OpenSearchClient client;

    @ConfigProperty(name = "opensearch.category-index")
    String indexName;

    public void ensureIndex() throws IOException {
        boolean exists = client.indices().exists(e -> e.index(indexName)).value();
        if (exists) {
            return;
        }

        client.indices().create(c -> c
                .index(indexName)
                .mappings(m -> m
                        .properties("categoryCode", p -> p.integer(i -> i))
                        .properties("categoryName", p -> p.text(t -> t
                                .fields("keyword", f -> f.keyword(k -> k.ignoreAbove(256)))
                        ))
                )
        );
    }

    public long count() throws IOException {
        CountResponse response = client.count(c -> c.index(indexName));
        return response.count();
    }

    public List<Category> findAll(int size) throws IOException {
        SearchResponse<Category> response = client.search(s -> s
                        .index(indexName)
                        .query(q -> q.matchAll(m -> m))
                        .size(size),
                Category.class);

        return response.hits().hits().stream()
                .map(Hit::source)
                .filter(category -> category != null)
                .sorted(Comparator.comparing(Category::getCategoryCode))
                .toList();
    }

    public Category findByCode(Integer categoryCode) throws IOException {
        GetResponse<Category> response = client.get(g -> g
                        .index(indexName)
                        .id(String.valueOf(categoryCode)),
                Category.class);
        return response.found() ? response.source() : null;
    }

    public void create(Category category) throws IOException {
        client.create(c -> c.index(indexName)
                .id(String.valueOf(category.getCategoryCode()))
                .document(category)
                .refresh(Refresh.True));
    }

    public BulkResponse bulkIndex(List<Category> categories) throws IOException {
        BulkRequest.Builder bulkBuilder = new BulkRequest.Builder().refresh(Refresh.True);

        for (Category category : categories) {
            bulkBuilder.operations(op -> op.index(idx -> idx
                    .index(indexName)
                    .id(String.valueOf(category.getCategoryCode()))
                    .document(category)
            ));
        }

        return client.bulk(bulkBuilder.build());
    }
}
