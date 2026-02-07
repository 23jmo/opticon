"use client";

import { useBilling } from "@flowglad/nextjs";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { X, Zap, Check } from "lucide-react";
import { PLAN_LIMITS } from "@/lib/billing-constants";

const PRO_PRICE_SLUG = "pro_monthly";

const proBenefits = [
  `Up to ${PLAN_LIMITS.pro.maxAgents} agents per session`,
  "Unlimited session credits",
  "Priority support",
];

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  onFallback: () => void;
  requestedAgents: number;
}

export function UpgradeModal({
  open,
  onClose,
  onFallback,
  requestedAgents,
}: UpgradeModalProps) {
  const { createCheckoutSession } = useBilling();
  const { data: authSession } = useSession();
  const router = useRouter();

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
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.3 }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="size-4" />
            </button>

            <div className="space-y-5">
              {/* Header */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="size-5 text-primary" />
                  <h2 className="text-lg font-semibold">Upgrade to Pro</h2>
                </div>
                <p className="text-sm text-zinc-400">
                  You requested {requestedAgents} agents, but your free plan
                  allows up to {PLAN_LIMITS.free.maxAgents}.
                </p>
              </div>

              {/* Benefits */}
              <div className="space-y-2.5">
                {proBenefits.map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <Check className="size-4 shrink-0 text-primary" />
                    <span className="text-zinc-300">{benefit}</span>
                  </div>
                ))}
              </div>

              {/* Price */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-center">
                <span className="text-2xl font-bold">$20</span>
                <span className="text-sm text-zinc-500">/mo</span>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <Button className="w-full gap-2" onClick={handleUpgrade}>
                  <Zap className="size-4" />
                  Upgrade to Pro
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-zinc-400"
                  onClick={onFallback}
                >
                  Start with {PLAN_LIMITS.free.maxAgents} agents instead
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
