import { requireSuperAdmin, isSuperAdmin } from "@/lib/auth/helpers";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function SuperAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireSuperAdmin();
    const superAdmin = await isSuperAdmin();

    return <DashboardShell isSuperAdmin={superAdmin}>{children}</DashboardShell>;
}
