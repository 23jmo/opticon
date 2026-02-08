import { FlowgladServer } from "@flowglad/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      const [user] = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, externalId))
        .limit(1);

      if (!user) throw new Error("User not found");

      return {
        email: user.email,
        name: user.name ?? "",
      };
    },
  });
};
