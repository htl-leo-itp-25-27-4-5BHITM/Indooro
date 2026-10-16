package at.htl.admin.service;

import at.htl.admin.entity.recipe.RecipeEntity;

import java.text.Collator;
import java.util.Comparator;
import java.util.Locale;

/** The legacy recipe list's German, numeric-aware ascending order. */
final class RecipeSort {
    private RecipeSort() {}

    static Comparator<RecipeEntity> comparator(String field) {
        if ("publishedAt".equals(field)) {
            return Comparator.comparing((RecipeEntity recipe) -> recipe.publishedAt,
                    Comparator.nullsLast(Comparator.naturalOrder())).thenComparing(recipe -> recipe.id);
        }
        Collator collator = Collator.getInstance(Locale.GERMAN);
        collator.setStrength(Collator.PRIMARY);
        collator.setDecomposition(Collator.CANONICAL_DECOMPOSITION);
        return (left, right) -> {
            Object a = value(left, field);
            Object b = value(right, field);
            if (a == null || b == null) {
                if (a != b) return a == null ? 1 : -1;
            } else {
                int result = natural(String.valueOf(a), String.valueOf(b), collator);
                if (result != 0) return result;
            }
            return left.id.compareTo(right.id);
        };
    }

    private static Object value(RecipeEntity recipe, String field) {
        return switch (field) {
            case "status" -> recipe.status;
            default -> recipe.title;
        };
    }

    private static int natural(String left, String right, Collator collator) {
        int i = 0, j = 0;
        while (i < left.length() && j < right.length()) {
            boolean leftDigit = Character.digit(left.charAt(i), 10) >= 0;
            boolean rightDigit = Character.digit(right.charAt(j), 10) >= 0;
            if (leftDigit && rightDigit) {
                int iEnd = i, jEnd = j;
                while (iEnd < left.length() && Character.digit(left.charAt(iEnd), 10) >= 0) iEnd++;
                while (jEnd < right.length() && Character.digit(right.charAt(jEnd), 10) >= 0) jEnd++;
                int iTrim = i, jTrim = j;
                while (iTrim < iEnd - 1 && Character.digit(left.charAt(iTrim), 10) == 0) iTrim++;
                while (jTrim < jEnd - 1 && Character.digit(right.charAt(jTrim), 10) == 0) jTrim++;
                int lengthOrder = Integer.compare(iEnd - iTrim, jEnd - jTrim);
                if (lengthOrder != 0) return lengthOrder;
                for (int offset = 0; offset < iEnd - iTrim; offset++) {
                    int digitOrder = Integer.compare(Character.digit(left.charAt(iTrim + offset), 10), Character.digit(right.charAt(jTrim + offset), 10));
                    if (digitOrder != 0) return digitOrder;
                }
                i = iEnd; j = jEnd;
                continue;
            }
            if (leftDigit != rightDigit) return collator.compare(left.substring(i, i + 1), right.substring(j, j + 1));
            int iEnd = i, jEnd = j;
            while (iEnd < left.length() && Character.digit(left.charAt(iEnd), 10) < 0) iEnd++;
            while (jEnd < right.length() && Character.digit(right.charAt(jEnd), 10) < 0) jEnd++;
            int textOrder = collator.compare(left.substring(i, iEnd), right.substring(j, jEnd));
            if (textOrder != 0) return textOrder;
            i = iEnd; j = jEnd;
        }
        return Integer.compare(left.length() - i, right.length() - j);
    }
}
