import React, { useEffect, useState } from 'react';
import { Download, Smartphone, CheckCircle2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
    KareFetihNative?: {
      setOrientation?: (mode: string) => void;
      isNativeAndroid?: () => boolean;
    };
  }
}

export const PWAInstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const isCapNative =
        Boolean(window.Capacitor?.isNativePlatform?.()) ||
        Boolean(window.KareFetihNative?.isNativeAndroid?.()) ||
        window.location.protocol === 'capacitor:' ||
        window.location.hostname === 'localhost' && Boolean(window.navigator.userAgent.includes('wv'));
      const standalone =
        isCapNative ||
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(standalone);
    };
    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  if (isStandalone) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-700/50 bg-emerald-950/40 text-emerald-300 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Android Çevrimdışı Mod Aktif</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setShowTip((prev) => !prev);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={handleInstallClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-600/50 bg-stone-900 hover:bg-stone-800 text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
      >
        {deferredPrompt ? <Download className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
        <span>Telefona Kur (PWA / APK)</span>
      </button>
      {showTip && !deferredPrompt && (
        <div className="mt-2 p-2.5 rounded-lg bg-stone-900 border border-stone-700 text-xs text-stone-300 max-w-xs leading-relaxed shadow-xl">
          Android Chrome menüsünden <strong>"Ana ekrana ekle"</strong> / <strong>"Uygulamayı yükle"</strong> seçeneğiyle veya doğrudan <strong>Android APK</strong> paketiyle tam ekran kurabilirsiniz.
        </div>
      )}
    </div>
  );
};
