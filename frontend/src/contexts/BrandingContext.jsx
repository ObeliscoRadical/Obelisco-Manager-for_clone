import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import {
  applyBrandingToDocument,
  buildBrandingFromSettings,
  cacheBranding,
  DEFAULT_BRANDING_PAYLOAD,
  fetchPublicBranding,
  getCachedBranding,
  normalizeBrandingPayload,
} from '../lib/branding';

const BrandingContext = createContext({
  branding: DEFAULT_BRANDING_PAYLOAD,
  loading: true,
  refreshBranding: async () => {},
  applyBrandingFromSettings: () => {},
});

export function BrandingProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [branding, setBranding] = useState(() => getCachedBranding());
  const [loading, setLoading] = useState(true);

  const commitBranding = useCallback((nextBranding) => {
    const normalized = normalizeBrandingPayload(nextBranding);
    setBranding(normalized);
    cacheBranding(normalized);
    applyBrandingToDocument(normalized);
  }, []);

  useEffect(() => {
    applyBrandingToDocument(getCachedBranding());
  }, []);

  const refreshBranding = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      if (user && user.__kind !== 'tech') {
        const { data } = await api.get('/system-settings');
        commitBranding(buildBrandingFromSettings(data, user));
      } else {
        const publicBranding = await fetchPublicBranding({
          companyId: user?.company_id || null,
          companySlug: user?.company_slug || null,
        });
        commitBranding(publicBranding);
      }
    } catch {
      commitBranding(getCachedBranding());
    } finally {
      setLoading(false);
    }
  }, [authLoading, commitBranding, user]);

  useEffect(() => {
    if (!authLoading) {
      refreshBranding();
    }
  }, [authLoading, refreshBranding]);

  const applyBrandingFromSettings = useCallback((settingsPayload) => {
    const next = buildBrandingFromSettings(settingsPayload, user || {});
    commitBranding(next);
  }, [commitBranding, user]);

  const value = useMemo(() => ({
    branding,
    loading,
    refreshBranding,
    applyBrandingFromSettings,
  }), [branding, loading, refreshBranding, applyBrandingFromSettings]);

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);