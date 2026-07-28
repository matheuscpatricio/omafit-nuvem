import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SizeCalculatorData } from '../SizeCalculator';
import type { WidgetTranslationKey } from '../widget-translations';
import {
  appendTryonHistory,
  applyForcedGenderToMeasurements,
  deleteShopperProfile,
  fetchShopperProfile,
  getOrCreateDeviceId,
  hasActiveMarketingWhatsappConsent,
  hasActiveShopperConsent,
  isValidShopperMeasurements,
  normalizeShopDomain,
  recordShopperProfileEvent,
  revokeShopperMarketingWhatsapp,
  saveShopperMarketingWhatsapp,
  saveShopperProfile,
  setShopperDeviceIdFromParent,
  shopperMeasurementsEqual,
  type ShopperProfile,
} from '../utils/shopperProfile';
import { isWhatsappMarketingEnabledForShop } from '../utils/whatsappPilotAccess';

const SHOPPER_RESTORE_DISMISS_PREFIX = 'omafit_shopper_restore_dismissed_v2:';
const SHOPPER_SAVE_DISMISS_PREFIX = 'omafit_shopper_save_dismissed_v1:';

type TranslateFn = (key: WidgetTranslationKey, vars?: Record<string, string>) => string;

export interface UseShopperProfileTryOnOptions {
  effectiveShopDomain: string;
  publicId: string;
  publicIdRef: React.MutableRefObject<string | undefined>;
  shopperDeviceIdProp?: string;
  step: 'info' | 'calculator' | 'photo' | 'processing' | 'result';
  setStep: (step: 'info' | 'calculator' | 'photo' | 'processing' | 'result') => void;
  sizeData: SizeCalculatorData | null;
  setSizeData: React.Dispatch<React.SetStateAction<SizeCalculatorData | null>>;
  tryOnEnabled: boolean | undefined;
  chartGenderScope: string | null;
  defaultGender: string;
  handleCalculatorContinueWithoutPhoto: (data: SizeCalculatorData) => void;
  result: string | null;
  recommendedSize: string | null;
  calculatedSize: string | null;
  analyticsSessionId: string;
  localProductHandle: string;
  productHandle: string;
  sessionModelImageUrlRef: React.MutableRefObject<string | null>;
  stylistEnabled: boolean;
  t: TranslateFn;
  setError: React.Dispatch<React.SetStateAction<string>>;
}

