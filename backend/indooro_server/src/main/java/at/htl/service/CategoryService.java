package at.htl.service;

import at.htl.model.Category;
import at.htl.repository.CategoryRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.HashSet;
import java.util.Set;

@ApplicationScoped
public class CategoryService {

    private static final String SEED_FILE = "META-INF/resources/assets/data/categories.json";

    @Inject
    CategoryRepository categoryRepository;

    @Inject
    ObjectMapper objectMapper;

    public List<Category> getAllCategories(Integer size) throws IOException {
        ensureSeeded();
        return categoryRepository.findAll(normalizeSize(size));
    }

    public Category getCategoryByCode(Integer categoryCode) throws IOException {
        ensureSeeded();
        return categoryRepository.findByCode(categoryCode);
    }

    public CatalogBulkResult bulkInsert(List<Category> categories) throws IOException {
        validate(categories);
        categoryRepository.ensureIndex();
        return CatalogBulkResult.fromResponse(
                categories.stream().map(category -> String.valueOf(category.getCategoryCode())).toList(),
                categoryRepository.bulkIndex(categories));
    }

    private void ensureSeeded() throws IOException {
        categoryRepository.ensureIndex();
        if (categoryRepository.count() > 0) {
            return;
        }

        try (InputStream inputStream = Thread.currentThread().getContextClassLoader().getResourceAsStream(SEED_FILE)) {
            if (inputStream == null) {
                throw new IOException("Category seed file not found: " + SEED_FILE);
            }
            List<Category> categories = objectMapper.readValue(inputStream, new TypeReference<>() {
            });
            bulkInsert(categories);
        }
    }

    private int normalizeSize(Integer size) {
        if (size == null || size < 1) {
            return 100;
        }
        return Math.min(size, 500);
    }

    private void validate(List<Category> categories) {
        if (categories == null || categories.isEmpty()) {
            throw new IllegalArgumentException("At least one category is required");
        }

        Set<Integer> codes = new HashSet<>();
        for (Category category : categories) {
            if (category == null || category.getCategoryCode() == null || category.getCategoryCode() < 1 || category.getCategoryCode() > 999
                    || category.getCategoryName() == null || category.getCategoryName().isBlank()) {
                throw new IllegalArgumentException("Each category needs categoryCode and categoryName");
            }
            if (!codes.add(category.getCategoryCode())) {
                throw new IllegalArgumentException("Duplicate categoryCode: " + category.getCategoryCode());
            }
        }
    }
}
