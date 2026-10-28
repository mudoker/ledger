'use client';

import { createContext, useContext, useEffect, useState } from "react"

export type Theme = "dark-emerald" | "dark-neon" | "light" | "system" | "dark"
export type ResolvedTheme = "dark-emerald" | "dark-neon" | "light"

interface ThemeProviderState {
    theme: Theme
    setTheme: (theme: Theme) => void
    resolvedTheme: ResolvedTheme
}

const ThemeProviderContext = createContext<ThemeProviderState>({
    theme: "dark-emerald",
    setTheme: () => { },
    resolvedTheme: "dark-emerald",
})

export function ThemeProvider({
    children,
    defaultTheme = "dark-emerald",
    storageKey = "vite-ui-theme",
}: {
    children: React.ReactNode
    defaultTheme?: Theme
    storageKey?: string
}) {
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window === "undefined") return defaultTheme
        try {
            const stored = localStorage.getItem(storageKey)
            if (stored === "dark") return "dark-emerald"
            if (stored === "light") return "light"
            if (stored === "dark-neon" || stored === "dark-emerald" || stored === "system") {
                return stored as Theme
            }
        } catch {
            // Ignore storage errors in restricted contexts
        }
        return defaultTheme
    })

    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
        if (theme === "light") return "light"
        if (theme === "dark-neon") return "dark-neon"
        if (theme === "dark-emerald") return "dark-emerald"
        if (typeof window !== "undefined") {
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark-emerald" : "light"
        }
        return "dark-emerald"
    })

    useEffect(() => {
        const root = window.document.documentElement

        const applyTheme = (currentTheme: Theme) => {
            root.classList.remove("light", "dark", "theme-neon", "theme-emerald")

            let resolved: ResolvedTheme

            if (currentTheme === "system") {
                const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches
                const lastDark = localStorage.getItem(`${storageKey}-dark-style`) as "dark-neon" | "dark-emerald" | null
                resolved = systemIsDark ? (lastDark || "dark-emerald") : "light"
            } else if (currentTheme === "dark") {
                resolved = "dark-emerald"
            } else {
                resolved = currentTheme
                if (currentTheme === "dark-neon" || currentTheme === "dark-emerald") {
                    localStorage.setItem(`${storageKey}-dark-style`, currentTheme)
                }
            }

            setResolvedTheme(resolved)

            if (resolved === "light") {
                root.classList.add("light")
            } else if (resolved === "dark-neon") {
                root.classList.add("dark", "theme-neon")
            } else {
                root.classList.add("dark", "theme-emerald")
            }
        }

        applyTheme(theme)

        if (theme === "system") {
            const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
            const handleChange = () => applyTheme("system")
            mediaQuery.addEventListener("change", handleChange)
            return () => mediaQuery.removeEventListener("change", handleChange)
        }
    }, [theme, storageKey])

    const value: ThemeProviderState = {
        theme,
        setTheme: (newTheme: Theme) => {
            try {
                localStorage.setItem(storageKey, newTheme)
            } catch {}
            setTheme(newTheme)
        },
        resolvedTheme,
    }

    return (
        <ThemeProviderContext.Provider value={value}>
            {children}
        </ThemeProviderContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext)

    if (context === undefined) {
        throw new Error("useTheme must be used within a ThemeProvider")
    }

    return context
}
