"use client";

import type { ReactNode } from "react";

export default function Header({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex gap-3 pt-4 pb-4 px-6" style={{justifyContent: "space-between", alignItems: "center"}}>
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
