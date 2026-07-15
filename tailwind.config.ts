import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#FAE8E8",
          100: "#F5D0D0",
          500: "#D64D4D",
          600: "#D64D4D",
          700: "#C04040",
        },
        rd: {
          bg:             "#1A1714",
          surface:        "#252118",
          elevated:       "#2E2820",
          accent:         "#F59E0B",
          "accent-light": "#FCD34D",
          "accent-dark":  "#D97706",
          text:           "#F5F0E8",
          "text-muted":   "#A89880",
          "text-faint":   "#6B5F50",
          border:         "#3D3427",
        },
        cream:     "#F7F2E7", // page background
        creamLight:"#FAF3DF", // secondary warm cream
        muted:     "#BDCAD1", // blue-gray
        sage:      "#90A575", // sage green
        warmBrown: "#896447",
        darkBrown: "#452A01",
        gold:      "#E5BE66",
      },
      fontFamily: {
        garamond: ["var(--font-garamond)", "Georgia", "serif"],
        mono:     ["var(--font-mono)", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
