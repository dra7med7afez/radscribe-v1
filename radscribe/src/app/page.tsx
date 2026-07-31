"use client";

import dynamic from "next/dynamic";

const ReportingPage = dynamic(() => import("@/features/reporting/ReportingPage"), {
  ssr: false,
});

export default function Page() {
  return <ReportingPage />;
}
