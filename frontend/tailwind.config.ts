import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#1a1a2e",
          soft: "#eef2ff",
        },
        surface: "#ffffff",
        border: "#e5e5e5",
      },
      fontFamily: {
        sans: ['"Geist Sans"', '"PingFang SC"', '"Microsoft YaHei"', "sans-serif"],
        mono: ['"Geist Mono"', "monospace"],
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
