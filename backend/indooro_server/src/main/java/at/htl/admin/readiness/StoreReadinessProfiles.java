package at.htl.admin.readiness;

import java.util.Set;

/** Public view of the coverage profile ids from coverage-rule.json ("market" plus the named profiles). */
public final class StoreReadinessProfiles {

    /** Profile of every store that was not set otherwise. Same values as the top level of coverage-rule.json. */
    public static final String DEFAULT = CoverageRule.PROFILE_MARKET;

    private StoreReadinessProfiles() {
    }

    public static boolean isKnown(String profileId) {
        return CoverageRule.forProfile(profileId) != null;
    }

    public static Set<String> ids() {
        return CoverageRule.profileIds();
    }
}
