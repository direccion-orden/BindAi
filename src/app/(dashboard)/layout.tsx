"use client"

import { useState } from "react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { TrackerAgent } from "@/components/tracker/TrackerAgent";
import { useAuth } from "@/context/AuthContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { companyId } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
      <div className="flex flex-1 relative">
        <Sidebar isMobileOpen={isMobileMenuOpen} onCloseMobile={() => setIsMobileMenuOpen(false)} />
        <main className="flex-1 p-6 md:p-8 lg:p-10 w-full overflow-x-hidden md:pl-[calc(4rem+2rem)] lg:pl-[calc(4rem+2.5rem)]">
          <div className="w-full">
            <AuthGuard>
              {children}
            </AuthGuard>
          </div>
        </main>
      </div>
      {companyId && <TrackerAgent companyId={companyId} />}
    </div>
  );
}
