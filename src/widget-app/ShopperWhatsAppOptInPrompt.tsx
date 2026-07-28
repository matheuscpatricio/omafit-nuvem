import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import type { WidgetTranslationKey } from './widget-translations';

type TranslateFn = (key: WidgetTranslationKey, vars?: Record<string, string>) => string;

export interface ShopperWhatsAppOptInPromptProps {
  primaryColor: string;
  t: TranslateFn;
  phone: string;
  onPhoneChange: (value: string) => void;
  consentChecked: boolean;
  onConsentChange: (checked: boolean) => void;
  photoConsentChecked?: boolean;
  onPhotoConsentChange?: (checked: boolean) => void;
  showPhotoConsent?: boolean;
  onSubmit: () => void;
  onDismiss: () => void;
  saving?: boolean;
  saved?: boolean;
  error?: string | null;
}

function OptInCard(props: ShopperWhatsAppOptInPromptProps) {
  if (props.saved) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-green-200 bg-white p-5 text-center shadow-xl">
        <p className="text-sm font-medium text-green-800">{props.t('shopperWhatsAppSaved')}</p>
      </div>
    );
  }

  return (
    <div
      className="omafit-whatsapp-optin w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="omafit-whatsapp-optin-title"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <p id="omafit-whatsapp-optin-title" className="text-base font-semibold text-gray-900">
          {props.t('shopperWhatsAppTitle')}
        </p>
        <button
          type="button"
          onClick={props.onDismiss}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label={props.t('shopperWhatsAppDismiss')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="mb-4 text-sm text-gray-600">{props.t('shopperWhatsAppDesc')}</p>
      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-medium text-gray-700">{props.t('shopperWhatsAppPhoneLabel')}</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={props.phone}
          disabled={props.saving}
          onChange={(e) => props.onPhoneChange(e.target.value)}
          placeholder={props.t('shopperWhatsAppPhonePlaceholder')}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
        />
      </label>
      <label className="mb-3 flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={props.consentChecked}
          disabled={props.saving}
          onChange={(e) => props.onConsentChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
          style={{ accentColor: props.primaryColor }}
        />
        <span className="text-xs leading-snug text-gray-700">{props.t('shopperWhatsAppConsent')}</span>
      </label>
      {props.showPhotoConsent ? (
        <label className="mb-3 flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={props.photoConsentChecked}
            disabled={props.saving}
            onChange={(e) => props.onPhotoConsentChange?.(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
            style={{ accentColor: props.primaryColor }}
          />
          <span className="text-xs leading-snug text-gray-700">{props.t('shopperWhatsAppPhotoConsent')}</span>
        </label>
      ) : null}
      {props.error ? <p className="mb-3 text-xs text-red-600">{props.error}</p> : null}
      <button
        type="button"
        disabled={props.saving || !props.consentChecked || !props.phone.trim()}
        onClick={props.onSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        style={{ backgroundColor: props.primaryColor }}
      >
        {props.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {props.t('shopperWhatsAppSubmit')}
      </button>
    </div>
  );
}

export function ShopperWhatsAppOptInPrompt(props: ShopperWhatsAppOptInPromptProps) {
  const { saved, onDismiss } = props;

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => onDismiss(), 2200);
    return () => window.clearTimeout(timer);
  }, [saved, onDismiss]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const modal = (
    <div className="omafit-whatsapp-optin-overlay fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label={props.t('shopperWhatsAppDismiss')}
        onClick={onDismiss}
      />
      <div className="relative z-[121] w-full max-w-md animate-fade-in">
        <OptInCard {...props} />
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}
