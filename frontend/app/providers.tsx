"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { FlowgladProvider } from "@flowglad/nextjs";
import { useState } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <FlowgladProvider>{children}</FlowgladProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
