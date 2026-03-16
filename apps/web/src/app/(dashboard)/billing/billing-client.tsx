"use client";

import { useState } from "react";
import { createSubscription, cancelSubscription } from "./actions";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { PlanTier, BillingCycle } from "@/lib/razorpay";

interface PlanDisplay {
  tier: PlanTier;
  name: string;
  description: string;
  features: string[];
  maxUsers: number;
  monthlyPrice: string;
  yearlyPrice: string;
  monthlyPriceRaw: number;
  yearlyPriceRaw: number;
}

export function BillingClient({
  plans,
  currentPlan,
  subscriptionStatus,
}: {
  plans: PlanDisplay[];
  currentPlan: string | null;
  subscriptionStatus: string | null;
}) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function handleSubscribe(tier: PlanTier) {
    setLoading(tier);
    try {
      const result = await createSubscription(tier, cycle);
      if (result.error) {
        alert(result.error);
      } else if (result.shortUrl) {
        // Redirect to Razorpay payment page
        window.location.href = result.shortUrl;
      }
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleCancel() {
    if (
      !confirm(
        "Are you sure you want to cancel your subscription? You'll retain access until the end of the current billing period.",
      )
    ) {
      return;
    }
    setCancelling(true);
    try {
      const result = await cancelSubscription();
      if (result.error) {
        alert(result.error);
      } else {
        window.location.reload();
      }
    } catch {
      alert("Something went wrong.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Billing Cycle Toggle */}
      <div className="flex items-center justify-center gap-1 bg-[#12121a] border border-[#1e1e2e] rounded-xl p-1 w-fit mx-auto">
        <button
          onClick={() => setCycle("monthly")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
            cycle === "monthly"
              ? "bg-violet-500/15 text-violet-400"
              : "text-[#8a8f98] hover:text-white"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setCycle("yearly")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
            cycle === "yearly"
              ? "bg-violet-500/15 text-violet-400"
              : "text-[#8a8f98] hover:text-white"
          }`}
        >
          Yearly
          <span className="ml-1.5 text-xs text-emerald-400">Save 2 months</span>
        </button>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = currentPlan === plan.tier;
          const isBusiness = plan.tier === "business";
          const price =
            cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
          const isLoading = loading === plan.tier;

          return (
            <div
              key={plan.tier}
              className={`relative bg-[#12121a] border rounded-2xl p-6 flex flex-col ${
                isBusiness
                  ? "border-violet-500/50 shadow-lg shadow-violet-500/10"
                  : "border-[#1e1e2e]"
              }`}
            >
              {isBusiness && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-linear-to-r from-violet-600 to-indigo-600 rounded-full text-xs font-medium text-white">
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <p className="text-sm text-[#8a8f98] mt-1">
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <span className="text-3xl font-bold text-white">{price}</span>
                <span className="text-[#8a8f98] text-sm">
                  /{cycle === "monthly" ? "mo" : "yr"}
                </span>
                {plan.maxUsers !== Infinity && (
                  <p className="text-xs text-[#555] mt-1">
                    Up to {plan.maxUsers} users
                  </p>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-[#8a8f98]"
                  >
                    <CheckCircle2
                      size={16}
                      className="text-violet-400 shrink-0 mt-0.5"
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              {isCurrentPlan && subscriptionStatus === "active" ? (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="w-full py-3 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {cancelling ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Cancelling...
                    </span>
                  ) : (
                    "Cancel Plan"
                  )}
                </button>
              ) : (
                <button
                  onClick={() => handleSubscribe(plan.tier)}
                  disabled={
                    isLoading ||
                    (isCurrentPlan && subscriptionStatus === "active")
                  }
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isBusiness
                      ? "bg-linear-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/25"
                      : "bg-[#1a1a2e] hover:bg-[#22223a] text-white border border-[#2a2a3e] hover:border-violet-500/50"
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Processing...
                    </span>
                  ) : isCurrentPlan ? (
                    "Current Plan"
                  ) : (
                    "Subscribe"
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Cancel Section for Active Plans */}
      {currentPlan && subscriptionStatus === "active" && (
        <p className="text-center text-xs text-[#555]">
          You can cancel anytime. Access continues until the end of your billing
          period.
        </p>
      )}
    </div>
  );
}
