package at.htl.service;

/**
 * Wird geworfen, wenn Eingaben fuer PDF-Export oder PDF-Import die festgelegten Grenzen verletzen.
 * Die Resources beantworten sie mit HTTP 400.
 */
public class PdfInputException extends IllegalArgumentException {

    public PdfInputException(String message) {
        super(message);
    }
}
