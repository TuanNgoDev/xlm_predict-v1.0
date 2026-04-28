import React, { useState, useCallback } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { cn } from './utils';

type ToastType = 'success' | 'error';
interface Toast { type: ToastType; msg: string }

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((type: ToastType, msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const ToastUI = toast ? (
    <div className={cn(
      'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-bold shadow-xl transition-all',
      toast.type === 'success'
        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
        : 'bg-red-500/20 border border-red-500/40 text-red-300'
    )}>
      {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
      {toast.msg}
    </div>
  ) : null;

  return { showToast, ToastUI };
}
