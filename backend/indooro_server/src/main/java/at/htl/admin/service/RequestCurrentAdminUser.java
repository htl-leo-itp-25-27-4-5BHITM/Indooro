package at.htl.admin.service;

import jakarta.enterprise.context.RequestScoped;

/** Per-request cache of the resolved admin user, so repeated access checks in one request query the assignment once. */
@RequestScoped
public class RequestCurrentAdminUser {

    private CurrentAdminUser user;

    public CurrentAdminUser current() {
        return user;
    }

    public void remember(CurrentAdminUser user) {
        this.user = user;
    }
}
