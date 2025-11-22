import React from 'react';

export default function HeroHeader({ title, subtitle, logoSrc, rightLogoSrc }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 text-white mb-6">
      <div className="px-6 py-8 sm:px-10">
        <div className="flex items-center gap-4">
          {logoSrc && (
            <img src={logoSrc} alt="brand" className="h-10 w-auto drop-shadow" />
          )}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
            {subtitle && <p className="text-white/90 mt-1">{subtitle}</p>}
          </div>
          <div className="ml-auto">
            {rightLogoSrc && (
              <img src={rightLogoSrc} alt="partner" className="h-10 w-auto opacity-90" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
