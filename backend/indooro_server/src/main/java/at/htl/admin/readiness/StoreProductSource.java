package at.htl.admin.readiness;

import at.htl.admin.readiness.ReadinessDtos.ProductPage;
import at.htl.admin.readiness.ReadinessDtos.ProductRef;
import at.htl.model.Product;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.opensearch.client.opensearch.OpenSearchClient;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Loads the products of one store from OpenSearch, page by page, with search_after on id.
 *
 * <p>A product belongs to a store when its storeId equals the store UUID or its storeCode equals the
 * store code. Products without either field are the global catalog (today every pilot product, see
 * add-store-scoped-catalog); the apps search it without a store filter, so customers of every store can
 * be sent to them and they are checked against the store layout as well.
 * Existing OpenSearchService.searchAdminProductsPage has no store filter, so this reader queries the
 * index directly. The scan stops after MAX_PAGES pages and reports truncation.
 */
@ApplicationScoped
public class StoreProductSource {

    static final int PAGE_SIZE = 500;
    static final int MAX_PAGES = 20;

    @Inject
    OpenSearchClient client;

    @ConfigProperty(name = "opensearch.index")
    String indexName;

    public ProductPage loadStoreProducts(UUID storeId, String storeCode) throws IOException {
        Query query = storeQuery(storeId, storeCode);
        List<ProductRef> products = new ArrayList<>();
        List<String> searchAfter = null;
        for (int page = 0; page < MAX_PAGES; page++) {
            SearchRequest.Builder request = new SearchRequest.Builder()
                    .index(indexName)
                    .size(PAGE_SIZE)
                    .sort(sortSpec -> sortSpec.field(field -> field.field("id").order(SortOrder.Asc)))
                    .query(query);
            if (searchAfter != null) {
                request.searchAfter(searchAfter);
            }
            SearchResponse<Product> response = client.search(request.build(), Product.class);
            List<Hit<Product>> hits = response.hits().hits();
            hits.stream()
                    .map(Hit::source)
                    .filter(Objects::nonNull)
                    .map(product -> new ProductRef(product.getId(), product.getName(), product.getLayoutCode()))
                    .forEach(products::add);
            if (hits.size() < PAGE_SIZE) {
                return new ProductPage(products, false);
            }
            searchAfter = hits.get(hits.size() - 1).sort();
            if (searchAfter == null || searchAfter.isEmpty()) {
                return new ProductPage(products, false);
            }
        }
        return new ProductPage(products, true);
    }

    private static Query storeQuery(UUID storeId, String storeCode) {
        String storeIdText = storeId.toString();
        String normalizedCode = storeCode == null || storeCode.isBlank() ? null : storeCode.trim();
        return Query.of(query -> query.bool(bool -> {
            bool.should(should -> should.term(term -> term.field("storeId").value(value -> value.stringValue(storeIdText))));
            if (normalizedCode != null) {
                bool.should(should -> should.term(term -> term.field("storeCode").value(value -> value.stringValue(normalizedCode))));
            }
            bool.should(should -> should.bool(global -> global
                    .mustNot(missing -> missing.exists(exists -> exists.field("storeId")))
                    .mustNot(missing -> missing.exists(exists -> exists.field("storeCode")))));
            return bool.minimumShouldMatch("1");
        }));
    }
}
