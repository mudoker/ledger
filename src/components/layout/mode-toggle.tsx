import { useState } from "react"
import { Sun, Moon, Check, Monitor, Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { useTheme, type Theme } from "./theme-provider"
import { cn } from "@/lib/utils"

interface ThemeOption {
    id: Theme
    label: string
    sublabel: string
    swatchBg: string
    swatchDot: string
    swatchBorder: string
    icon?: typeof Monitor
}

const THEME_OPTIONS: ThemeOption[] = [
    {
        id: "dark-emerald",
        label: "Emerald Dark",
        sublabel: "Midnight slate & cool blueish mint",
        swatchBg: "bg-[#070a12]",
        swatchDot: "bg-[#10b981]",
        swatchBorder: "border-slate-800",
    },
    {
        id: "dark-neon",
        label: "Neon Dark",
        sublabel: "OLED pitch black & vibrant lime",
        swatchBg: "bg-black",
        swatchDot: "bg-[#15df4b]",
        swatchBorder: "border-neutral-800",
    },
    {
        id: "light",
        label: "Crisp Light",
        sublabel: "High contrast & clean daylight",
        swatchBg: "bg-white",
        swatchDot: "bg-[#0d945a]",
        swatchBorder: "border-slate-300",
    },
    {
        id: "system",
        label: "System Default",
        sublabel: "Sync automatically with device theme",
        swatchBg: "bg-muted",
        swatchDot: "bg-primary",
        swatchBorder: "border-border",
        icon: Monitor,
    },
]

export function ModeToggle() {
    const { theme, setTheme, resolvedTheme } = useTheme()
    const [open, setOpen] = useState(false)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl relative hover:bg-foreground/5 text-foreground/80 hover:text-foreground transition-all"
                    title="Appearance & Theme"
                    aria-label="Appearance and Theme"
                >
                    {resolvedTheme === "light" ? (
                        <Sun className="h-4 w-4 text-amber-500 transition-transform hover:rotate-45" />
                    ) : resolvedTheme === "dark-neon" ? (
                        <Moon className="h-4 w-4 text-[#15df4b] transition-transform hover:-rotate-12" />
                    ) : (
                        <Moon className="h-4 w-4 text-[#10b981] transition-transform hover:-rotate-12" />
                    )}

                    {/* Theme accent indicator dot */}
                    <span
                        className={cn(
                            "absolute bottom-1 right-1 w-2 h-2 rounded-full border border-background shadow-xs transition-colors",
                            resolvedTheme === "light" && "bg-amber-500",
                            resolvedTheme === "dark-neon" && "bg-[#15df4b]",
                            resolvedTheme === "dark-emerald" && "bg-[#10b981]"
                        )}
                    />
                    <span className="sr-only">Toggle theme menu</span>
                </Button>
            </PopoverTrigger>

            <PopoverContent
                align="end"
                sideOffset={8}
                className="w-72 xs:w-80 p-3 shadow-2xl rounded-2xl border-border/80 bg-popover"
            >
                <div className="flex items-center gap-2 pb-2.5 mb-2 border-b border-border/60">
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <Palette className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold leading-none text-foreground">Theme & Appearance</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            Consistent color palette & mode
                        </p>
                    </div>
                </div>

                <div className="space-y-1">
                    {THEME_OPTIONS.map((opt) => {
                        const isSelected = theme === opt.id

                        return (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                    setTheme(opt.id)
                                    setOpen(false)
                                }}
                                className={cn(
                                    "w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all",
                                    isSelected
                                        ? "bg-primary/10 border border-primary/30 text-foreground"
                                        : "hover:bg-muted/70 border border-transparent text-foreground/80 hover:text-foreground"
                                )}
                            >
                                {/* Swatch visual */}
                                <div
                                    className={cn(
                                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border shadow-xs relative",
                                        opt.swatchBg,
                                        opt.swatchBorder
                                    )}
                                >
                                    {opt.icon ? (
                                        <opt.icon className="w-3.5 h-3.5 text-foreground/70" />
                                    ) : (
                                        <span className={cn("w-2.5 h-2.5 rounded-full shadow-xs", opt.swatchDot)} />
                                    )}
                                </div>

                                {/* Text info */}
                                <div className="flex-1 min-w-0">
                                    <span
                                        className={cn(
                                            "text-xs font-bold block leading-tight",
                                            isSelected ? "text-primary" : "text-foreground"
                                        )}
                                    >
                                        {opt.label}
                                    </span>
                                    <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                                        {opt.sublabel}
                                    </p>
                                </div>

                                {/* Active checkmark */}
                                {isSelected && (
                                    <Check className="w-4 h-4 text-primary shrink-0 ml-1" />
                                )}
                            </button>
                        )
                    })}
                </div>
            </PopoverContent>
        </Popover>
    )
}
