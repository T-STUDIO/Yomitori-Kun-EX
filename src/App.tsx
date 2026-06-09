import React, { useState, useEffect } from 'react';
import { 
  Camera as CameraIcon, 
  FileText, 
  CreditCard, 
  Languages, 
  Plus, 
  Trash2, 
  Send, 
  Save, 
  Download,
  LogOut,
  User,
  Settings,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  ArrowLeft,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera } from './components/Camera';
import { processImage, ProcessingMode, ReceiptData, BusinessCardData, TranslationData } from './services/geminiService';

import { optimizeImage } from './services/imageUtils';

type AppState = 'idle' | 'capturing' | 'processing' | 'results';

const getStoredSSID = () => {
  try {
    return localStorage.getItem('yomitori_ss_id');
  } catch (e) {
    return null;
  }
};

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [mode, setMode] = useState<ProcessingMode>(ProcessingMode.RECEIPT);
  const [images, setImages] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(getStoredSSID());
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [savedApiKey, setSavedApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('gemini_api_key') || '';
    } catch (e) {
      return '';
    }
  });
  const [showKeyModal, setShowKeyModal] = useState<boolean>(() => {
    try {
      const hasEnvKey = typeof process !== 'undefined' && process.env && !!process.env.GEMINI_API_KEY;
      const hasSavedKey = typeof window !== 'undefined' && !!localStorage.getItem('gemini_api_key');
      return !hasSavedKey && !hasEnvKey;
    } catch (e) {
      return false;
    }
  });
  const [apiKeyVal, setApiKeyVal] = useState<string>(() => {
    try {
      return localStorage.getItem('gemini_api_key') || '';
    } catch (e) {
      return '';
    }
  });

  useEffect(() => {
    checkAuthStatus();
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsAuth(true);
        setMessage({ type: 'success', text: 'Googleアカウントと連携しました。' });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setIsAuth(data.isAuthenticated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const { url } = await res.json();
      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
      if (!authWindow) {
        setMessage({ type: 'error', text: 'ポップアップがブロックされました。ブラウザの設定で許可してください。' });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: '認証URLの取得に失敗しました。' });
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsAuth(false);
    setMessage({ type: 'success', text: 'ログアウトしました。' });
  };

  const onCapture = async (base64: string) => {
    setLoading(true);
    setState('processing');
    try {
      const optimized = await optimizeImage(base64);
      setImages(prev => [...prev, optimized]);
      
      const res = await processImage(optimized, mode);
      const processedResults = Array.isArray(res) 
        ? res.map(item => ({ ...item, _imageIndex: images.length }))
        : [{ ...res, _imageIndex: images.length }];
      
      setResults(prev => [...prev, ...processedResults]);
      setState('results');
    } catch (err) {
      console.error('Processing failed', err);
      setMessage({ type: 'error', text: '解析に失敗しました。' });
      setState('idle');
    } finally {
      setLoading(false);
    }
  };

  const resetApp = () => {
    setImages([]);
    setResults([]);
    setState('idle');
  };

  const exportToSheets = async () => {
    if (!isAuth) return handleConnect();
    setLoading(true);
    try {
      const values = results.map(r => {
        if (mode === ProcessingMode.RECEIPT) {
          return [r.date, r.merchant, r.totalAmount, r.currency];
        } else if (mode === ProcessingMode.BUSINESS_CARD) {
          return [r.companyName, r.name, r.title, r.email, r.phone];
        }
        return [JSON.stringify(r)];
      });

      const res = await fetch('/api/google/sheets/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId,
          range: 'Sheet1!A1',
          values
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        if (data.spreadsheetId) {
          setSpreadsheetId(data.spreadsheetId);
          try {
            localStorage.setItem('yomitori_ss_id', data.spreadsheetId);
          } catch (e) {
            console.warn('Could not save to localStorage');
          }
        }
        setMessage({ 
          type: 'success', 
          text: `スプレッドシートに保存しました。${data.spreadsheetUrl ? ' [開く](' + data.spreadsheetUrl + ')' : ''}` 
        });
      } else {
        throw new Error(data.error || 'Export failed');
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: '書き出しに失敗しました。' });
    } finally {
      setLoading(false);
    }
  };

  const exportToDocs = async () => {
    if (!isAuth) return handleConnect();
    setLoading(true);
    try {
      const content = results.map(r => {
        if (mode === ProcessingMode.TRANSLATION) {
          return `Original:\n${r.originalText}\n\nTranslated:\n${r.translatedText}\n\n---\n`;
        }
        return JSON.stringify(r, null, 2);
      }).join('\n');

      const res = await fetch('/api/google/docs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `よみとりくん 解析結果 - ${new Date().toLocaleString()}`,
          content
        })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ 
          type: 'success', 
          text: `Googleドキュメントを作成しました。${data.documentUrl ? ' [開く](' + data.documentUrl + ')' : ''}` 
        });
      } else {
        throw new Error(data.error || 'Export failed');
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'ドキュメント作成に失敗しました。' });
    } finally {
      setLoading(false);
    }
  };

  const exportToVCard = () => {
    if (mode !== ProcessingMode.BUSINESS_CARD) return;
    results.forEach((card: BusinessCardData, index) => {
      const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${card.name}
ORG:${card.companyName}
TITLE:${card.title}
TEL;TYPE=WORK,VOICE:${card.phone}
TEL;TYPE=CELL,VOICE:${card.mobile}
EMAIL;TYPE=PREF,INTERNET:${card.email}
ADR;TYPE=WORK:;;${card.address}
END:VCARD`;
      const blob = new Blob([vcard], { type: 'text/vcard' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${card.name || 'contact'}_${index}.vcf`;
      a.click();
      URL.revokeObjectURL(url);
    });
    setMessage({ type: 'success', text: 'VCardファイルをダウンロードしました。' });
  };

  return (
    <div className="h-screen flex flex-col bg-[#FDFCFB] font-sans text-[#1A1A1A] overflow-hidden">
      {/* Header */}
      <header className="shrink-0 px-6 py-8 max-w-2xl mx-auto w-full flex justify-between items-baseline border-b border-stone-50">
        <div className="space-y-1">
          <h1 className="text-3xl font-serif font-light tracking-tight italic">よみとりくん</h1>
          <p className="text-[9px] uppercase tracking-[0.2em] text-stone-400 font-medium">Digital Archive Assistant</p>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => {
              setApiKeyVal(savedApiKey);
              setShowKeyModal(true);
            }} 
            className="text-stone-400 hover:text-stone-900 transition-colors flex items-center justify-center p-1"
            title="APIキー設定"
          >
            <Settings size={18} />
          </button>
          {isAuth ? (
            <button onClick={handleLogout} className="text-stone-400 hover:text-stone-900 transition-colors">
              <LogOut size={18} />
            </button>
          ) : (
            <button 
              onClick={handleConnect}
              className="text-[10px] uppercase tracking-widest font-semibold border-b border-stone-200 pb-1 hover:border-stone-900 transition-all"
            >
              Google連携
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 overflow-hidden relative">
        {state === 'idle' && (
          <div className="h-full flex flex-col justify-center gap-4 py-6">
            <button
              onClick={() => { setMode(ProcessingMode.RECEIPT); setState('capturing'); }}
              className="flex-1 bg-white border border-stone-200 rounded-3xl flex flex-col items-center justify-center gap-4 hover:bg-stone-50 active:scale-[0.98] transition-all shadow-sm group"
            >
              <FileText size={40} className="text-stone-400 group-hover:text-stone-900 transition-colors" />
              <span className="text-xl font-serif italic">領収書をスキャン</span>
            </button>

            <button
              onClick={() => { setMode(ProcessingMode.BUSINESS_CARD); setState('capturing'); }}
              className="flex-1 bg-white border border-stone-200 rounded-3xl flex flex-col items-center justify-center gap-4 hover:bg-stone-50 active:scale-[0.98] transition-all shadow-sm group"
            >
              <CreditCard size={40} className="text-stone-400 group-hover:text-stone-900 transition-colors" />
              <span className="text-xl font-serif italic">名刺をスキャン</span>
            </button>

            <button
              onClick={() => { setMode(ProcessingMode.TRANSLATION); setState('capturing'); }}
              className="flex-1 bg-white border border-stone-200 rounded-3xl flex flex-col items-center justify-center gap-4 hover:bg-stone-50 active:scale-[0.98] transition-all shadow-sm group"
            >
              <Languages size={40} className="text-stone-400 group-hover:text-stone-900 transition-colors" />
              <span className="text-xl font-serif italic">翻訳する</span>
            </button>
          </div>
        )}

        {/* Results */}
        <AnimatePresence>
          {state === 'results' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col"
            >
              <div className="shrink-0 flex items-center justify-between border-b border-stone-100 py-4">
                <h2 className="text-xl font-serif italic">解析結果 ({results.length}件)</h2>
                <button
                  onClick={() => setState('capturing')}
                  className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-stone-500 hover:text-stone-900 transition-colors"
                >
                  <Plus size={14} />
                  続けてスキャン
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-6 space-y-10">
                {results.map((res, i) => (
                  <div key={i} className="space-y-6 pb-10 border-b border-stone-100 last:border-0">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase tracking-widest text-stone-300 font-bold">Entry {i + 1}</span>
                      <button 
                        onClick={() => {
                          const newResults = [...results];
                          newResults.splice(i, 1);
                          setResults(newResults);
                          if (newResults.length === 0) setState('idle');
                        }}
                        className="text-stone-300 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="w-full aspect-video overflow-hidden border border-stone-100 rounded-xl">
                      <img src={images[res._imageIndex]} className="w-full h-full object-cover grayscale" />
                    </div>
                    
                    <div className="space-y-6">
                      {mode === ProcessingMode.RECEIPT && (
                        <div className="space-y-6">
                          <h3 className="text-2xl font-serif">{res.merchant}</h3>
                          <div className="grid grid-cols-2 gap-8">
                            <div>
                              <p className="text-[9px] uppercase tracking-widest text-stone-400 mb-1">日付</p>
                              <p className="text-sm font-medium">{res.date}</p>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-widest text-stone-400 mb-1">合計</p>
                              <p className="text-xl font-light">{res.totalAmount?.toLocaleString()} <span className="text-xs text-stone-400">{res.currency}</span></p>
                            </div>
                          </div>
                        </div>
                      )}

                      {mode === ProcessingMode.BUSINESS_CARD && (
                        <div className="space-y-6">
                          <div>
                            <h3 className="text-2xl font-serif">{res.name}</h3>
                            <p className="text-xs text-stone-400 uppercase tracking-widest mt-1">{res.title} — {res.companyName}</p>
                          </div>
                          <div className="grid grid-cols-1 gap-3 text-xs text-stone-600 border-l border-stone-100 pl-4">
                            <p className="flex items-center gap-3"><span className="text-stone-300 w-4">E</span> {res.email}</p>
                            <p className="flex items-center gap-3"><span className="text-stone-300 w-4">T</span> {res.phone || res.mobile}</p>
                            <p className="flex items-center gap-3"><span className="text-stone-300 w-4">A</span> {res.address}</p>
                          </div>
                        </div>
                      )}

                      {mode === ProcessingMode.TRANSLATION && (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <p className="text-[9px] uppercase tracking-widest text-stone-400">原文</p>
                            <p className="text-sm text-stone-500 leading-relaxed italic">"{res.originalText}"</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[9px] uppercase tracking-widest text-stone-400">翻訳</p>
                            <p className="text-lg font-serif leading-relaxed">{res.translatedText}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Batch Actions */}
                <div className="pt-6 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-stone-100" />
                    <span className="text-[9px] uppercase tracking-widest text-stone-300 font-bold">一括操作</span>
                    <div className="h-px flex-1 bg-stone-100" />
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {(mode === ProcessingMode.RECEIPT || mode === ProcessingMode.BUSINESS_CARD) && (
                      <button
                        onClick={exportToSheets}
                        className="w-full py-4 bg-white border border-stone-200 rounded-xl text-[10px] uppercase tracking-widest font-bold hover:bg-stone-50 transition-all flex items-center justify-center gap-3 shadow-sm"
                      >
                        <Save size={14} />
                        全データをスプレッドシートに保存
                      </button>
                    )}
                    
                    {mode === ProcessingMode.TRANSLATION && (
                      <button
                        onClick={exportToDocs}
                        className="w-full py-4 bg-white border border-stone-200 rounded-xl text-[10px] uppercase tracking-widest font-bold hover:bg-stone-50 transition-all flex items-center justify-center gap-3 shadow-sm"
                      >
                        <FileText size={14} />
                        全データをドキュメントに保存
                      </button>
                    )}

                    {mode === ProcessingMode.BUSINESS_CARD && (
                      <button
                        onClick={exportToVCard}
                        className="w-full py-4 bg-white border border-stone-200 rounded-xl text-[10px] uppercase tracking-widest font-bold hover:bg-stone-50 transition-all flex items-center justify-center gap-3 shadow-sm"
                      >
                        <Download size={14} />
                        VCardを一括ダウンロード
                      </button>
                    )}

                    <button
                      onClick={() => setMessage({ type: 'success', text: 'Googleフォトへのアップロード準備が整いました（デモ）' })}
                      className="w-full py-4 bg-white border border-stone-200 rounded-xl text-[10px] uppercase tracking-widest font-bold hover:bg-stone-50 transition-all flex items-center justify-center gap-3 shadow-sm"
                    >
                      <ImageIcon size={14} />
                      画像をGoogleフォトに保存
                    </button>
                  </div>
                </div>
              </div>

              {/* Fixed Bottom Back Button */}
              <div className="shrink-0 py-6 border-t border-stone-100 bg-stone-50">
                <button
                  onClick={resetApp}
                  className="w-full py-5 bg-stone-900 text-white rounded-2xl text-sm font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all"
                >
                  <ArrowLeft size={18} />
                  トップ画面に戻る
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Camera */}
      {state === 'capturing' && (
        <Camera 
          onCapture={onCapture} 
          onClose={() => setState('idle')} 
          onError={(err) => {
            setMessage({ type: 'error', text: err });
            setState('idle');
          }}
        />
      )}

      {/* Loading */}
      {state === 'processing' && (
        <div className="fixed inset-0 z-50 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center gap-6">
          <div className="w-12 h-12 border-t border-stone-900 rounded-full animate-spin" />
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-stone-400">Analyzing Archive</p>
        </div>
      )}

      {/* API Key Modal */}
      <AnimatePresence>
        {showKeyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-stone-200 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative space-y-6"
            >
              <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                <h3 className="text-xl font-serif italic">APIキー設定 (BYOK)</h3>
                <button
                  onClick={() => setShowKeyModal(false)}
                  className="text-stone-400 hover:text-stone-900 p-1"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-stone-500 leading-relaxed">
                  画像解析機能（Gemini）を利用するには、Google CloudのGemini APIキーが必要です。入力されたキーはあなたのブラウザ内のみ（localStorage）に安全に保存されます。
                </p>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold block">Gemini APIキー</label>
                  <input
                    type="password"
                    value={apiKeyVal}
                    onChange={(e) => setApiKeyVal(e.target.value)}
                    placeholder={typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY ? "環境変数からキーを検出済み" : "AIzaSy..."}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono focus:outline-none focus:border-stone-900 transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <a
                    href="https://aistudio.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 bg-stone-100 text-stone-850 text-stone-800 rounded-xl text-[10px] uppercase tracking-widest font-bold text-center hover:bg-stone-200 transition-all block"
                  >
                    💡 AI Studioでキーを無料取得する
                  </a>
                </div>
              </div>

              <div className="flex gap-3 border-t border-stone-100 pt-4">
                <button
                  onClick={() => setShowKeyModal(false)}
                  className="flex-1 py-3 border border-stone-200 text-stone-600 rounded-xl text-xs font-bold hover:bg-stone-50 transition-colors"
                >
                  閉じる
                </button>
                <button
                  onClick={() => {
                    try {
                      localStorage.setItem('gemini_api_key', apiKeyVal.trim());
                      setSavedApiKey(apiKeyVal.trim());
                      setMessage({ type: 'success', text: 'APIキーを保存しました。' });
                      setShowKeyModal(false);
                    } catch (e) {
                      setMessage({ type: 'error', text: 'キーの保存に失敗しました。' });
                    }
                  }}
                  className="flex-1 py-3 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors"
                >
                  保存する
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-6 right-6 max-w-sm mx-auto p-5 bg-stone-900 text-white shadow-2xl z-50 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {message.type === 'success' ? <CheckCircle2 size={18} className="text-stone-400" /> : <AlertCircle size={18} className="text-red-400" />}
                <p className="text-xs font-medium leading-relaxed">
                  {message.text.split(' [開く](')[0]}
                </p>
              </div>
              <button onClick={() => setMessage(null)} className="text-stone-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            {message.text.includes('[開く](') && (
              <a 
                href={message.text.split('[開く](')[1].split(')')[0]} 
                target="_blank" 
                rel="noreferrer"
                className="text-[10px] uppercase tracking-widest font-bold text-stone-400 hover:text-white underline text-center pt-2 border-t border-white/10"
              >
                ファイルを開く
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
