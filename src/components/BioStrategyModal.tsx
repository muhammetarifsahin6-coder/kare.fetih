import React, { useState } from 'react';
import { X, Dna, Sparkles, Search, ShieldCheck } from 'lucide-react';

interface BioStrategyModalProps {
  onClose: () => void;
}

interface ProteinStructureSummary {
  accession: string;
  proteinName: string;
  organism: string;
  residueCount: number;
  plddtMean: number;
  tacticalPattern: string;
}

const OFFLINE_PROTEIN_PRESETS: Record<string, ProteinStructureSummary> = {
  P69905: {
    accession: 'P69905',
    proteinName: 'Hemoglobin Subunit Alpha (AlphaFold Globüler Çekirdek)',
    organism: 'Homo sapiens',
    residueCount: 142,
    plddtMean: 94.6,
    tacticalPattern:
      'Kompakt 2×2 ve 3×3 globüler blok kümeleri — İnce koridorlardan kaçınan yüksek dayanımlı savunma geometrisi.',
  },
  P00533: {
    accession: 'P00533',
    proteinName: 'Epidermal Growth Factor Receptor (Çok Bölgeli Kalkan)',
    organism: 'Homo sapiens',
    residueCount: 1210,
    plddtMean: 88.4,
    tacticalPattern:
      'Köprü ve geçit noktalarını tutan birbirine kenetli 2×4 ve 3×4 dikdörtgen cephe blokları.',
  },
  P04637: {
    accession: 'P04637',
    proteinName: 'Cellular Tumor Antigen p53 (Merkez Çekirdek Kuşatması)',
    organism: 'Homo sapiens',
    residueCount: 393,
    plddtMean: 86.2,
    tacticalPattern:
      'Merkez karolarda 3×3 yoğun çekirdek kurup kanatlardan 2×3 destek kollarıyla genişleme modeli.',
  },
};

function generateOfflineTacticalAdvice(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('köprü') || q.includes('nehir') || q.includes('arazi') || q.includes('random')) {
    return 'KareFetih Taktik Önerisi (Arazi & Köprü Hakimiyeti): Rastgele taktik haritalarda nehir ve dağ engelleri doğal savunma duvarı oluşturur. Köprü karelerine ulaşırken tek karelik ince hatlar Kural 5.1 gereği reddedileceği için köprü girişini en az 2×2 veya 2×3 blokla tutun; köprüyü geçer geçmez karşı kıyıda 2×2 dayanak noktası kurarak rakibin geçişini tamamen kilitleyin.';
  }
  if (q.includes('4 oyuncu') || q.includes('3 oyuncu') || q.includes('çok') || q.includes('köşe')) {
    return 'KareFetih Taktik Önerisi (Çok Oyunculu Köşe Dengesi): 3 veya 4 oyunculu maçlarda erken turlarda tek bir rakibe aşırı uzanmak diğer rakiplerin arkanızdan kuşatma yapmasına yol açar. Başlangıçtaki 2×5 bölgenizi önce 4×5 veya 5×5 kompakt bir kaleye dönüştürün, ardından en zayıf zar atan komşunuzun sınırına 2 kare kalınlığında cephe hattıyla baskı kurun.';
  }
  if (q.includes('tur sınırlı') || q.includes('puan') || q.includes('tur')) {
    return 'KareFetih Taktik Önerisi (Tur Sınırlı Mod): Tur sınırlı modda amaç rakibi tamamen elemek değil, son tur sonunda en yüksek kare sayısına ulaşmaktır. Yüksek zar (ör. 15–36 hak) geldiğinde tarafsız açık alanları 3×4 veya 4×4 bloklarla hızla kapatın; son 3 turda ise lider rakibin karelerini doğrudan hedef alarak net kare farkını (sizin artışınız + rakibin kaybı = 2× etki) maksimize edin.';
  }
  return 'KareFetih Taktik Önerisi (Kural 5.1 & Kompakt Genişleme): Fetih hakkınızı tek seferde harcamak yerine 2×2, 2×3 veya 3×3 kompakt bloklara bölerek ilerleyin. Tek karelik ince hatlar Kural 5.1 nedeniyle geçersizdir; rakip sınırına yaklaştığınızda en az 2 kare kalınlığında cephe hattı kurarak rakibin başlangıç köşesini kuşatın ve düşük zar (1–3 hak) turlarını cephe gediklerini doldurmak için kullanın.';
}

