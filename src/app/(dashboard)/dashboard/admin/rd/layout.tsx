import React from "react";

export default function RdLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rd-lab -m-4 md:-m-6 min-h-screen"
      style={{ backgroundColor: "#1A1714", padding: "1.5rem" }}
    >
      {children}
    </div>
  );
}
