import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Crosshair, MapPin, Navigation, Search } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { apiFetch } from '../lib/api';
import type { TechnicianPublicProfile } from '../types';

export interface Coordinates {
  lat: number;
  lng: number;
}

function MapsUnconfiguredNotice({ lang }: { lang: 'ar' | 'en' }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
      <MapPin className="w-7 h-7 mx-auto text-[#C8A24E] mb-2" />
      <p className="text-sm font-semibold text-neutral-900 dark:text-stone-100">
        {lang === 'ar'
          ? 'خدمة خرائط Google Maps غير مفعّلة بعد (بانتظار مفتاح API)'
          : 'Google Maps Platform is not activated yet (awaiting API key)'}
      </p>
      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
        {lang === 'ar'
          ? 'يمكنك مشاركة إحداثيات GPS من متصفحك مباشرة، أو تفعيل VITE_GOOGLE_MAPS_API_KEY لعرض الخريطة التفاعلية وحساب المسار.'
          : 'You can still capture GPS coordinates from your browser, or configure VITE_GOOGLE_MAPS_API_KEY to enable the interactive map and live routing.'}
      </p>
    </div>
  );
}

interface AutocompleteSuggestionLike {
  placePrediction?: {
    text: { text: string };
    toPlace: () => {
      fetchFields: (opts: { fields: string[] }) => Promise<void>;
      formattedAddress?: string;
      location?: { lat: () => number; lng: () => number };
    };
  };
}

