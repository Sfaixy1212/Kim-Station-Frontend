import { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';

/**
 * Componente per autocomplete indirizzi con Google Places API
 * Richiede Google Maps JavaScript API con Places library
 */
export default function GooglePlacesAutocomplete({ 
  value, 
  onChange, 
  onPlaceSelected,
  placeholder = "Cerca indirizzo...",
  className = ""
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Verifica se Google Maps è già caricato
    if (window.google && window.google.maps && window.google.maps.places) {
      setIsLoaded(true);
      return;
    }

    // Carica Google Maps API
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places&language=it&region=IT`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsLoaded(true);
    script.onerror = () => {
      console.error('[GooglePlaces] Errore caricamento Google Maps API');
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup se necessario
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !inputRef.current) return;

    try {
      // Inizializza Autocomplete
      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'it' }, // Solo Italia
        fields: ['address_components', 'formatted_address', 'geometry', 'name']
      });

      // Listener per selezione place
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        
        if (!place.geometry) {
          console.warn('[GooglePlaces] Nessun dettaglio disponibile per:', place.name);
          return;
        }

        // Estrai componenti indirizzo
        const addressComponents = place.address_components || [];
        const extracted = {
          formattedAddress: place.formatted_address || '',
          street: '',
          streetNumber: '',
          city: '',
          province: '',
          postalCode: '',
          country: '',
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };

        addressComponents.forEach(component => {
          const types = component.types;
          
          if (types.includes('route')) {
            extracted.street = component.long_name;
          }
          if (types.includes('street_number')) {
            extracted.streetNumber = component.long_name;
          }
          if (types.includes('locality')) {
            extracted.city = component.long_name;
          }
          if (types.includes('administrative_area_level_2')) {
            extracted.province = component.short_name;
          }
          if (types.includes('postal_code')) {
            extracted.postalCode = component.long_name;
          }
          if (types.includes('country')) {
            extracted.country = component.long_name;
          }
        });

        // Costruisci indirizzo completo
        const fullAddress = [extracted.street, extracted.streetNumber]
          .filter(Boolean)
          .join(', ');

        console.log('[GooglePlaces] Place selezionato:', extracted);

        // Callback con dati estratti
        if (onPlaceSelected) {
          onPlaceSelected({
            indirizzoCompleto: fullAddress || extracted.formattedAddress,
            cap: extracted.postalCode,
            citta: extracted.city,
            provincia: extracted.province,
            latitudine: extracted.lat,
            longitudine: extracted.lng,
            formattedAddress: extracted.formattedAddress
          });
        }

        // Aggiorna input
        if (onChange) {
          onChange(fullAddress || extracted.formattedAddress);
        }
      });

    } catch (err) {
      console.error('[GooglePlaces] Errore inizializzazione:', err);
    }

    return () => {
      // Cleanup listener
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [isLoaded, onPlaceSelected, onChange]);

  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <MapPin className="w-4 h-4" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${className}`}
        disabled={!isLoaded}
      />
      {!isLoaded && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
}
