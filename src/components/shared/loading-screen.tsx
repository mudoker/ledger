import { AppLogo } from "@/components/shared/app-logo";

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = "Ledger" }: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="fixed inset-0 z-50 w-full h-full flex flex-col items-center justify-center bg-background select-none overflow-hidden"
    >
      {/* Centered container */}
      <div className="relative flex flex-col items-center justify-center gap-3.5 sm:gap-4">
        {/* Icon container badge */}
        <div className="relative flex items-center justify-center">
          <div className="absolute -inset-4 rounded-3xl bg-primary/20 blur-2xl animate-pulse pointer-events-none" />
          <div className="relative p-3.5 sm:p-4 bg-gradient-to-tr from-primary/20 via-primary/10 to-transparent rounded-2xl border border-primary/20 shadow-xl shadow-primary/10 flex items-center justify-center animate-pulse">
            <AppLogo className="w-10 h-10 sm:w-12 sm:h-12 text-primary" />
          </div>
        </div>

        {/* Text and loading pulse included in flex layout for true vertical centering */}
        <div className="flex flex-col items-center gap-1.5 whitespace-nowrap pointer-events-none">
          <span className="text-sm sm:text-base font-bold tracking-tight text-foreground/80">
            {message}
          </span>
          <div className="h-1 w-16 sm:w-20 bg-muted/60 rounded-full overflow-hidden">
            <div className="h-full w-full bg-primary/70 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
