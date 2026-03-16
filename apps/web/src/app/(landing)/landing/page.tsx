import Link from "next/link";
import {
    Mail,
    Shield,
    Layers,
    Zap,
    Users,
    Globe,
    ArrowRight,
    CheckCircle2,
} from "lucide-react";

export const metadata = {
    title: "Pixora — Email Signature Management for Microsoft 365",
    description:
        "Centrally manage your organization's email signatures with dynamic resources, rules, and templates. Connect your Microsoft 365 in minutes.",
};

function PixoraLogo() {
    return (
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/25">
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
            </svg>
        </div>
    );
}

const features = [
    {
        icon: Layers,
        title: "Dynamic Resource Builder",
        description:
            "Define your own resource schemas — certifications, banners, legal text — whatever your brand needs.",
    },
    {
        icon: Shield,
        title: "Rule Engine",
        description:
            "Assign resources by country, job title, group, or individual. Global rules cascade, specific rules override.",
    },
    {
        icon: Mail,
        title: "Server-Side Injection",
        description:
            "Signatures applied server-side via SMTP relay — works on every device, every email client, every time.",
    },
    {
        icon: Zap,
        title: "Outlook Add-in Preview",
        description:
            "Real-time signature preview while composing in Outlook. Event-based — no disruption to the user.",
    },
    {
        icon: Users,
        title: "Microsoft 365 Sync",
        description:
            "User profiles, groups, and photos synced from your M365 directory. Always up to date.",
    },
    {
        icon: Globe,
        title: "Multi-Tenant SaaS",
        description:
            "Self-service onboarding. Your admin connects M365 in one click — no IT support needed.",
    },
];

const steps = [
    { step: "1", title: "Connect", description: "Click the button below and approve access for your organization." },
    { step: "2", title: "Sync", description: "We automatically import your users, groups, and photos from M365." },
    { step: "3", title: "Configure", description: "Build your signature template, assign resources via rules." },
    { step: "4", title: "Done", description: "Every email gets your brand-consistent signature — automatically." },
];

export default function LandingPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>;
}) {
    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white">
            {/* ─── Nav ──────────────────────────────────────── */}
            <nav className="border-b border-[#1e1e2e]/50">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <PixoraLogo />
                        <span className="font-bold text-lg tracking-tight">Pixora</span>
                    </div>
                    <Link
                        href="/login"
                        className="text-sm text-[#8a8f98] hover:text-white transition-colors"
                    >
                        Sign in
                    </Link>
                </div>
            </nav>

            {/* ─── Error Banner ──────────────────────────────── */}
            <ErrorBanner searchParams={searchParams} />

            {/* ─── Hero ──────────────────────────────────────── */}
            <section className="pt-24 pb-20 px-6">
                <div className="max-w-3xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-8">
                        <CheckCircle2 size={14} />
                        Trusted email signature management
                    </div>

                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
                        Professional email signatures
                        <br />
                        <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                            managed centrally
                        </span>
                    </h1>

                    <p className="text-lg text-[#8a8f98] max-w-xl mx-auto mb-10 leading-relaxed">
                        Connect your Microsoft 365 organization and deploy brand-consistent
                        email signatures across every user, every device — in minutes.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <a
                            href="/api/onboarding/consent"
                            id="connect-m365-btn"
                            className="inline-flex items-center gap-3 px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-violet-500/25 transition-all duration-200 hover:shadow-violet-500/40 hover:-translate-y-0.5"
                        >
                            <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
                                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                            </svg>
                            Connect to Microsoft 365
                            <ArrowRight size={16} />
                        </a>

                        <Link
                            href="/login"
                            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-[#1e1e2e] hover:border-[#2e2e3e] text-[#8a8f98] hover:text-white text-sm font-medium transition-all duration-200"
                        >
                            Already connected? Sign in
                        </Link>
                    </div>
                </div>
            </section>

            {/* ─── How it works ─────────────────────────────── */}
            <section className="py-20 px-6 border-t border-[#1e1e2e]/50">
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-2xl font-bold text-center mb-12">
                        Up and running in 4 steps
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {steps.map((s) => (
                            <div
                                key={s.step}
                                className="relative bg-[#12121a] border border-[#1e1e2e] rounded-2xl p-6"
                            >
                                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400 text-sm font-bold mb-4">
                                    {s.step}
                                </div>
                                <h3 className="font-semibold text-white mb-1">
                                    {s.title}
                                </h3>
                                <p className="text-sm text-[#8a8f98] leading-relaxed">
                                    {s.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── Features ─────────────────────────────────── */}
            <section className="py-20 px-6 border-t border-[#1e1e2e]/50">
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-2xl font-bold text-center mb-4">
                        Everything you need
                    </h2>
                    <p className="text-[#8a8f98] text-center mb-12 max-w-lg mx-auto">
                        From templates to rules to server-side injection — Pixora handles it all.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((f) => {
                            const Icon = f.icon;
                            return (
                                <div
                                    key={f.title}
                                    className="bg-[#12121a] border border-[#1e1e2e] rounded-2xl p-6 hover:border-[#2e2e3e] transition-colors duration-200"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-4">
                                        <Icon size={20} className="text-violet-400" />
                                    </div>
                                    <h3 className="font-semibold text-white mb-2">
                                        {f.title}
                                    </h3>
                                    <p className="text-sm text-[#8a8f98] leading-relaxed">
                                        {f.description}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ─── CTA Footer ───────────────────────────────── */}
            <section className="py-20 px-6 border-t border-[#1e1e2e]/50">
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className="text-2xl font-bold mb-4">
                        Ready to get started?
                    </h2>
                    <p className="text-[#8a8f98] mb-8">
                        Connect your Microsoft 365 organization and deploy professional signatures in minutes.
                    </p>
                    <a
                        href="/api/onboarding/consent"
                        className="inline-flex items-center gap-3 px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-violet-500/25 transition-all duration-200 hover:shadow-violet-500/40 hover:-translate-y-0.5"
                    >
                        <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
                            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                        </svg>
                        Connect to Microsoft 365
                        <ArrowRight size={16} />
                    </a>
                </div>
            </section>

            {/* ─── Footer ───────────────────────────────────── */}
            <footer className="border-t border-[#1e1e2e]/50 py-8 px-6">
                <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-[#555]">
                    <div className="flex items-center gap-2">
                        <PixoraLogo />
                        <span>Pixora</span>
                    </div>
                    <span>© {new Date().getFullYear()} Pixora. All rights reserved.</span>
                </div>
            </footer>
        </div>
    );
}

// ─── Error Banner (displays consent errors) ─────────────────

async function ErrorBanner({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>;
}) {
    const params = await searchParams;

    if (!params.error) return null;

    const messages: Record<string, string> = {
        consent_denied: "Admin consent was denied. An organization admin must approve the connection.",
        invalid_response: "We received an invalid response from Microsoft. Please try again.",
        invalid_state: "The request expired or was invalid. Please try again.",
        onboarding_failed: "Something went wrong during onboarding. Please try again.",
    };

    return (
        <div className="max-w-3xl mx-auto mt-6 px-6">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 text-sm text-red-400">
                <p className="font-medium mb-1">Connection failed</p>
                <p className="text-red-400/80">
                    {params.message || messages[params.error] || "An unexpected error occurred."}
                </p>
            </div>
        </div>
    );
}
