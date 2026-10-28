import type { Metadata, Viewport } from 'next';
import '@/index.css';
import { ViewportUnzoom } from '@/components/shared/viewport-unzoom';
import { PwaRegister } from '@/components/shared/pwa-register';
import { QueryProvider } from '@/components/providers/query-provider';
import { ThemeProvider } from '@/components/layout/theme-provider';

export const metadata: Metadata = {
  title: 'Ledger',
  description: 'The smart group expense ledger for splitting bills, tracking sponsors, and settling balances.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ledger',
  },
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/logo-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/logo-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark theme-emerald" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='vite-ui-theme',s=localStorage.getItem(k)||'dark-emerald',r='dark-emerald';if(s==='light'){r='light';}else if(s==='dark-neon'){r='dark-neon';}else if(s==='system'){var d=window.matchMedia('(prefers-color-scheme: dark)').matches;r=d?(localStorage.getItem(k+'-dark-style')||'dark-emerald'):'light';}var el=document.documentElement;el.classList.remove('light','dark','theme-neon','theme-emerald');if(r==='light'){el.classList.add('light');}else if(r==='dark-neon'){el.classList.add('dark','theme-neon');}else{el.classList.add('dark','theme-emerald');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased selection:bg-foreground/20">
        <ThemeProvider defaultTheme="dark-emerald" storageKey="vite-ui-theme">
          <QueryProvider>
            <ViewportUnzoom />
            <PwaRegister />
            {children}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
