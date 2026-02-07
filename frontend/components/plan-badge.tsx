"use client";

import { useBilling } from "@flowglad/nextjs";
import { PRO_FEATURE_SLUG } from "@/lib/billing-constants";

export function PlanBadge() {
  const { checkFeatureAccess, loaded } = useBilling();

  if (!loaded) return null;

  const isPro = checkFeatureAccess?.(PRO_FEATURE_SLUG) ?? false;

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        isPro
          ? "bg-primary/15 text-primary"
          : "bg-zinc-800 text-zinc-500"
      }`}
    >
      {isPro ? "Pro" : "Free"}
    </span>
  );
}
