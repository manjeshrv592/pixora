import { getCurrentSubscription } from "./actions";
import { PLANS, formatPrice } from "@/lib/razorpay";
import { BillingClient } from "./billing-client";

export default async function BillingPage() {
    const { subscription, tenantStatus } = await getCurrentSubscription();

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Billing</h1>
                <p className="text-[#8a8f98] mt-1">
                    Manage your subscription and billing preferences.
                </p>
            </div>

            {/* Current Status */}
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-2xl p-6">
                <h2 className="text-sm font-medium text-[#8a8f98] uppercase tracking-wider mb-4">
                    Current Plan
                </h2>
                {subscription ? (
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xl font-bold text-white capitalize">
                                {subscription.plan} Plan
                            </p>
                            <p className="text-sm text-[#8a8f98] mt-1">
                                Billed {subscription.billingCycle} •{" "}
                                <span
                                    className={
                                        subscription.status === "active"
                                            ? "text-emerald-400"
                                            : subscription.status === "cancelled"
                                                ? "text-red-400"
                                                : "text-amber-400"
                                    }
                                >
                                    {subscription.status}
                                </span>
                            </p>
                            {subscription.currentPeriodEnd && (
                                <p className="text-xs text-[#555] mt-1">
                                    Current period ends:{" "}
                                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div>
                        <p className="text-xl font-bold text-white">
                            {tenantStatus === "trial" ? "Free Trial" : "No Plan"}
                        </p>
                        <p className="text-sm text-[#8a8f98] mt-1">
                            {tenantStatus === "trial"
                                ? "You're on a 14-day free trial. Choose a plan below to continue."
                                : "Select a plan to get started."}
                        </p>
                    </div>
                )}
            </div>

            {/* Plan Cards */}
            <BillingClient
                plans={PLANS.map((p) => ({
                    tier: p.tier,
                    name: p.name,
                    description: p.description,
                    features: p.features,
                    maxUsers: p.maxUsers,
                    monthlyPrice: formatPrice(p.prices.monthly),
                    yearlyPrice: formatPrice(p.prices.yearly),
                    monthlyPriceRaw: p.prices.monthly,
                    yearlyPriceRaw: p.prices.yearly,
                }))}
                currentPlan={subscription?.plan || null}
                subscriptionStatus={subscription?.status || null}
            />
        </div>
    );
}
