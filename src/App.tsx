import { useState, useEffect, useRef } from 'react';
import { saveReceipt, getReceipt, deleteReceipt, getAllReceipts, restoreReceipts } from './db';
import Dashboard from './components/Dashboard';

import { DEFAULT_CATEGORIES, type Category, type Expense, type Project, type QuickTemplate } from './types';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const CURRENCIES = [
  { code: 'MYR', symbol: 'RM', locale: 'en-MY' },
  { code: 'USD', symbol: '$', locale: 'en-US' },
  { code: 'EUR', symbol: '€', locale: 'de-DE' },
  { code: 'SGD', symbol: 'S$', locale: 'en-SG' },
  { code: 'GBP', symbol: '£', locale: 'en-GB' },
  { code: 'JPY', symbol: '¥', locale: 'ja-JP' },
  { code: 'CNY', symbol: '¥', locale: 'zh-CN' }
];

const getCurrencySymbol = (code: string) => {
  const match = CURRENCIES.find(c => c.code === code);
  return match ? match.symbol : 'RM';
};

// Formatter for currency
const formatCurrency = (amount: number, code: string = 'MYR') => {
  try {
    const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : parseFloat(String(amount)) || 0;
    const match = CURRENCIES.find(c => c.code === code);
    const locale = match ? match.locale : 'en-US';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(safeAmount);
  } catch (e) {
    console.error("formatCurrency error, using fallback:", e);
    const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : parseFloat(String(amount)) || 0;
    const match = CURRENCIES.find(c => c.code === code);
    const symbol = match ? match.symbol : 'RM';
    return `${symbol} ${safeAmount.toFixed(2)}`;
  }
};

// Helper to format 24h time string (e.g. "18:15") to 12h format (e.g. "6:15 PM")
const formatTime12h = (time24?: string) => {
  if (!time24) return '';
  const [hoursStr, minutesStr] = time24.split(':');
  if (!hoursStr || !minutesStr) return time24;
  let hours = parseInt(hoursStr, 10);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  return `${hours}:${minutesStr} ${ampm}`;
};

// Helper to render currency with optimized typography (smaller currency symbol and smaller cents)
const renderFormattedAmount = (amount: number, code: string = 'MYR', isNegative: boolean = false) => {
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : parseFloat(String(amount)) || 0;
  const match = CURRENCIES.find(c => c.code === code);
  const symbol = match ? match.symbol : 'RM';
  const parts = safeAmount.toFixed(2).split('.');
  const intPart = parts[0];
  const decPart = parts[1];

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
      {isNegative && <span style={{ marginRight: '1px' }}>-</span>}
      <span style={{ fontSize: '0.78em', opacity: 0.6, fontWeight: 600, marginRight: '2px', verticalAlign: 'baseline' }}>
        {symbol}
      </span>
      <span style={{ fontWeight: 800 }}>
        {Number(intPart).toLocaleString('en-US')}
      </span>
      <span style={{ fontSize: '0.78em', opacity: 0.6, fontWeight: 700, verticalAlign: 'baseline' }}>
        .{decPart}
      </span>
    </span>
  );
};

// Helper to format stored date into human-readable text (Today, Yesterday, or Month Day)
const formatExpenseDate = (dateStr: string) => {
  if (!dateStr) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const tStr = today.toISOString().split('T')[0];
  const yStr = yesterday.toISOString().split('T')[0];

  if (dateStr === tStr) return 'Today';
  if (dateStr === yStr) return 'Yesterday';

  // Fallback to parsing
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }
  
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};


// Robustly parse a stored expense date (handles both ISO "2026-06-22" and legacy "6/22/2026" / "22/6/2026")
const parseExpenseDate = (dateStr: string): Date => {
  if (!dateStr) return new Date(NaN);
  // ISO format: YYYY-MM-DD → parse with explicit parts to avoid timezone shift
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }
  // Legacy localized format: try native parsing as fallback
  const d = new Date(dateStr);
  return d;
};

// Helper to get local date string YYYY-MM-DD to avoid timezone offset shifts
const getLocalDateString = (d: Date = new Date()): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};



interface ConfettiParticle {
  x: number;
  y: number;
  size: number;
  color: string;
  speedX: number;
  speedY: number;
  rotation: number;
  rotationSpeed: number;
}

const playHaptic = (type: 'click' | 'success' | 'delete' | 'warning') => {
  if (localStorage.getItem('micro_sound_enabled') === 'false') return;
  try {
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    if (type === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    }
    else if (type === 'success') {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1000, now + 0.1);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(now + 0.25);
    }
    else if (type === 'delete') {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.15);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(now + 0.15);
    }
    else if (type === 'warning') {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(now + 0.3);
    }
  } catch (e) {
    console.error("Audio Context failed to play", e);
  }
};

