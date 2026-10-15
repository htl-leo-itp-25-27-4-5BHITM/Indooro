package at.htl.service;

import at.htl.model.Category;
import at.htl.repository.CategoryRepository;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

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
}
