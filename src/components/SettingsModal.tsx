import React from 'react';
import { X, Volume2, Music, Smartphone, Sun, Moon, Monitor, Box } from 'lucide-react';
import { AppSettings } from '../game/types';

interface SettingsModalProps {
  settings: AppSettings;
  onUpdate: (next: AppSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdate,
  onClose,
}) => {
  const toggle = (key: 'soundEnabled' | 'musicEnabled' | 'vibrationEnabled') => {
    onUpdate({
      ...settings,
      [key]: !settings[key],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-md rounded-2xl bg-stone-900 border border-amber-500/40 shadow-2xl p-5 text-stone-100">
        <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-4">
          <h2 className="text-lg font-bold text-amber-300">Oyun Ayarları</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <button
            type="button"
            onClick={() => toggle('soundEnabled')}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-stone-950/80 border border-stone-800 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Volume2 className="w-5 h-5 text-amber-400" />
              <div className="text-left">
                <div className="text-sm font-semibold">Oyun İçi Ses Efektleri</div>
                <div className="text-xs text-stone-400">Zar atışı, fetih ve sıra uyarı sesleri</div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded text-xs font-bold ${
                settings.soundEnabled ? 'bg-emerald-600 text-white' : 'bg-stone-800 text-stone-400'
              }`}
            >
              {settings.soundEnabled ? 'AÇIK' : 'KAPALI'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => toggle('musicEnabled')}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-stone-950/80 border border-stone-800 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Music className="w-5 h-5 text-amber-400" />
              <div className="text-left">
                <div className="text-sm font-semibold">Arka Plan Müziği</div>
                <div className="text-xs text-stone-400">Klasik strateji ambiyans müziği</div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded text-xs font-bold ${
                settings.musicEnabled ? 'bg-emerald-600 text-white' : 'bg-stone-800 text-stone-400'
              }`}
            >
              {settings.musicEnabled ? 'AÇIK' : 'KAPALI'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => toggle('vibrationEnabled')}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-stone-950/80 border border-stone-800 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-amber-400" />
              <div className="text-left">
                <div className="text-sm font-semibold">Titreşim (Haptic)</div>
                <div className="text-xs text-stone-400">Fetih ve geçersiz hamle titreşimi</div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded text-xs font-bold ${
                settings.vibrationEnabled ? 'bg-emerald-600 text-white' : 'bg-stone-800 text-stone-400'
              }`}
            >
              {settings.vibrationEnabled ? 'AÇIK' : 'KAPALI'}
            </span>
          </button>

          <div className="p-3 rounded-xl bg-stone-950/80 border border-stone-800 space-y-2">
            <div className="text-xs font-semibold text-stone-300">Görünüm Teması</div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'dark', label: 'Karanlık', icon: Moon },
                  { id: 'light', label: 'Aydınlık', icon: Sun },
                  { id: 'system', label: 'Cihaz', icon: Monitor },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = settings.themeMode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onUpdate({ ...settings, themeMode: item.id })}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                      active
                        ? 'bg-amber-600 border-amber-400 text-stone-950'
                        : 'bg-stone-900 border-stone-700 text-stone-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-950/80 border border-stone-800 space-y-2">
            <div className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-amber-400" />
              <span>Varsayılan Tahta Görünümü</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdate({ ...settings, renderMode: '2d' })}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${
                  settings.renderMode === '2d'
                    ? 'bg-amber-600 border-amber-400 text-stone-950'
                    : 'bg-stone-900 border-stone-700 text-stone-300'
                }`}
              >
                2B Taktiksel Harita (Hızlı)
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ ...settings, renderMode: '3d' })}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border cursor-pointer ${
                  settings.renderMode === '3d'
                    ? 'bg-amber-600 border-amber-400 text-stone-950'
                    : 'bg-stone-900 border-stone-700 text-stone-300'
                }`}
              >
                3B Kale Görünümü (Three.js)
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-sm cursor-pointer"
        >
          Tamam
        </button>
      </div>
    </div>
  );
};
