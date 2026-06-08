import type { Metadata } from 'next';
import './globals.css';
import InstallPrompt from '@/components/InstallPrompt';
import PushSubscriber, { PushBanner } from '@/components/PushSubscriber';

export const metadata: Metadata = {
  title: '라이프 스토어',
  description: '라이프 스토어 쇼핑 애플리케이션',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, interactive-widget=resizes-content" />
        <meta name="theme-color" content="#FF6B35" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="라이프 스토어" />
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
