import { useEffect } from "react";
import { useOrganizationList, useOrganization } from "@clerk/clerk-react";

/**
 * Component that automatically sets the user's organization as active
 * This ensures the organization ID appears in session claims (auth.sessionClaims.o.id)
 */
export function OrganizationManager() {
  const { setActive, userMemberships } = useOrganizationList({
    userMemberships: {
      infinite: true,
    },
  });
  const { organization } = useOrganization();

  useEffect(() => {
    // If user is not in an active organization but has memberships, activate the first one
    if (!organization && userMemberships?.data && userMemberships.data.length > 0) {
      const firstOrg = userMemberships.data[0].organization;
      setActive?.({ organization: firstOrg.id });
    }
  }, [organization, userMemberships, setActive]);

  // This component doesn't render anything
  return null;
}