function PlacesAutocompleteInput({
  lang,
  onSelect,
}: {
  lang: 'ar' | 'en';
  onSelect: (coords: Coordinates, formattedAddress: string) => void;
}) {
  const placesLib = useMapsLibrary('places');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestionLike[]>([]);
  const sessionTokenRef = useRef<unknown>(null);

  useEffect(() => {
    if (!placesLib || !query.trim()) {
      setSuggestions([]);
      return;
    }
    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib as any;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }
    let cancelled = false;
    AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      sessionToken: sessionTokenRef.current,
    })
      .then((res: { suggestions?: AutocompleteSuggestionLike[] }) => {
        if (!cancelled) setSuggestions(res.suggestions || []);
      })
      .catch((err: unknown) => {
        const msg = String((err as any)?.message || err || '');
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [placesLib, query]);

  const handlePick = async (suggestion: AutocompleteSuggestionLike) => {
    if (!suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['formattedAddress', 'location', 'displayName'],
      });
      if (place.location) {
        const lat = place.location.lat();
        const lng = place.location.lng();
        const addr = place.formattedAddress || suggestion.placePrediction.text.text;
        onSelect({ lat, lng }, addr);
        setQuery(addr);
      }
      sessionTokenRef.current = null;
      setSuggestions([]);
    } catch {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-[#131316] rounded-lg px-3 py-2">
        <Search className="w-4 h-4 text-neutral-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            lang === 'ar' ? 'ابحث عن العنوان أو الحي عبر Google Places...' : 'Search address via Google Places...'
          }
          className="w-full bg-transparent text-sm text-neutral-900 dark:text-stone-100 focus:outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141418] shadow-xl max-h-56 overflow-y-auto">
          {suggestions.map((s, idx) => (
            <li
              key={idx}
              onClick={() => void handlePick(s)}
              className="px-3 py-2.5 text-sm text-neutral-800 dark:text-stone-200 hover:bg-[#C8A24E]/10 cursor-pointer border-b last:border-b-0 border-neutral-100 dark:border-neutral-800"
            >
              {s.placePrediction?.text.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const LocationPickerMap: React.FC<{
  value: Coordinates | null;
  address: string;
  onChange: (coords: Coordinates, resolvedAddress?: string) => void;
  heightClass?: string;
}> = ({ value, address, onChange, heightClass = 'h-[320px]' }) => {
  const { mapsApiKey, lang, gmpQuotaExceeded } = useApp();
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      setGeoError(lang === 'ar' ? 'المتصفح لا يدعم تحديد الموقع.' : 'Geolocation unsupported.');
      return;
    }
    setLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {
          lat: Math.round(pos.coords.latitude * 1000000) / 1000000,
          lng: Math.round(pos.coords.longitude * 1000000) / 1000000,
        };
        let resolvedAddr = address;
        try {
          const geo = await apiFetch<any>(`/api/maps/geocode?latlng=${coords.lat},${coords.lng}`);
          if (geo?.results?.[0]?.formatted_address) {
            resolvedAddr = geo.results[0].formatted_address;
          }
        } catch {
          // If server geocoding key not available, still keep genuine GPS coordinates
        }
        onChange(coords, resolvedAddr);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setGeoError(err.message || (lang === 'ar' ? 'تعذر الحصول على الموقع.' : 'Could not fetch GPS position.'));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleUseCurrentGps}
          disabled={locating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C8A24E] text-black text-xs font-semibold hover:bg-[#DFBE6F] transition-colors disabled:opacity-60 whitespace-nowrap"
        >
          <Crosshair className="w-4 h-4" />
          {locating
            ? lang === 'ar'
              ? 'جاري تحديد موقعك...'
              : 'Locating GPS...'
            : lang === 'ar'
            ? 'تحديد موقعي الحالي (GPS)'
            : 'Use Current GPS Location'}
        </button>

        {value && (
          <span className="text-xs font-mono-num text-neutral-600 dark:text-neutral-400">
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          </span>
        )}
      </div>

      {geoError && <p className="text-xs text-red-500">{geoError}</p>}

      {!mapsApiKey || gmpQuotaExceeded ? (
        <MapsUnconfiguredNotice lang={lang} />
      ) : (
        <APIProvider apiKey={mapsApiKey} language={lang} region="EG">
          <PlacesAutocompleteInput
            lang={lang}
            onSelect={(coords, addr) => onChange(coords, addr)}
          />
          <div className={`w-full ${heightClass} rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800`}>
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultCenter={value || { lat: 30.0444, lng: 31.2357 }}
              center={value || undefined}
              defaultZoom={value ? 15 : 11}
              gestureHandling="greedy"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              onClick={async (ev) => {
                const ll = ev.detail.latLng;
                if (!ll) return;
                const coords = { lat: ll.lat, lng: ll.lng };
                let resolvedAddr = address;
                try {
                  const geo = await apiFetch<any>(`/api/maps/geocode?latlng=${coords.lat},${coords.lng}`);
                  if (geo?.results?.[0]?.formatted_address) {
                    resolvedAddr = geo.results[0].formatted_address;
                  }
                } catch {
                  // keep existing address
                }
                onChange(coords, resolvedAddr);
              }}
              style={{ width: '100%', height: '100%' }}
            >
              {value && (
                <AdvancedMarker position={value}>
                  <Pin background="#C8A24E" borderColor="#0A0A0B" glyphColor="#0A0A0B" />
                </AdvancedMarker>
              )}
            </GoogleMap>
          </div>
        </APIProvider>
      )}
    </div>
  );
};

function TechnicianMarker({
  tech,
  onSelect,
}: {
  tech: TechnicianPublicProfile;
  onSelect: (t: TechnicianPublicProfile) => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  if (typeof tech.baseLat !== 'number' || typeof tech.baseLng !== 'number') return null;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: tech.baseLat, lng: tech.baseLng }}
        onClick={() => setOpen(true)}
      >
        <Pin
          background={tech.subscriptionPlanId === 'PREMIUM' ? '#C8A24E' : '#18181B'}
          borderColor="#C8A24E"
          glyphColor={tech.subscriptionPlanId === 'PREMIUM' ? '#0A0A0B' : '#FAFAF9'}
        />
      </AdvancedMarker>
      {open && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)}>
          <div className="p-1 text-neutral-900 min-w-[160px]">
            <p className="font-bold text-sm">{tech.displayName}</p>
            <p className="text-xs text-neutral-600 mt-0.5">
              ★ {tech.ratingAvg.toFixed(1)} ({tech.ratingCount})
              {typeof tech.distanceKm === 'number' ? ` · ${tech.distanceKm} km` : ''}
            </p>
            <button
              type="button"
              onClick={() => onSelect(tech)}
              className="mt-2 px-2.5 py-1 rounded bg-neutral-900 text-[#C8A24E] text-xs font-semibold"
            >
              Select
            </button>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export const TechnicianDiscoveryMap: React.FC<{
  customerCoords: Coordinates | null;
  technicians: TechnicianPublicProfile[];
  onSelectTechnician: (tech: TechnicianPublicProfile) => void;
}> = ({ customerCoords, technicians, onSelectTechnician }) => {
  const { mapsApiKey, lang, gmpQuotaExceeded } = useApp();

  if (!mapsApiKey || gmpQuotaExceeded) {
    return <MapsUnconfiguredNotice lang={lang} />;
  }

  const firstTechWithCoords = technicians.find(
    (t) => typeof t.baseLat === 'number' && typeof t.baseLng === 'number'
  );
  const center =
    customerCoords ||
    (firstTechWithCoords
      ? { lat: firstTechWithCoords.baseLat!, lng: firstTechWithCoords.baseLng! }
      : { lat: 30.0444, lng: 31.2357 });

  return (
    <APIProvider apiKey={mapsApiKey} language={lang} region="EG">
      <div className="w-full h-[360px] rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={center}
          center={customerCoords || undefined}
          defaultZoom={12}
          gestureHandling="greedy"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          {customerCoords && (
            <AdvancedMarker position={customerCoords}>
              <Pin background="#2563EB" borderColor="#FFFFFF" glyphColor="#FFFFFF" />
            </AdvancedMarker>
          )}
          {technicians.map((tech) => (
            <TechnicianMarker key={tech.uid} tech={tech} onSelect={onSelectTechnician} />
          ))}
        </GoogleMap>
      </div>
    </APIProvider>
  );
};

interface PolylineLike {
  setMap: (map: unknown) => void;
  setOptions: (opts: { strokeColor: string; strokeWeight: number }) => void;
}

function RoutePolylineOverlay({
  origin,
  destination,
  onStats,
}: {
  origin: Coordinates;
  destination: Coordinates;
  onStats: (stats: { distanceKm: number; durationMin: number } | null) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<PolylineLike[]>([]);

  useEffect(() => {
    if (!routesLib || !map) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    const request = {
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    let cancelled = false;
    (routesLib as any).Route
      .computeRoutes(request)
      .then(({ routes }: { routes: any[] }) => {
        if (cancelled || !routes || routes.length === 0) return;
        const primary = routes[0];
        const lines: PolylineLike[] = primary.createPolylines();
        lines.forEach((poly) => {
          poly.setOptions({ strokeColor: '#C8A24E', strokeWeight: 5 });
          poly.setMap(map);
        });
        polylinesRef.current = lines;
        if (primary.viewport) map.fitBounds(primary.viewport);
        onStats({
          distanceKm: Math.round(((primary.distanceMeters || 0) / 1000) * 10) / 10,
          durationMin: Math.max(1, Math.round((primary.durationMillis || 0) / 60000)),
        });
      })
      .catch((err: any) => {
        const msg = String(err?.message || err || '');
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onStats(null);
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, origin.lat, origin.lng, destination.lat, destination.lng, onStats]);

  return null;
}

export const OrderLiveTrackingMap: React.FC<{
  destination: Coordinates;
  technicianCoords: Coordinates | null;
}> = ({ destination, technicianCoords }) => {
  const { mapsApiKey, lang, gmpQuotaExceeded } = useApp();
  const [routeStats, setRouteStats] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const handleStats = useCallback(
    (s: { distanceKm: number; durationMin: number } | null) => setRouteStats(s),
    []
  );

  if (!mapsApiKey || gmpQuotaExceeded) {
    return <MapsUnconfiguredNotice lang={lang} />;
  }

  return (
    <div className="space-y-3">
      {routeStats && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-[#C8A24E]/30 bg-[#C8A24E]/5 text-sm">
          <span className="inline-flex items-center gap-2 font-medium text-neutral-900 dark:text-stone-100">
            <Navigation className="w-4 h-4 text-[#C8A24E]" />
            {lang === 'ar' ? 'تقدير وقت وصول الفني' : 'Estimated Technician Arrival'}
          </span>
          <span className="font-mono-num font-semibold text-[#C8A24E]">
            {routeStats.durationMin} {lang === 'ar' ? 'دقيقة' : 'min'} · {routeStats.distanceKm}{' '}
            {lang === 'ar' ? 'كم' : 'km'}
          </span>
        </div>
      )}
      <APIProvider apiKey={mapsApiKey} language={lang} region="EG">
        <div className="w-full h-[340px] rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={technicianCoords || destination}
            defaultZoom={13}
            gestureHandling="greedy"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            <AdvancedMarker position={destination}>
              <Pin background="#18181B" borderColor="#C8A24E" glyphColor="#C8A24E" />
            </AdvancedMarker>
            {technicianCoords && (
              <>
                <AdvancedMarker position={technicianCoords}>
                  <Pin background="#C8A24E" borderColor="#0A0A0B" glyphColor="#0A0A0B" />
                </AdvancedMarker>
                <RoutePolylineOverlay
                  origin={technicianCoords}
                  destination={destination}
                  onStats={handleStats}
                />
              </>
            )}
          </GoogleMap>
        </div>
      </APIProvider>
    </div>
  );
};
