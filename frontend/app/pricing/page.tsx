"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useBilling } from "@flowglad/nextjs";
import { Button } from "@/components/ui/button";
import { Check, X, ArrowLeft } from "lucide-react";
import { PLAN_LIMITS, PRO_FEATURE_SLUG } from "@/lib/billing-constants";
import Link from "next/link";

const PRO_PRICE_SLUG = "pro_monthly";

const features = [
  { name: "Cloud desktop sandboxes", free: true, pro: true },
  { name: "AI task decomposition", free: true, pro: true },
  {
    name: `Agents per session`,
    free: `Up to ${PLAN_LIMITS.free.maxAgents}`,
    pro: `Up to ${PLAN_LIMITS.pro.maxAgents}`,
  },
  { name: "Session credits", free: "Limited", pro: "Unlimited" },
  { name: "Priority support", free: false, pro: true },
];

function FeatureValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm text-zinc-300">{value}</span>;
  }
  return value ? (
    <Check className="size-4 text-primary" />
  ) : (
    <X className="size-4 text-zinc-600" />
  );
}

export default function PricingPage() {
  const { data: authSession } = useSession();
  const { checkFeatureAccess, createCheckoutSession } = useBilling();
  const router = useRouter();

  const isPro = checkFeatureAccess?.(PRO_FEATURE_SLUG) ?? false;

  const handleUpgrade = () => {
    if (!authSession) {
      router.push("/auth/signin?callbackUrl=/pricing");
      return;
    }
    createCheckoutSession?.({
      priceSlug: PRO_PRICE_SLUG,
      successUrl: `${window.location.origin}/?upgraded=true`,
      cancelUrl: window.location.href,
      autoRedirect: true,
    });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center">
      <div className="dot-grid absolute inset-0 pointer-events-none" />

      <div className="absolute top-4 left-4 z-20">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2 text-zinc-400 hover:text-zinc-200">
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </Link>
      </div>

      <main className="relative z-10 w-full max-w-3xl px-6 py-16">
        <div className="space-y-10">
          {/* Header */}
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold tracking-tight text-gradient">
              Pricing
            </h1>
            <p className="text-base text-zinc-400 max-w-md mx-auto">
              Start free, upgrade when you need more agents.
            </p>
          </div>

          {/* Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Free plan */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm p-6 space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">Free</h2>
                  {!isPro && authSession && (
                    <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                      Current Plan
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$0</span>
                  <span className="text-sm text-zinc-500">/mo</span>
                </div>
                <p className="text-sm text-zinc-500">
                  Perfect for trying out Opticon.
                </p>
              </div>

              <div className="space-y-3">
                {features.map((feature) => (
                  <div
                    key={feature.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-zinc-400">{feature.name}</span>
                    <FeatureValue value={feature.free} />
                  </div>
                ))}
              </div>

              {!isPro && authSession ? (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              ) : !authSession ? (
                <Link href="/auth/signup">
                  <Button variant="outline" className="w-full">
                    Get Started
                  </Button>
                </Link>
              ) : null}
            </div>

            {/* Pro plan */}
            <div className="rounded-xl border border-primary/30 bg-zinc-900/60 backdrop-blur-sm p-6 space-y-6 ring-1 ring-primary/10">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">Pro</h2>
                  {isPro && (
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-medium text-primary uppercase tracking-wider">
                      Current Plan
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$20</span>
                  <span className="text-sm text-zinc-500">/mo</span>
                </div>
                <p className="text-sm text-zinc-500">
                  For power users who need maximum parallelism.
                </p>
              </div>

              <div className="space-y-3">
                {features.map((feature) => (
                  <div
                    key={feature.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-zinc-400">{feature.name}</span>
                    <FeatureValue value={feature.pro} />
                  </div>
                ))}
              </div>

              {isPro ? (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button className="w-full" onClick={handleUpgrade}>
                  Upgrade to Pro
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
