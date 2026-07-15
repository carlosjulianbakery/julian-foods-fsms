import React from "react";

export default function RdLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rd-lab -m-4 md:-m-6 min-h-screen"
      style={{ backgroundColor: "#1A1714", padding: "1.5rem" }}
    >
      <style>{`
        @keyframes labPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(245,158,11,0.3), 0 0 0 1px rgba(245,158,11,0.25), inset 0 0 8px rgba(245,158,11,0.03); }
          50% { box-shadow: 0 0 20px rgba(245,158,11,0.6), 0 0 0 1px rgba(245,158,11,0.5), inset 0 0 12px rgba(245,158,11,0.05); }
        }
        @keyframes columnFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fabRing {
          0% { box-shadow: 0 8px 32px rgba(245,158,11,0.5), 0 0 0 0 rgba(245,158,11,0.4); }
          70% { box-shadow: 0 8px 32px rgba(245,158,11,0.5), 0 0 0 20px rgba(245,158,11,0); }
          100% { box-shadow: 0 8px 32px rgba(245,158,11,0.5), 0 0 0 0 rgba(245,158,11,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .rd-lab * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
      {children}
    </div>
  );
}
