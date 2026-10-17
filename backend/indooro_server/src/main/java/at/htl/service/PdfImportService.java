package at.htl.service;

import at.htl.model.Product;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import jakarta.enterprise.context.ApplicationScoped;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@ApplicationScoped
public class PdfImportService {

    public record ImportItem(
            Integer id,
            String category,
            String meter,
            String pos,
            Integer level,
            Integer position,
            String name,
            String layoutCode
    ) {}

    static final long MAX_PDF_BYTES = 10L * 1024 * 1024;
    static final int MAX_PDF_PAGES = 50;

    // Header (überall im Text), Zahlen begrenzt
    private static final Pattern HEADER_ANYWHERE =
            Pattern.compile("BELEGPLAN:\\s*KATEGORIE\\s+(\\d{1,9})\\s*-\\s*METER\\s+(\\d{1,9})", Pattern.CASE_INSENSITIVE);

    // Item-Zeile: POS + ID + Name + LayoutCode. Wird zeilenweise mit find() angewendet (ohne DOTALL);
    // die Zeile kann durch Shelf-Beschriftungen davor verunreinigt sein, daher kein ^-Anker.
    // Alle Zahlengruppen sind in der Laenge begrenzt, Name ist auf 200 Zeichen begrenzt.
    private static final Pattern ITEM_LINE =
            Pattern.compile("(B(\\d{1,3})-P(\\d{1,3}))\\s+(\\d{1,9})\\s+(.{1,200}?)\\s+((\\d{1,9})/(\\d{1,3})/(\\d{1,3})/(\\d{1,3}))\\s*$");

    public List<ImportItem> parsePdf(File pdfFile) throws IOException {
        if (pdfFile == null || !pdfFile.exists()) return List.of();
        if (pdfFile.length() > MAX_PDF_BYTES) {
            throw new PdfInputException("PDF-Datei ist zu gross (maximal 10 MB).");
        }
        byte[] pdfBytes = Files.readAllBytes(pdfFile.toPath());
        return importFromPdf(pdfBytes);
    }

    public List<ImportItem> importFromPdf(byte[] pdfBytes) throws IOException {
        if (pdfBytes != null && pdfBytes.length > MAX_PDF_BYTES) {
            throw new PdfInputException("PDF-Datei ist zu gross (maximal 10 MB).");
        }
        String text = extractText(pdfBytes);
        return parseExtractedText(text);
    }

    public String importFromPdfAsJson(byte[] pdfBytes) throws IOException {
        List<ImportItem> items = importFromPdf(pdfBytes);
        ObjectMapper om = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
        return om.writeValueAsString(items);
    }

    /**
     * Wenn du direkt wieder Product-Objekte willst:
     * price bleibt null (steht nicht im PDF), aber id/name/layoutCode sind drin.
     */
    public List<Product> importProductsFromPdf(byte[] pdfBytes) throws IOException {
        List<ImportItem> items = importFromPdf(pdfBytes);
        return items.stream()
                .map(it -> new Product(it.id(), it.name(), null, it.layoutCode()))
                .toList();
    }

    // ---------------- intern ----------------

    private String extractText(byte[] pdfBytes) throws IOException {
        if (pdfBytes == null || pdfBytes.length == 0) return "";
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            if (doc.getNumberOfPages() > MAX_PDF_PAGES) {
                throw new PdfInputException("PDF hat zu viele Seiten (maximal " + MAX_PDF_PAGES + ").");
            }
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            stripper.setLineSeparator("\n");
            return stripper.getText(doc);
        }
    }

    List<ImportItem> parseExtractedText(String text) {
        if (text == null || text.isBlank()) return List.of();

        String normalized = text
                .replace("\r", "\n")
                .replaceAll("[ \\t\\f\\u00A0]+", " ")
                .replaceAll("\\n{2,}", "\n");

        List<HeaderHit> headers = new ArrayList<>();
        Matcher mh = HEADER_ANYWHERE.matcher(normalized);
        while (mh.find()) {
            headers.add(new HeaderHit(mh.start(), mh.group(1), mh.group(2)));
        }

        // Falls kein Header gefunden wird: trotzdem global parsen
        if (headers.isEmpty()) {
            return dedupByLayout(parseItemsInBlock(normalized, "?", "?"));
        }

        List<ImportItem> out = new ArrayList<>();
        for (int i = 0; i < headers.size(); i++) {
            HeaderHit h = headers.get(i);
            int start = h.start;
            int end = (i + 1 < headers.size()) ? headers.get(i + 1).start : normalized.length();
            String block = normalized.substring(start, end);

            out.addAll(parseItemsInBlock(block, h.category, h.meter));
        }

        return dedupByLayout(out);
    }

    private List<ImportItem> parseItemsInBlock(String block, String category, String meter) {
        List<ImportItem> items = new ArrayList<>();

        for (String line : block.split("\n")) {
            Matcher mi = ITEM_LINE.matcher(line.strip());
            if (!mi.find()) continue;

            String pos = mi.group(1);
            int level = Integer.parseInt(mi.group(2));
            int position = Integer.parseInt(mi.group(3));

            Integer id;
            try {
                id = Integer.parseInt(mi.group(4));
            } catch (Exception e) {
                id = null;
            }

            String name = cleanupName(mi.group(5));
            String layoutCode = mi.group(6);

            if (isGarbageName(name)) continue;

            items.add(new ImportItem(id, category, meter, pos, level, position, name, layoutCode));
        }

        return items;
    }

    private List<ImportItem> dedupByLayout(List<ImportItem> items) {
        Map<String, ImportItem> map = new LinkedHashMap<>();
        for (ImportItem it : items) {
            if (it.layoutCode() != null && !it.layoutCode().isBlank()) {
                map.putIfAbsent(it.layoutCode(), it);
            }
        }
        return new ArrayList<>(map.values());
    }

    private String cleanupName(String name) {
        if (name == null) return "";
        return name.replace("\n", " ").replaceAll("\\s{2,}", " ").trim();
    }

    private boolean isGarbageName(String name) {
        if (name == null) return true;
        String n = name.trim().toUpperCase(Locale.ROOT);

        return n.isEmpty()
                || n.equals("POS")
                || n.equals("ID")
                || n.equals("ARTIKELNAME")
                || n.equals("CODE")
                || n.equals("VISUALISIERUNG")
                || n.equals("BESTÜCKUNGSLISTE")
                || n.startsWith("ERSTELLT:");
    }

    private record HeaderHit(int start, String category, String meter) {}
}
