import { getAllTenants } from "./actions";
import { AdminClient } from "./admin-client";

export default async function AdminPage() {
    const tenants = await getAllTenants();

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
                <p className="text-[#8a8f98] mt-1">
                    View and manage all onboarded organizations.
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <SummaryCard
                    label="Total Tenants"
                    value={tenants.length}
                />
                <SummaryCard
                    label="Active"
                    value={tenants.filter((t) => t.status === "active").length}
                    color="text-emerald-400"
                />
                <SummaryCard
                    label="Trial"
                    value={tenants.filter((t) => t.status === "trial").length}
                    color="text-amber-400"
                />
                <SummaryCard
                    label="Suspended"
                    value={tenants.filter((t) => t.status === "suspended").length}
                    color="text-red-400"
                />
            </div>

            {/* Tenant Table */}
            <AdminClient tenants={tenants} />
        </div>
    );
}

function SummaryCard({
    label,
    value,
    color = "text-white",
}: {
    label: string;
    value: number;
    color?: string;
}) {
    return (
        <div className="bg-[#12121a] border border-[#1e1e2e] rounded-2xl p-5">
            <p className="text-xs font-medium text-[#8a8f98] uppercase tracking-wider">
                {label}
            </p>
            <p className={`text-2xl font-bold mt-2 ${color}`}>{value}</p>
        </div>
    );
}
