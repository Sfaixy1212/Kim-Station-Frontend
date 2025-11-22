import { useState } from 'react';

export default function OperatorLogos({ operators = [], selectedOperator, onSelect }) {
  const [imageErrors, setImageErrors] = useState(new Set());

  const handleImageError = (operatorId, logoUrl) => {
    console.error(`❌ Errore caricamento logo per ${operatorId}:`, logoUrl);
    setImageErrors(prev => new Set([...prev, operatorId]));
  };

  const handleLogoClick = (operatorId) => {
    onSelect(operatorId);
  };

  // Espandi SKY in 4 varianti - mostra tutti gli operatori anche senza logo
  const operatorsWithLogos = operators
    .flatMap(op => {
      // Se è SKY, espandi in 4 varianti usando i loghi specifici
      if (op.id === 'SKY' || String(op.name).toUpperCase() === 'SKY') {
        const variants = op.skyVariants || [];
        console.log('🔍 SKY variants ricevute:', variants);
        
        // Mappa ID operatore -> nome variante
        const variantMap = {
          3: 'TV',
          8: 'MOBILE',
          12: 'BUSINESS',
          14: 'BAR'
        };
        
        const expanded = variants
          .filter(v => variantMap[v.id]) // Solo varianti conosciute
          .map(v => ({
            id: `${op.id}::${variantMap[v.id]}`,
            name: `SKY ${variantMap[v.id]}`,
            logo: v.logo
          }));
        
        console.log('✅ SKY varianti espanse:', expanded);
        return expanded;
      }
      return [op];
    })
    .filter(op => op.logo); // Mostra solo operatori con logo definito (anche se fallisce il caricamento)
  
  console.log('📸 Operatori con loghi finali:', operatorsWithLogos);

  if (operatorsWithLogos.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Selezione rapida operatore</h3>
        <span className="text-xs text-gray-500">Click sul logo per selezionare</span>
      </div>
      
      {/* Barra loghi scrollabile */}
      <div className="relative">
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {operatorsWithLogos.map((op) => {
            const isSelected = selectedOperator === op.id || 
                              (typeof selectedOperator === 'string' && selectedOperator.startsWith(`${op.id}::`));
            
            return (
              <button
                key={op.id}
                onClick={() => handleLogoClick(op.id)}
                className={`
                  flex-shrink-0 relative group
                  w-32 h-32 rounded-xl overflow-hidden
                  transition-all duration-200
                  ${isSelected 
                    ? 'ring-4 ring-blue-500 shadow-lg scale-105' 
                    : 'ring-2 ring-gray-200 hover:ring-blue-300 hover:shadow-md hover:scale-102'
                  }
                  bg-white p-3
                `}
                title={op.name}
              >
                {/* Logo o placeholder */}
                {imageErrors.has(op.id) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50">
                    <div className="text-3xl font-bold text-gray-300">
                      {op.name.charAt(0)}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 text-center px-2">
                      {op.name}
                    </div>
                  </div>
                ) : (
                  <img
                    src={op.logo}
                    alt={op.name}
                    className="w-full h-full object-contain"
                    onError={() => handleImageError(op.id, op.logo)}
                    loading="lazy"
                  />
                )}
                
                {/* Badge selezionato */}
                {isSelected && (
                  <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                
                {/* Badge variante SKY */}
                {op.name.includes('SKY') && op.name !== 'SKY' && (
                  <div className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {op.name.replace('SKY ', '')}
                  </div>
                )}
                
                {/* Nome operatore al hover */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2">
                  <p className="text-xs font-medium text-white text-center truncate">
                    {op.name}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        
        {/* Gradient fade sui bordi per indicare scroll */}
        <div className="absolute top-0 left-0 h-full w-8 bg-gradient-to-r from-white to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-white to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
