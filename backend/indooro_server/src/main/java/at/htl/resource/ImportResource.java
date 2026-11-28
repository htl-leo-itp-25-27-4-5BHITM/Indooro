package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.service.PdfImportService;
import at.htl.service.PdfInputException;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.jboss.resteasy.reactive.RestForm;

import java.io.File;
import java.io.IOException;
import java.util.List;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/api/convert")
@Tag(name = "utility")
public class ImportResource {

    @Inject
    PdfImportService pdfImportService;

    @Inject
    AdminAccessService adminAccessService;

    public record ProductJson(
            Integer id,
            String name,
            String layoutCode
    ) {}

    @Operation(operationId = "convertPdfToJson")
    @POST
    @Path("/pdf-to-json")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @RolesAllowed("admin")
    public Response convertPdfToJson(@RestForm("file") File file) {
        adminAccessService.requireAdmin();

        if (file == null || !file.exists()) {
            throw new WebApplicationException("Keine Datei hochgeladen", Response.Status.BAD_REQUEST);
        }

        try {
            List<PdfImportService.ImportItem> items = pdfImportService.parsePdf(file);

            List<ProductJson> out = items.stream()
                    .map(it -> new ProductJson(
                            it.id(),
                            it.name(),
                            it.layoutCode()
                    ))
                    .toList();

            return Response.ok(out).build();

        } catch (PdfInputException e) {
            throw new WebApplicationException(e.getMessage(), e, Response.Status.BAD_REQUEST);
        } catch (IOException e) {
            throw new WebApplicationException("PDF import failed", e, Response.Status.INTERNAL_SERVER_ERROR);
        }
    }
}
