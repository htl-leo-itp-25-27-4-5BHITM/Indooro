package at.htl.service;

import at.htl.model.Product;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeout;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PdfExportServiceBoundsTest {

    private final PdfExportService service = new PdfExportService();

    private static Product product(String name, String layoutCode) {
        return new Product(1, name, null, layoutCode);
    }

    @Test
    void rejectsMoreThan2000Products() {
        List<Product> products = new ArrayList<>();
        for (int i = 0; i < 2001; i++) {
            products.add(product("Produkt " + i, "310/1/1/1"));
        }
        assertThrows(PdfInputException.class, () -> service.generatePdf(products));
    }

    @Test
    void rejectsNameLongerThan200Characters() {
        assertThrows(PdfInputException.class,
                () -> service.generatePdf(List.of(product("a".repeat(201), "310/1/1/1"))));
    }

    @Test
    void acceptsNameWith200Characters() {
        assertDoesNotThrow(() -> service.generatePdf(List.of(product("a".repeat(200), "310/1/1/1"))));
    }

    @Test
    void rejectsOversizedLevelQuicklyWithoutRendering() {
        assertTimeout(Duration.ofSeconds(1), () ->
                assertThrows(PdfInputException.class,
                        () -> service.generatePdf(List.of(product("Apfel", "1/1/2000000000/1")))));
    }

    @Test
    void rejectsLevelOutOfRange() {
        assertThrows(PdfInputException.class,
                () -> service.generatePdf(List.of(product("Apfel", "310/1/51/1"))));
    }

    @Test
    void rejectsPositionOutOfRange() {
        assertThrows(PdfInputException.class,
                () -> service.generatePdf(List.of(product("Apfel", "310/1/1/0"))));
    }

    @Test
    void rejectsMeterOutOfRange() {
        assertThrows(PdfInputException.class,
                () -> service.generatePdf(List.of(product("Apfel", "310/1000/1/1"))));
    }

    @Test
    void rejectsNonNumericOrWrongPartCount() {
        assertThrows(PdfInputException.class,
                () -> service.generatePdf(List.of(product("Apfel", "310/1/x/1"))));
        assertThrows(PdfInputException.class,
                () -> service.generatePdf(List.of(product("Apfel", "310/1/1"))));
    }

    @Test
    void missingLayoutCodeStaysAllowed() {
        assertDoesNotThrow(() -> service.generatePdf(List.of(product("Apfel", null))));
    }

    @Test
    void unencodableEmojiIsReplacedAndPdfStaysValid() throws Exception {
        byte[] pdf = service.generatePdf(List.of(product("Apfel 🍎", "310/1/1/1")));

        assertTrue(new String(pdf, 0, 4, StandardCharsets.ISO_8859_1).startsWith("%PDF"));
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(doc);
            assertTrue(text.contains("Apfel ?"), "Extrahierter Text: " + text);
        }
    }

    @Test
    void everyLatin1CharacterCanBeRendered() {
        List<Product> products = new ArrayList<>();
        // Ein Produkt pro Zeichen, jeweils auf eigenem Meter (eigene Seite)
        for (int cp = 0x20; cp <= 0xFF; cp++) {
            products.add(product(String.valueOf((char) cp), "310/" + (cp - 0x1F) + "/1/1"));
        }
        products.add(product("Ü\u0000\u0007\u0081€🍎", "310/300/1/1"));

        assertDoesNotThrow(() -> service.generatePdf(products));
    }
}
