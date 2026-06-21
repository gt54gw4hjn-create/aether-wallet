import { useState, useEffect, useMemo, useRef } from 'react';
import DonutChart from './Chart';
import Sparkline from './Sparkline';
import { saveReceipt, getReceipt, deleteReceipt } from './db';

// Define Categories with Apple-style Colors
const CATEGORIES = [
  { id: 'food', label: 'Food', icon: 'restaurant', emoji: '🍔', color: '#ff9500' }, 
  { id: 'coffee', label: 'Coffee', icon: 'local_cafe', emoji: '☕', color: '#a2845e' }, 
  { id: 'transport', label: 'Transit', icon: 'directions_car', emoji: '🚗', color: '#34c759' }, 
  { id: 'shopping', label: 'Shopping', icon: 'shopping_bag', emoji: '🛍️', color: '#007aff' }, 
  { id: 'entertainment', label: 'Fun', icon: 'sports_esports', emoji: '🎮', color: '#af52de' }, 
  { id: 'other', label: 'Other', icon: 'more_horiz', emoji: '✨', color: '#8e8e93' }, 
];

interface Project {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string;
  time?: string;
  categoryId: string;
  hasReceipt?: boolean;
  scopeType?: 'one-off' | 'weekly' | 'monthly' | 'project';
  projectId?: string;
}

