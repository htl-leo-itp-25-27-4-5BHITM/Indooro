package at.htl.resource.admin;

import at.htl.admin.entity.LayoutUnderlayEntity;
import at.htl.admin.repository.LayoutUnderlayRepository;
import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.AdminRole;
import at.htl.admin.service.AuditLogService;
import at.htl.admin.service.CurrentAdminUser;
import at.htl.admin.service.StoreAdminService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import jakarta.ws.rs.ForbiddenException;
import org.junit.jupiter.api.Test;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.UUID;
import javax.imageio.ImageIO;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@QuarkusTest
class StoreLayoutUnderlayResourceTest {
    private static final UUID STORE = UUID.fromString("82828282-8282-8282-8282-828282828282");

    @InjectMock LayoutUnderlayRepository repository;
    @InjectMock AdminAccessService access;
    @InjectMock StoreAdminService stores;
    @InjectMock AuditLogService audit;

    @Test
    void anonymousCannotReadUnderlay() {
        given().get(path()).then().statusCode(401);
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void foreignStoreIsForbidden() {
        doThrow(new ForbiddenException("Kein Zugriff auf diese Filiale.")).when(access).requireStoreAccess(STORE);
        given().get(path()).then().statusCode(403);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void uploadsReadsAndDeletesImage() throws Exception {
        when(access.currentUser()).thenReturn(new CurrentAdminUser("test-admin", "test", null, AdminRole.ADMIN, null));
        String image = Base64.getEncoder().encodeToString(png());
        given().contentType("application/json")
                .body("{\"contentType\":\"image/png\",\"imageBase64\":\"" + image + "\",\"opacity\":0.5}")
                .put(path()).then().statusCode(200)
                .header("Cache-Control", containsString("no-store"))
                .body("widthPx", equalTo(2), "heightPx", equalTo(3));
        verify(repository).persist(any(LayoutUnderlayEntity.class));

        LayoutUnderlayEntity stored = new LayoutUnderlayEntity();
        stored.storeId = STORE;
        stored.contentType = "image/png";
        stored.bytes = png();
        stored.widthPx = 2;
        stored.heightPx = 3;
        stored.updatedAt = java.time.Instant.now();
        when(repository.findByIdOptional(STORE)).thenReturn(java.util.Optional.of(stored));
        given().get(path()).then().statusCode(200).body("imageBase64", equalTo(image));
        given().delete(path()).then().statusCode(204);
        verify(repository).delete(stored);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void rejectsOversizedAndWrongType() throws Exception {
        String huge = Base64.getEncoder().encodeToString(png(8001, 1));
        given().contentType("application/json")
                .body("{\"contentType\":\"image/png\",\"imageBase64\":\"" + huge + "\"}")
                .put(path()).then().statusCode(413);
        given().contentType("application/json")
                .body("{\"contentType\":\"image/png\",\"imageBase64\":\"R0lGODlh\"}")
                .put(path()).then().statusCode(415);
    }

    private static String path() { return "/api/stores/" + STORE + "/layout/underlay"; }

    private static byte[] png() throws Exception { return png(2, 3); }

    private static byte[] png(int width, int height) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", output);
        return output.toByteArray();
    }
}
