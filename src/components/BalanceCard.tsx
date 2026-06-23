import React from 'react';

interface BalanceCardProps {
  balance: number;
  walletAddress?: string;
  budgetLimit: number;
  budgetUsed: number;      // 0–100
  isOverBudget: boolean;
  currencySymbol?: string;
}

const BalanceCard: React.FC<BalanceCardProps> = ({
  balance,
  walletAddress = '0x1234...ABCD',
  budgetLimit,
  budgetUsed,
  isOverBudget,
  currencySymbol = 'RM',
}) => {
  const safeBalance = typeof balance === 'number' && !isNaN(balance) ? balance : parseFloat(String(balance)) || 0;
  const intPart = safeBalance.toFixed(2).split('.')[0];
  const decPart = safeBalance.toFixed(2).split('.')[1];
  const remaining = Math.max(0, budgetLimit - safeBalance);

  const barColor = isOverBudget
    ? 'rgba(239,68,68,0.9)'
    : budgetUsed > 70
    ? 'rgba(245,158,11,0.9)'
    : 'rgba(255,255,255,0.85)';

  return (
    <div style={{
      background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #a855f7 100%)',
      borderRadius: '1.5rem',
      padding: '1.5rem',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(79,70,229,0.38)',
    }}>
      {/* Decorative orbs */}
      <div style={{ position:'absolute', top:'-40px', right:'-40px', width:'140px', height:'140px', borderRadius:'50%', background:'rgba(255,255,255,0.10)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'-25px', left:'20px', width:'100px', height:'100px', borderRadius:'50%', background:'rgba(255,255,255,0.06)', pointerEvents:'none' }} />

      {/* Label */}
      <p style={{ margin:0, fontSize:'0.65rem', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(255,255,255,0.65)', marginBottom:'0.4rem' }}>
        Total Spent
      </p>

      {/* Amount */}
      <div style={{ display:'flex', alignItems:'flex-end', gap:'2px', marginBottom:'1rem' }}>
        <span style={{ fontSize:'1.1rem', fontWeight:600, color:'rgba(255,255,255,0.75)', marginBottom:'6px', marginRight:'2px' }}>{currencySymbol}</span>
        <span style={{ fontSize:'3rem', fontWeight:800, color:'#fff', letterSpacing:'-2px', lineHeight:1 }}>{intPart}</span>
        <span style={{ fontSize:'1.4rem', fontWeight:700, color:'rgba(255,255,255,0.8)', marginBottom:'5px' }}>.{decPart}</span>
      </div>

      {/* Budget bar (only if budgetLimit set) */}
      {budgetLimit > 0 && (
        <div style={{ marginBottom:'0.85rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.35rem' }}>
            <span style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.6)', fontWeight:600 }}>
              {isOverBudget ? '⚠️ Near limit' : 'Budget used'}
            </span>
            <span style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.75)', fontWeight:700 }}>
              {currencySymbol}{remaining.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} left
            </span>
          </div>
          {/* Track */}
          <div style={{ width:'100%', height:'5px', borderRadius:'99px', background:'rgba(0,0,0,0.25)' }}>
            <div style={{
              height:'5px', borderRadius:'99px',
              width:`${budgetUsed}%`,
              background: barColor,
              transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)',
            }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:'0.25rem' }}>
            <span style={{ fontSize:'0.6rem', color:'rgba(255,255,255,0.45)' }}>{currencySymbol}0</span>
            <span style={{ fontSize:'0.6rem', color:'rgba(255,255,255,0.45)' }}>{currencySymbol}{budgetLimit.toLocaleString('en-US')}</span>
          </div>
        </div>
      )}

      {/* Wallet address pill */}
      <div style={{
        display:'flex', alignItems:'center', gap:'0.4rem',
        background:'rgba(0,0,0,0.22)', borderRadius:'0.75rem',
        padding:'0.45rem 0.7rem', backdropFilter:'blur(8px)',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize:'13px', color:'rgba(255,255,255,0.65)' }}>account_balance_wallet</span>
        <span style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.7)', fontFamily:'monospace', letterSpacing:'0.04em' }}>{walletAddress}</span>
      </div>
    </div>
  );
};

export default BalanceCard;
