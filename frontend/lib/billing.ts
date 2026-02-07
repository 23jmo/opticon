import { flowglad } from "@/lib/flowglad";
import { PLAN_LIMITS, PRO_FEATURE_SLUG } from "@/lib/billing-constants";

// Re-export constants so existing server-side imports still work
export { PLAN_LIMITS, PRO_FEATURE_SLUG } from "@/lib/billing-constants";

export async function getMaxAgentsForUser(userId: string): Promise<number> {
  try {
    const billing = await flowglad(userId).getBilling();
    const hasPro = billing.checkFeatureAccess(PRO_FEATURE_SLUG);
    return hasPro ? PLAN_LIMITS.pro.maxAgents : PLAN_LIMITS.free.maxAgents;
  } catch {
    return PLAN_LIMITS.free.maxAgents;
  }
}

export async function isProUser(userId: string): Promise<boolean> {
  try {
    const billing = await flowglad(userId).getBilling();
    return billing.checkFeatureAccess(PRO_FEATURE_SLUG);
  } catch {
    return false;
  }
}
