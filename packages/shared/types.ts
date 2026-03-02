// ═══════════════════════════════════════════
// Resource Builder Types
// ═══════════════════════════════════════════

export type FieldType =
    | "text"
    | "textarea"
    | "richtext"
    | "image"
    | "url"
    | "date"
    | "select"
    | "toggle"
    | "number"
    | "color";

export interface FieldValidation {
    maxLength?: number;
    minLength?: number;
    maxSize?: number; // bytes, for image uploads
    options?: string[]; // for select type
}

export interface FieldDefinition {
    name: string;
    label: string;
    type: FieldType;
    required: boolean;
    validation?: FieldValidation;
}

// ═══════════════════════════════════════════
// Rule Engine Types
// ═══════════════════════════════════════════

export type ScopeType = "global" | "country" | "job_title" | "group" | "individual";

// ═══════════════════════════════════════════
// Tenant Types
// ═══════════════════════════════════════════

export type TenantStatus = "active" | "suspended" | "trial";
export type SubscriptionPlan = "starter" | "business" | "enterprise";
export type BillingCycle = "monthly" | "yearly" | "lifetime";
export type SubscriptionStatus = "active" | "past_due" | "cancelled";
