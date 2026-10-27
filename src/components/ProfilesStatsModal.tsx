import React, { useState } from 'react';
import { X, UserCheck, BarChart3, History, Cloud, LogIn, LogOut, Check } from 'lucide-react';
import { MatchSummary, PlayerColorKey, PlayerProfile, PLAYER_PALETTES } from '../game/types';

interface ProfilesStatsModalProps {
  profiles: PlayerProfile[];
  history: MatchSummary[];
  onClose: () => void;
  onUpdateProfile: (profileId: string, name: string, colorKey: PlayerColorKey) => void;
  cloudUserName: string | null;
  cloudSyncStatus: string;
  onCloudSignIn: () => void;
  onCloudSignOut: () => void;
  onCloudSyncNow: () => void;
}

const COLOR_KEYS: PlayerColorKey[] = ['blue', 'red', 'green', 'gold'];

export const ProfilesStatsModal: React.FC<ProfilesStatsModalProps> = ({
  profiles,
  history,
  onClose,
  onUpdateProfile,
  cloudUserName,
  cloudSyncStatus,
  onCloudSignIn,
  onCloudSignOut,
  onCloudSyncNow,
}) => {
  const [tab, setTab] = useState<'profiles' | 'history'>('profiles');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<PlayerColorKey>('blue');

  const startEditing = (p: PlayerProfile) => {
    setEditingId(p.profileId);
    setDraftName(p.name);
    setDraftColor(p.colorKey);
  };

  const saveEdit = (profileId: string) => {
    if (draftName.trim()) {
      onUpdateProfile(profileId, draftName.trim(), draftColor);
    }
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-stone-900 border border-amber-500/40 shadow-2xl p-5 text-stone-100 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-amber-300">Oyuncu Profilleri ve İstatistikler</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 bg-stone-950/80 border border-stone-800 rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs text-stone-300">
            <Cloud className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="font-semibold text-stone-200">
                Yerel Kayıt Aktif {cloudUserName ? `• Bulut: ${cloudUserName}` : '• Çevrimdışı Mod'}
              </div>
              <div className="text-[11px] text-stone-400">{cloudSyncStatus}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cloudUserName ? (
              <>
                <button
                  type="button"
                  onClick={onCloudSyncNow}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-600/30 cursor-pointer"
                >
                  Yedekle
                </button>
                <button
                  type="button"
                  onClick={onCloudSignOut}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stone-800 text-stone-300 text-xs hover:bg-stone-700 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Çıkış</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onCloudSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-amber-300 text-xs font-semibold cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>İsteğe Bağlı Bulut Yedekleme</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTab('profiles')}
            className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'profiles'
                ? 'bg-amber-600 text-stone-950'
                : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Sabit Oyuncu Profilleri ({profiles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'history'
                ? 'bg-amber-600 text-stone-950'
                : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Tamamlanan Maç Özeti ({history.length})</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {tab === 'profiles' ? (
            profiles.map((profile) => {
              const palette = PLAYER_PALETTES[profile.colorKey] || PLAYER_PALETTES.blue;
              const isEditing = editingId === profile.profileId;

              return (
                <div
                  key={profile.profileId}
                  className="rounded-xl bg-stone-950/80 border border-stone-800 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-4 h-4 rounded-sm border border-white/30 shrink-0"
                        style={{ backgroundColor: palette.fillHex }}
                      />
                      {isEditing ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            maxLength={24}
                            className="px-2.5 py-1 rounded bg-stone-900 border border-amber-500/60 text-sm text-white"
                          />
                          <div className="flex items-center gap-1">
                            {COLOR_KEYS.map((key) => {
                              const c = PLAYER_PALETTES[key];
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => setDraftColor(key)}
                                  className={`w-5 h-5 rounded-sm border ${
                                    draftColor === key
                                      ? 'border-white scale-110'
                                      : 'border-transparent opacity-70'
                                  }`}
                                  style={{ backgroundColor: c.fillHex }}
                                />
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => saveEdit(profile.profileId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Kaydet</span>
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="font-bold text-sm text-white">{profile.name}</div>
                          <div className="text-[11px] text-stone-400 font-mono">
                            Sabit Kimlik: {profile.profileId} (Ad değişse bile istatistikler korunur)
                          </div>
                        </div>
                      )}
                    </div>
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => startEditing(profile)}
                        className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs text-amber-300 font-medium cursor-pointer"
                      >
                        Adı / Rengi Düzenle
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-stone-900/90 rounded-lg p-2 border border-stone-800/80">
                      <div className="text-stone-400">Toplam Maç</div>
                      <div className="font-mono font-bold text-base text-white">
                        {profile.totalMatches}
                      </div>
                    </div>
                    <div className="bg-stone-900/90 rounded-lg p-2 border border-stone-800/80">
                      <div className="text-stone-400">G / M / B</div>
                      <div className="font-mono font-bold text-base text-amber-300">
                        {profile.wins} / {profile.losses} / {profile.draws}
                      </div>
                    </div>
                    <div className="bg-stone-900/90 rounded-lg p-2 border border-stone-800/80">
                      <div className="text-stone-400">Tam Fetih / Tur Sınırlı</div>
                      <div className="font-mono font-semibold text-xs text-stone-200 mt-0.5">
                        TF: {profile.fullConquestWins}/{profile.fullConquestMatches} • TS:{' '}
                        {profile.turnLimitedWins}/{profile.turnLimitedMatches}
                      </div>
                    </div>
                    <div className="bg-stone-900/90 rounded-lg p-2 border border-stone-800/80">
                      <div className="text-stone-400">Fethedilen Kare / Eleme</div>
                      <div className="font-mono font-bold text-sm text-emerald-400">
                        {profile.totalConqueredTiles} kare • {profile.eliminationsCaused} eleme
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-stone-400 text-sm">
              Henüz tamamlanmış maç bulunmuyor. Tamamlanan maçlar burada listelenir.
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.matchId}
                className="rounded-xl bg-stone-950/80 border border-stone-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="text-xs font-bold text-amber-300">
                    {item.victoryMode === 'full_conquest' ? 'Tam Fetih' : 'Tur Sınırlı'} •{' '}
                    {item.boardSize}×{item.boardSize} Harita • {item.turnCount} Tur
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {item.isDraw
                      ? 'Berabere sonuçlandı'
                      : `Kazanan: ${
                          item.standings.find((s) => item.winnerIds.includes(s.playerId))?.name ||
                          'Oyuncu'
                        }`}
                  </div>
                  <div className="text-[11px] text-stone-400 mt-1">
                    {item.standings
                      .map((s) => `${s.name}: ${s.tileCount} kare (${s.conqueredCount} fetih)`)
                      .join(' • ')}
                  </div>
                </div>
                <div className="text-[11px] font-mono text-stone-400 shrink-0">
                  {new Date(item.completedAt).toLocaleString('tr-TR')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