// Formatter for currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(amount);
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

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem('micro_expenses');
    return saved ? JSON.parse(saved) : [];
  });

  const [amountInput, setAmountInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('food');
  const [titleInput, setTitleInput] = useState('');
  
  // New: Date State defaulting to today (YYYY-MM-DD)
  const [dateInput, setDateInput] = useState(() => new Date().toISOString().split('T')[0]);

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
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [editBudgetVal, setEditBudgetVal] = useState('');

  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // AI Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bottom Sheet State
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

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

  // V4 Custom States for Receipts and Swiping
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [lightboxReceipt, setLightboxReceipt] = useState<{ url: string; title: string; id: string } | null>(null);
  const [swipeActiveId, setSwipeActiveId] = useState<string | null>(null);
  const [swipeDistance, setSwipeDistance] = useState<number>(0);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwiping = useRef<boolean>(false);

  useEffect(() => localStorage.setItem('micro_expenses', JSON.stringify(expenses)), [expenses]);
  useEffect(() => localStorage.setItem('micro_projects', JSON.stringify(projects)), [projects]);
  useEffect(() => localStorage.setItem('micro_budget', budgetLimit.toString()), [budgetLimit]);
  useEffect(() => {
    localStorage.setItem('micro_theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // AI Image Scanning Logic (OpenAI)
  const handleImageScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be chosen again
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Load key from .env
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      alert("Error: OpenAI API Key not found in .env file.");
      return;
    }

    setIsScanning(true);

    try {
      // Compress Image using Canvas before sending to AI
      const compressedDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1024;
            const MAX_HEIGHT = 1024;
            let width = img.width;
            let height = img.height;

            // Maintain aspect ratio
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
            ctx?.drawImage(img, 0, 0, width, height);
            
            // Get compressed JPEG at 70% quality
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve(dataUrl); // return full data URL
          };
          img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
      });

      setScannedImage(compressedDataUrl);
      const base64Data = compressedDataUrl.split(',')[1];

      // Fetch to OpenAI API
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
                  text: "Analyze this receipt. Return ONLY a valid JSON object with these exact keys:\n1. 'amount' (number, the final total price, NO currency symbols or commas).\n2. 'title' (string, the merchant name AND a concise list of main items purchased, e.g. \"Walmart - Milk, Bread, Apples\"). This is crucial for later searching.\n3. 'date' (string, YYYY-MM-DD. If missing, omit the key).\n4. 'time' (string, HH:MM format in 24-hour clock. If missing, omit the key).\n5. 'category' (string, choose exactly one from: 'food', 'coffee', 'transport', 'shopping', 'entertainment', 'other').\nIf the image is not a receipt or is completely unreadable, return {\"error\": \"Unreadable receipt\"}.\nDo not use markdown code blocks like ```json."
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Data}`
                  }
                }
              ]
            }
          ],
          temperature: 0.1
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message || 'API Error');
      }

      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("No text returned from AI");

      // Parse JSON from AI text
      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanText);

      if (parsed.error) {
        throw new Error(parsed.error);
      }

      // Populate Form
      if (parsed.amount) setAmountInput(parsed.amount.toString());
      if (parsed.title) setTitleInput(parsed.title);
      if (parsed.date) setDateInput(parsed.date);
      if (parsed.time) setTimeInput(parsed.time);
      if (parsed.category) {
        const cat = CATEGORIES.find(c => c.id === parsed.category.toLowerCase());
        if (cat) setSelectedCategory(cat.id);
      }

    } catch (err: any) {
      alert("Failed to scan receipt: " + err.message);
      setScannedImage(null);
    } finally {
      setIsScanning(false);
    }
  };

  const handleOpenNewBottomSheet = () => {
    setEditingId(null);
    setAmountInput('');
    setTitleInput('');
    setSelectedCategory('food');
    setDateInput(new Date().toISOString().split('T')[0]);
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
    if (!amountInput || parseFloat(amountInput) <= 0) return;

    const cat = CATEGORIES.find(c => c.id === selectedCategory);
    const finalTitle = titleInput.trim() || cat?.label || 'Expense';

    const [year, month, day] = dateInput.split('-');
    const formattedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString();

    let updatedExpensesList = [...expenses];

    const finalTime = timeInput.trim() || (() => {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    })();

    let finalProjId: string | undefined = undefined;
    if (scopeType === 'project') {
      if (isCreatingNewProject && newProjectName.trim()) {
        const newProjId = 'proj_' + Date.now();
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
      const newId = Date.now().toString();
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
    setAmountInput('');
    setTitleInput('');
    setDateInput(new Date().toISOString().split('T')[0]);
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
    setEditingId(exp.id);
    setAmountInput(exp.amount.toString());
    setTitleInput(exp.title);
    setSelectedCategory(exp.categoryId);
    const d = new Date(exp.date);
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

  const handleDeleteExpense = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpenses(expenses.filter(exp => exp.id !== id));
    await deleteReceipt(id);
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

  const renderExpenseItem = (exp: Expense, index: number) => {
    const category = CATEGORIES.find(c => c.id === exp.categoryId) || CATEGORIES[5];
    const isEditingThis = editingId === exp.id;
    const isSwiped = swipeActiveId === exp.id;
    const translateStyle = isSwiped ? `translateX(${swipeDistance}px)` : 'translateX(0)';
    const transitionStyle = isSwiped && isSwiping.current ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
    
    return (
      <div 
        key={exp.id}
        className="relative overflow-hidden rounded-2xl w-full select-none"
      >
        {/* Swipe Action Background Layer */}
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

        {/* Foreground Card */}
        <div 
          onClick={() => {
            if (isSwiped && Math.abs(swipeDistance) > 10) {
              setSwipeActiveId(null);
              setSwipeDistance(0);
            } else {
              handleEditClick(exp);
            }
          }}
          onTouchStart={(e) => handleTouchStart(e, exp.id)}
          onTouchMove={(e) => handleTouchMove(e, exp.id)}
          onTouchEnd={() => handleTouchEnd()}
          className={`relative z-10 flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer animate-in fade-in slide-in-from-bottom-2
                     ${isEditingThis 
                       ? (isDarkMode ? 'bg-slate-800 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-blue-50 border-blue-200 shadow-md')
                       : (isDarkMode 
                           ? 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800' 
                           : 'bg-white border-slate-200/60 shadow-sm hover:shadow-md')}`}
          style={{ 
            transform: translateStyle, 
            transition: transitionStyle,
            animationDelay: `${index * 30}ms`, 
            animationFillMode: 'both' 
          }}
        >
          <div className="flex items-center gap-3.5">
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
                      handleViewReceipt(exp.id, exp.title);
                    }}
                    title="View receipt"
                    className={`material-symbols-outlined text-[15px] px-1 rounded flex items-center justify-center cursor-pointer transition-colors
                               ${isDarkMode ? 'text-indigo-400 hover:text-indigo-300 hover:bg-slate-700' : 'text-indigo-600 hover:text-indigo-500 hover:bg-indigo-50'}`}
                  >
                    receipt_long
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[11px] font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{category.label}</span>
                {exp.time && (
                  <>
                    <span className={`text-[9px] ${isDarkMode ? 'text-slate-700' : 'text-slate-300'}`}>•</span>
                    <span className={`text-[11px] font-medium ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{formatTime12h(exp.time)}</span>
                  </>
                )}
                {exp.scopeType && exp.scopeType !== 'one-off' && (
                  <>
                    <span className={`text-[9px] ${isDarkMode ? 'text-slate-700' : 'text-slate-300'}`}>•</span>
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
            <span className={`text-base font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>-{formatCurrency(exp.amount)}</span>
            <button 
              onClick={(e) => handleDeleteExpense(exp.id, e)}
              className={`opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity p-2 rounded-full border-0 bg-transparent cursor-pointer flex items-center justify-center -mr-1 outline-none
                         ${isDarkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50'}`}
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleResetExpenses = () => {
    if (confirm('Are you sure you want to clear all expenses and reset the total?')) {
      setExpenses([]);
      setFilterCategory(null);
      setEditingId(null);
      setSearchQuery('');
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
    link.setAttribute("download", `expenses_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalSpent = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [expenses]);

  const budgetPercentage = Math.min((totalSpent / budgetLimit) * 100, 100);
  const isOverBudget = budgetPercentage >= 90;

  const insightText = useMemo(() => {
    if (expenses.length === 0) return "Ready to track your first expense.";
    
    const totals: Record<string, number> = {};
    expenses.forEach(exp => {
      totals[exp.categoryId] = (totals[exp.categoryId] || 0) + exp.amount;
    });
    
    let maxCat = '';
    let maxAmt = 0;
    Object.entries(totals).forEach(([catId, amt]) => {
      if (amt > maxAmt) { maxAmt = amt; maxCat = catId; }
    });

    const categoryLabel = CATEGORIES.find(c => c.id === maxCat)?.label || 'Unknown';
    const percent = Math.round((maxAmt / totalSpent) * 100);
    
    if (isOverBudget) return `Careful! You're approaching your RM${budgetLimit} budget limit.`;
    return `You've spent ${percent}% of your total on ${categoryLabel} this month.`;
  }, [expenses, totalSpent, isOverBudget, budgetLimit]);

  // Sorting, Filtering, and Grouping
  const groupedExpenses = useMemo(() => {
    let filtered = expenses;
    
    if (filterCategory) {
      filtered = filtered.filter(exp => exp.categoryId === filterCategory);
    }
    
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(exp => exp.title.toLowerCase().includes(lowerQuery));
    }

    // Sort descending by date (newest first)
    const sorted = [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const groups: { [key: string]: Expense[] } = {};
    const today = new Date().toLocaleDateString();
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();

    sorted.forEach(exp => {
      let groupName = exp.date;
      if (exp.date === today) groupName = "Today";
      else if (exp.date === yesterday) groupName = "Yesterday";
      
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(exp);
    });

    return groups;
  }, [expenses, filterCategory, searchQuery]);

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = true;
    
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
    <div className={`min-h-[100dvh] w-full flex items-center justify-center p-0 md:p-6 font-[system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif] antialiased transition-colors duration-700 
                    ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#faf8ff] text-slate-900'}`}>
      
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
      <div className={`relative z-10 flex flex-col overflow-hidden backdrop-blur-[40px] border-x-0 border-y-0 md:border w-full h-[100dvh] md:h-[85dvh] md:max-h-[800px] md:w-[420px] md:rounded-[2.5rem] md:shadow-[0_20px_60px_rgba(0,0,0,0.15)] transition-all duration-500
                      ${isDarkMode ? 'bg-black/60 border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.8)]' : 'bg-white/70 border-white/60'}`}>
        
        {/* Header */}
        <div className={`flex items-center justify-between px-7 pt-12 pb-6 shrink-0 bg-gradient-to-b ${isDarkMode ? 'from-black/60 to-transparent' : 'from-white/60 to-transparent'}`}>
          <h1 className={`text-xl font-bold tracking-tight m-0 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Aether Wallet</h1>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2 rounded-full transition-colors border-0 cursor-pointer flex items-center justify-center outline-none ${isDarkMode ? 'bg-slate-800 text-yellow-400 hover:bg-slate-700' : 'bg-white text-slate-500 hover:bg-slate-100 shadow-sm'}`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {isDarkMode ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
        </div>

        {/* Balance Display with Chart & Budget */}
        <div className={`px-8 pb-6 flex flex-col shrink-0 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200/60'}`}>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold tracking-widest uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Total Spent</span>
                {expenses.length > 0 && (
                  <button 
                    onClick={handleResetExpenses}
                    title="Reset all expenses"
                    className={`p-1 rounded-full border-0 bg-transparent cursor-pointer flex items-center justify-center transition-colors outline-none
                               ${isDarkMode ? 'text-slate-500 hover:text-red-400 hover:bg-slate-800' : 'text-slate-400 hover:text-red-500 hover:bg-slate-100'}`}
                  >
                    <span className="material-symbols-outlined text-[14px]">refresh</span>
                  </button>
                )}
              </div>
              <div className="flex items-start">
                <span className={`text-2xl font-semibold mt-2 mr-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-400'}`}>RM</span>
                <span className={`text-5xl font-bold tracking-tighter ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{totalSpent.toFixed(2).split('.')[0]}</span>
                <span className={`text-2xl font-bold mt-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}>.{totalSpent.toFixed(2).split('.')[1]}</span>
              </div>
            </div>
            <div className="ml-4 shrink-0 relative">
              <DonutChart 
                expenses={expenses} 
                categories={CATEGORIES} 
                filterCategory={filterCategory}
                onCategoryClick={(id) => setFilterCategory(prev => prev === id ? null : id)}
              />
              {filterCategory && (
                <button 
                  onClick={() => setFilterCategory(null)}
                  className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-0.5 shadow-md flex items-center justify-center scale-75 hover:bg-slate-700 cursor-pointer border-0"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 w-full">
            <div className="flex justify-between items-end mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold tracking-wider uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Monthly Budget</span>
                <button 
                  onClick={handleExportCSV}
                  title="Export to CSV"
                  className={`border-0 bg-transparent p-0 flex items-center justify-center cursor-pointer opacity-50 hover:opacity-100 transition-opacity ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}
                >
                  <span className="material-symbols-outlined text-[14px]">download</span>
                </button>
              </div>
              <span className={`text-[11px] font-semibold flex items-center gap-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                {formatCurrency(totalSpent)} / 
                {isEditingBudget ? (
                  <input 
                    type="number" 
                    autoFocus
                    value={editBudgetVal}
                    onChange={e => setEditBudgetVal(e.target.value)}
                    onBlur={() => {
                      setIsEditingBudget(false);
                      const val = parseFloat(editBudgetVal);
                      if (val > 0) setBudgetLimit(val);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setIsEditingBudget(false);
                        const val = parseFloat(editBudgetVal);
                        if (val > 0) setBudgetLimit(val);
                      }
                    }}
                    className={`w-14 bg-transparent border-b text-center focus:outline-none p-0 m-0 ${isDarkMode ? 'border-blue-400 text-blue-400' : 'border-blue-500 text-blue-600'}`} 
                  />
                ) : (
                  <span 
                    onClick={() => { setIsEditingBudget(true); setEditBudgetVal(budgetLimit.toString()); }} 
                    className="cursor-pointer hover:text-blue-500 underline decoration-dashed decoration-slate-400 underline-offset-2"
                    title="Click to edit budget"
                  >
                    RM{budgetLimit}
                  </span>
                )}
              </span>
            </div>
            <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <div 
                className={`h-full rounded-full transition-all duration-1000 ease-out ${isOverBudget ? 'bg-red-500' : (isDarkMode ? 'bg-white' : 'bg-slate-800')}`}
                style={{ width: `${budgetPercentage}%` }}
              ></div>
            </div>
          </div>

          <div className={`mt-4 px-4 py-3 rounded-xl flex items-start gap-3 ${isDarkMode ? 'bg-slate-800/60 text-slate-300' : 'bg-white/60 text-slate-600 shadow-sm'}`}>
            <span className={`material-symbols-outlined text-[18px] mt-0.5 ${isOverBudget ? 'text-red-500' : (isDarkMode ? 'text-white' : 'text-slate-800')}`}>
              {isOverBudget ? 'warning' : 'tips_and_updates'}
            </span>
            <p className="text-xs font-medium leading-relaxed m-0">{insightText}</p>
          </div>
          
          {/* Sparkline Chart */}
          <Sparkline expenses={expenses} isDarkMode={isDarkMode} />
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col w-full relative">
          
          {/* Segmented Tab Selector */}
          <div className={`px-6 pt-4 pb-2 border-b shrink-0 transition-colors ${isDarkMode ? 'bg-black/20 border-white/5' : 'bg-slate-50/30 border-slate-200/50'}`}>
            <div className={`flex p-1 rounded-2xl border ${isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100/80 border-slate-200'}`}>
              {(['transactions', 'recurrings', 'projects'] as const).map(tab => {
                const isSelected = currentTab === tab;
                const labels = { transactions: 'Transactions', recurrings: 'Commitments', projects: 'Projects' };
                const icons = { transactions: 'receipt_long', recurrings: 'autorenew', projects: 'folder' };
                return (
                  <button
                    key={tab}
                    onClick={() => {
                      setCurrentTab(tab);
                      setSelectedProjectDetailId(null); // Reset drilldown when switching tabs
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all border-0 outline-none cursor-pointer
                               ${isSelected 
                                 ? (isDarkMode ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm') 
                                 : (isDarkMode ? 'text-slate-500 hover:text-slate-400' : 'text-slate-500 hover:text-slate-600')}`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{icons[tab]}</span>
                    {labels[tab]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab 1: Transactions List */}
          {currentTab === 'transactions' && (
            <div className={`flex-1 flex flex-col relative ${isDarkMode ? 'bg-black/20' : 'bg-slate-50/50'}`}>
              {/* Sticky Search Bar */}
              <div className={`sticky top-0 z-20 px-6 py-4 backdrop-blur-xl border-b transition-colors ${isDarkMode ? 'bg-black/40 border-white/5' : 'bg-white/40 border-slate-200/50'}`}>
                <div className="relative group">
                  <span className={`absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] transition-colors ${isDarkMode ? 'text-slate-500 group-focus-within:text-blue-400' : 'text-slate-400 group-focus-within:text-blue-500'}`}>search</span>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search notes or amounts..."
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all
                               ${isDarkMode 
                                 ? 'bg-slate-900/50 border border-slate-700/50 text-slate-200 placeholder-slate-500 focus:bg-slate-800/80 focus:border-blue-500/50 focus:shadow-[0_0_10px_rgba(59,130,246,0.1)]' 
                                 : 'bg-white/60 border border-slate-200 text-slate-700 placeholder-slate-400 focus:bg-white focus:border-blue-400 focus:shadow-sm'}`}
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] rounded-full p-0.5 border-0 cursor-pointer transition-colors
                                 ${isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                    >
                      close
                    </button>
                  )}
                </div>
              </div>

              <div className="px-6 pb-24 pt-4">
                {Object.keys(groupedExpenses).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 opacity-40">
                    <span className={`material-symbols-outlined text-4xl mb-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {searchQuery ? 'search_off' : 'receipt_long'}
                    </span>
                    <p className={`text-sm font-medium m-0 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {searchQuery ? `No notes found matching "${searchQuery}"` : "No transactions found"}
                    </p>
                  </div>
                ) : (
                  Object.entries(groupedExpenses).map(([dateGroup, groupExpenses]) => (
                    <div key={dateGroup} className="mb-4">
                      <div className={`sticky top-0 py-2 backdrop-blur-md z-10 ${isDarkMode ? 'bg-black/60' : 'bg-slate-50/90'}`}>
                        <h3 className={`text-[11px] font-bold uppercase tracking-widest m-0 pl-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{dateGroup}</h3>
                      </div>
                      <div className="space-y-2 mt-1">
                        {groupExpenses.map((exp, i) => renderExpenseItem(exp, i))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Commitments / Recurrings View */}
          {currentTab === 'recurrings' && (() => {
            const weeklyItems = expenses.filter(exp => exp.scopeType === 'weekly');
            const monthlyItems = expenses.filter(exp => exp.scopeType === 'monthly');
            const weeklyTotal = weeklyItems.reduce((acc, curr) => acc + curr.amount, 0);
            const monthlyTotal = monthlyItems.reduce((acc, curr) => acc + curr.amount, 0);
            
            return (
              <div className={`flex-1 flex flex-col p-6 space-y-6 pb-24 ${isDarkMode ? 'bg-black/20' : 'bg-slate-50/50'}`}>
                {/* Commitment Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-4 rounded-3xl border flex flex-col justify-between h-32 relative overflow-hidden transition-all hover:shadow-md ${isDarkMode ? 'bg-slate-900/50 border-amber-500/10' : 'bg-amber-50/20 border-amber-200'}`}>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl translate-x-4 -translate-y-4"></div>
                    <div className="flex items-center gap-2">
                      <span className={`material-symbols-outlined text-[20px] ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>date_range</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Weekly</span>
                    </div>
                    <div className="mt-2">
                      <span className={`text-2xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(weeklyTotal)}</span>
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
                      <span className={`text-2xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(monthlyTotal)}</span>
                      <p className={`text-[10px] m-0 mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{monthlyItems.length} recurring items</p>
                    </div>
                  </div>
                </div>

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
                <div className={`flex-1 flex flex-col p-6 pb-24 ${isDarkMode ? 'bg-black/20' : 'bg-slate-50/50'}`}>
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
                  <div className={`p-5 rounded-3xl border flex flex-col justify-between mb-6 relative overflow-hidden transition-all ${isDarkMode ? 'bg-slate-900/50 border-cyan-500/10' : 'bg-cyan-50/20 border-cyan-200'}`}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-xl translate-x-4 -translate-y-4"></div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-[20px] text-cyan-500 animate-pulse">folder</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Project Cost</span>
                      </div>
                      <h2 className={`text-xl font-bold tracking-tight m-0 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{project.name}</h2>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-500/10 flex items-end justify-between">
                      <span className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Accumulated Expense</span>
                      <span className={`text-2xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{formatCurrency(projectTotal)}</span>
                    </div>
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
              <div className={`flex-1 flex flex-col p-6 space-y-6 pb-24 ${isDarkMode ? 'bg-black/20' : 'bg-slate-50/50'}`}>
                
                {/* Project Creator Card */}
                <div className={`p-4 rounded-3xl border flex flex-col gap-3 transition-all ${isDarkMode ? 'bg-slate-900/30 border-slate-800' : 'bg-white border-slate-200/60 shadow-sm'}`}>
                  <h3 className={`text-xs font-bold uppercase tracking-wider pl-1 m-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Create New Project</h3>
                  <div className="flex gap-2">
                    <div className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-900/50 border-slate-700 focus-within:border-blue-500' : 'bg-slate-50 border-slate-200 focus-within:border-blue-400'}`}>
                      <span className={`material-symbols-outlined text-[18px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>create_new_folder</span>
                      <input 
                        type="text" 
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Project Name (e.g. Prototype Cost)"
                        className={`w-full bg-transparent border-none outline-none text-sm p-0 ${isDarkMode ? 'text-slate-200 placeholder-slate-600' : 'text-slate-700 placeholder-slate-400'}`}
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (newProjectName.trim()) {
                          const newProj = {
                            id: 'proj_' + Date.now(),
                            name: newProjectName.trim()
                          };
                          setProjects(prev => [...prev, newProj]);
                          setNewProjectName('');
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs px-4 py-2.5 border-0 cursor-pointer font-bold transition-all active:scale-[0.98]"
                    >
                      Create
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
                            className={`p-4 rounded-2xl border flex items-center justify-between cursor-pointer group transition-all hover:-translate-y-0.5 active:scale-[0.99]
                                       ${isDarkMode 
                                         ? 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600' 
                                         : 'bg-white border-slate-200/60 shadow-sm hover:shadow-md hover:border-slate-300'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${isDarkMode ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' : 'bg-cyan-50 border-cyan-200 text-cyan-600'}`}>
                                <span className="material-symbols-outlined text-[20px]">folder</span>
                              </div>
                              <div className="flex flex-col">
                                <span className={`text-[15px] font-semibold transition-colors group-hover:text-blue-500 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{proj.name}</span>
                                <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{projExpenses.length} expenses</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-base font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{formatCurrency(projTotal)}</span>
                              <span className={`material-symbols-outlined text-slate-400 transition-transform group-hover:translate-x-0.5`}>chevron_right</span>
                            </div>
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
      
      <button 
        onClick={handleOpenNewBottomSheet}
        className={`fixed bottom-8 right-8 md:bottom-12 md:right-[calc(50vw-200px)] w-14 h-14 rounded-full shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center z-40 border-0 cursor-pointer ${isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'}`}
      >
        <span className="material-symbols-outlined text-3xl">add</span>
      </button>

      {/* Bottom Sheet Overlay */}
      <div 
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isBottomSheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => { setIsBottomSheetOpen(false); setScannedImage(null); }}
      >
        <div 
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md rounded-t-[2rem] p-6 pt-2 transition-transform duration-300 transform ${isBottomSheetOpen ? 'translate-y-0 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]' : 'translate-y-full'} ${isDarkMode ? 'bg-slate-900 border-t border-slate-800' : 'bg-slate-50 border-t border-slate-200'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag Handle */}
          <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-6" />

          {/* Extracted Input Form */}
          <div className="relative">
            {isScanning && (
              <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center rounded-[2rem] backdrop-blur-md ${isDarkMode ? 'bg-black/60 text-white' : 'bg-white/70 text-slate-800'}`}>
                <span className="material-symbols-outlined text-4xl animate-bounce text-indigo-500 mb-2">document_scanner</span>
                <p className="font-medium animate-pulse">AI Scanning Receipt...</p>
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
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>RM</span>
                  <input 
                    type="number" 
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    className={`w-full max-w-[200px] text-center text-7xl font-bold bg-transparent border-none outline-none p-0 m-0 transition-all 
                               ${isDarkMode ? 'text-slate-200 placeholder-slate-700' : 'text-slate-800 placeholder-slate-300'}
                               ${scannedImage ? 'text-indigo-500 dark:text-indigo-400 drop-shadow-[0_0_12px_rgba(99,102,241,0.3)] animate-pulse' : ''}`}
                  />
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
                  {CATEGORIES.map(cat => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
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
                        await handleDeleteExpense(editingId, e as any);
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
    </div>
  </div>
  );
}
