import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#070712",
        surface: "rgba(255,255,255,0.04)",
        surfaceHi: "rgba(255,255,255,0.07)",
        line: "rgba(255,255,255,0.09)",
        lineHi: "rgba(255,255,255,0.16)",
        ink: "#e9eaf5",
        mute: "#8a8ea8",
        violet: "#a78bfa",
        cyan: "#22d3ee",
        glow: "#7c3aed",
      },
      fontFamily: {
        display: ['"Instrument Serif"', "Georgia", "serif"],
      },
      animation: {
        "pulse-slow": "pulse 3.2s cubic-bezier(0.4,0,0.6,1) infinite",
        shimmer: "shimmer 2.4s linear infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
