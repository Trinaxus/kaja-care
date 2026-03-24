export function LoadingSpinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4'
  };

  return (
    <div className={`${sizeClasses[size]} border-blue-500 border-t-transparent rounded-full animate-spin ${className}`}></div>
  );
}

export function LoadingState({ message = 'Lädt...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 fade-in">
      <LoadingSpinner size="lg" />
      <p className="mt-4 text-slate-600 font-medium">{message}</p>
    </div>
  );
}
