import { supabase } from "@/lib/supabase";
import { buildServerApiUrl } from "@/services/serverApi";

export type AdminMasterSummary = {
  psychologistsTotal: number;
  patientsTotal: number;
  clinicsTotal: number;
  consultationsTotal: number;
  subscriptionsActive: number;
  subscriptionsPending: number;
  subscriptionsCancelled: number;
  monthlyEstimatedRevenue: number;
};

export type AdminMasterPsychologist = {
  id: string;
  authUserId: string;
  name: string;
  email: string;
  phone: string;
  planSlug: string;
  subscriptionStatus: string;
  subscriptionActive: boolean;
  createdAt: string;
};

export type AdminMasterClinic = {
  id: string;
  name: string;
  email: string;
  status: string;
  psychologistCount: number;
  planSlug: string;
  subscriptionStatus: string;
  subscriptionActive: boolean;
  createdAt: string;
};

export type AdminMasterSubscription = {
  id: string;
  ownerType: string;
  authUserId: string;
  clinicId: string;
  planSlug: string;
  subscriptionStatus: string;
  paymentStatus: string;
  subscriptionActive: boolean;
  planValue: number;
  nextDueDate: string;
  asaasSubscriptionIdMasked: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminMasterActionName =
  | "sync_subscription_asaas"
  | "block_professional_access"
  | "release_professional_access"
  | "mark_subscription_pending"
  | "mark_subscription_cancelled"
  | "deactivate_psychologist"
  | "view_webhook_logs"
  | "detect_duplicate_subscriptions";

export type AdminMasterActionInput = {
  action: AdminMasterActionName;
  targetTable: "usuarios" | "assinaturas_asaas" | "clinicas";
  targetId: string;
  reason: string;
  confirmation: string;
};

export type AdminMasterActionResult = {
  action: AdminMasterActionName;
  target: {
    table: string;
    id: string;
  };
  result: unknown;
};

export type AdminMasterConsultationFinanceItem = {
  status: string;
  count: number;
  amount: number;
};

export type AdminMasterPage<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

export type AdminMasterFilters = {
  search?: string;
  subscriptionStatus?: string;
  planSlug?: string;
  ownerType?: string;
  offset?: number;
  limit?: number;
};

export type AdminMasterOverview = {
  admin: {
    id: string;
    email: string | null;
  };
  summary: AdminMasterSummary;
  psychologists: AdminMasterPage<AdminMasterPsychologist>;
  clinics: AdminMasterPage<AdminMasterClinic>;
  subscriptions: AdminMasterPage<AdminMasterSubscription>;
  consultationFinance: AdminMasterConsultationFinanceItem[];
};

export const adminMasterOverviewQueryKey = ["admin-master-overview"] as const;

export class AdminMasterAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "AdminMasterAccessError";
    this.status = status;
    this.code = code;
  }
}

export function isAdminMasterAccessError(error: unknown) {
  return error instanceof AdminMasterAccessError;
}

type AdminMasterApiResponse = AdminMasterOverview & {
  success?: boolean;
  error?: {
    message?: string;
    code?: string;
  };
};

type AdminMasterActionApiResponse = AdminMasterActionResult & {
  success?: boolean;
  error?: {
    message?: string;
    code?: string;
  };
};

export async function fetchAdminMasterOverview(
  filters: AdminMasterFilters = {},
): Promise<AdminMasterOverview> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new AdminMasterAccessError(
      "Pagina nao encontrada.",
      401,
      "ADMIN_MASTER_AUTH_REQUIRED",
    );
  }

  const response = await fetch(buildServerApiUrl("/api/admin-master/overview"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(filters),
  });
  const payload = (await response.json().catch(() => null)) as AdminMasterApiResponse | null;

  if (!response.ok || !payload?.success) {
    throw new AdminMasterAccessError(
      payload?.error?.message ||
        "Nao foi possivel carregar os dados do Admin Master.",
      response.status,
      payload?.error?.code || "ADMIN_MASTER_REQUEST_FAILED",
    );
  }

  return payload;
}

export async function executeAdminMasterAction(
  input: AdminMasterActionInput,
): Promise<AdminMasterActionResult> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new AdminMasterAccessError(
      "Pagina nao encontrada.",
      401,
      "ADMIN_MASTER_AUTH_REQUIRED",
    );
  }

  const response = await fetch(buildServerApiUrl("/api/admin-master/action"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as AdminMasterActionApiResponse | null;

  if (!response.ok || !payload?.success) {
    throw new AdminMasterAccessError(
      payload?.error?.message ||
        "Nao foi possivel executar a acao do Admin Master.",
      response.status,
      payload?.error?.code || "ADMIN_MASTER_ACTION_FAILED",
    );
  }

  return {
    action: payload.action,
    target: payload.target,
    result: payload.result,
  };
}
