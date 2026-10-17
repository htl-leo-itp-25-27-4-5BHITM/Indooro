package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.model.Product;
import at.htl.service.PdfExportService;
import at.htl.service.PdfInputException;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.Map;

@Path("/api/export")
public class ExportResource {

    @Inject
    PdfExportService pdfExportService;

    @Inject
    AdminAccessService adminAccessService;

    @POST
    @Path("/pdf")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces("application/pdf")
    @RolesAllowed("admin")
    public Response exportBelegplanPdf(List<Product> products) {
        adminAccessService.requireAdmin();
        try {
            // 1. PDF generieren
            byte[] pdfBytes = pdfExportService.generatePdf(products);

            // 2. Als Datei zurückgeben
            return Response.ok(pdfBytes)
                    .header("Content-Disposition", "attachment; filename=\"belegplan_export.pdf\"")
                    .build();

        } catch (PdfInputException e) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .type(MediaType.APPLICATION_JSON)
                    .entity(Map.of("error", e.getMessage()))
                    .build();
        } catch (Exception e) {
            e.printStackTrace();
            return Response.serverError().entity("Fehler beim PDF Export: " + e.getMessage()).build();
        }
    }
}