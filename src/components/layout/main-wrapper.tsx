"use client";

import { usePathname } from "next/navigation";

export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin  = pathname === "/login";

  if (isLogin) return <>{children}</>;

  return (
    <div className="flex-1 md:ml-[64px] flex flex-col h-full overflow-hidden pt-14 md:pt-0">
      {children}
    </div>
  );
}
