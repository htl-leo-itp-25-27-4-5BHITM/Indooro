package at.htl.service;

import at.htl.model.Product;
import at.htl.service.PdfImportService.ImportItem;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeout;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PdfImportServiceBoundsTest {

    private final PdfExportService exportService = new PdfExportService();
    private final PdfImportService importService = new PdfImportService();

    @Test
    void exportThenImportRoundTripReturnsItems() throws Exception {
        List<Product> products = List.of(
                new Product(1, "Milch", null, "1/1/1/1"),
                new Product(2, "Brot", null, "1/1/2/3"));

        byte[] pdf = exportService.generatePdf(products);
        List<ImportItem> items = importService.importFromPdf(pdf);

        assertEquals(2, items.size());
        assertTrue(items.stream().anyMatch(i -> i.id() == 1 && "Milch".equals(i.name())
                && "1/1/1/1".equals(i.layoutCode()) && i.level() == 1 && i.position() == 1));
        assertTrue(items.stream().anyMatch(i -> i.id() == 2 && "Brot".equals(i.name())
                && "1/1/2/3".equals(i.layoutCode()) && i.level() == 2 && i.position() == 3));
        assertTrue(items.stream().allMatch(i -> "1".equals(i.category()) && "1".equals(i.meter())));
    }

    @Test
    void lineParserKeepsNamesWithSpaces() {
        String text = "BELEGPLAN: KATEGORIE 310 - METER 2\n"
                + "B1-P2 7 Vollmilch 3,5% 310/2/1/2\n"
                + "noch eine kaputte Zeile\n";

        List<ImportItem> items = importService.parseExtractedText(text);

        assertEquals(1, items.size());
        assertEquals(7, items.get(0).id());
        assertEquals("Vollmilch 3,5%", items.get(0).name());
        assertEquals("310/2/1/2", items.get(0).layoutCode());
        assertEquals("310", items.get(0).category());
        assertEquals("2", items.get(0).meter());
    }

    @Test
    void rejectsFileLargerThan10Mb() {
        byte[] tooLarge = new byte[10 * 1024 * 1024 + 1];
        assertThrows(PdfInputException.class, () -> importService.importFromPdf(tooLarge));
    }

    @Test
    void rejectsPdfWithMoreThan50Pages() throws IOException {
        byte[] pdf;
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < 51; i++) {
                doc.addPage(new PDPage());
            }
            doc.save(out);
            pdf = out.toByteArray();
        }
        byte[] bytes = pdf;
        assertThrows(PdfInputException.class, () -> importService.importFromPdf(bytes));
    }

    @Test
    void longDigitLineIsRejectedFastWithoutMatches() {
        String digits = "1".repeat(100_000);

        assertTimeout(Duration.ofSeconds(1), () -> {
            assertEquals(List.of(), importService.parseExtractedText(digits));
            assertEquals(List.of(), importService.parseExtractedText("B1-P1 " + digits + " Milch 1/1/1/1"));
            assertEquals(List.of(), importService.parseExtractedText("B1-P1 1 " + "a".repeat(100_000) + " 1/1/1/1"));
        });
    }
}