const getRandom = () => Math.random();
const getNow = () => Date.now();

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem('micro_expenses');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return (parsed as Expense[]).map((exp) => {
          const rawAmount = exp.amount as unknown;
          return {
            ...exp,
            amount: typeof rawAmount === 'string' ? parseFloat(rawAmount) || 0 : Number(rawAmount) || 0
          };
        });
      }
    } catch (e) {
      console.error("Failed to parse micro_expenses", e);
    }
    return [];
  });

  const [amountInput, setAmountInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('food');
  const [titleInput, setTitleInput] = useState('');
  
  // New: Date State defaulting to today (YYYY-MM-DD)
  const [dateInput, setDateInput] = useState(() => getLocalDateString());

  // New: Time State defaulting to now (HH:MM in 24h format)
  const [timeInput, setTimeInput] = useState(() => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });
  
  // New: Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('micro_theme') === 'dark';
  });

  const [budgetLimit, setBudgetLimit] = useState(() => {
    const saved = localStorage.getItem('micro_budget');
    return saved ? parseFloat(saved) : 3000;
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  
  // AI Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);

  const longPressTimeout = useRef<number | null>(null);

  // Bottom Sheet State
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  const triggerConfetti = () => {
    if (localStorage.getItem('micro_confetti_enabled') === 'false') return;
    const canvas = confettiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
    canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    
    const colors = ['#ff9500', '#a2845e', '#34c759', '#007aff', '#af52de', '#ff2d55', '#6366f1'];
    const particles: ConfettiParticle[] = [];
    
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height - 20,
        size: getRandom() * 6 + 4,
        color: colors[Math.floor(getRandom() * colors.length)],
        speedX: (getRandom() - 0.5) * 12,
        speedY: -getRandom() * 12 - 8,
        rotation: getRandom() * Math.PI * 2,
        rotationSpeed: (getRandom() - 0.5) * 0.2
      });
    }
    
    const update = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      let active = false;
      particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.speedY += 0.3; // gravity
        p.speedX *= 0.98; // friction
        p.rotation += p.rotationSpeed;
        
        if (p.y < canvas.height + 20) {
          active = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
      });
      
      if (active) {
        requestAnimationFrame(update);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    
    update();
  };

  // V5 Custom States for Scope and Projects
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('micro_projects');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentTab, setCurrentTab] = useState<'transactions' | 'recurrings' | 'projects'>('transactions');
  const [scopeType, setScopeType] = useState<'one-off' | 'weekly' | 'monthly' | 'project'>('one-off');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [isCreatingNewProject, setIsCreatingNewProject] = useState<boolean>(false);
  const [selectedProjectDetailId, setSelectedProjectDetailId] = useState<string | null>(null);

  // V6 Custom States for Budgets & Portability
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('micro_category_budgets');
    return saved ? JSON.parse(saved) : {};
  });
  const [isBudgetSheetOpen, setIsBudgetSheetOpen] = useState(false);

  // Dynamic categories state
  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem('timmy_wallet_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });

  // Category customization UI state
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('âœ¨');
  const [newCatColor, setNewCatColor] = useState('#8e8e93');
  const [newCatIcon, setNewCatIcon] = useState('more_horiz');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatEmoji, setEditCatEmoji] = useState('');
  const [editCatColor, setEditCatColor] = useState('');

  // Currency selection state
  const [currency, setCurrency] = useState<string>(() => {
    return localStorage.getItem('timmy_wallet_currency') || 'MYR';
  });

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    playHaptic('click');
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted PWA install');
    }
    setDeferredPrompt(null);
  };
  const [newProjectBudget, setNewProjectBudget] = useState<string>('');
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const importCsvInputRef = useRef<HTMLInputElement>(null);

  // V7: Quick Templates, Bulk Mode, and Insights toggles
  const [quickTemplates, setQuickTemplates] = useState<QuickTemplate[]>(() => {
    const saved = localStorage.getItem('micro_templates');
    if (saved) return JSON.parse(saved);
    return [
      { id: 't1', emoji: 'â˜•', title: 'Coffee', amount: 12, categoryId: 'coffee' },
      { id: 't2', emoji: 'ðŸš—', title: 'Transit', amount: 20, categoryId: 'transport' },
      { id: 't3', emoji: 'ðŸ”', title: 'Lunch', amount: 15, categoryId: 'food' },
      { id: 't4', emoji: 'ðŸ›ï¸', title: 'Shopping', amount: 50, categoryId: 'shopping' },
    ];
  });
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [isBatchCategoryOpen, setIsBatchCategoryOpen] = useState(false);
  const [selectedCalendarDateIndex, setSelectedCalendarDateIndex] = useState<number | null>(null);


  // V6 Audio & Confetti Toggle States
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('micro_sound_enabled') !== 'false';
  });
  const [confettiEnabled, setConfettiEnabled] = useState(() => {
    return localStorage.getItem('micro_confetti_enabled') !== 'false';
  });

  // V6 Crop Editor States
  const [rawImageToCrop, setRawImageToCrop] = useState<string | null>(null);
  const [isCropEditorOpen, setIsCropEditorOpen] = useState(false);
  const [cropTop, setCropTop] = useState(5);
  const [cropBottom, setCropBottom] = useState(5);
  const [cropLeft, setCropLeft] = useState(5);
  const [cropRight, setCropRight] = useState(5);

  // V4 Custom States for Receipts and Swiping
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [lightboxReceipt, setLightboxReceipt] = useState<{ url: string; title: string; id: string } | null>(null);
  const [swipeActiveId, setSwipeActiveId] = useState<string | null>(null);
  const [swipeDistance, setSwipeDistance] = useState<number>(0);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwiping = useRef<boolean>(false);
  const [isSwipingState, setIsSwipingState] = useState(false);

  useEffect(() => localStorage.setItem('micro_expenses', JSON.stringify(expenses)), [expenses]);
  useEffect(() => localStorage.setItem('micro_projects', JSON.stringify(projects)), [projects]);
  useEffect(() => localStorage.setItem('micro_budget', budgetLimit.toString()), [budgetLimit]);
  useEffect(() => {
    localStorage.setItem('micro_category_budgets', JSON.stringify(categoryBudgets));
  }, [categoryBudgets]);
  useEffect(() => {
    localStorage.setItem('micro_sound_enabled', soundEnabled ? 'true' : 'false');
  }, [soundEnabled]);
  useEffect(() => {
    localStorage.setItem('micro_confetti_enabled', confettiEnabled ? 'true' : 'false');
  }, [confettiEnabled]);
  useEffect(() => {
    localStorage.setItem('micro_templates', JSON.stringify(quickTemplates));
  }, [quickTemplates]);
  useEffect(() => {
    localStorage.setItem('timmy_wallet_categories', JSON.stringify(categories));
  }, [categories]);
  useEffect(() => {
    localStorage.setItem('timmy_wallet_currency', currency);
  }, [currency]);
  useEffect(() => {
    localStorage.setItem('micro_theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleNumpadPress = (key: string) => {
    playHaptic('click');
    setAmountInput(prev => {
      if (key === 'backspace') {
        if (!prev) return '';
        return prev.slice(0, -1);
      }
      
      if (key === '.') {
        if (!prev) return '0.';
        if (prev.includes('.')) return prev;
        return prev + '.';
      }
      
      if (prev.includes('.')) {
        const parts = prev.split('.');
        if (parts[1] && parts[1].length >= 2) {
          return prev;
        }
      }
      
      if (prev === '0' && key === '0') return prev;
      if (prev === '0' && key !== '0') return key;

      return prev + key;
    });
  };

  // AI Image Scanning Logic (OpenAI)
  const processAndScanImage = async (croppedUrl: string) => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      alert("Error: OpenAI API Key not found in .env file.");
      return;
    }

    setIsScanning(true);
    setIsCropEditorOpen(false);

    try {
      // 1. Keep the color cropped image for the user to review and save in IndexedDB
      setScannedImage(croppedUrl);

      // 2. Generate a processed grayscale/high-contrast image strictly for OpenAI Vision API (to optimize token usage and accuracy)
      const processedDataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.src = croppedUrl;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 768;
          const MAX_HEIGHT = 768;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error("Canvas context is null"));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Local grayscale & contrast enhancement for better AI read
          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            
            let val: number;
            if (gray < 120) {
              val = Math.max(0, gray - 25);
            } else {
              val = Math.min(255, gray + 25);
            }
            
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
          }
          ctx.putImageData(imgData, 0, 0);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      });

      const base64Data = processedDataUrl.split(',')[1];

      const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract receipt data. Return ONLY JSON: {amount: number, title: string (Merchant - items), date: 'YYYY-MM-DD', time: 'HH:MM' (24h), category: 'food'|'coffee'|'transport'|'shopping'|'entertainment'|'other'}. If invalid, return {error: 'invalid'}. No markdown code blocks."
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Data}`,
                    detail: "low"
                  }
                }
              ]
            }
          ],
          temperature: 0.1,
          max_tokens: 150
        })
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || 'API Error');
      }

      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("No text returned from AI");

      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanText);

      if (parsed.error) {
        throw new Error(parsed.error);
      }

      if (parsed.amount) setAmountInput(parsed.amount.toString());
      if (parsed.title) setTitleInput(parsed.title);
      if (parsed.date) setDateInput(parsed.date);
      if (parsed.time) setTimeInput(parsed.time);
      if (parsed.category) {
        const cat = categories.find(c => c.id === parsed.category.toLowerCase());
        if (cat) setSelectedCategory(cat.id);
      }

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert("Failed to auto-scan receipt values. You can still manually enter the details. (" + errorMessage + ")");
    } finally {
      setIsScanning(false);
    }
  };

  const handleImageScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) fileInputRef.current.value = '';

    playHaptic('click');

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setRawImageToCrop(dataUrl);
      
      // Auto edge detection (CamScanner style crop)
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const detectCanvas = document.createElement('canvas');
        const dCtx = detectCanvas.getContext('2d');
        if (dCtx) {
          const size = 150;
          detectCanvas.width = size;
          detectCanvas.height = size;
          dCtx.drawImage(img, 0, 0, size, size);
          
          const imgData = dCtx.getImageData(0, 0, size, size);
          const pixels = imgData.data;
          
          const getPixel = (x: number, y: number) => {
            const idx = (y * size + x) * 4;
            return 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
          };
          
          const rowBrightness = Array(size).fill(0);
          const colBrightness = Array(size).fill(0);
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const b = getPixel(x, y);
              rowBrightness[y] += b;
              colBrightness[x] += b;
            }
          }
          for (let i = 0; i < size; i++) {
            rowBrightness[i] /= size;
            colBrightness[i] /= size;
          }
          
          // Detect brightness deviation from borders
          const threshold = 18;
          let topIdx = 0;
          const topBorderAvg = (rowBrightness[0] + rowBrightness[1] + rowBrightness[2] + rowBrightness[3] + rowBrightness[4]) / 5;
          for (let y = 5; y < size / 2; y++) {
            if (Math.abs(rowBrightness[y] - topBorderAvg) > threshold) {
              topIdx = y;
              break;
            }
          }
          
          let bottomIdx = 0;
          const bottomBorderAvg = (rowBrightness[size-1] + rowBrightness[size-2] + rowBrightness[size-3] + rowBrightness[size-4] + rowBrightness[size-5]) / 5;
          for (let y = 5; y < size / 2; y++) {
            const currentY = size - 1 - y;
            if (Math.abs(rowBrightness[currentY] - bottomBorderAvg) > threshold) {
              bottomIdx = y;
              break;
            }
          }
          
          let leftIdx = 0;
          const leftBorderAvg = (colBrightness[0] + colBrightness[1] + colBrightness[2] + colBrightness[3] + colBrightness[4]) / 5;
          for (let x = 5; x < size / 2; x++) {
            if (Math.abs(colBrightness[x] - leftBorderAvg) > threshold) {
              leftIdx = x;
              break;
            }
          }
          
          let rightIdx = 0;
          const rightBorderAvg = (colBrightness[size-1] + colBrightness[size-2] + colBrightness[size-3] + colBrightness[size-4] + colBrightness[size-5]) / 5;
          for (let x = 5; x < size / 2; x++) {
            const currentX = size - 1 - x;
            if (Math.abs(colBrightness[currentX] - rightBorderAvg) > threshold) {
              rightIdx = x;
              break;
            }
          }
          
          const pctTop = Math.min(40, Math.max(3, Math.round((topIdx / size) * 100)));
          const pctBottom = Math.min(40, Math.max(3, Math.round((bottomIdx / size) * 100)));
          const pctLeft = Math.min(40, Math.max(3, Math.round((leftIdx / size) * 100)));
          const pctRight = Math.min(40, Math.max(3, Math.round((rightIdx / size) * 100)));
          
          setCropTop(pctTop);
          setCropBottom(pctBottom);
          setCropLeft(pctLeft);
          setCropRight(pctRight);
        } else {
          setCropTop(5);
          setCropBottom(5);
          setCropLeft(5);
          setCropRight(5);
        }
      };
      setIsCropEditorOpen(true);
    };
  };

  const handleOpenNewBottomSheet = () => {
    playHaptic('click');
    setEditingId(null);
    setAmountInput('');
    setTitleInput('');
    setSelectedCategory('food');
    setDateInput(getLocalDateString());
    setTimeInput(() => {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    });
    setScopeType('one-off');
    setSelectedProjectId(projects[0]?.id || '');
    setIsCreatingNewProject(false);
    setNewProjectName('');
    setScannedImage(null);
    setIsBottomSheetOpen(true);
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountInput);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const cat = categories.find(c => c.id === selectedCategory);
    const finalTitle = titleInput.trim() || cat?.label || 'Expense';

    const formattedDate = dateInput; // Store as ISO YYYY-MM-DD for reliable date comparisons

    let updatedExpensesList: Expense[];

    const finalTime = timeInput.trim() || (() => {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    })();

    let finalProjId: string | undefined = undefined;
    if (scopeType === 'project') {
      if (isCreatingNewProject && newProjectName.trim()) {
        const newProjId = 'proj_' + getNow();
        const newProj = { id: newProjId, name: newProjectName.trim() };
        setProjects(prev => [...prev, newProj]);
        finalProjId = newProjId;
      } else {
        finalProjId = selectedProjectId || undefined;
      }
    }

    if (editingId) {
      updatedExpensesList = expenses.map(exp => exp.id === editingId ? {
        ...exp,
        title: finalTitle,
        amount: parseFloat(amountInput),
        date: formattedDate,
        time: finalTime,
        categoryId: selectedCategory,
        hasReceipt: !!scannedImage,
        scopeType,
        projectId: finalProjId
      } : exp);
      
      if (scannedImage) {
        await saveReceipt(editingId, scannedImage);
      } else {
        await deleteReceipt(editingId);
      }
      setEditingId(null);
    } else {
      const newId = getNow().toString();
      const newExpense: Expense = {
        id: newId,
        title: finalTitle,
        amount: parseFloat(amountInput),
        date: formattedDate,
        time: finalTime,
        categoryId: selectedCategory,
        hasReceipt: !!scannedImage,
        scopeType,
        projectId: finalProjId
      };
      
      updatedExpensesList = [newExpense, ...expenses];
      if (scannedImage) {
        await saveReceipt(newId, scannedImage);
      }
    }

    setExpenses(updatedExpensesList);
    
    // Play haptic feedback and trigger confetti
    const newTotal = updatedExpensesList.reduce((sum, exp) => sum + exp.amount, 0);
    if (newTotal >= budgetLimit) {
      playHaptic('warning');
    } else {
      playHaptic('success');
      triggerConfetti();
    }

    setAmountInput('');
    setTitleInput('');
    setDateInput(getLocalDateString());
    setTimeInput(() => {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    });
    setScopeType('one-off');
    setSelectedProjectId('');
    setIsCreatingNewProject(false);
    setNewProjectName('');
    setScannedImage(null);
  };

  const handleEditClick = (exp: Expense) => {
    playHaptic('click');
    setEditingId(exp.id);
    setAmountInput(exp.amount.toString());
    setTitleInput(exp.title);
    setSelectedCategory(exp.categoryId);
    const d = parseExpenseDate(exp.date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setDateInput(`${yyyy}-${mm}-${dd}`);
    
    if (exp.time) {
      setTimeInput(exp.time);
    } else {
      const now = new Date();
      setTimeInput(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    }

    setScopeType(exp.scopeType || 'one-off');
    setSelectedProjectId(exp.projectId || '');
    setIsCreatingNewProject(false);
    setNewProjectName('');

    if (exp.hasReceipt) {
      getReceipt(exp.id).then(img => {
        if (img) setScannedImage(img);
      });
    } else {
      setScannedImage(null);
    }
    setIsBottomSheetOpen(true);
  };

  const handleDeleteExpense = async (id: string, e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    setExpenses(expenses.filter(exp => exp.id !== id));
    await deleteReceipt(id);
    playHaptic('delete');
    if (editingId === id) {
      setEditingId(null);
      setAmountInput('');
      setTitleInput('');
      setScannedImage(null);
    }
  };

  const handleDeleteProject = (projId: string) => {
    if (!confirm('Are you sure you want to delete this project? Expenses in this project will not be deleted, but will be changed to one-off.')) {
      return;
    }
    setProjects(prev => prev.filter(p => p.id !== projId));
    setExpenses(prev => prev.map(exp => exp.projectId === projId ? {
      ...exp,
      scopeType: 'one-off',
      projectId: undefined
    } : exp));
    if (selectedProjectDetailId === projId) {
      setSelectedProjectDetailId(null);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedExpenseIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete these ${selectedExpenseIds.length} items?`)) return;
    
    playHaptic('delete');
    const idsToDelete = [...selectedExpenseIds];
    setExpenses(prev => prev.filter(exp => !idsToDelete.includes(exp.id)));
    
    for (const id of idsToDelete) {
      await deleteReceipt(id);
    }
    
    setSelectedExpenseIds([]);
    setIsBulkMode(false);
  };

  const handleBatchChangeCategory = (catId: string) => {
    if (selectedExpenseIds.length === 0) return;
    playHaptic('success');
    
    setExpenses(prev => prev.map(exp => 
      selectedExpenseIds.includes(exp.id) 
        ? { ...exp, categoryId: catId } 
        : exp
    ));
    
    setSelectedExpenseIds([]);
    setIsBulkMode(false);
    setIsBatchCategoryOpen(false);
  };

  const renderExpenseItem = (exp: Expense, index: number) => {
    const category = categories.find(c => c.id === exp.categoryId) || categories.find(c => c.id === 'other') || categories[categories.length - 1];
    const isEditingThis = editingId === exp.id;
    const isSwiped = swipeActiveId === exp.id;
    const translateStyle = !isBulkMode && isSwiped ? `translateX(${swipeDistance}px)` : 'translateX(0)';
    const transitionStyle = !isBulkMode && isSwiped && isSwipingState ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
    
    const isSelected = selectedExpenseIds.includes(exp.id);
    const handleToggleSelect = () => {
      playHaptic('click');
      if (isSelected) {
        setSelectedExpenseIds(prev => prev.filter(id => id !== exp.id));
      } else {
        setSelectedExpenseIds(prev => [...prev, exp.id]);
      }
    };

    const startLongPress = () => {
      if (isBulkMode) return;
      longPressTimeout.current = window.setTimeout(() => {
        playHaptic('success');
        setIsBulkMode(true);
        setSelectedExpenseIds([exp.id]);
      }, 600);
    };

    const cancelLongPress = () => {
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
        longPressTimeout.current = null;
      }
    };

    return (
      <div 
        key={exp.id}
        className="relative overflow-hidden rounded-2xl w-full select-none"
      >
        {/* Swipe Action Background Layer (Disabled in Bulk Mode) */}
        {!isBulkMode && (
          <div className="absolute inset-0 flex items-center justify-between z-0 rounded-2xl">
            {/* Left Swipe Action (Edit) */}
            <div 
              onClick={() => {
                handleEditClick(exp);
                setSwipeActiveId(null);
                setSwipeDistance(0);
              }}
              className="h-full bg-indigo-600 text-white px-5 flex items-center justify-start rounded-l-2xl cursor-pointer w-20 transition-opacity"
              style={{ opacity: swipeDistance > 0 ? 1 : 0 }}
            >
              <span className="material-symbols-outlined text-white text-[20px]">edit</span>
            </div>
            
            {/* Right Swipe Action (Delete) */}
            <div 
              onClick={(e) => {
                handleDeleteExpense(exp.id, e);
                setSwipeActiveId(null);
                setSwipeDistance(0);
              }}
              className="h-full bg-red-600 text-white px-5 flex items-center justify-end rounded-r-2xl cursor-pointer w-20 ml-auto transition-opacity"
              style={{ opacity: swipeDistance < 0 ? 1 : 0 }}
            >
              <span className="material-symbols-outlined text-white text-[20px]">delete</span>
            </div>
          </div>
        )}

        {/* Foreground Card */}
        <div 
          onClick={() => {
            if (isBulkMode) {
              handleToggleSelect();
            } else if (isSwiped && Math.abs(swipeDistance) > 10) {
              setSwipeActiveId(null);
              setSwipeDistance(0);
            } else {
              handleEditClick(exp);
            }
          }}
          onTouchStart={(e) => {
            startLongPress();
            if (!isBulkMode) handleTouchStart(e, exp.id);
          }}
          onTouchMove={(e) => {
            cancelLongPress();
            if (!isBulkMode) handleTouchMove(e, exp.id);
          }}
          onTouchEnd={() => {
            cancelLongPress();
            if (!isBulkMode) handleTouchEnd();
          }}
          onMouseDown={startLongPress}
          onMouseUp={cancelLongPress}
          onMouseLeave={cancelLongPress}
          className={`relative z-10 flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer animate-in fade-in slide-in-from-bottom-2
                     ${isEditingThis 
                       ? (isDarkMode ? 'bg-slate-800 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-blue-50 border-blue-200 shadow-md')
                       : (isBulkMode && isSelected
                           ? (isDarkMode ? 'bg-indigo-950/40 border-indigo-500/50' : 'bg-indigo-50/50 border-indigo-300 shadow-sm')
                           : (isDarkMode 
                               ? 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800' 
                               : 'bg-white border-slate-200/60 shadow-sm hover:shadow-md'))}`}
          style={{ 
            transform: translateStyle, 
            transition: transitionStyle,
            animationDelay: `${index * 30}ms`, 
            animationFillMode: 'both' 
          }}
        >
          <div className="flex items-center gap-3.5">
            {/* V7 Checkbox Circle (Bulk Mode) */}
            {isBulkMode && (
              <span className={`material-symbols-outlined text-[20px] shrink-0 mr-0.5 transition-colors
                               ${isSelected 
                                 ? 'text-indigo-500 font-bold' 
                                 : (isDarkMode ? 'text-slate-600' : 'text-slate-300')}`}>
                {isSelected ? 'check_circle' : 'circle'}
              </span>
            )}
            
            <div 
              className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-inner border shrink-0 transition-colors"
              style={{ 
                backgroundColor: isDarkMode ? `${category.color}15` : `${category.color}0D`,
                borderColor: isDarkMode ? `${category.color}30` : `${category.color}20`
              }}
            >
              <span className="material-symbols-outlined text-[20px] font-semibold" style={{ color: category.color }}>
                {category.icon}
              </span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className={`text-[15px] font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{exp.title}</span>
                {exp.hasReceipt && (
                  <span 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isBulkMode) {
                        handleToggleSelect();
                      } else {
                        handleViewReceipt(exp.id, exp.title);
                      }
                    }}
                    title="View receipt"
                    className={`material-symbols-outlined text-[15px] px-1 rounded flex items-center justify-center cursor-pointer transition-colors
                               ${isDarkMode ? 'text-indigo-400 hover:text-indigo-300 hover:bg-slate-700' : 'text-indigo-600 hover:text-indigo-500 hover:bg-indigo-50'}`}
                  >
                    receipt_long
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-medium transition-colors">
                <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>
                  {formatExpenseDate(exp.date)}
                </span>
                {exp.time && (
                  <>
                    <span className={isDarkMode ? 'text-slate-700' : 'text-slate-300'}>•</span>
                    <span className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}>
                      {formatTime12h(exp.time)}
                    </span>
                  </>
                )}
                {/* Only display category label if the expense title is different, to avoid repetition */}
                {exp.title !== category.label && (
                  <>
                    <span className={isDarkMode ? 'text-slate-700' : 'text-slate-300'}>•</span>
                    <span className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}>
                      {category.label}
                    </span>
                  </>
                )}
                {exp.scopeType && exp.scopeType !== 'one-off' && (
                  <>
                    <span className={isDarkMode ? 'text-slate-700' : 'text-slate-300'}>•</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors
                                     ${exp.scopeType === 'weekly' 
                                       ? (isDarkMode ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-amber-50 text-amber-700 border border-amber-200') 
                                       : exp.scopeType === 'monthly' 
                                         ? (isDarkMode ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-purple-50 text-purple-700 border border-purple-200')
                                         : (isDarkMode ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-cyan-50 text-cyan-700 border border-cyan-200')}`}>
                      {exp.scopeType === 'weekly' && 'Weekly'}
                      {exp.scopeType === 'monthly' && 'Monthly'}
                      {exp.scopeType === 'project' && (() => {
                        const p = projects.find(proj => proj.id === exp.projectId);
                        return p ? p.name : 'Project';
                      })()}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-base font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              {renderFormattedAmount(exp.amount, currency, true)}
            </span>

            {!isBulkMode && (
              <button 
                onClick={(e) => handleDeleteExpense(exp.id, e)}
                className={`opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity p-2 rounded-full border-0 bg-transparent cursor-pointer flex items-center justify-center -mr-1 outline-none
                           ${isDarkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50'}`}
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleResetExpenses = () => {
    if (confirm('Are you sure you want to clear all expenses and reset the total?')) {
      setExpenses([]);
      setEditingId(null);
    }
  };

  const handleExportCSV = () => {
    if (expenses.length === 0) return;
    const headers = ['Date', 'Title', 'Category', 'Amount'];
    const rows = expenses.map(exp => [
      exp.date,
      `"${exp.title.replace(/"/g, '""')}"`,
      exp.categoryId,
      exp.amount.toFixed(2)
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + 
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `expenses_${getLocalDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (importCsvInputRef.current) importCsvInputRef.current.value = '';

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      if (lines.length <= 1) {
        throw new Error("CSV file is empty or only contains headers.");
      }

      const importedExpenses: Expense[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields: string[] = [];
        let currentField = '';
        let insideQuotes = false;
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            insideQuotes = !insideQuotes;
          } else if (char === ',' && !insideQuotes) {
            fields.push(currentField.trim());
            currentField = '';
          } else {
            currentField += char;
          }
        }
        fields.push(currentField.trim());

        if (fields.length < 4) continue;

        const [dateVal, titleVal, catIdVal, amountVal] = fields;
        const parsedAmount = parseFloat(amountVal);
        if (isNaN(parsedAmount) || parsedAmount < 0) continue;

        const matchedCat = categories.find(c => c.id === catIdVal.toLowerCase() || c.label.toLowerCase() === catIdVal.toLowerCase());
        const categoryId = matchedCat ? matchedCat.id : 'other';

        importedExpenses.push({
          id: 'exp_' + Math.random().toString(36).substring(2, 11),
          title: titleVal || 'Imported Expense',
          amount: parsedAmount,
          date: dateVal || getLocalDateString(),
          categoryId,
          scopeType: 'one-off'
        });
      }

      if (importedExpenses.length === 0) {
        throw new Error("No valid transactions found in the CSV file.");
      }

      const confirmImport = confirm(`Successfully parsed ${importedExpenses.length} transactions. Do you want to merge them into your current expenses?`);
      if (confirmImport) {
        setExpenses(prev => [...prev, ...importedExpenses]);
        playHaptic('success');
        triggerConfetti();
        alert(`${importedExpenses.length} transactions imported successfully!`);
      }
    } catch (err: unknown) {
      alert("CSV Import failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleBackupJSON = async () => {
    playHaptic('click');
    try {
      const receipts = await getAllReceipts();
      const backupData = {
        version: 1,
        expenses,
        projects,
        budgetLimit,
        categoryBudgets,
        quickTemplates,
        receipts
      };
      
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `timmy_backup_${getLocalDateString()}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      playHaptic('success');
    } catch (err: unknown) {
      alert("Backup failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRestoreJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';

    const confirmRestore = confirm("Warning: Restoring data will overwrite all current expenses, projects, and receipt images. Are you sure you want to continue?");
    if (!confirmRestore) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed.expenses || !Array.isArray(parsed.expenses)) {
        throw new Error("Invalid backup file: 'expenses' array is missing.");
      }

      // 1. Sanitize expenses to prevent NaN and missing properties
      const sanitizedExpenses = (parsed.expenses as Array<{
        id?: string;
        title?: string;
        amount?: number | string;
        date?: string;
        time?: string;
        categoryId?: string;
        hasReceipt?: boolean;
        scopeType?: 'one-off' | 'weekly' | 'monthly' | 'project';
        projectId?: string;
      }>).map((exp) => ({
        id: String(exp.id || Math.random().toString(36).substring(2, 9)),
        title: String(exp.title || 'Expense'),
        amount: Math.max(0, parseFloat(String(exp.amount)) || 0),
        date: String(exp.date || getLocalDateString()),
        time: exp.time ? String(exp.time) : undefined,
        categoryId: String(exp.categoryId || 'other'),
        hasReceipt: !!exp.hasReceipt,
        scopeType: exp.scopeType || 'one-off',
        projectId: exp.projectId ? String(exp.projectId) : undefined,
      }));

      // 2. Sanitize projects
      let sanitizedProjects: Project[] = [];
      if (parsed.projects && Array.isArray(parsed.projects)) {
        sanitizedProjects = (parsed.projects as Array<{
          id?: string;
          name?: string;
          budget?: number | string;
        }>).map((p) => ({
          id: String(p.id || Math.random().toString(36).substring(2, 9)),
          name: String(p.name || 'Unnamed Project'),
          budget: p.budget !== undefined ? Math.max(0, parseFloat(String(p.budget)) || 0) : undefined,
        }));
      }

      // 3. Sanitize budget limit
      let sanitizedBudgetLimit = 3000;
      if (parsed.budgetLimit !== undefined) {
        sanitizedBudgetLimit = Math.max(0, parseFloat(parsed.budgetLimit) || 3000);
      }

      // 4. Sanitize category budgets
      const sanitizedCategoryBudgets: Record<string, number> = {};
      if (parsed.categoryBudgets && typeof parsed.categoryBudgets === 'object') {
        Object.keys(parsed.categoryBudgets).forEach(key => {
          const val = parseFloat(parsed.categoryBudgets[key]);
          if (!isNaN(val)) {
            sanitizedCategoryBudgets[key] = Math.max(0, val);
          }
        });
      }
 
      // 4b. Sanitize quickTemplates
      let sanitizedTemplates = quickTemplates;
      if (parsed.quickTemplates && Array.isArray(parsed.quickTemplates)) {
        sanitizedTemplates = (parsed.quickTemplates as Array<{
          id?: string;
          emoji?: string;
          title?: string;
          amount?: number | string;
          categoryId?: string;
        }>).map((t, index) => ({
          id: String(t.id || `t-${index}-${Math.random().toString(36).substring(2, 9)}`),
          emoji: String(t.emoji || 'âœ¨'),
          title: String(t.title || 'Template'),
          amount: Math.max(0, parseFloat(String(t.amount)) || 0),
          categoryId: String(t.categoryId || 'other'),
        }));
      }

      // 5. Sanitize receipt images
      const sanitizedReceipts: Record<string, string> = {};
      if (parsed.receipts && typeof parsed.receipts === 'object') {
        Object.keys(parsed.receipts).forEach(key => {
          if (typeof parsed.receipts[key] === 'string') {
            sanitizedReceipts[key] = parsed.receipts[key];
          }
        });
      }

      // Restore receipts in IndexedDB first
      await restoreReceipts(sanitizedReceipts);

      // Save states (triggers localstorage write effects)
      setExpenses(sanitizedExpenses);
      setProjects(sanitizedProjects);
      setBudgetLimit(sanitizedBudgetLimit);
      setCategoryBudgets(sanitizedCategoryBudgets);
      setQuickTemplates(sanitizedTemplates);

      playHaptic('success');
      triggerConfetti();
      alert("Database restored successfully!");
    } catch (err: unknown) {
      alert("Restore failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = true;
    setIsSwipingState(true);
    
    // Close other swiped cards
    if (swipeActiveId && swipeActiveId !== id) {
      setSwipeActiveId(null);
      setSwipeDistance(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent, id: string) => {
    if (!isSwiping.current) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // Reject vertical scrolling
    if (Math.abs(diffY) > Math.abs(diffX) && swipeActiveId !== id) {
      isSwiping.current = false;
      setIsSwipingState(false);
      return;
    }

    if (Math.abs(diffX) > 8) {
      setSwipeActiveId(id);
      let dist = diffX;
      if (dist < -120) dist = -120;
      if (dist > 120) dist = 120;
      setSwipeDistance(dist);
    }
  };

  const handleTouchEnd = () => {
    isSwiping.current = false;
    setIsSwipingState(false);
    if (swipeDistance < -60) {
      setSwipeDistance(-80);
    } else if (swipeDistance > 60) {
      setSwipeDistance(80);
    } else {
      setSwipeActiveId(null);
      setSwipeDistance(0);
    }
  };

  const handleViewReceipt = async (id: string, title: string) => {
    const img = await getReceipt(id);
    if (img) {
      setLightboxReceipt({ url: img, title, id });
    } else {
      alert("Receipt image not found.");
    }
  };

  return (
    <div className={`min-h-[100dvh] w-full flex items-center justify-center p-0 md:p-6 antialiased transition-colors duration-700 
                    ${isDarkMode ? 'bg-[#070a14] text-slate-100' : 'bg-[#f0eeff] text-slate-900'}`}
         style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      
      {/* Dynamic Background Blobs */}
      <div className={`fixed inset-0 z-0 overflow-hidden pointer-events-none transition-opacity duration-700 flex items-center justify-center ${isDarkMode ? 'opacity-30' : 'opacity-60'}`}>
        <div className={`absolute top-1/4 left-1/4 w-72 h-72 rounded-full mix-blend-multiply filter blur-[80px] animate-blob 
                        ${isDarkMode ? 'bg-indigo-600 mix-blend-screen' : 'bg-purple-300'}`}></div>
        <div className={`absolute top-1/3 right-1/4 w-72 h-72 rounded-full mix-blend-multiply filter blur-[80px] animate-blob animation-delay-2000 
                        ${isDarkMode ? 'bg-cyan-600 mix-blend-screen' : 'bg-cyan-300'}`}></div>
        <div className={`absolute -bottom-8 left-1/3 w-80 h-80 rounded-full mix-blend-multiply filter blur-[80px] animate-blob animation-delay-4000 
                        ${isDarkMode ? 'bg-blue-700 mix-blend-screen' : 'bg-pink-300'}`}></div>
      </div>

      {/* Main Container */}
      <div className={`relative z-10 flex flex-col overflow-hidden backdrop-blur-[40px] border-x-0 border-y-0 md:border w-full h-[100dvh] md:h-[85dvh] md:max-h-[800px] md:w-[420px] md:rounded-[2.5rem] md:shadow-[0_20px_60px_rgba(0,0,0,0.15)] transition-all duration-[350ms] ease-out
                      ${isDarkMode ? 'bg-black/60 border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.8)]' : 'bg-white/70 border-white/60'}`}>
        
        {/* Header */}
        <div className={`flex items-center justify-between px-6 pt-10 pb-4 shrink-0`}
             style={{ background: isDarkMode ? 'linear-gradient(180deg, rgba(7,10,20,0.95) 0%, transparent 100%)' : 'linear-gradient(180deg, rgba(240,238,255,0.95) 0%, transparent 100%)' }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <img 
              src="/icon.png" 
              alt="Timmy Wallet Logo" 
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
                objectFit: 'contain'
              }}
            />
            <div>
              <h1 style={{
                margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1,
                background: isDarkMode ? 'linear-gradient(135deg, #e0e7ff 0%, #a5b4fc 100%)' : 'linear-gradient(135deg, #4f46e5 0%, #8b5cf6 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>Timmy Wallet</h1>
              <p style={{ margin: 0, fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: isDarkMode ? 'rgba(165,180,252,0.55)' : 'rgba(99,102,241,0.5)' }}>Smart Finance</p>
            </div>
          </div>
          {/* Header actions */}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{
                width: '34px', height: '34px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.8)',
                color: isDarkMode ? '#fbbf24' : '#6366f1',
                boxShadow: isDarkMode ? 'none' : '0 2px 8px rgba(99,102,241,0.15)',
                transition: 'all 0.2s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>
                {isDarkMode ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <button
              onClick={() => { playHaptic('click'); setIsBudgetSheetOpen(true); }}
              style={{
                width: '34px', height: '34px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.8)',
                color: isDarkMode ? '#a5b4fc' : '#6366f1',
                boxShadow: isDarkMode ? 'none' : '0 2px 8px rgba(99,102,241,0.15)',
                transition: 'all 0.2s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>tune</span>
            </button>
          </div>
        </div>

        <input 
          type="file"
          accept=".json"
          ref={restoreFileInputRef}
          onChange={handleRestoreJSON}
          className="hidden"
        />
        <input
          type="file"
          accept=".csv"
          ref={importCsvInputRef}
          onChange={handleImportCSV}
          className="hidden"
        />

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col w-full relative">
          
          {/* Segmented Tab Selector */}
          <div style={{
            padding: '0.6rem 1rem 0.5rem',
            borderBottom: isDarkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(99,102,241,0.1)',
            flexShrink: 0,
            background: isDarkMode ? 'rgba(7,10,20,0.6)' : 'rgba(240,238,255,0.6)',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{
              display: 'flex', padding: '4px', gap: '2px',
              borderRadius: '14px',
              background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.55)',
              border: isDarkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(99,102,241,0.15)',
              boxShadow: isDarkMode ? 'none' : '0 2px 8px rgba(99,102,241,0.08)',
            }}>
              {(['transactions', 'recurrings', 'projects'] as const).map(tab => {
                const isSelected = currentTab === tab;
                const labels = { transactions: 'Transactions', recurrings: 'Commitments', projects: 'Projects' };
                const icons  = { transactions: 'receipt_long', recurrings: 'autorenew', projects: 'folder_open' };
                return (
                  <button
                    key={tab}
                    onClick={() => { playHaptic('click'); setCurrentTab(tab); setSelectedProjectDetailId(null); }}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                      padding: '7px 4px',
                      borderRadius: '10px', border: 'none', outline: 'none', cursor: 'pointer',
                      fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.01em',
                      fontFamily: 'inherit',
                      transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                      background: isSelected
                        ? (isDarkMode ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'linear-gradient(135deg, #4f46e5, #7c3aed)')
                        : 'transparent',
                      color: isSelected ? '#fff' : (isDarkMode ? 'rgba(148,163,184,0.7)' : 'rgba(99,102,241,0.5)'),
                      boxShadow: isSelected ? '0 4px 12px rgba(79,70,229,0.35)' : 'none',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{
                      fontSize: '14px',
                      fontVariationSettings: isSelected ? "'FILL' 1" : "'FILL' 0",
                    }}>{icons[tab]}</span>
                    {labels[tab]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab 1: Transactions List */}
          {currentTab === 'transactions' && (
            <Dashboard
              expenses={expenses}
              isDarkMode={isDarkMode}
              budgetLimit={budgetLimit}
              categoryBudgets={categoryBudgets}
              currency={currency}
              categories={categories}
            >
              <div className="space-y-2">
                {expenses.length === 0 ? null : expenses.map((exp, i) => renderExpenseItem(exp, i))}
              </div>
            </Dashboard>
          )}

          {/* Tab 2: Commitments / Recurrings View */}
          {currentTab === 'recurrings' && (() => {
            const weeklyItems = expenses.filter(exp => exp.scopeType === 'weekly');
            const monthlyItems = expenses.filter(exp => exp.scopeType === 'monthly');
            const weeklyTotal = weeklyItems.reduce((acc, curr) => acc + curr.amount, 0);
            const monthlyTotal = monthlyItems.reduce((acc, curr) => acc + curr.amount, 0);

            const calendarDays = Array.from({ length: 14 }).map((_, i) => {
              const d = new Date();
              d.setDate(new Date().getDate() + i);
              d.setHours(0, 0, 0, 0);
              return d;
            });

            const getDuesForDay = (date: Date) => {
              const dayOfWeek = date.getDay();
              const dayOfMonth = date.getDate();
              
              const dueWeekly = weeklyItems.filter(exp => {
                const expDate = parseExpenseDate(exp.date);
                return !isNaN(expDate.getTime()) && expDate.getDay() === dayOfWeek;
              });
              
              const dueMonthly = monthlyItems.filter(exp => {
                const expDate = parseExpenseDate(exp.date);
                return !isNaN(expDate.getTime()) && expDate.getDate() === dayOfMonth;
              });
              
              return [...dueWeekly, ...dueMonthly];
            };
            
            return (
              <div className={`flex-1 shrink-0 flex flex-col p-6 space-y-6 pb-24 ${isDarkMode ? 'bg-black/20' : 'bg-slate-50/50'}`}>
                {/* Commitment Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 rounded-3xl border flex flex-col justify-between h-32 relative overflow-hidden transition-all hover:shadow-md ${isDarkMode ? 'bg-slate-900/50 border-amber-500/10' : 'bg-amber-50/20 border-amber-200'}`}>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl translate-x-4 -translate-y-4"></div>
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined text-[20px] ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>date_range</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Weekly</span>
                    </div>
                    <div className="mt-2">
                      <span className={`text-2xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{renderFormattedAmount(weeklyTotal, currency, false)}</span>
                      <p className={`text-[10px] m-0 mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{weeklyItems.length} recurring items</p>
                    </div>
                  </div>

                  <div className={`p-4 rounded-3xl border flex flex-col justify-between h-32 relative overflow-hidden transition-all hover:shadow-md ${isDarkMode ? 'bg-slate-900/50 border-purple-500/10' : 'bg-purple-50/20 border-purple-200'}`}>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl translate-x-4 -translate-y-4"></div>
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined text-[20px] ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>calendar_month</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Monthly</span>
                    </div>
                    <div className="mt-2">
                      <span className={`text-2xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{renderFormattedAmount(monthlyTotal, currency, false)}</span>
                      <p className={`text-[10px] m-0 mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{monthlyItems.length} recurring items</p>
                    </div>
                  </div>
                </div>

                {/* V7: 14-Day Rolling Subscriptions Calendar Strip */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between pl-1">
                    <span className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Bill Calendar (Next 14 Days)</span>
                    {selectedCalendarDateIndex !== null && (
                      <button
                        onClick={() => { playHaptic('click'); setSelectedCalendarDateIndex(null); }}
                        className={`text-[10px] font-bold border-0 bg-transparent cursor-pointer hover:underline text-indigo-500`}
                      >
                        Show All
                      </button>
                    )}
                  </div>
                  
                  <div className="flex gap-2 overflow-x-auto pb-1.5 custom-scrollbar mask-linear-x shrink-0">
                    {calendarDays.map((day, idx) => {
                      const dayNameShort = day.toLocaleDateString('en-US', { weekday: 'short' });
                      const dayNum = day.getDate();
                      const dues = getDuesForDay(day);
                      const hasDues = dues.length > 0;
                      const isSelected = selectedCalendarDateIndex === idx;
                      
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            playHaptic('click');
                            setSelectedCalendarDateIndex(isSelected ? null : idx);
                          }}
                          className={`flex flex-col items-center justify-between p-2.5 rounded-2xl w-11 h-14 border shrink-0 transition-all cursor-pointer select-none
                                     ${isSelected 
                                       ? 'bg-indigo-600 border-indigo-600 text-white scale-105 shadow-md shadow-indigo-600/20' 
                                       : hasDues
                                         ? (isDarkMode ? 'bg-slate-900/80 border-indigo-500/40 text-slate-200' : 'bg-indigo-50/50 border-indigo-200 text-indigo-950')
                                         : (isDarkMode ? 'bg-slate-900/30 border-slate-800/80 text-slate-400 hover:bg-slate-800/50' : 'bg-white border-slate-200/50 text-slate-600 hover:bg-slate-50')}`}
                        >
                          <span className={`text-[9px] font-bold uppercase ${isSelected ? 'text-indigo-200' : 'opacity-60'}`}>{dayNameShort}</span>
                          <span className="text-sm font-extrabold">{dayNum}</span>
                          
                          {/* Dot Indicators */}
                          <div className="flex gap-0.5 justify-center mt-0.5 h-1">
                            {dues.slice(0, 3).map((due, dIdx) => {
                              const cat = categories.find(c => c.id === due.categoryId) || categories.find(c => c.id === 'other') || categories[categories.length - 1];
                              return (
                                <div 
                                  key={dIdx} 
                                  className="w-1.5 h-1.5 rounded-full" 
                                  style={{ backgroundColor: isSelected ? '#ffffff' : cat.color }} 
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Dues List or Weekly/Monthly lists */}
                {selectedCalendarDateIndex !== null ? (() => {
                  const targetDay = calendarDays[selectedCalendarDateIndex];
                  const dues = getDuesForDay(targetDay);
                  return (
                    <div className="flex flex-col gap-2">
                      <h3 className={`text-xs font-bold uppercase tracking-wider pl-1 mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Bills Due on {targetDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                      </h3>
                      {dues.length === 0 ? (
                        <div className={`text-center py-6 rounded-2xl border border-dashed text-xs ${isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                          No bills due on this day.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dues.map((exp, i) => renderExpenseItem(exp, i))}
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <>
                    {/* Weekly Commitments List */}
                    <div className="flex flex-col gap-2">
                      <h3 className={`text-xs font-bold uppercase tracking-wider pl-1 mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Weekly Commitments</h3>
                      {weeklyItems.length === 0 ? (
                        <div className={`text-center py-6 rounded-2xl border border-dashed text-xs ${isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                          No weekly commitments found.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {weeklyItems.map((exp, i) => renderExpenseItem(exp, i))}
                        </div>
                      )}
                    </div>

                    {/* Monthly Commitments List */}
                    <div className="flex flex-col gap-2 pt-2">
                      <h3 className={`text-xs font-bold uppercase tracking-wider pl-1 mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Monthly Commitments</h3>
                      {monthlyItems.length === 0 ? (
                        <div className={`text-center py-6 rounded-2xl border border-dashed text-xs ${isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                          No monthly commitments found.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {monthlyItems.map((exp, i) => renderExpenseItem(exp, i))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Tab 3: Projects Tracker View */}
          {currentTab === 'projects' && (() => {
            if (selectedProjectDetailId) {
              const project = projects.find(p => p.id === selectedProjectDetailId);
              if (!project) {
                setSelectedProjectDetailId(null);
                return null;
              }
              
              const projectExpenses = expenses.filter(exp => exp.projectId === selectedProjectDetailId);
              const projectTotal = projectExpenses.reduce((acc, curr) => acc + curr.amount, 0);
              
              return (
                <div className={`flex-1 shrink-0 flex flex-col p-6 pb-24 ${isDarkMode ? 'bg-black/20' : 'bg-slate-50/50'}`}>
                  {/* Detail Header */}
                  <div className="flex items-center justify-between mb-6">
                    <button
                      onClick={() => setSelectedProjectDetailId(null)}
                      className={`flex items-center gap-1 text-xs font-bold border-0 bg-transparent cursor-pointer transition-colors outline-none
                                 ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                      Back to Projects
                    </button>
                    <button
                      onClick={() => handleDeleteProject(project.id)}
                      className={`flex items-center gap-1 text-xs font-bold border-0 bg-transparent cursor-pointer transition-colors outline-none
                                 ${isDarkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-500'}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      Delete Project
                    </button>
                  </div>

                  {/* Summary Card */}
                  <div className={`p-5 rounded-3xl border flex flex-col gap-4 mb-6 relative overflow-hidden transition-all ${isDarkMode ? 'bg-slate-900/50 border-cyan-500/10' : 'bg-cyan-50/20 border-cyan-200'}`}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-xl translate-x-4 -translate-y-4"></div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-[20px] text-cyan-500 animate-pulse">folder</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {typeof project.budget === 'number' && project.budget > 0 ? `Project Cost / Budget ${getCurrencySymbol(currency)}${project.budget}` : 'Project Cost'}
                        </span>
                      </div>
                      <h2 className={`text-xl font-bold tracking-tight m-0 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{project.name}</h2>
                    </div>

                    {typeof project.budget === 'number' && project.budget > 0 && (() => {
                      const projPercent = Math.min((projectTotal / project.budget) * 100, 100);
                      const isProjOver = projectTotal > project.budget;
                      return (
                        <div className="w-full flex flex-col gap-1.5 pt-1">
                          <div className="flex justify-between items-center text-[10px] font-bold opacity-60">
                            <span>Cost Progress</span>
                            <span className={isProjOver ? 'text-red-500' : ''}>
                              {formatCurrency(projectTotal, currency)} / {formatCurrency(project.budget, currency)} ({projPercent.toFixed(0)}%)
                            </span>
                          </div>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                            <div 
                                className={`h-full rounded-full transition-all duration-500 ${isProjOver ? 'bg-red-500' : 'bg-cyan-500'}`}
                                style={{ width: `${projPercent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {(!project.budget || project.budget <= 0) && (
                      <div className="mt-2 pt-4 border-t border-slate-500/10 flex items-end justify-between">
                        <span className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Accumulated Expense</span>
                        <span className={`text-2xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(projectTotal, currency)}</span>
                      </div>
                    )}
                  </div>

                  {/* Expenses List */}
                  <div className="flex flex-col gap-2">
                    <h3 className={`text-xs font-bold uppercase tracking-wider pl-1 mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Expenses in Project</h3>
                    {projectExpenses.length === 0 ? (
                      <div className={`text-center py-10 rounded-2xl border border-dashed text-xs ${isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                        No expenses logged for this project yet. Use the '+' button below to add!
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {projectExpenses.map((exp, i) => renderExpenseItem(exp, i))}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            
            // Otherwise, render list of projects
            return (
              <div className={`flex-1 shrink-0 flex flex-col p-6 space-y-6 pb-24 ${isDarkMode ? 'bg-black/20' : 'bg-slate-50/50'}`}>
                
                {/* Project Creator Card */}
                <div className={`p-4 rounded-3xl border flex flex-col gap-3 transition-all ${isDarkMode ? 'bg-slate-900/30 border-slate-800' : 'bg-white border-slate-200/60 shadow-sm'}`}>
                  <h3 className={`text-xs font-bold uppercase tracking-wider pl-1 m-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Create New Project</h3>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <div className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus-within:border-blue-500' : 'bg-slate-50 border-slate-200 focus-within:border-blue-400'}`}>
                        <span className={`material-symbols-outlined text-[18px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>create_new_folder</span>
                        <input 
                          type="text" 
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          placeholder="Project Name (e.g. Prototype)"
                          className={`w-full bg-transparent border-none outline-none text-sm p-0 ${isDarkMode ? 'text-slate-200 placeholder-slate-600' : 'text-slate-700 placeholder-slate-400'}`}
                        />
                      </div>
                      <div className={`w-28 flex items-center gap-1.5 px-3 py-2.5 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus-within:border-blue-500' : 'bg-slate-50 border-slate-200 focus-within:border-blue-400'}`}>
                        <span className="text-xs font-bold opacity-60">RM</span>
                        <input 
                          type="number" 
                          value={newProjectBudget}
                          onChange={(e) => setNewProjectBudget(e.target.value)}
                          placeholder="Budget (opt)"
                          className={`w-full bg-transparent border-none outline-none text-sm p-0 ${isDarkMode ? 'text-slate-200 placeholder-slate-600' : 'text-slate-700 placeholder-slate-400'}`}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (newProjectName.trim()) {
                          const budgetVal = newProjectBudget.trim() ? parseFloat(newProjectBudget) : undefined;
                          const newProj = {
                            id: 'proj_' + getNow(),
                            name: newProjectName.trim(),
                            budget: budgetVal
                          };
                          setProjects(prev => [...prev, newProj]);
                          setNewProjectName('');
                          setNewProjectBudget('');
                          playHaptic('success');
                          triggerConfetti();
                        }
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs py-2.5 border-0 cursor-pointer font-bold transition-all active:scale-[0.98]"
                    >
                      Create Project
                    </button>
                  </div>
                </div>

                {/* Projects Grid */}
                <div className="flex flex-col gap-2">
                  <h3 className={`text-xs font-bold uppercase tracking-wider pl-1 mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Active Projects</h3>
                  
                  {projects.length === 0 ? (
                    <div className={`text-center py-10 rounded-2xl border border-dashed text-xs ${isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                      No custom projects found. Create one above to track project costs!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {projects.map(proj => {
                        const projExpenses = expenses.filter(exp => exp.projectId === proj.id);
                        const projTotal = projExpenses.reduce((acc, curr) => acc + curr.amount, 0);
                        
                        return (
                          <div
                            key={proj.id}
                            onClick={() => setSelectedProjectDetailId(proj.id)}
                            className={`p-4 rounded-2xl border flex flex-col gap-3 cursor-pointer group transition-all hover:-translate-y-0.5 active:scale-[0.99]
                                       ${isDarkMode 
                                         ? 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600' 
                                         : 'bg-white border-slate-200/60 shadow-sm hover:shadow-md hover:border-slate-300'}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${isDarkMode ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' : 'bg-cyan-50 border-cyan-200 text-cyan-600'}`}>
                                  <span className="material-symbols-outlined text-[20px]">folder</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className={`text-[15px] font-semibold transition-colors group-hover:text-blue-500 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{proj.name}</span>
                                  <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {projExpenses.length} expenses
                                    {typeof proj.budget === 'number' && proj.budget > 0 && (
                                      <>
                                        {' • Budget '}
                                        {renderFormattedAmount(proj.budget, currency, false)}
                                      </>
                                    )}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-base font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                  {renderFormattedAmount(projTotal, currency, false)}
                                </span>
                                <span className={`material-symbols-outlined text-slate-400 transition-transform group-hover:translate-x-0.5`}>chevron_right</span>
                              </div>
                            </div>

                            {typeof proj.budget === 'number' && proj.budget > 0 && (() => {
                              const projPercent = Math.min((projTotal / proj.budget) * 100, 100);
                              const isProjOver = projTotal > proj.budget;
                              return (
                                <div className="w-full flex flex-col gap-1.5 pt-1">
                                  <div className="flex justify-between items-center text-[10px] font-bold opacity-60">
                                    <span>Cost Progress</span>
                                    <span className={isProjOver ? 'text-red-500' : ''}>
                                      {projPercent.toFixed(0)}%
                                    </span>
                                  </div>
                                  <div className={`w-full h-1 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800/80' : 'bg-slate-100'}`}>
                                    <div 
                                      className={`h-full rounded-full transition-all duration-500 ${isProjOver ? 'bg-red-500' : 'bg-cyan-500'}`}
                                      style={{ width: `${projPercent}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            );
          })()}
        </div>
      
      {!isBulkMode ? (
        <button 
          onClick={handleOpenNewBottomSheet}
          className={`fixed bottom-8 right-8 md:bottom-12 md:right-[calc(50vw-200px)] w-14 h-14 rounded-full shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center z-40 border-0 cursor-pointer ${isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'}`}
        >
          <span className="material-symbols-outlined text-3xl">add</span>
        </button>
      ) : (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md z-45 p-4 rounded-2xl border backdrop-blur-xl shadow-lg flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300
                        ${isDarkMode ? 'bg-slate-950/95 border-indigo-500/30 text-white' : 'bg-white/95 border-indigo-200 text-slate-800'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {selectedExpenseIds.length} item{selectedExpenseIds.length !== 1 && 's'} selected
            </span>
            <button
              onClick={() => {
                playHaptic('click');
                setSelectedExpenseIds([]);
                setIsBulkMode(false);
                setIsBatchCategoryOpen(false);
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-0 bg-transparent cursor-pointer"
            >
              Cancel
            </button>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => {
                playHaptic('click');
                setIsBatchCategoryOpen(!isBatchCategoryOpen);
              }}
              disabled={selectedExpenseIds.length === 0}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border outline-none cursor-pointer flex items-center justify-center gap-1.5
                         ${selectedExpenseIds.length === 0 
                           ? 'opacity-40 cursor-not-allowed border-slate-200 text-slate-400 dark:border-slate-800' 
                           : (isDarkMode 
                               ? 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800' 
                               : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100')}`}
            >
              <span className="material-symbols-outlined text-[16px]">sell</span>
              Category
            </button>
            
            <button
              onClick={handleBatchDelete}
              disabled={selectedExpenseIds.length === 0}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border-0 outline-none cursor-pointer flex items-center justify-center gap-1.5 text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/10
                         ${selectedExpenseIds.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              Delete
            </button>
          </div>

          {/* Batch Category Selector Popover */}
          {isBatchCategoryOpen && selectedExpenseIds.length > 0 && (
            <div className={`mt-2 p-3 rounded-xl border grid grid-cols-3 gap-2 animate-in fade-in zoom-in-95 duration-200
                            ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleBatchChangeCategory(cat.id)}
                  className={`flex items-center gap-1.5 p-2 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer outline-none hover:scale-[1.02] active:scale-[0.98]
                             ${isDarkMode 
                               ? 'bg-slate-950/40 border-slate-800 hover:bg-slate-950/80 text-slate-300' 
                               : 'bg-white border-slate-200 hover:bg-white text-slate-600 shadow-sm'}`}
                >
                  <span className="text-[13px]">{cat.emoji}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Sheet Overlay */}
      <div 
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isBottomSheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => { playHaptic('click'); setIsBottomSheetOpen(false); setScannedImage(null); }}
      >
        <div 
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md rounded-t-[2rem] p-6 pt-2 max-h-[85dvh] overflow-y-auto custom-scrollbar pb-10 transition-transform duration-300 transform ${isBottomSheetOpen ? 'translate-y-0 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]' : 'translate-y-full'} ${isDarkMode ? 'bg-slate-900 border-t border-slate-800' : 'bg-slate-50 border-t border-slate-200'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag Handle */}
          <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-6" />

          {/* Extracted Input Form */}
          <div className="relative">
            {isScanning && (
              <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center rounded-[2rem] backdrop-blur-md ${isDarkMode ? 'bg-black/85 text-white' : 'bg-white/90 text-slate-800'}`}>
                {scannedImage && (
                  <div className="relative w-44 h-56 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden mb-4 shadow-2xl flex items-center justify-center">
                    <img src={scannedImage} alt="Scanning" className="w-full h-full object-cover opacity-60" />
                    {/* Laser scanner line */}
                    <div 
                      className="absolute left-0 right-0 h-1 bg-green-500 shadow-[0_0_12px_#22c55e,0_0_20px_#22c55e]"
                      style={{
                        animation: 'scanLaser 2.2s linear infinite',
                        top: 0
                      }}
                    />
                  </div>
                )}
                <span className="material-symbols-outlined text-3xl animate-bounce text-green-500 mb-1">document_scanner</span>
                <p className="font-bold text-sm tracking-wide text-green-500 animate-pulse uppercase">CamScanner Processing...</p>
                <p className="text-[10px] text-slate-400 mt-1">AI extracting details...</p>
              </div>
            )}
            <form onSubmit={(e) => { handleAddExpense(e); setIsBottomSheetOpen(false); }} className="flex flex-col gap-6">
              
              {/* Amount Input */}
              <div className="flex flex-col items-center justify-center relative">
                {scannedImage && (
                  <span className={`text-[10px] font-bold uppercase tracking-wider mb-2 px-2.5 py-1 rounded-full ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                    Please Review AI Extraction
                  </span>
                )}
                <div className="flex items-center justify-center gap-2 w-full">
                  <span className={`text-3xl font-bold ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>{getCurrencySymbol(currency)}</span>
                  <div 
                    className={`w-full max-w-[280px] text-center text-6xl font-bold bg-transparent border-none outline-none p-0 m-0 transition-all select-none
                               ${amountInput ? (isDarkMode ? 'text-slate-200' : 'text-slate-800') : (isDarkMode ? 'text-slate-700' : 'text-slate-300')}
                               ${scannedImage ? 'text-indigo-500 dark:text-indigo-400 drop-shadow-[0_0_12px_rgba(99,102,241,0.3)] animate-pulse' : ''}`}
                    style={{ 
                      minHeight: '72px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      lineHeight: '1',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {amountInput || '0.00'}
                  </div>
                </div>
                
                {/* AI Scanner Button */}
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  className={`mt-4 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 cursor-pointer outline-none shadow-sm
                            ${isDarkMode ? 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20' : 'border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                >
                  <span className="material-symbols-outlined text-[16px]">document_scanner</span>
                  Scan Receipt (AI)
                </button>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  ref={fileInputRef} 
                  onChange={handleImageScan} 
                  className="hidden" 
                />

                {/* V11: Custom Numpad */}
                <div className="grid grid-cols-3 gap-2 w-full max-w-[260px] mx-auto mt-5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleNumpadPress(key)}
                      className={`h-11 rounded-xl flex items-center justify-center font-bold text-lg select-none transition-all active:scale-90 border-0 cursor-pointer outline-none
                        ${isDarkMode 
                          ? 'bg-slate-800/40 text-slate-200 hover:bg-slate-700/60 border border-slate-700/30' 
                          : 'bg-white/90 text-slate-800 hover:bg-slate-50 border border-slate-200/50 shadow-sm'}`}
                    >
                      {key === 'backspace' ? (
                        <span className="material-symbols-outlined text-[18px]">backspace</span>
                      ) : (
                        key
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Receipt Preview in Bottom Sheet */}
              {scannedImage && (
                <div className={`p-3 rounded-2xl border flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 ${isDarkMode ? 'bg-slate-900/80 border-indigo-500/20' : 'bg-indigo-50/50 border-indigo-200/50'}`}>
                  <div className="flex items-center gap-3">
                    <div 
                      onClick={() => setLightboxReceipt({ url: scannedImage, title: titleInput || 'Receipt Attachment', id: editingId || 'temp' })}
                      className="w-12 h-12 rounded-lg overflow-hidden border border-indigo-500/20 bg-black cursor-pointer hover:opacity-85 transition-opacity"
                    >
                      <img src={scannedImage} alt="Receipt preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-[12px] font-semibold flex items-center gap-1 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
                        <span className="material-symbols-outlined text-[14px] animate-pulse">check_circle</span>
                        Receipt Attached
                      </span>
                      <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        IndexedDB Secure Storage
                      </span>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setScannedImage(null)}
                    className={`p-1.5 rounded-full border-0 bg-transparent cursor-pointer flex items-center justify-center transition-colors outline-none
                               ${isDarkMode ? 'text-slate-500 hover:text-red-400 hover:bg-slate-800' : 'text-slate-400 hover:text-red-500 hover:bg-slate-100'}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              )}

              {/* Category Selector */}
              <div className="w-full overflow-x-auto pb-2 custom-scrollbar mask-linear-x">
                <div className="flex items-center gap-2 px-2 w-max mx-auto">
                  {categories.map(cat => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => { playHaptic('click'); setSelectedCategory(cat.id); }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all cursor-pointer border-0 outline-none
                                  ${isSelected 
                                    ? 'text-white shadow-md scale-105' 
                                    : (isDarkMode ? 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-slate-300' : 'bg-white/80 text-slate-500 hover:bg-white hover:shadow-sm')}`}
                        style={{
                          backgroundColor: isSelected ? cat.color : undefined,
                          boxShadow: isSelected ? `0 4px 12px ${cat.color}33` : undefined
                        }}
                      >
                        <span 
                          className="material-symbols-outlined text-[18px] flex items-center justify-center font-semibold"
                          style={{ color: isSelected ? '#ffffff' : cat.color }}
                        >
                          {cat.icon}
                        </span>
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Scope Selector */}
              <div className="w-full flex flex-col gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider pl-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Scope & Recurrings</span>
                <div className={`grid grid-cols-4 gap-1 p-1 rounded-2xl border ${isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100/80 border-slate-200'}`}>
                  {(['one-off', 'weekly', 'monthly', 'project'] as const).map(type => {
                    const isSelected = scopeType === type;
                    const labels = { 'one-off': 'One-off', 'weekly': 'Weekly', 'monthly': 'Monthly', 'project': 'Project' };
                    const icons = { 'one-off': 'payments', 'weekly': 'date_range', 'monthly': 'calendar_month', 'project': 'folder' };
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          playHaptic('click');
                          setScopeType(type);
                          if (type === 'project' && projects.length > 0 && !selectedProjectId) {
                            setSelectedProjectId(projects[0].id);
                          }
                        }}
                        className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-bold transition-all border-0 outline-none cursor-pointer
                                  ${isSelected 
                                    ? (isDarkMode ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm') 
                                    : (isDarkMode ? 'text-slate-500 hover:text-slate-400' : 'text-slate-500 hover:text-slate-600')}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">{icons[type]}</span>
                        {labels[type]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Project Selection Row (Visible only if project scope selected) */}
              {scopeType === 'project' && (
                <div className="w-full flex flex-col gap-2 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between pl-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Select Project</span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingNewProject(!isCreatingNewProject)}
                      className={`text-[10px] font-bold border-0 bg-transparent cursor-pointer flex items-center gap-1 outline-none transition-colors ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-500'}`}
                    >
                      <span className="material-symbols-outlined text-[12px]">{isCreatingNewProject ? 'list' : 'add'}</span>
                      {isCreatingNewProject ? 'Choose Existing' : 'Create New'}
                    </button>
                  </div>

                  {isCreatingNewProject ? (
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus-within:border-blue-500 focus-within:bg-slate-800' : 'bg-white/60 border-slate-200 focus-within:border-blue-400 focus-within:bg-white'}`}>
                      <span className={`material-symbols-outlined text-[18px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>create_new_folder</span>
                      <input 
                        type="text" 
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Project Name (e.g. Prototype Cost)"
                        className={`w-full bg-transparent border-none outline-none text-sm p-0 ${isDarkMode ? 'text-slate-200 placeholder-slate-600' : 'text-slate-700 placeholder-slate-400'}`}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus-within:border-blue-500 focus-within:bg-slate-800' : 'bg-white/60 border-slate-200 focus-within:border-blue-400 focus-within:bg-white'}`}>
                      <span className={`material-symbols-outlined text-[18px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>folder</span>
                      {projects.length === 0 ? (
                        <div className="flex-1 flex items-center justify-between">
                          <span className={`text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>No projects. Create one first!</span>
                          <button
                            type="button"
                            onClick={() => setIsCreatingNewProject(true)}
                            className="bg-blue-600 text-white rounded-lg text-xs px-2.5 py-1 border-0 cursor-pointer font-bold"
                          >
                            Create
                          </button>
                        </div>
                      ) : (
                        <select
                          value={selectedProjectId}
                          onChange={(e) => setSelectedProjectId(e.target.value)}
                          className={`w-full bg-transparent border-none outline-none text-sm p-0 font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}
                        >
                          {projects.map(p => (
                            <option key={p.id} value={p.id} className={isDarkMode ? 'bg-slate-900 text-slate-200' : 'bg-white text-slate-800'}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Note Input */}
              <div className="w-full">
                <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all 
                                 ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus-within:border-blue-500 focus-within:bg-slate-800' : 'bg-white/60 border-slate-200 focus-within:border-blue-400 focus-within:bg-white'}
                                 ${scannedImage ? 'border-indigo-500/50 bg-indigo-500/5 dark:bg-indigo-500/10' : ''}`}>
                  <span className={`material-symbols-outlined text-[18px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>edit_note</span>
                  <input 
                    type="text" 
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="Note (optional)"
                    className={`w-full bg-transparent border-none outline-none text-sm p-0 ${isDarkMode ? 'text-slate-200 placeholder-slate-600' : 'text-slate-700 placeholder-slate-400'}`}
                  />
                </div>
              </div>

              {/* Date & Time Row */}
              <div className="flex gap-3">
                {/* Date Input */}
                <div className="flex-1">
                  <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus-within:border-blue-500 focus-within:bg-slate-800' : 'bg-white/60 border-slate-200 focus-within:border-blue-400 focus-within:bg-white'}`}>
                    <span className={`material-symbols-outlined text-[18px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>calendar_today</span>
                    <input 
                      type="date" 
                      value={dateInput}
                      onChange={(e) => setDateInput(e.target.value)}
                      className={`w-full bg-transparent border-none outline-none text-sm p-0 [&::-webkit-calendar-picker-indicator]:opacity-50 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 ${isDarkMode ? 'text-slate-200 [&::-webkit-calendar-picker-indicator]:invert' : 'text-slate-700'}`}
                    />
                  </div>
                </div>

                {/* Time Input */}
                <div className="flex-1">
                  <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus-within:border-blue-500 focus-within:bg-slate-800' : 'bg-white/60 border-slate-200 focus-within:border-blue-400 focus-within:bg-white'}`}>
                    <span className={`material-symbols-outlined text-[18px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>schedule</span>
                    <input 
                      type="time" 
                      value={timeInput}
                      onChange={(e) => setTimeInput(e.target.value)}
                      className={`w-full bg-transparent border-none outline-none text-sm p-0 [&::-webkit-calendar-picker-indicator]:opacity-50 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 ${isDarkMode ? 'text-slate-200 [&::-webkit-calendar-picker-indicator]:invert' : 'text-slate-700'}`}
                    />
                  </div>
                </div>
              </div>

              {/* Submit / Action Buttons */}
              {editingId ? (
                <div className="flex gap-3 w-full">
                  <button 
                    type="button"
                    onClick={async (e) => {
                      if (confirm('Delete this expense?')) {
                        await handleDeleteExpense(editingId, e);
                        setIsBottomSheetOpen(false);
                      }
                    }}
                    className={`flex-1 py-4 mb-2 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all cursor-pointer border active:scale-[0.98] outline-none
                               ${isDarkMode 
                                 ? 'border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400' 
                                 : 'border-red-200 bg-red-50 hover:bg-red-100 text-red-600'}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">delete</span>
                    Delete
                  </button>
                  <button 
                    type="submit" 
                    className="flex-[2] py-4 mb-2 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all cursor-pointer border-0 outline-none bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25 active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    Update Expense
                  </button>
                </div>
              ) : (
                <button 
                  type="submit" 
                  className={`w-full py-4 mb-2 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all cursor-pointer border-0 outline-none
                            ${amountInput && parseFloat(amountInput) > 0 
                              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 active:scale-[0.98]'
                              : (isDarkMode ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-100 text-slate-400 cursor-not-allowed')}`}
                >
                  <span className="material-symbols-outlined text-[20px]">add_circle</span>
                  Add Expense
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Receipt Lightbox Modal */}
      {lightboxReceipt && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in"
          onClick={() => setLightboxReceipt(null)}
        >
          {/* Close button */}
          <button 
            onClick={() => setLightboxReceipt(null)}
            className="absolute top-6 right-6 p-3 rounded-full bg-slate-800/80 text-white border-0 cursor-pointer flex items-center justify-center hover:bg-slate-700 transition-colors z-50"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
          
          <div className="flex flex-col items-center max-w-lg w-full gap-4" onClick={e => e.stopPropagation()}>
            {/* Header info */}
            <div className="text-center text-white px-4">
              <h3 className="text-lg font-bold truncate max-w-[300px] mb-1">{lightboxReceipt.title}</h3>
              <p className="text-xs text-slate-400">Local Receipt Backup</p>
            </div>
            
            {/* Image */}
            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900 flex items-center justify-center max-h-[70vh] w-full shadow-2xl">
              <img 
                src={lightboxReceipt.url} 
                alt="Receipt" 
                className="max-w-full max-h-[65vh] object-contain select-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-2">
              <a 
                href={lightboxReceipt.url} 
                download={`receipt_${lightboxReceipt.id}.jpg`}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer no-underline border-0"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Save Image
              </a>
              <button 
                onClick={async () => {
                  if (confirm('Delete this receipt attachment?')) {
                    await deleteReceipt(lightboxReceipt.id);
                    setExpenses(expenses.map(exp => exp.id === lightboxReceipt.id ? { ...exp, hasReceipt: false } : exp));
                    setLightboxReceipt(null);
                    if (editingId === lightboxReceipt.id) setScannedImage(null);
                  }
                }}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-semibold bg-red-950/40 border border-red-900/50 hover:bg-red-900/50 text-red-400 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                Delete Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget Settings Sheet Overlay */}
      <div 
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isBudgetSheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => { playHaptic('click'); setIsBudgetSheetOpen(false); }}
      >
        <div 
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md rounded-t-[2rem] p-6 pt-2 transition-transform duration-300 transform ${isBudgetSheetOpen ? 'translate-y-0 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]' : 'translate-y-full'} ${isDarkMode ? 'bg-slate-900 border-t border-slate-800' : 'bg-slate-50 border-t border-slate-200'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag Handle */}
          <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-6" />

          <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1 custom-scrollbar">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[22px] text-blue-500">settings_accessibility</span>
              <h2 className={`text-lg font-bold m-0 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>Budget Configuration</h2>
            </div>

            {/* Main Monthly Budget */}
            <div className="flex flex-col gap-1.5">
              <label className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Monthly Budget ({getCurrencySymbol(currency)})</label>
              <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-950/80 border-slate-800 focus-within:border-blue-500' : 'bg-white border-slate-200 focus-within:border-blue-400'}`}>
                <span className="text-sm font-bold opacity-60">{getCurrencySymbol(currency)}</span>
                <input 
                  type="number"
                  value={budgetLimit || ''}
                  onChange={(e) => setBudgetLimit(parseFloat(e.target.value) || 0)}
                  placeholder="3000"
                  className={`w-full bg-transparent border-none outline-none text-sm p-0 font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}
                />
              </div>
            </div>

            <div className="h-px bg-slate-500/10 my-1" />
            
            {/* Category Budgets */}
            <div className="flex flex-col gap-3">
              <label className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Category Limits (Optional)</label>
              
              <div className="grid grid-cols-1 gap-2.5">
                {categories.map(cat => {
                  const currentVal = categoryBudgets[cat.id] || '';
                  return (
                    <div 
                      key={cat.id}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-950/40 border-slate-800/80' : 'bg-white border-slate-200/60 shadow-sm'}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div 
                          className="w-8 h-8 rounded-xl flex items-center justify-center border"
                          style={{ 
                            backgroundColor: isDarkMode ? `${cat.color}15` : `${cat.color}0D`,
                            borderColor: isDarkMode ? `${cat.color}30` : `${cat.color}20`
                          }}
                        >
                          <span className="material-symbols-outlined text-[16px]" style={{ color: cat.color }}>{cat.icon}</span>
                        </div>
                        <span className={`text-sm font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{cat.label}</span>
                      </div>
                      
                      <div className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border w-28 transition-all ${isDarkMode ? 'bg-slate-950/80 border-slate-800 focus-within:border-blue-500' : 'bg-slate-50 border-slate-200 focus-within:border-blue-400'}`}>
                        <span className="text-xs font-bold opacity-50">{getCurrencySymbol(currency)}</span>
                        <input 
                          type="number"
                          value={currentVal}
                          onChange={(e) => {
                            const val = e.target.value ? parseFloat(e.target.value) : 0;
                            setCategoryBudgets(prev => ({
                              ...prev,
                              [cat.id]: val
                            }));
                          }}
                          placeholder="No Limit"
                          className={`w-full bg-transparent border-none outline-none text-xs p-0 font-medium text-right ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-slate-500/10 my-1" />
            
            {/* Audio & Confetti Toggles */}
            <div className="flex flex-col gap-2.5">
              <label className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Preference Settings</label>
              
              <div className="flex flex-col gap-2">
                {/* Currency Selector */}
                <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-950/40 border-slate-800/80' : 'bg-white border-slate-200/60 shadow-sm'}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[18px] text-emerald-500">
                      payments
                    </span>
                    <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Primary Currency</span>
                  </div>
                  <select
                    value={currency}
                    onChange={(e) => { playHaptic('click'); setCurrency(e.target.value); }}
                    className={`px-3 py-1 rounded-xl border outline-none text-xs font-medium cursor-pointer
                               ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300 focus:border-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-600 focus:border-indigo-400'}`}
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Audio Switch */}
                <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-950/40 border-slate-800/80' : 'bg-white border-slate-200/60 shadow-sm'}`}>
                  <div className="flex items-center gap-2.5">
                    <span className={`material-symbols-outlined text-[18px] ${soundEnabled ? 'text-indigo-500' : 'text-slate-400'}`}>
                      {soundEnabled ? 'volume_up' : 'volume_off'}
                    </span>
                    <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Sound Feedback Haptics</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { playHaptic('click'); setSoundEnabled(!soundEnabled); }}
                    className={`w-11 h-6 rounded-full p-0.5 border-0 transition-all cursor-pointer flex items-center ${soundEnabled ? 'bg-blue-600 justify-end' : 'bg-slate-300 dark:bg-slate-800 justify-start'}`}
                  >
                    <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
                  </button>
                </div>

                {/* Confetti Switch */}
                <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-950/40 border-slate-800/80' : 'bg-white border-slate-200/60 shadow-sm'}`}>
                  <div className="flex items-center gap-2.5">
                    <span className={`material-symbols-outlined text-[18px] ${confettiEnabled ? 'text-amber-500' : 'text-slate-400'}`}>
                      {confettiEnabled ? 'celebration' : 'sentiment_neutral'}
                    </span>
                    <span className={`text-xs font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Confetti Animations</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { playHaptic('click'); setConfettiEnabled(!confettiEnabled); }}
                    className={`w-11 h-6 rounded-full p-0.5 border-0 transition-all cursor-pointer flex items-center ${confettiEnabled ? 'bg-blue-600 justify-end' : 'bg-slate-300 dark:bg-slate-800 justify-start'}`}
                  >
                    <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
                  </button>
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-500/10 my-1" />

            {/* Quick Log Templates Customizer */}
            <div className="flex flex-col gap-2.5">
              <label className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Customize Quick Templates</label>
              <div className="flex flex-col gap-2.5">
                {quickTemplates.map((template, idx) => (
                  <div 
                    key={template.id}
                    className={`flex flex-col gap-2.5 p-3.5 rounded-2xl border ${isDarkMode ? 'bg-slate-950/40 border-slate-800/80' : 'bg-white border-slate-200/60 shadow-sm'}`}
                  >
                    <div className="flex items-center gap-2">
                      {/* Emoji input */}
                      <input 
                        type="text"
                        value={template.emoji}
                        maxLength={2}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuickTemplates(prev => prev.map((t, i) => i === idx ? { ...t, emoji: val } : t));
                        }}
                        className={`w-10 text-center py-1.5 rounded-xl border outline-none font-bold text-sm
                                   ${isDarkMode ? 'bg-slate-950 border-slate-800 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-400'}`}
                      />
                      
                      {/* Title input */}
                      <input 
                        type="text"
                        value={template.title}
                        placeholder="Title"
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuickTemplates(prev => prev.map((t, i) => i === idx ? { ...t, title: val } : t));
                        }}
                        className={`flex-1 px-3 py-1.5 rounded-xl border outline-none text-xs font-semibold
                                   ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-700 focus:border-blue-400'}`}
                      />

                      {/* Amount input */}
                      <div className={`flex items-center gap-0.5 px-2 py-1.5 rounded-xl border w-20 transition-all ${isDarkMode ? 'bg-slate-950 border-slate-800 focus-within:border-blue-500' : 'bg-slate-50 border-slate-200 focus-within:border-blue-400'}`}>
                        <span className="text-[10px] font-bold opacity-50">{getCurrencySymbol(currency)}</span>
                        <input 
                          type="number"
                          value={template.amount || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setQuickTemplates(prev => prev.map((t, i) => i === idx ? { ...t, amount: val } : t));
                          }}
                          className={`w-full bg-transparent border-none outline-none text-xs font-medium text-right ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}
                        />
                      </div>
                    </div>

                    {/* Category Select */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold opacity-55">Category:</span>
                      <select
                        value={template.categoryId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuickTemplates(prev => prev.map((t, i) => i === idx ? { ...t, categoryId: val } : t));
                        }}
                        className={`flex-1 px-2.5 py-1.5 rounded-xl border outline-none text-xs font-medium cursor-pointer
                                   ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-300 focus:border-indigo-500' : 'bg-slate-50 border-slate-200 text-slate-600 focus:border-indigo-400'}`}
                      >
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>
                            {cat.emoji} {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px bg-slate-500/10 my-1" />

            {/* Data Management Section */}
            <div className="flex flex-col gap-2.5">
              <label className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Data Management & Portability</label>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Export CSV */}
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className={`py-3 px-4 rounded-2xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer outline-none hover:scale-[1.02] active:scale-[0.98]
                             ${isDarkMode ? 'bg-slate-950/40 border-slate-800 hover:bg-slate-900 text-slate-300' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm'}`}
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Export CSV
                </button>

                {/* Import CSV */}
                <button
                  type="button"
                  onClick={() => { playHaptic('click'); importCsvInputRef.current?.click(); }}
                  className={`py-3 px-4 rounded-2xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer outline-none hover:scale-[1.02] active:scale-[0.98]
                             ${isDarkMode ? 'bg-slate-950/40 border-slate-800 hover:bg-slate-900 text-slate-300' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm'}`}
                >
                  <span className="material-symbols-outlined text-[16px]">upload</span>
                  Import CSV
                </button>
                
                {/* Backup JSON */}
                <button
                  type="button"
                  onClick={handleBackupJSON}
                  className={`py-3 px-4 rounded-2xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer outline-none hover:scale-[1.02] active:scale-[0.98]
                             ${isDarkMode ? 'bg-slate-950/40 border-slate-800 hover:bg-slate-900 text-slate-300' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm'}`}
                >
                  <span className="material-symbols-outlined text-[16px]">backup</span>
                  Backup (JSON)
                </button>
                
                {/* Restore JSON */}
                <button
                  type="button"
                  onClick={() => { playHaptic('click'); restoreFileInputRef.current?.click(); }}
                  className={`py-3 px-4 rounded-2xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer outline-none hover:scale-[1.02] active:scale-[0.98]
                             ${isDarkMode ? 'bg-slate-950/40 border-slate-800 hover:bg-slate-900 text-slate-300' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700 shadow-sm'}`}
                >
                  <span className="material-symbols-outlined text-[16px]">settings_backup_restore</span>
                  Restore (JSON)
                </button>

                {/* Reset All */}
                {expenses.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetExpenses}
                    className={`py-3 px-4 rounded-2xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer outline-none hover:scale-[1.02] active:scale-[0.98] text-red-500 border-red-500/20 bg-red-500/5 hover:bg-red-500/10`}
                  >
                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                    Reset Data
                  </button>
                )}
              </div>
            </div>

            <div className="h-px bg-slate-500/10 my-1" />

            {/* Category Customization Section */}
            {(() => {
              const PRESET_COLORS = ['#ff9500','#a2845e','#34c759','#007aff','#af52de','#ff3b30','#ff6b35','#5ac8fa','#4cd964','#ffcc00','#8e8e93','#636366'];
              const PRESET_EMOJIS = ['ðŸ”','â˜•','ðŸš—','ðŸ›ï¸','ðŸŽ®','âœ¨','ðŸ’Š','ðŸ“š','ðŸ ','ðŸ’¡','ðŸŽµ','âœˆï¸','ðŸ’°','ðŸŽ','ðŸ•','ðŸ‹ï¸','ðŸ¶','ðŸŒ¿','âš¡','ðŸŽ¨'];
              const PRESET_ICONS = ['restaurant','local_cafe','directions_car','shopping_bag','sports_esports','more_horiz','medical_services','menu_book','home','bolt','music_note','flight','savings','card_giftcard','local_pizza','fitness_center','pets','eco','electric_bolt','palette'];

              const handleAddCategory = () => {
                if (!newCatName.trim()) return;
                const newId = 'cat_' + Date.now().toString(36);
                const newCat = { id: newId, label: newCatName.trim(), icon: newCatIcon, emoji: newCatEmoji, color: newCatColor };
                setCategories(prev => [...prev, newCat]);
                setNewCatName('');
                playHaptic('success');
              };

              const handleDeleteCategory = (catId: string) => {
                if (catId === 'other') { alert('The "Other" category cannot be deleted.'); return; }
                if (!confirm('Delete this category? All expenses assigned to it will be moved to "Other".')) return;
                setCategories(prev => prev.filter(c => c.id !== catId));
                setExpenses(prev => prev.map(exp => exp.categoryId === catId ? { ...exp, categoryId: 'other' } : exp));
                playHaptic('click');
              };

              const handleStartEdit = (cat: { id: string; label: string; emoji: string; color: string }) => {
                setEditingCatId(cat.id);
                setEditCatName(cat.label);
                setEditCatEmoji(cat.emoji);
                setEditCatColor(cat.color);
              };

              const handleSaveEdit = () => {
                if (!editCatName.trim() || !editingCatId) return;
                setCategories(prev => prev.map(c => c.id === editingCatId ? { ...c, label: editCatName.trim(), emoji: editCatEmoji, color: editCatColor } : c));
                setEditingCatId(null);
                playHaptic('success');
              };

              return (
                <div className="flex flex-col gap-3">
                  <label className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Category Management</label>

                  {/* Existing categories list */}
                  <div className="flex flex-col gap-2">
                    {categories.map(cat => (
                      <div key={cat.id} className={`rounded-2xl border overflow-hidden transition-all ${isDarkMode ? 'bg-slate-950/40 border-slate-800/80' : 'bg-white border-slate-200/60 shadow-sm'}`}>
                        {editingCatId === cat.id ? (
                          <div className="flex flex-col gap-2 p-3">
                            <input
                              value={editCatName}
                              onChange={e => setEditCatName(e.target.value)}
                              className={`px-3 py-2 rounded-xl border outline-none text-sm font-medium w-full ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                              placeholder="Category name"
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold opacity-60">Emoji:</span>
                              <div className="flex flex-wrap gap-1 flex-1">
                                {PRESET_EMOJIS.slice(0, 10).map(em => (
                                  <button key={em} type="button" onClick={() => setEditCatEmoji(em)}
                                    className={`text-base w-7 h-7 rounded-lg border-0 cursor-pointer transition-all ${editCatEmoji === em ? 'bg-indigo-500/20 scale-110' : 'bg-transparent'}`}>
                                    {em}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold opacity-60">Color:</span>
                              <div className="flex flex-wrap gap-1.5 flex-1">
                                {PRESET_COLORS.map(clr => (
                                  <button key={clr} type="button" onClick={() => setEditCatColor(clr)}
                                    className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-all ${editCatColor === clr ? 'border-white scale-110 shadow-md' : 'border-transparent'}`}
                                    style={{ backgroundColor: clr }} />
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button type="button" onClick={handleSaveEdit}
                                className="flex-1 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white border-0 cursor-pointer transition-all">
                                Save
                              </button>
                              <button type="button" onClick={() => setEditingCatId(null)}
                                className={`flex-1 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                                style={{ backgroundColor: `${cat.color}20` }}>
                                {cat.emoji}
                              </div>
                              <span className={`text-sm font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{cat.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={() => handleStartEdit(cat)}
                                className={`p-1.5 rounded-lg border-0 bg-transparent cursor-pointer transition-colors ${isDarkMode ? 'text-slate-400 hover:text-indigo-400 hover:bg-slate-800' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}>
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                              </button>
                              {cat.id !== 'other' && (
                                <button type="button" onClick={() => handleDeleteCategory(cat.id)}
                                  className={`p-1.5 rounded-lg border-0 bg-transparent cursor-pointer transition-colors ${isDarkMode ? 'text-slate-400 hover:text-red-400 hover:bg-red-950/30' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}>
                                  <span className="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add new category form */}
                  <div className={`rounded-2xl border p-3 flex flex-col gap-2.5 ${isDarkMode ? 'bg-slate-950/40 border-slate-800/80 border-dashed' : 'bg-slate-50/80 border-slate-300 border-dashed'}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider m-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Add New Category</p>
                    <input
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      placeholder="Category name (e.g. Bills)"
                      className={`px-3 py-2 rounded-xl border outline-none text-sm font-medium w-full ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600' : 'bg-white border-slate-200 text-slate-700 placeholder:text-slate-400'}`}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold opacity-60 shrink-0">Emoji:</span>
                      <div className="flex flex-wrap gap-1">
                        {PRESET_EMOJIS.map(em => (
                          <button key={em} type="button" onClick={() => setNewCatEmoji(em)}
                            className={`text-base w-7 h-7 rounded-lg border-0 cursor-pointer transition-all ${newCatEmoji === em ? 'bg-indigo-500/20 scale-110' : 'bg-transparent'}`}>
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold opacity-60 shrink-0">Icon:</span>
                      <div className="flex flex-wrap gap-1 overflow-x-auto">
                        {PRESET_ICONS.map((ic) => (
                          <button key={ic} type="button" onClick={() => setNewCatIcon(ic)}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center border cursor-pointer transition-all ${
                              newCatIcon === ic
                                ? 'bg-indigo-600 border-indigo-600 text-white scale-105'
                                : (isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500')
                            }`}>
                            <span className="material-symbols-outlined text-[16px]">{ic}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold opacity-60 shrink-0">Color:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESET_COLORS.map(clr => (
                          <button key={clr} type="button" onClick={() => setNewCatColor(clr)}
                            className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-all ${newCatColor === clr ? 'border-white scale-110 shadow-md' : 'border-transparent'}`}
                            style={{ backgroundColor: clr }} />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1" style={{ backgroundColor: `${newCatColor}15`, border: `1.5px solid ${newCatColor}40` }}>
                        <span className="text-base">{newCatEmoji}</span>
                        <span className="text-sm font-semibold" style={{ color: newCatColor }}>{newCatName || 'Preview'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        disabled={!newCatName.trim()}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all ${
                          newCatName.trim()
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            : 'bg-slate-300 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* V11.4: PWA Installation Status */}
            <div className="flex flex-col gap-2.5">
              <label className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>PWA Application Status</label>
              
              {(() => {
                const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
                
                if (isStandalone) {
                  return (
                    <div className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-semibold ${isDarkMode ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                      <span className="material-symbols-outlined text-[18px]">verified</span>
                      <span>Running in Standalone App Mode</span>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col gap-2">
                    {deferredPrompt ? (
                      <button
                        type="button"
                        onClick={handleInstallApp}
                        className="w-full py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border-0 outline-none bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10 active:scale-[0.98]"
                      >
                        <span className="material-symbols-outlined text-[16px]">install_mobile</span>
                        Install Timmy Wallet App
                      </button>
                    ) : (
                      <div className={`p-3.5 rounded-2xl border flex items-start gap-2.5 text-[11px] leading-normal ${isDarkMode ? 'bg-slate-950/40 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600 shadow-sm'}`}>
                        <span className="material-symbols-outlined text-[16px] text-indigo-500 mt-0.5">info</span>
                        <span>
                          <strong>Web App Mode</strong>: To install Timmy Wallet as a standalone app, tap your browser's menu (or <span className="font-bold">Share</span> button on Safari) and select <span className="font-bold">"Add to Home Screen"</span>.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="h-px bg-slate-500/10 my-1" />

            <button 
              type="button"
              onClick={() => { playHaptic('success'); triggerConfetti(); setIsBudgetSheetOpen(false); }}
              className="w-full py-4 mt-3 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all cursor-pointer border-0 outline-none bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              Save Configurations
            </button>
          </div>
        </div>
      </div>

      {/* Receipt Crop & Preprocess Editor Modal */}
      {isCropEditorOpen && rawImageToCrop && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in">
          {/* Header */}
          <div className="text-center text-white mb-4">
            <h3 className="text-lg font-bold mb-1">Crop Receipt</h3>
            <p className="text-xs text-slate-400">Drag sliders to crop out background clutter</p>
          </div>

          {/* Visual Image Preview with Bounding Box Overlay */}
          <div className="relative max-w-sm w-full bg-slate-900 border border-white/10 rounded-2xl overflow-hidden flex items-center justify-center max-h-[50vh]">
            <img 
              src={rawImageToCrop} 
              alt="Raw scan" 
              className="max-w-full max-h-[48vh] object-contain select-none opacity-90"
            />
            {/* Draggable/Visual overlay box shadows indicating dark borders outside cropped region */}
            <div 
              className="absolute pointer-events-none border-2 border-dashed border-indigo-500/80 shadow-[0_0_20px_rgba(99,102,241,0.5)]"
              style={{
                top: `${cropTop}%`,
                bottom: `${cropBottom}%`,
                left: `${cropLeft}%`,
                right: `${cropRight}%`
              }}
            >
              {/* Corner indicators */}
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-indigo-400 -translate-x-0.5 -translate-y-0.5" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-indigo-400 translate-x-0.5 -translate-y-0.5" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-indigo-400 -translate-x-0.5 translate-y-0.5" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-indigo-400 translate-x-0.5 translate-y-0.5" />
            </div>
            {/* Shading outside the crop area */}
            <div className="absolute inset-0 bg-black/50 pointer-events-none" style={{ clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${cropLeft}% ${cropTop}%, ${100 - cropRight}% ${cropTop}%, ${100 - cropRight}% ${100 - cropBottom}%, ${cropLeft}% ${100 - cropBottom}%, ${cropLeft}% ${cropTop}%)` }} />
          </div>

          {/* Sliders Area */}
          <div className="w-full max-w-sm flex flex-col gap-3 mt-4 px-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Crop Top */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Crop Top: {cropTop}%</span>
                <input 
                  type="range" 
                  min="0" 
                  max="45" 
                  value={cropTop} 
                  onChange={(e) => setCropTop(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
              {/* Crop Bottom */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Crop Bottom: {cropBottom}%</span>
                <input 
                  type="range" 
                  min="0" 
                  max="45" 
                  value={cropBottom} 
                  onChange={(e) => setCropBottom(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
              {/* Crop Left */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Crop Left: {cropLeft}%</span>
                <input 
                  type="range" 
                  min="0" 
                  max="45" 
                  value={cropLeft} 
                  onChange={(e) => setCropLeft(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
              {/* Crop Right */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Crop Right: {cropRight}%</span>
                <input 
                  type="range" 
                  min="0" 
                  max="45" 
                  value={cropRight} 
                  onChange={(e) => setCropRight(parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-3 w-full">
              <button 
                type="button"
                onClick={() => { playHaptic('click'); setIsCropEditorOpen(false); setRawImageToCrop(null); }}
                className="flex-1 py-3 rounded-xl font-bold text-xs bg-slate-800 text-white hover:bg-slate-700 transition-colors border-0 cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={() => {
                  playHaptic('success');
                  const img = new Image();
                  img.src = rawImageToCrop;
                  img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const x = img.width * (cropLeft / 100);
                    const y = img.height * (cropTop / 100);
                    const w = img.width * (1 - (cropLeft + cropRight) / 100);
                    const h = img.height * (1 - (cropTop + cropBottom) / 100);
                    
                    // Downscale the saved receipt image to a reasonable size (max 1024px) to optimize IndexedDB storage and JSON exports
                    const MAX_SAVE_DIM = 1024;
                    let targetW = w;
                    let targetH = h;
                    if (targetW > targetH) {
                      if (targetW > MAX_SAVE_DIM) {
                        targetH = targetH * (MAX_SAVE_DIM / targetW);
                        targetW = MAX_SAVE_DIM;
                      }
                    } else {
                      if (targetH > MAX_SAVE_DIM) {
                        targetW = targetW * (MAX_SAVE_DIM / targetH);
                        targetH = MAX_SAVE_DIM;
                      }
                    }

                    canvas.width = targetW;
                    canvas.height = targetH;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      ctx.drawImage(img, x, y, w, h, 0, 0, targetW, targetH);
                      
                      // Apply CamScanner filter (Grayscale + High Contrast + Brighten)
                      const imgData = ctx.getImageData(0, 0, targetW, targetH);
                      if (imgData) {
                        const data = imgData.data;
                        for (let i = 0; i < data.length; i += 4) {
                          const r = data[i];
                          const g = data[i + 1];
                          const b = data[i + 2];
                          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                          
                          // Stretch contrast and boost brightness for a crisp black-and-white scan look
                          const contrast = 1.7;
                          const brightness = 12;
                          let newVal = contrast * (gray - 128) + 128 + brightness;
                          newVal = Math.max(0, Math.min(255, newVal));
                          
                          data[i] = newVal;
                          data[i + 1] = newVal;
                          data[i + 2] = newVal;
                        }
                        ctx.putImageData(imgData, 0, 0);
                      }
                      
                      const croppedUrl = canvas.toDataURL('image/jpeg', 0.85);
                      processAndScanImage(croppedUrl);
                    }
                  };
                }}
                className="flex-[2] py-3 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 transition-colors border-0 cursor-pointer shadow-lg shadow-indigo-600/20"
              >
                Crop & Enhance (Scan)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confetti Overlay Canvas */}
      <canvas 
        ref={confettiCanvasRef} 
        className="absolute inset-0 pointer-events-none z-50 rounded-[2.5rem]" 
        style={{ width: '100%', height: '100%' }}
      />

    </div>
  </div>
  );
}