export function useShopperProfileTryOn(options: UseShopperProfileTryOnOptions) {
  const {
    effectiveShopDomain,
    publicId,
    publicIdRef,
    shopperDeviceIdProp = '',
    step,
    setStep,
    sizeData,
    setSizeData,
    tryOnEnabled,
    chartGenderScope,
    defaultGender,
    handleCalculatorContinueWithoutPhoto,
    result,
    recommendedSize,
    calculatedSize,
    analyticsSessionId,
    localProductHandle,
    productHandle,
    sessionModelImageUrlRef,
    stylistEnabled,
    t,
    setError,
  } = options;

  const [shopperProfile, setShopperProfile] = useState<ShopperProfile | null>(null);
  const [shopperProfileLoading, setShopperProfileLoading] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [restoreOfferLogged, setRestoreOfferLogged] = useState(false);
  const [shopperSaveConsent, setShopperSaveConsent] = useState(false);
  const [shopperSaveEmail, setShopperSaveEmail] = useState('');
  const [shopperProfileSaving, setShopperProfileSaving] = useState(false);
  const [shopperProfileSaved, setShopperProfileSaved] = useState(false);
  const [shopperSaveError, setShopperSaveError] = useState<string | null>(null);
  const [shopperSaveDismissed, setShopperSaveDismissed] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [whatsappPhotoConsent, setWhatsappPhotoConsent] = useState(false);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappSaved, setWhatsappSaved] = useState(false);
  const [whatsappRevoked, setWhatsappRevoked] = useState(false);
  const [whatsappRevoking, setWhatsappRevoking] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappDismissed, setWhatsappDismissed] = useState(false);
  const [shopperForgetting, setShopperForgetting] = useState(false);

  const loadShopperProfileRef = useRef<(() => void) | null>(null);
  const shopperProfileFetchSeqRef = useRef(0);
  const tryonHistoryRecordedRef = useRef('');
  const prevStepRef = useRef(step);

  const whatsappMarketingEnabled = isWhatsappMarketingEnabledForShop(
    effectiveShopDomain,
    stylistEnabled,
  );

  const getShopperProfileFetchConfig = () => {
    const shopDomain = normalizeShopDomain(effectiveShopDomain);
    if (!shopDomain) return null;
    return {
      shopDomain,
      publicId: (publicIdRef.current || publicId || '').trim(),
    };
  };

  const getShopperProfileWriteConfig = () => {
    const config = getShopperProfileFetchConfig();
    if (!config?.publicId) return null;
    return config;
  };

  const isRestoreDismissedThisSession = (shopDomain: string) => {
    const normalized = normalizeShopDomain(shopDomain);
    if (!normalized || typeof window === 'undefined') return false;
    try {
      return Boolean(window.sessionStorage.getItem(`${SHOPPER_RESTORE_DISMISS_PREFIX}${normalized}`));
    } catch {
      return false;
    }
  };

  const dismissRestorePromptForSession = (shopDomain: string) => {
    const normalized = normalizeShopDomain(shopDomain);
    if (!normalized || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(`${SHOPPER_RESTORE_DISMISS_PREFIX}${normalized}`, '1');
    } catch {
      /* ignore */
    }
  };

  const dismissSavePromptForSession = (shopDomain: string) => {
    const normalized = normalizeShopDomain(shopDomain);
    if (!normalized || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(`${SHOPPER_SAVE_DISMISS_PREFIX}${normalized}`, '1');
    } catch {
      /* ignore */
    }
  };

  const shouldOfferShopperRestore = (profile: ShopperProfile | null) => {
    if (!profile || !hasActiveShopperConsent(profile)) return false;
    if (!isValidShopperMeasurements(profile.measurements)) return false;
    if (isRestoreDismissedThisSession(effectiveShopDomain)) return false;
    return true;
  };

  const resolveForcedCalculatorGender = (
    scope: string | null,
    defGender: string,
  ): 'male' | 'female' | null => {
    if (scope === 'male' || scope === 'female') return scope;
    if (defGender === 'male' || defGender === 'female') return defGender;
    return null;
  };

  const handleAcceptShopperRestore = () => {
    if (!shopperProfile || !isValidShopperMeasurements(shopperProfile.measurements)) return;
    const forcedGender = resolveForcedCalculatorGender(chartGenderScope, defaultGender);
    const measurements = applyForcedGenderToMeasurements(shopperProfile.measurements, forcedGender);
    setShowRestorePrompt(false);
    setSizeData(measurements);
    const config = getShopperProfileWriteConfig();
    if (config) {
      void recordShopperProfileEvent(config, 'profile_accepted');
      void recordShopperProfileEvent(config, 'profile_skipped_calculator');
    }
    if (tryOnEnabled === false) {
      handleCalculatorContinueWithoutPhoto(measurements);
      return;
    }
    setStep('photo');
  };

  const handleDeclineShopperRestore = () => {
    setShowRestorePrompt(false);
    dismissRestorePromptForSession(effectiveShopDomain);
  };

  const handleUpdateShopperMeasurements = () => {
    setShowRestorePrompt(false);
    setStep('calculator');
  };

  const handleForgetShopperProfile = async () => {
    const config = getShopperProfileWriteConfig();
    if (!config) return;
    setShopperForgetting(true);
    try {
      await deleteShopperProfile(config);
      setShopperProfile(null);
      setShowRestorePrompt(false);
      setShopperProfileSaved(false);
      setShopperSaveConsent(false);
      setShopperSaveEmail('');
      dismissRestorePromptForSession(effectiveShopDomain);
    } catch {
      setError(t('shopperProfileDeleteError'));
    } finally {
      setShopperForgetting(false);
    }
  };

  const handleSaveShopperProfile = async (consentOverride?: boolean) => {
    const hasConsent = consentOverride ?? shopperSaveConsent;
    if (!sizeData || !hasConsent) return;
    const config = getShopperProfileWriteConfig();
    if (!config) return;
    setShopperProfileSaving(true);
    setShopperSaveError(null);
    try {
      const saved = await saveShopperProfile(config, sizeData, {
        email: shopperSaveEmail,
        event: 'profile_saved',
      });
      setShopperProfile(saved);
      setShopperProfileSaved(true);
    } catch {
      setShopperSaveError(t('shopperProfileSaveError'));
    } finally {
      setShopperProfileSaving(false);
    }
  };

  const handleShopperSaveConsentChange = (checked: boolean) => {
    setShopperSaveConsent(checked);
    if (checked) void handleSaveShopperProfile(true);
  };

  const handleDismissShopperSave = () => {
    setShopperSaveDismissed(true);
    dismissSavePromptForSession(effectiveShopDomain);
  };

  const shopperProfileStoredInDb =
    Boolean(shopperProfile) &&
    hasActiveShopperConsent(shopperProfile) &&
    isValidShopperMeasurements(shopperProfile?.measurements);

  const shopperMeasurementsMatchStoredProfile =
    shopperProfileStoredInDb &&
    Boolean(sizeData) &&
    isValidShopperMeasurements(sizeData) &&
    shopperMeasurementsEqual(sizeData, shopperProfile!.measurements);

  const shouldShowShopperSavePrompt =
    step === 'processing' &&
    tryOnEnabled !== false &&
    Boolean(sizeData) &&
    isValidShopperMeasurements(sizeData) &&
    !shopperSaveDismissed &&
    !shopperProfileLoading &&
    (shopperProfileSaved || shopperMeasurementsMatchStoredProfile || !shopperProfileStoredInDb);

  const shopperSavePromptShowsSaved =
    shopperProfileSaved || shopperMeasurementsMatchStoredProfile;

  const shouldShowWhatsappOptIn =
    step === 'result' &&
    whatsappMarketingEnabled &&
    tryOnEnabled !== false &&
    !whatsappDismissed &&
    !hasActiveMarketingWhatsappConsent(shopperProfile) &&
    !whatsappRevoked &&
    Boolean(getShopperProfileWriteConfig());

  const handleSaveWhatsappOptIn = async () => {
    const config = getShopperProfileWriteConfig();
    if (!config || !whatsappConsent || !whatsappPhone.trim()) return;
    const modelImageUrl = sessionModelImageUrlRef.current?.trim() || null;
    setWhatsappSaving(true);
    setWhatsappError(null);
    try {
      if (sizeData && !hasActiveShopperConsent(shopperProfile)) {
        const profile = await saveShopperProfile(config, sizeData, { event: 'profile_saved' });
        if (profile) setShopperProfile(profile);
      }
      const saved = await saveShopperMarketingWhatsapp(config, whatsappPhone, {
        modelImageUrl,
        marketingPhotoConsent: whatsappPhotoConsent,
      });
      if (saved) setShopperProfile(saved);
      setWhatsappSaved(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('OMAFIT_PII_ENCRYPTION_KEY') || msg.includes('503')) {
        setWhatsappError(t('shopperWhatsAppEncryptionError'));
      } else {
        setWhatsappError(t('shopperWhatsAppError'));
      }
    } finally {
      setWhatsappSaving(false);
    }
  };

  const loadShopperProfile = useCallback(() => {
    const config = getShopperProfileFetchConfig();
    if (!config) return;

    const seq = ++shopperProfileFetchSeqRef.current;
    setShopperProfileLoading(true);

    void fetchShopperProfile(config)
      .then((profile) => {
        if (shopperProfileFetchSeqRef.current !== seq) return;
        setShopperProfile(profile);
        if (profile?.email) setShopperSaveEmail(profile.email);
      })
      .catch((err) => {
        if (shopperProfileFetchSeqRef.current === seq) {
          console.warn('[shopperProfile] fetch error:', err);
        }
      })
      .finally(() => {
        if (shopperProfileFetchSeqRef.current === seq) {
          setShopperProfileLoading(false);
        }
      });
  }, [effectiveShopDomain, publicId, publicIdRef]);

  loadShopperProfileRef.current = loadShopperProfile;

  useEffect(() => {
    const incoming = String(shopperDeviceIdProp || '').trim();
    if (!incoming) return;
    if (setShopperDeviceIdFromParent(incoming)) loadShopperProfile();
  }, [shopperDeviceIdProp, loadShopperProfile]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    const deviceId = getOrCreateDeviceId();
    if (!deviceId) return;
    try {
      window.parent.postMessage(
        {
          type: 'omafit-device-id-adopt',
          deviceId,
          shopDomain: normalizeShopDomain(effectiveShopDomain),
        },
        '*',
      );
    } catch {
      /* ignore */
    }
  }, [effectiveShopDomain]);

  useEffect(() => {
    loadShopperProfile();
  }, [effectiveShopDomain, loadShopperProfile]);

  useEffect(() => {
    const enteredInfo = step === 'info' && prevStepRef.current !== 'info';
    prevStepRef.current = step;
    if (step === 'info') setRestoreOfferLogged(false);
    if (enteredInfo) loadShopperProfile();
  }, [step, effectiveShopDomain, loadShopperProfile]);

  useEffect(() => {
    if (step !== 'info') {
      setShowRestorePrompt(false);
      return;
    }
    if (shopperProfileLoading) return;
    setShowRestorePrompt(shouldOfferShopperRestore(shopperProfile));
  }, [step, shopperProfile, shopperProfileLoading, effectiveShopDomain]);

  useEffect(() => {
    if (!showRestorePrompt || restoreOfferLogged) return;
    const config = getShopperProfileWriteConfig();
    if (!config) return;
    setRestoreOfferLogged(true);
    void recordShopperProfileEvent(config, 'profile_offered');
  }, [showRestorePrompt, restoreOfferLogged, publicId, effectiveShopDomain]);

  useEffect(() => {
    if (!shopperSaveConsent || shopperProfileSaved || shopperProfileSaving || !sizeData) return;
    if (shopperMeasurementsMatchStoredProfile) return;
    const config = getShopperProfileWriteConfig();
    if (!config) return;
    void handleSaveShopperProfile(true);
  }, [
    publicId,
    effectiveShopDomain,
    shopperSaveConsent,
    shopperProfileSaved,
    sizeData,
    shopperProfile?.updated_at,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !effectiveShopDomain) return;
    const normalized = normalizeShopDomain(effectiveShopDomain);
    try {
      setShopperSaveDismissed(
        Boolean(window.sessionStorage.getItem(`${SHOPPER_SAVE_DISMISS_PREFIX}${normalized}`)),
      );
    } catch {
      setShopperSaveDismissed(false);
    }
  }, [effectiveShopDomain]);

  useEffect(() => {
    if (step !== 'result' || !sizeData) return;
    const config = getShopperProfileWriteConfig();
    if (!config || !shopperProfile || !hasActiveShopperConsent(shopperProfile)) return;

    const historyKey = [
      localProductHandle || productHandle || '',
      recommendedSize || calculatedSize || '',
      result || '',
      analyticsSessionId || '',
    ].join('|');
    if (tryonHistoryRecordedRef.current === historyKey) return;
    tryonHistoryRecordedRef.current = historyKey;

    void appendTryonHistory(config, {
      productHandle: localProductHandle || productHandle || null,
      recommendedSize: recommendedSize || calculatedSize || null,
      resultImageUrl: result || null,
      tryonSessionId: analyticsSessionId || null,
      modelImageUrl: sessionModelImageUrlRef.current,
    }).then((updated) => {
      if (updated) setShopperProfile(updated);
    });
  }, [
    step,
    result,
    recommendedSize,
    calculatedSize,
    analyticsSessionId,
    shopperProfile?.id,
    sizeData,
    localProductHandle,
    productHandle,
    sessionModelImageUrlRef,
  ]);

  return {
    loadShopperProfileRef,
    shopperProfileLoading,
    showRestorePrompt,
    handleAcceptShopperRestore,
    handleUpdateShopperMeasurements,
    handleForgetShopperProfile,
    shopperForgetting,
    shouldShowShopperSavePrompt,
    shopperSavePromptShowsSaved,
    shopperSaveConsent,
    handleShopperSaveConsentChange,
    handleDismissShopperSave,
    shopperProfileSaving,
    shopperSaveError,
    shouldShowWhatsappOptIn,
    whatsappPhone,
    setWhatsappPhone,
    whatsappConsent,
    setWhatsappConsent,
    whatsappPhotoConsent,
    setWhatsappPhotoConsent,
    handleSaveWhatsappOptIn,
    whatsappSaving,
    whatsappSaved,
    whatsappError,
    setWhatsappDismissed,
    hasActiveMarketingWhatsappConsent: hasActiveMarketingWhatsappConsent(shopperProfile),
    whatsappRevoked,
    whatsappRevoking,
    handleRevokeWhatsapp: async () => {
      const config = getShopperProfileWriteConfig();
      if (!config) return;
      setWhatsappRevoking(true);
      setWhatsappError(null);
      try {
        const updated = await revokeShopperMarketingWhatsapp(config);
        if (updated) setShopperProfile(updated);
        setWhatsappRevoked(true);
      } catch {
        setWhatsappError(t('shopperWhatsAppError'));
      } finally {
        setWhatsappRevoking(false);
      }
    },
    shopperProfile,
  };
}
