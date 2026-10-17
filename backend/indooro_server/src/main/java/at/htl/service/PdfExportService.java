package at.htl.service;

import at.htl.model.Product;
import jakarta.enterprise.context.ApplicationScoped;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.text.PDFTextStripper;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@ApplicationScoped
public class PdfExportService {

    private record ShelfPosition(String categoryId, String meterId, int level, int position) {}

    static final int MAX_PRODUCTS = 2000;
    static final int MAX_NAME_LENGTH = 200;
    static final int MAX_LEVEL = 50;
    static final int MAX_POSITION = 50;
    static final int MAX_METER = 999;
    private static final int MAX_NUMBER_DIGITS = 9;

    public byte[] generatePdf(List<Product> products) throws IOException {
        if (products != null && products.size() > MAX_PRODUCTS) {
            throw new PdfInputException("Maximal " + MAX_PRODUCTS + " Produkte pro PDF-Export erlaubt.");
        }
        List<Product> safeProducts = products == null ? List.of()
                : products.stream().filter(Objects::nonNull).toList();
        // Alle Eingaben vor dem Rendern pruefen (schnell, ohne PDF-Aufbau)
        safeProducts.forEach(PdfExportService::validateProduct);

        try (PDDocument document = new PDDocument()) {

            Map<String, List<Product>> productsByCategory = safeProducts.stream()
                    .collect(Collectors.groupingBy(p -> parseCode(p.getLayoutCode()).categoryId()));

            List<String> sortedCategories = new ArrayList<>(productsByCategory.keySet());
            Collections.sort(sortedCategories);

            for (String categoryId : sortedCategories) {
                List<Product> categoryProducts = productsByCategory.get(categoryId);

                Map<String, List<Product>> productsByMeter = categoryProducts.stream()
                        .collect(Collectors.groupingBy(p -> parseCode(p.getLayoutCode()).meterId()));

                List<String> sortedMeters = new ArrayList<>(productsByMeter.keySet());
                sortedMeters.sort(Comparator.comparingInt(m -> {
                    try { return Integer.parseInt(m); } catch (Exception e) { return 0; }
                }));

                for (String meterId : sortedMeters) {
                    List<Product> meterProducts = productsByMeter.get(meterId);
                    createPageForMeter(document, categoryId, meterId, meterProducts);
                }
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    // -------------------- OHNE OCR: Text extrahieren / Console-Output --------------------

    public String extractText(byte[] pdfBytes) throws IOException {
        if (pdfBytes == null || pdfBytes.length == 0) return "";
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            return stripper.getText(doc);
        }
    }

    public void printExtractedTextToConsole(byte[] pdfBytes) throws IOException {
        System.out.println(extractText(pdfBytes));
    }

    public boolean hasExtractableText(byte[] pdfBytes) throws IOException {
        String text = extractText(pdfBytes);
        return text != null && !text.trim().isEmpty();
    }

    public void dumpDecompressedPageContentStreamsToConsole(byte[] pdfBytes) throws IOException {
        if (pdfBytes == null || pdfBytes.length == 0) return;

        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            int pageIndex = 0;
            for (PDPage page : doc.getPages()) {
                pageIndex++;
                System.out.println("=== Page " + pageIndex + " Content Stream (decompressed) ===");

                try (InputStream is = page.getContents()) {
                    if (is == null) {
                        System.out.println("(no page contents)");
                        continue;
                    }
                    byte[] bytes = is.readAllBytes();
                    System.out.println(new String(bytes, StandardCharsets.ISO_8859_1));
                }
            }
        }
    }

    // -------------------- PDF Layout --------------------

    private void createPageForMeter(PDDocument doc, String categoryId, String meterId, List<Product> products) throws IOException {
        PDPage page = new PDPage(new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth()));
        doc.addPage(page);

        try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
            drawHeader(content, categoryId, meterId);

            float pageWidth = page.getMediaBox().getWidth();
            float margin = 40;
            float spacing = 40;

            float graphicX = margin;
            float graphicWidth = (pageWidth - (2 * margin) - spacing) * 0.55f;

            float listX = graphicX + graphicWidth + spacing;
            float listWidth = (pageWidth - (2 * margin) - spacing) * 0.45f;

            float startY = 500;

            drawVisualShelf(content, products, graphicX, startY, graphicWidth);
            drawProductList(content, products, listX, startY, listWidth);
        }
    }

    private void drawVisualShelf(PDPageContentStream content, List<Product> products, float x, float y, float width) throws IOException {
        content.beginText();
        content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 14);
        content.setNonStrokingColor(Color.BLACK);
        content.newLineAtOffset(x, y + 25);
        content.showText("VISUALISIERUNG");
        content.endText();

        int maxLevel = products.stream().mapToInt(p -> parseCode(p.getLayoutCode()).level()).max().orElse(1);
        float shelfHeight = 75;

        for (int level = maxLevel; level >= 1; level--) {
            float currentY = y - ((maxLevel - level + 1) * shelfHeight);

            content.setStrokingColor(Color.BLACK);
            content.setLineWidth(1.5f);
            content.addRect(x, currentY, width, shelfHeight);
            content.stroke();

            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 10);
            content.setNonStrokingColor(Color.BLACK);
            content.newLineAtOffset(x - 25, currentY + (shelfHeight / 2));
            content.showText("B" + level);
            content.endText();

            int finalLevel = level;
            List<Product> levelProducts = products.stream()
                    .filter(p -> parseCode(p.getLayoutCode()).level() == finalLevel)
                    .sorted(Comparator.comparingInt(p -> parseCode(p.getLayoutCode()).position()))
                    .toList();

            if (!levelProducts.isEmpty()) {
                float productWidth = width / levelProducts.size();
                for (int i = 0; i < levelProducts.size(); i++) {
                    Product p = levelProducts.get(i);
                    float pX = x + (i * productWidth);

                    content.setStrokingColor(Color.GRAY);
                    content.setLineWidth(0.5f);
                    content.addRect(pX, currentY, productWidth, shelfHeight);
                    content.stroke();

                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 8);
                    content.setNonStrokingColor(Color.BLACK);

                    content.newLineAtOffset(pX + 3, currentY + shelfHeight - 12);
                    String nameVal = sanitize(p.getName());
                    String shortName = nameVal.length() > 12 ? nameVal.substring(0, 10) + ".." : nameVal;
                    content.showText(shortName);

                    content.newLineAtOffset(0, -12);
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.COURIER), 7);
                    content.setNonStrokingColor(Color.BLUE);
                    content.showText(sanitize(p.getLayoutCode()));

                    content.endText();
                }
            }
        }
    }

    /**
     * Rechte Seite: Detaillierte Liste (Tabelle)  -> jetzt mit ID-Spalte
     */
    private void drawProductList(PDPageContentStream content, List<Product> products, float x, float y, float width) throws IOException {
        content.beginText();
        content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 14);
        content.setNonStrokingColor(Color.BLACK);
        content.newLineAtOffset(x, y + 25);
        content.showText("BESTÜCKUNGSLISTE");
        content.endText();

        float currentY = y;
        float rowHeight = 18;

        content.setLineWidth(1f);
        content.moveTo(x, currentY + 5);
        content.lineTo(x + width, currentY + 5);
        content.stroke();

        // Spalten-Offsets (relativ zu x)
        final float COL_POS  = 0;
        final float COL_ID   = 45;
        final float COL_NAME = 85;
        final float COL_CODE = 245;

        // Header: POS | ID | ARTIKELNAME | CODE
        content.beginText();
        content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 9);
        content.newLineAtOffset(x + COL_POS, currentY + 10);
        content.showText("POS");
        content.newLineAtOffset(COL_ID - COL_POS, 0);
        content.showText("ID");
        content.newLineAtOffset(COL_NAME - COL_ID, 0);
        content.showText("ARTIKELNAME");
        content.newLineAtOffset(COL_CODE - COL_NAME, 0);
        content.showText("CODE");
        content.endText();

        List<Product> sortedList = products.stream()
                .sorted(Comparator.comparingInt((Product p) -> parseCode(p.getLayoutCode()).level()).reversed()
                        .thenComparingInt(p -> parseCode(p.getLayoutCode()).position()))
                .toList();

        for (Product p : sortedList) {
            currentY -= rowHeight;
            ShelfPosition pos = parseCode(p.getLayoutCode());

            content.setStrokingColor(Color.LIGHT_GRAY);
            content.setLineWidth(0.5f);
            content.moveTo(x, currentY - 2);
            content.lineTo(x + width, currentY - 2);
            content.stroke();

            content.beginText();
            content.setNonStrokingColor(Color.BLACK);
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 9);

            // POS
            content.newLineAtOffset(x + COL_POS, currentY + 3);
            content.showText("B" + pos.level + "-P" + pos.position);

            // ID (neu)
            content.newLineAtOffset(COL_ID - COL_POS, 0);
            content.showText(p.getId() == null ? "" : String.valueOf(p.getId()));

            // Name
            content.newLineAtOffset(COL_NAME - COL_ID, 0);
            String name = sanitize(p.getName());
            if (name.length() > 30) name = name.substring(0, 27) + "...";
            content.showText(name);

            // Code
            content.newLineAtOffset(COL_CODE - COL_NAME, 0);
            content.setFont(new PDType1Font(Standard14Fonts.FontName.COURIER), 9);
            content.showText(sanitize(p.getLayoutCode()));

            content.endText();
        }
    }

    private void drawHeader(PDPageContentStream content, String categoryId, String meterId) throws IOException {
        content.beginText();
        content.setNonStrokingColor(Color.BLACK);
        content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 24);
        content.newLineAtOffset(40, 560);
        content.showText(sanitize("BELEGPLAN: KATEGORIE " + categoryId + " - METER " + meterId));
        content.endText();

        content.beginText();
        content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
        content.newLineAtOffset(40, 545);
        content.showText("Erstellt: " + LocalDate.now());
        content.endText();

        content.setStrokingColor(Color.BLACK);
        content.setLineWidth(2f);
        content.moveTo(40, 540);
        content.lineTo(800, 540);
        content.stroke();
    }

    private static void validateProduct(Product p) {
        String name = p.getName();
        if (name != null && name.length() > MAX_NAME_LENGTH) {
            throw new PdfInputException("Produktname darf hoechstens " + MAX_NAME_LENGTH + " Zeichen lang sein.");
        }
        parseCode(p.getLayoutCode());
    }

    /**
     * Layoutcode im Format kategorie/meter/level/position.
     * Fehlender Code (null) und leerer Code bleiben erlaubt und ergeben die bisherigen Platzhalter.
     * Jeder andere Code muss exakt 4 Teile haben; meter, level und position sind Ganzzahlen im erlaubten Bereich.
     */
    private static ShelfPosition parseCode(String code) {
        if (code == null) return new ShelfPosition("?", "?", 1, 1);
        if (code.isBlank()) return new ShelfPosition("Unknown", "1", 1, 1);

        String[] parts = code.split("/", -1);
        if (parts.length != 4) {
            throw new PdfInputException("Ungueltiger Layoutcode '" + code + "': erwartet kategorie/meter/level/position.");
        }
        int meter = parseBoundedNumber(parts[1], 1, MAX_METER, "Meter", code);
        int level = parseBoundedNumber(parts[2], 1, MAX_LEVEL, "Level", code);
        int position = parseBoundedNumber(parts[3], 1, MAX_POSITION, "Position", code);
        return new ShelfPosition(parts[0], String.valueOf(meter), level, position);
    }

    private static int parseBoundedNumber(String value, int min, int max, String label, String code) {
        // Laengenpruefung vor dem Parsen, damit Ueberlaeufe gar nicht erst entstehen
        if (value.isEmpty() || value.length() > MAX_NUMBER_DIGITS || !value.chars().allMatch(c -> c >= '0' && c <= '9')) {
            throw new PdfInputException("Ungueltiger " + label + " im Layoutcode '" + code + "'.");
        }
        int number = Integer.parseInt(value);
        if (number < min || number > max) {
            throw new PdfInputException(label + " im Layoutcode '" + code + "' muss zwischen " + min + " und " + max + " liegen.");
        }
        return number;
    }

    /**
     * Ersetzt Zeichen, die die Standard-14-Schriften (WinAnsi) nicht darstellen koennen, durch '?'.
     * Steuerzeichen und alles ausserhalb von Latin-1 wird ersetzt; ein Surrogatpaar ergibt ein '?'.
     */
    static String sanitize(String text) {
        if (text == null) return "";
        StringBuilder sb = new StringBuilder(text.length());
        text.codePoints().forEach(cp -> sb.append(isWinAnsiPrintable(cp) ? (char) cp : '?'));
        return sb.toString();
    }

    private static boolean isWinAnsiPrintable(int codePoint) {
        if (codePoint > 255) return false;
        if (codePoint < 0x20) return false;
        return codePoint < 0x7F || codePoint > 0x9F;
    }
}
