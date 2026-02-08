import { nextRouteHandler } from "@flowglad/nextjs/server";
import { flowglad } from "@/lib/flowglad";
import { auth } from "@/auth";

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async () => {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("User not authenticated");
    }
    return session.user.id;
  },
  onError: (error: unknown) => {
    // Suppress 409 conflicts from SDK auto-syncing pricing models that already exist
    const message =
      error instanceof Error ? error.message : String(error);
    if (message.includes("409") || message.includes("CONFLICT")) return;
    console.error("[flowglad]", error);
  },
});
