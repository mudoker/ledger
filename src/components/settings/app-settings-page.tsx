'use client';

import { useState } from 'react';
import { useAppSettingsStore, type StorageMode, type AppLanguage } from '@/store/useAppSettingsStore';
import { useTheme, type Theme } from '@/components/layout/theme-provider';
import { useTranslation } from '@/lib/i18n';
import { CurrencyDropdown } from '@/components/shared/currency-dropdown';
import {
  APP_METADATA,
  PRIVACY_POLICY,
  TERMS_OF_SERVICE,
  PRIVACY_CONSENT_DISCLOSURE,
  OPEN_SOURCE_LICENSES,
} from '@/constants/app-info';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Database,
  Cloud,
  Layers,
  Palette,
  Globe,
  Coins,
  ShieldCheck,
  FileText,
  Scale,
  Check,
  AlertTriangle,
  Monitor,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppSettingsPageProps {
  onBack: () => void;
}

const THEME_OPTIONS: Array<{
  id: Theme;
  label: string;
  sublabel: string;
  swatchBg: string;
  swatchDot: string;
  swatchBorder: string;
  icon?: typeof Monitor;
}> = [
  {
    id: 'dark-emerald',
    label: 'Emerald Dark',
    sublabel: 'Midnight slate & cool blueish mint',
    swatchBg: 'bg-[#070a12]',
    swatchDot: 'bg-[#10b981]',
    swatchBorder: 'border-slate-800',
  },
  {
    id: 'dark-neon',
    label: 'Neon Dark',
    sublabel: 'OLED pitch black & vibrant lime',
    swatchBg: 'bg-black',
    swatchDot: 'bg-[#15df4b]',
    swatchBorder: 'border-neutral-800',
  },
  {
    id: 'light',
    label: 'Crisp Light',
    sublabel: 'High contrast & clean daylight',
    swatchBg: 'bg-white',
    swatchDot: 'bg-[#0d945a]',
    swatchBorder: 'border-slate-300',
  },
  {
    id: 'system',
    label: 'System Default',
    sublabel: 'Sync automatically with device theme',
    swatchBg: 'bg-muted',
    swatchDot: 'bg-primary',
    swatchBorder: 'border-border',
    icon: Monitor,
  },
];

