import type { Metadata } from 'next';
import './globals.css';
import InstallPrompt from '@/components/InstallPrompt';
import PushSubscriber, { PushBanner } from '@/components/PushSubscriber';

export const metadata: Metadata = {
  title: '마이클조던',
  description: '마이클조던 채팅 애플리케이션',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, interactive-widget=resizes-content" />
        <meta name="theme-color" content="#1e1f22" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="마이클조던" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="bg-gray-100 text-gray-900 antialiased">
        {children}
        <PushSubscriber />
        <PushBanner />
        <InstallPrompt />
      </body>
    </html>
  );
}
