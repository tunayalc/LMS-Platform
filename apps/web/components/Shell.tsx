"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/dashboard");

  return (
    <div className={`shell${isDashboard ? " shell--dashboard" : ""}`}>{children}</div>
  );
}

