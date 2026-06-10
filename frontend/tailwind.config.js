export default {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
            },
            boxShadow: {
                soft: "0 20px 70px rgba(15, 23, 42, 0.12)",
                glow: "0 0 0 1px rgba(99, 102, 241, 0.08), 0 24px 80px rgba(99, 102, 241, 0.18)",
            },
            borderRadius: {
                xl2: "1.25rem",
                xl3: "1.75rem",
            },
            fontFamily: {
                sans: ["var(--font-sans)", "sans-serif"],
                display: ["var(--font-display)", "sans-serif"],
                mono: ["var(--font-mono)", "monospace"],
            },
            backgroundImage: {
                hero: "radial-gradient(circle at top left, rgba(59,130,246,0.22), transparent 36%), radial-gradient(circle at top right, rgba(16,185,129,0.18), transparent 32%), linear-gradient(135deg, rgba(15,23,42,0.98), rgba(15,23,42,0.86))",
            },
            keyframes: {
                fadeUp: {
                    from: { opacity: "0", transform: "translateY(12px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                float: {
                    "0%, 100%": { transform: "translateY(0px)" },
                    "50%": { transform: "translateY(-8px)" },
                },
            },
            animation: {
                fadeUp: "fadeUp 0.5s ease-out both",
                float: "float 8s ease-in-out infinite",
            },
        },
    },
    plugins: [],
};
