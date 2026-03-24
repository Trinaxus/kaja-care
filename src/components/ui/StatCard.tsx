import { Video as LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'slate';
  action?: ReactNode;
  className?: string;
}

const colorClasses = {
  blue: {
    bg: 'from-blue-50 to-blue-100',
    border: 'border-blue-200',
    iconBg: 'bg-blue-500',
    text: 'text-blue-900',
    label: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700'
  },
  green: {
    bg: 'from-green-50 to-green-100',
    border: 'border-green-200',
    iconBg: 'bg-green-500',
    text: 'text-green-900',
    label: 'text-green-700',
    badge: 'bg-green-100 text-green-700'
  },
  orange: {
    bg: 'from-orange-50 to-orange-100',
    border: 'border-orange-200',
    iconBg: 'bg-orange-500',
    text: 'text-orange-900',
    label: 'text-orange-700',
    badge: 'bg-orange-100 text-orange-700'
  },
  red: {
    bg: 'from-red-50 to-red-100',
    border: 'border-red-200',
    iconBg: 'bg-red-500',
    text: 'text-red-900',
    label: 'text-red-700',
    badge: 'bg-red-100 text-red-700'
  },
  purple: {
    bg: 'from-purple-50 to-purple-100',
    border: 'border-purple-200',
    iconBg: 'bg-purple-500',
    text: 'text-purple-900',
    label: 'text-purple-700',
    badge: 'bg-purple-100 text-purple-700'
  },
  slate: {
    bg: 'from-slate-50 to-slate-100',
    border: 'border-slate-200',
    iconBg: 'bg-slate-500',
    text: 'text-slate-900',
    label: 'text-slate-700',
    badge: 'bg-slate-100 text-slate-700'
  }
};

export function StatCard({ icon: Icon, label, value, trend, color = 'slate', action, className = '' }: StatCardProps) {
  const colors = colorClasses[color];

  return (
    <div className={`bg-gradient-to-br ${colors.bg} rounded-2xl shadow-sm border ${colors.border} p-6 card-hover fade-in ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 ${colors.iconBg} rounded-xl flex items-center justify-center shadow-lg`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className={`text-sm font-semibold ${colors.label}`}>{label}</p>
            {trend && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                <span>{trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
              </div>
            )}
          </div>
        </div>
        {action && <div>{action}</div>}
      </div>
      <p className={`text-4xl font-bold ${colors.text}`}>{value}</p>
    </div>
  );
}
