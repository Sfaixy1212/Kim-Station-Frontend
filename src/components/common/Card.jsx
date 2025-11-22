export default function Card({ title, subtitle, actions, icon, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm ring-1 ring-gray-100 hover:shadow transition-shadow flex flex-col ${className}`}>
      {(title || subtitle || actions) && (
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            {icon && <span className="w-4 h-4 text-gray-500 shrink-0 mb-1">{icon}</span>}
            {title && <h3 className="text-sm font-semibold text-gray-800 leading-tight truncate">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
          )}
        </div>
      )}
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}
