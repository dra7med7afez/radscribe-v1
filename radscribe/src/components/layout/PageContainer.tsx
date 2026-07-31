// "use client";

// import type { ReactNode } from "react";

// // Scrolling page wrapper for the non-workspace pages.
// export default function PageContainer({ children }: { children: ReactNode }) {
//   return (
//     <div className="h-screen overflow-auto" style={{ background: "var(--page)", borderTopLeftRadius: "25px" }}>
//       <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
//     </div>
//   );
// }
"use client";

import type { ReactNode } from "react";

export default function PageContainer({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main
      className="h-screen overflow-y-auto bg-[var(--page)]"
      style={{ borderTopLeftRadius: 24 }}
    >
      <div className="w-full max-w-7xlzzz">
        {children}
      </div>
    </main>
  );
}