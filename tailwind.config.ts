import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0d10",
        panel: "#13161b",
        line: "#23272e",
        accent: "#7c9cff",
      },
    },
  },
  plugins: [],
};

export default config;
