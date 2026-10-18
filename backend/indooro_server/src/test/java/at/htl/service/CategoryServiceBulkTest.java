package at.htl.service;

import at.htl.model.Category;
import at.htl.repository.CategoryRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.opensearch.client.opensearch.core.BulkResponse;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CategoryServiceBulkTest {
    @Test
    void duplicateCategoryCodesAreRejectedBeforeAnyWrite() throws IOException {
        CategoryService service = new CategoryService();
        service.categoryRepository = mock(CategoryRepository.class);

        assertThrows(IllegalArgumentException.class, () -> service.bulkInsert(List.of(
                new Category(310, "Obst"), new Category(310, "Gemüse"))));

        verify(service.categoryRepository, never()).bulkIndex(anyList());
    }

    @Test
    void createOnlyValidatesBeforeAtomicWrite() throws IOException {
        CategoryService service = new CategoryService();
        service.categoryRepository = mock(CategoryRepository.class);
        assertThrows(IllegalArgumentException.class, () -> service.create(new Category(0, "Invalid")));
        verify(service.categoryRepository, never()).create(org.mockito.ArgumentMatchers.any(Category.class));
        service.create(new Category(312, "Neu"));
        verify(service.categoryRepository).create(org.mockito.ArgumentMatchers.any(Category.class));
    }

    @Test
    void writesNeitherPrepareTheIndexNorSeed() throws IOException {
        CategoryRepository repository = mock(CategoryRepository.class);
        BulkResponse bulk = BulkResponse.of(b -> b.took(1L).errors(false).items(List.of()));
        when(repository.bulkIndex(anyList())).thenReturn(bulk);
        CategoryService service = new CategoryService();
        service.categoryRepository = repository;

        service.bulkInsert(List.of(new Category(310, "Obst")));
        service.create(new Category(312, "Neu"));

        verify(repository, never()).ensureIndex();
        verify(repository, never()).count();
    }

    @Test
    void seedIfEmptyLoadsBundledCategoriesWhenTheIndexIsEmpty() throws IOException {
        CategoryRepository repository = mock(CategoryRepository.class);
        BulkResponse bulk = BulkResponse.of(b -> b.took(1L).errors(false).items(List.of()));
        when(repository.count()).thenReturn(0L);
        when(repository.bulkIndex(anyList())).thenReturn(bulk);
        CategoryService service = seedingService(repository);

        service.seedIfEmpty();

        verify(repository).bulkIndex(anyList());
    }

    @Test
    void seedIfEmptyLeavesAnIndexWithEntriesUntouched() throws IOException {
        CategoryRepository repository = mock(CategoryRepository.class);
        when(repository.count()).thenReturn(12L);
        CategoryService service = seedingService(repository);

        service.seedIfEmpty();

        verify(repository, never()).bulkIndex(anyList());
    }

    private static CategoryService seedingService(CategoryRepository repository) {
        CategoryService service = new CategoryService();
        service.categoryRepository = repository;
        service.objectMapper = new ObjectMapper();
        return service;
    }
}