export function AppSettingsPage({ onBack }: AppSettingsPageProps) {
  const { t } = useTranslation();
  const { storageMode, setStorageMode, language, setLanguage, defaultCurrency, setDefaultCurrency } =
    useAppSettingsStore();
  const { theme, setTheme } = useTheme();

  // Storage confirmation modal state
  const [pendingStorageMode, setPendingStorageMode] = useState<StorageMode | null>(null);

  // Legal documentation modal state
  const [activeDocModal, setActiveDocModal] = useState<'privacy' | 'terms' | 'consent' | 'licenses' | null>(null);

  const handleSelectStorageMode = (newMode: StorageMode) => {
    if (newMode === storageMode) return;
    setPendingStorageMode(newMode);
  };

  const confirmStorageModeChange = () => {
    if (pendingStorageMode) {
      setStorageMode(pendingStorageMode);
      setPendingStorageMode(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground overflow-y-auto">
      {/* Top Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border/60 px-4 sm:px-6 py-3.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={onBack}
              className="h-9 w-9 rounded-xl border-border/80 hover:bg-muted"
              title={t.back}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight">{t.settingsTitle}</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">{t.settingsSubtitle}</p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold">
            v{APP_METADATA.version}
          </span>
        </div>
      </div>

      {/* Main Content Sections */}
      <div className="flex-1 max-w-3xl mx-auto w-full p-4 sm:p-6 space-y-6 sm:space-y-8 pb-32">
        {/* Section 1: Storage Mode */}
        <section className="space-y-3.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">{t.storageSectionTitle}</h2>
              <p className="text-xs text-muted-foreground">{t.storageSectionDesc}</p>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            {/* Mode: Local Only */}
            <button
              type="button"
              onClick={() => handleSelectStorageMode('local')}
              className={cn(
                'p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2.5',
                storageMode === 'local'
                  ? 'bg-primary/10 border-primary/50 shadow-sm ring-1 ring-primary/30'
                  : 'bg-card border-border/70 hover:border-foreground/20 hover:bg-muted/40'
              )}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="p-1.5 rounded-lg bg-foreground/5 text-foreground inline-block">
                    <Database className="w-4 h-4 text-primary" />
                  </span>
                  {storageMode === 'local' && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary bg-primary/20 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <h3 className="text-xs font-bold text-foreground">{t.storageModeLocal}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{t.storageModeLocalDesc}</p>
              </div>
            </button>

            {/* Mode: Cloud Only */}
            <button
              type="button"
              onClick={() => handleSelectStorageMode('cloud')}
              className={cn(
                'p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2.5',
                storageMode === 'cloud'
                  ? 'bg-primary/10 border-primary/50 shadow-sm ring-1 ring-primary/30'
                  : 'bg-card border-border/70 hover:border-foreground/20 hover:bg-muted/40'
              )}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="p-1.5 rounded-lg bg-foreground/5 text-foreground inline-block">
                    <Cloud className="w-4 h-4 text-blue-500" />
                  </span>
                  {storageMode === 'cloud' && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary bg-primary/20 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <h3 className="text-xs font-bold text-foreground">{t.storageModeCloud}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{t.storageModeCloudDesc}</p>
              </div>
            </button>

            {/* Mode: Hybrid */}
            <button
              type="button"
              onClick={() => handleSelectStorageMode('hybrid')}
              className={cn(
                'p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2.5',
                storageMode === 'hybrid'
                  ? 'bg-primary/10 border-primary/50 shadow-sm ring-1 ring-primary/30'
                  : 'bg-card border-border/70 hover:border-foreground/20 hover:bg-muted/40'
              )}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="p-1.5 rounded-lg bg-foreground/5 text-foreground inline-block">
                    <Layers className="w-4 h-4 text-amber-500" />
                  </span>
                  {storageMode === 'hybrid' && (
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary bg-primary/20 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <h3 className="text-xs font-bold text-foreground">{t.storageModeHybrid}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{t.storageModeHybridDesc}</p>
              </div>
            </button>
          </div>
        </section>

        {/* Section 2: Appearance & Theme */}
        <section className="space-y-3.5 pt-4 border-t border-border/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">{t.appearanceTitle}</h2>
              <p className="text-xs text-muted-foreground">{t.appearanceDesc}</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {THEME_OPTIONS.map((opt) => {
              const isSelected = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-2xl border text-left transition-all',
                    isSelected
                      ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/30'
                      : 'bg-card border-border/70 hover:bg-muted/50'
                  )}
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-xs relative',
                      opt.swatchBg,
                      opt.swatchBorder
                    )}
                  >
                    {opt.icon ? (
                      <opt.icon className="w-4 h-4 text-foreground/70" />
                    ) : (
                      <span className={cn('w-3 h-3 rounded-full shadow-xs', opt.swatchDot)} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={cn('text-xs font-bold block', isSelected ? 'text-primary' : 'text-foreground')}>
                      {opt.label}
                    </span>
                    <p className="text-[10px] text-muted-foreground truncate">{opt.sublabel}</p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Section 3: Language & Default Currency */}
        <section className="space-y-3.5 pt-4 border-t border-border/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">{t.languageTitle}</h2>
              <p className="text-xs text-muted-foreground">Select system language and default bill currency</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Language Selector */}
            <div className="p-3.5 bg-card border border-border/70 rounded-2xl space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Display Language
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={cn(
                    'py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center',
                    language === 'en'
                      ? 'bg-foreground text-background border-foreground shadow-sm'
                      : 'bg-muted/30 border-border/60 hover:bg-muted text-foreground'
                  )}
                >
                  🇬🇧 English
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('vi')}
                  className={cn(
                    'py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center',
                    language === 'vi'
                      ? 'bg-foreground text-background border-foreground shadow-sm'
                      : 'bg-muted/30 border-border/60 hover:bg-muted text-foreground'
                  )}
                >
                  🇻🇳 Tiếng Việt
                </button>
              </div>
            </div>

            {/* Default Currency Selector */}
            <div className="p-3.5 bg-card border border-border/70 rounded-2xl space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-primary" /> {t.defaultCurrencyTitle}
              </Label>
              <CurrencyDropdown
                value={defaultCurrency}
                onChange={(c) => setDefaultCurrency(c)}
                variant="default"
              />
              <p className="text-[10px] text-muted-foreground">{t.defaultCurrencyDesc}</p>
            </div>
          </div>
        </section>

        {/* Section 4: App Info & Store Compliance (Google Play Ready) */}
        <section className="space-y-3.5 pt-4 border-t border-border/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">{t.appInfoTitle}</h2>
              <p className="text-xs text-muted-foreground">{t.appInfoDesc}</p>
            </div>
          </div>

          <div className="bg-card border border-border/70 rounded-2xl divide-y divide-border/50">
            {/* Version & Metadata */}
            <div className="p-3.5 flex items-center justify-between text-xs">
              <span className="font-bold text-foreground">Application Build</span>
              <span className="font-mono text-muted-foreground">
                {APP_METADATA.name} v{APP_METADATA.version} ({APP_METADATA.build})
              </span>
            </div>

            {/* Privacy Policy */}
            <button
              type="button"
              onClick={() => setActiveDocModal('privacy')}
              className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-foreground hover:bg-muted/40 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span>{t.privacyPolicy}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">View &rarr;</span>
            </button>

            {/* Terms of Service */}
            <button
              type="button"
              onClick={() => setActiveDocModal('terms')}
              className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-foreground hover:bg-muted/40 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-blue-500" />
                <span>{t.termsOfService}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">View &rarr;</span>
            </button>

            {/* Privacy Consent Summary */}
            <button
              type="button"
              onClick={() => setActiveDocModal('consent')}
              className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-foreground hover:bg-muted/40 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>{t.dataConsent}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">View &rarr;</span>
            </button>

            {/* Open Source Licenses */}
            <button
              type="button"
              onClick={() => setActiveDocModal('licenses')}
              className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-foreground hover:bg-muted/40 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <Scale className="w-4 h-4 text-purple-500" />
                <span>{t.licenses}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">View &rarr;</span>
            </button>
          </div>
        </section>
      </div>

      {/* Confirmation Modal for Storage Mode Change */}
      <Dialog open={Boolean(pendingStorageMode)} onOpenChange={(open) => !open && setPendingStorageMode(null)}>
        <DialogContent className="max-w-md p-5 rounded-2xl bg-card border-border">
          <DialogHeader className="space-y-1.5 text-left">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-1">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold">{t.storageConfirmTitle}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              {pendingStorageMode === 'local' && t.storageConfirmLocalWarning}
              {pendingStorageMode === 'cloud' && t.storageConfirmCloudWarning}
              {pendingStorageMode === 'hybrid' && t.storageConfirmHybridWarning}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-3 gap-2 flex-row justify-end">
            <Button variant="ghost" size="sm" onClick={() => setPendingStorageMode(null)} className="rounded-xl font-bold text-xs">
              {t.cancel}
            </Button>
            <Button size="sm" onClick={confirmStorageModeChange} className="rounded-xl font-bold text-xs bg-primary text-primary-foreground">
              {t.applyChange}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Legal & Policy Viewer Modal */}
      <Dialog open={Boolean(activeDocModal)} onOpenChange={(open) => !open && setActiveDocModal(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-4 sm:p-6 rounded-2xl bg-card border-border">
          <DialogHeader className="border-b border-border/60 pb-3 shrink-0 text-left">
            <DialogTitle className="text-base sm:text-lg font-bold">
              {activeDocModal === 'privacy' && t.privacyPolicy}
              {activeDocModal === 'terms' && t.termsOfService}
              {activeDocModal === 'consent' && t.dataConsent}
              {activeDocModal === 'licenses' && t.licenses}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {APP_METADATA.name} — Store Compliance & Legal Disclosures
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap pr-1 font-sans">
            {activeDocModal === 'privacy' && PRIVACY_POLICY}
            {activeDocModal === 'terms' && TERMS_OF_SERVICE}
            {activeDocModal === 'consent' && PRIVACY_CONSENT_DISCLOSURE}
            {activeDocModal === 'licenses' && (
              <div className="space-y-3">
                <p>Ledger is built using the following high quality open-source software libraries:</p>
                <div className="grid gap-2">
                  {OPEN_SOURCE_LICENSES.map((lic) => (
                    <div key={lic.name} className="p-2.5 bg-muted/40 rounded-xl flex items-center justify-between">
                      <span className="font-bold text-foreground">{lic.name}</span>
                      <span className="font-mono text-primary font-bold text-[10px]">{lic.license}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border/60 pt-3 shrink-0">
            <Button size="sm" onClick={() => setActiveDocModal(null)} className="rounded-xl font-bold text-xs">
              {t.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
