export const ADMIN_SUBSCRIPTION_ROUTE = "/admin/assinatura";

export type AdminSubscriptionFlow = "change-plan" | "payment-method";

type BuildAdminSubscriptionRouteInput = {
  planId?: string | null;
  flow?: AdminSubscriptionFlow | null;
};

export function buildAdminSubscriptionRoute(input?: BuildAdminSubscriptionRouteInput) {
  const params = new URLSearchParams();

  if (input?.planId) {
    params.set("plano", input.planId);
  }

  if (input?.flow) {
    params.set("flow", input.flow);
  }

  const queryString = params.toString();
  return queryString ? `${ADMIN_SUBSCRIPTION_ROUTE}?${queryString}` : ADMIN_SUBSCRIPTION_ROUTE;
}
