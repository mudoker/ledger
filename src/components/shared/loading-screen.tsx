import { AppLogo } from "@/components/shared/app-logo";

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = "Ledger" }: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="fixed inset-0 z-50 h-[100dvh] w-full flex items-center justify-center bg-background select-none overflow-hidden"
    >
      {/* Centered container with relative positioning */}
      <div className="relative flex flex-col items-center justify-center">
        {/* Soft emerald glowing backdrop */}
        <div className="absolute -inset-4 rounded-3xl bg-primary/20 blur-2xl animate-pulse pointer-events-none" />

        {/* Icon container badge positioned at the exact dead center */}
        <div className="relative p-3.5 sm:p-4 bg-gradient-to-tr from-primary/20 via-primary/10 to-transparent rounded-2xl border border-primary/20 shadow-xl shadow-primary/10 flex items-center justify-center animate-pulse">
          <AppLogo className="w-10 h-10 sm:w-12 sm:h-12 text-primary" />
        </div>

        {/* Text and loading pulse anchored below the icon without displacing its exact vertical center */}
        <div className="absolute top-full mt-3.5 sm:mt-4 flex flex-col items-center gap-1.5 whitespace-nowrap pointer-events-none">
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
