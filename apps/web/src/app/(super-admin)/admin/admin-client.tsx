"use client";

import { useState } from "react";
import { suspendTenant, activateTenant } from "./actions";
import { Loader2 } from "lucide-react";

interface TenantRow {
    id: string;
    name: string;
    domain: string;
    status: string;
    userCount: number;
    subscriptionPlan: string | null;
    subscriptionStatus: string | null;
    createdAt: Date | null;
}

export function AdminClient({ tenants }: { tenants: TenantRow[] }) {
    const [loadingId, setLoadingId] = useState<string | null>(null);

    async function handleSuspend(tenantId: string) {
        if (!confirm("Are you sure you want to suspend this tenant? Their signatures will stop working.")) return;
        setLoadingId(tenantId);
        try {
            await suspendTenant(tenantId);
            window.location.reload();
        } catch {
            alert("Failed to suspend tenant.");
        } finally {
            setLoadingId(null);
        }
    }

    async function handleActivate(tenantId: string) {
        setLoadingId(tenantId);
        try {
            await activateTenant(tenantId);
            window.location.reload();
        } catch {
            alert("Failed to activate tenant.");
        } finally {
            setLoadingId(null);
        }
    }

    function statusBadge(status: string) {
        const colors: Record<string, string> = {
            active: "bg-emerald-500/15 text-emerald-400",
            trial: "bg-amber-500/15 text-amber-400",
            suspended: "bg-red-500/15 text-red-400",
        };
        return (
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[status] || "bg-[#1e1e2e] text-[#8a8f98]"}`}>
                {status}
            </span>
        );
    }

    function planBadge(plan: string | null, subStatus: string | null) {
        if (!plan) return <span className="text-[#555] text-sm">—</span>;
        const colors: Record<string, string> = {
            active: "text-violet-400",
            cancelled: "text-red-400",
            pending: "text-amber-400",
            past_due: "text-orange-400",
        };
        return (
            <div className="flex flex-col">
                <span className="text-sm text-white capitalize">{plan}</span>
                {subStatus && (
                    <span className={`text-xs ${colors[subStatus] || "text-[#8a8f98]"}`}>
                        {subStatus}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="bg-[#12121a] border border-[#1e1e2e] rounded-2xl overflow-hidden">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-[#1e1e2e]">
                        <th className="text-left px-6 py-4 text-xs font-medium text-[#8a8f98] uppercase tracking-wider">Organization</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-[#8a8f98] uppercase tracking-wider">Domain</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-[#8a8f98] uppercase tracking-wider">Status</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-[#8a8f98] uppercase tracking-wider">Users</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-[#8a8f98] uppercase tracking-wider">Plan</th>
                        <th className="text-left px-6 py-4 text-xs font-medium text-[#8a8f98] uppercase tracking-wider">Created</th>
                        <th className="text-right px-6 py-4 text-xs font-medium text-[#8a8f98] uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {tenants.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="px-6 py-12 text-center text-[#555]">
                                No tenants found.
                            </td>
                        </tr>
                    ) : (
                        tenants.map((tenant) => {
                            const isLoading = loadingId === tenant.id;
                            return (
                                <tr key={tenant.id} className="border-b border-[#1e1e2e] last:border-b-0 hover:bg-[#16161f] transition-colors">
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-medium text-white">{tenant.name}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-[#8a8f98]">{tenant.domain}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {statusBadge(tenant.status)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-white">{tenant.userCount}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {planBadge(tenant.subscriptionPlan, tenant.subscriptionStatus)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-[#8a8f98]">
                                            {tenant.createdAt
                                                ? new Date(tenant.createdAt).toLocaleDateString()
                                                : "—"}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {isLoading ? (
                                            <Loader2 size={16} className="animate-spin text-[#8a8f98] inline-block" />
                                        ) : tenant.status === "suspended" ? (
                                            <button
                                                onClick={() => handleActivate(tenant.id)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors cursor-pointer"
                                            >
                                                Activate
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleSuspend(tenant.id)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                                            >
                                                Suspend
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
}