export const BioStrategyModal: React.FC<BioStrategyModalProps> = ({ onClose }) => {
  const [uniprotId, setUniprotId] = useState('P69905'); // Human Hemoglobin subunit alpha
  const [loadingBio, setLoadingBio] = useState(false);
  const [bioData, setBioData] = useState<ProteinStructureSummary | null>(OFFLINE_PROTEIN_PRESETS.P69905);

  const [advisorPrompt, setAdvisorPrompt] = useState(
    '30x30 tahtada 4 oyunculu maçta en dar kesiti en az 2 kare olan genişleme stratejisi nedir?'
  );
  const [advisorReply, setAdvisorReply] = useState<string>('');
  const [loadingAdvisor, setLoadingAdvisor] = useState(false);

  const fetchAlphaFoldPattern = async () => {
    setLoadingBio(true);
    const cleanId = uniprotId.trim().toUpperCase() || 'P69905';
    try {
      // 1. Doğrudan genel AlphaFold EBI API çağrısı (Android APK / Capacitor içinde sunucusuz çalışır)
      const directResp = await fetch(
        `https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(cleanId)}`
      );
      if (directResp.ok) {
        const list = await directResp.json();
        if (Array.isArray(list) && list.length > 0) {
          const entry = list[0];
          setBioData({
            accession: entry.uniprotAccession || cleanId,
            proteinName: entry.uniprotDescription || 'Globular Protein Core',
            organism: entry.organismScientificName || 'Homo sapiens',
            residueCount: (entry.uniprotEnd || 142) - (entry.uniprotStart || 1) + 1,
            plddtMean: entry.globalMetricValue ?? 92.4,
            tacticalPattern:
              'Kompakt 2×2 ve 3×3 globüler blok kümeleri — İnce koridorlardan kaçınan yüksek dayanımlı savunma geometrisi.',
          });
          setLoadingBio(false);
          return;
        }
      }
    } catch {
      // Çevrimdışıysa yerel önbelleğe düş
    }

    // 2. Çevrimdışı / Android yerel yedek
    setBioData(
      OFFLINE_PROTEIN_PRESETS[cleanId] || {
        accession: cleanId,
        proteinName: 'Globüler Kompakt Çekirdek Yapısı (Çevrimdışı Model)',
        organism: 'Homo sapiens',
        residueCount: 148,
        plddtMean: 93.8,
        tacticalPattern:
          'Kompakt 2×2 ve 2×4 dikdörtgen blok kümeleri — Kural 5.1 uyumlu kesintisiz savunma hattı.',
      }
    );
    setLoadingBio(false);
  };

  const askTacticalAdvisor = async () => {
    setLoadingAdvisor(true);
    try {
      const isNativeAndroid =
        Boolean(window.Capacitor?.isNativePlatform?.()) ||
        Boolean(window.KareFetihNative?.isNativeAndroid?.()) ||
        window.location.protocol === 'capacitor:';

      if (!isNativeAndroid) {
        const resp = await fetch('/api/ai-advisor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: advisorPrompt }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.advice) {
            setAdvisorReply(data.advice);
            setLoadingAdvisor(false);
            return;
          }
        }
      }
    } catch {
      // Android veya çevrimdışı modda yerel taktik motorunu kullan
    }

    setAdvisorReply(generateOfflineTacticalAdvice(advisorPrompt));
    setLoadingAdvisor(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-stone-900 border border-amber-500/40 shadow-2xl p-5 text-stone-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Dna className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-amber-300">
              Geometrik Strateji & Biyo-Yapısal Alan Analizi
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-stone-950/90 border border-stone-800 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Kural 5.1: Kompakt Geometri & AlphaFold Katlanma Modelleri</span>
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">
              KareFetih&apos;te tek kare genişliğinde ip gibi uzanan koridorlar yasaktır; en dar kesit en az{' '}
              <strong>2 kare</strong> olmalıdır. Doğadaki globüler proteinlerin (AlphaFold DB / UniProt)
              kompakt katlanma geometrisiyle aynı prensibi paylaşır.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={uniprotId}
                onChange={(e) => setUniprotId(e.target.value)}
                placeholder="UniProt ID (örn. P69905, P00533, P04637)"
                className="flex-1 px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-xs text-white font-mono"
              />
              <button
                type="button"
                onClick={fetchAlphaFoldPattern}
                disabled={loadingBio}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{loadingBio ? 'Yükleniyor...' : 'Yapı Analizi'}</span>
              </button>
            </div>
            {bioData && (
              <div className="p-2.5 rounded-lg bg-stone-900 border border-stone-800 text-xs space-y-1">
                <div className="font-bold text-amber-300">
                  {bioData.accession} — {bioData.proteinName}
                </div>
                <div className="text-stone-400">
                  Organizma: {bioData.organism} • Uzunluk: {bioData.residueCount} aa • Güven (pLDDT):{' '}
                  {bioData.plddtMean}
                </div>
                <div className="text-emerald-300 font-medium">{bioData.tacticalPattern}</div>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-stone-950/90 border border-stone-800 p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Strateji Rehberi & Hamle Danışmanı</span>
            </div>
            <textarea
              rows={2}
              value={advisorPrompt}
              onChange={(e) => setAdvisorPrompt(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-stone-900 border border-stone-700 text-xs text-white"
            />
            <button
              type="button"
              onClick={askTacticalAdvisor}
              disabled={loadingAdvisor}
              className="w-full py-2 rounded-lg bg-stone-800 hover:bg-stone-700 border border-amber-500/40 text-amber-300 font-bold text-xs cursor-pointer"
            >
              {loadingAdvisor ? 'Analiz Ediliyor...' : 'Strateji Önerisi Al'}
            </button>
            {advisorReply && (
              <div className="p-3 rounded-lg bg-stone-900 border border-stone-800 text-xs text-stone-200 leading-relaxed whitespace-pre-wrap">
                {advisorReply}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
