import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  type: ToastType;
  message: string;
  onClose: () => void;
  duration?: number;
}

const toastConfig = {
  success: {
    icon: CheckCircle2,
    className: 'bg-gradient-to-r from-green-500 to-emerald-500'
  },
  error: {
    icon: XCircle,
    className: 'bg-gradient-to-r from-red-500 to-rose-500'
  },
  warning: {
    icon: AlertCircle,
    className: 'bg-gradient-to-r from-orange-500 to-amber-500'
  },
  info: {
    icon: Info,
    className: 'bg-gradient-to-r from-blue-500 to-cyan-500'
  }
};

export function Toast({ type, message, onClose, duration = 5000 }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const config = toastConfig[type];
  const Icon = config.icon;

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className={`${isExiting ? 'slide-down' : 'slide-up'} ${config.className} text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 min-w-[320px] max-w-md`}>
      <Icon className="w-5 h-5 flex-shrink-0" />
      <p className="flex-1 font-medium text-sm">{message}</p>
      <button
        onClick={() => {
          setIsExiting(true);
          setTimeout(onClose, 300);
        }}
        className="flex-shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg p-1 transition"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts }: { toasts: Array<{ id: string; type: ToastType; message: string }> }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
      {toasts.map((toast) => (
        <Toast key={toast.id} type={toast.type} message={toast.message} onClose={() => {}} />
      ))}
    </div>
  );
}
