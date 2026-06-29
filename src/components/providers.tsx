"use client";

import React, { useEffect } from "react";
import { AuthProvider } from "@/context/AuthContext";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleActionError = (error: any) => {
      const msg = error?.message || String(error || "");
      if (
        msg.includes("was not found on the server") || 
        msg.includes("Failed to find Server Action") ||
        msg.includes("failed-to-find-server-action")
      ) {
        console.warn("Server Action version mismatch detected. Reloading page...", error);
        alert("El sistema ha sido actualizado recientemente. La página se recargará automáticamente para aplicar la actualización.");
        window.location.reload();
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      handleActionError(event.reason);
    };

    const handleError = (event: ErrorEvent) => {
      handleActionError(event.error || event.message);
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return <AuthProvider>{children}</AuthProvider>;
}
