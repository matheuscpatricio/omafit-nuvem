import React from 'react';
import { Loader2, X } from 'lucide-react';
import type { WidgetTranslationKey } from './widget-translations';

type TranslateFn = (key: WidgetTranslationKey, vars?: Record<string, string>) => string;

export interface ShopperProfileRestorePromptProps {
  mode: 'restore';
  primaryColor: string;
  contrastText: string;
  t: TranslateFn;
  onContinue: () => void;
  onUpdateMeasurements: () => void;
  onForget?: () => void;
  forgetting?: boolean;
}

export interface ShopperProfileSaveCompactPromptProps {
  mode: 'save-compact';
  primaryColor: string;
  t: TranslateFn;
  consentChecked: boolean;
  onConsentChange: (checked: boolean) => void;
  onDismiss: () => void;
  saving?: boolean;
  saved?: boolean;
  saveError?: string | null;
}

export type ShopperProfilePromptProps =
  | ShopperProfileRestorePromptProps
  | ShopperProfileSaveCompactPromptProps;

export function ShopperProfilePrompt(props: ShopperProfilePromptProps) {
  if (props.mode === 'restore') {
    return (
      <div className="omafit-shopper-restore rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h4 className="omafit-shopper-restore-title text-lg font-semibold text-gray-900">
          {props.t('shopperProfileWelcomeBack')}
        </h4>
        <p className="omafit-shopper-restore-desc mt-1 text-sm text-gray-600">
          {props.t('shopperProfileWelcomeBackDesc')}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={props.onContinue}
            className="omafit-shopper-restore-primary flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: props.primaryColor, color: props.contrastText }}
          >
            {props.t('shopperProfileContinue')}
          </button>
          <button
            type="button"
            onClick={props.onUpdateMeasurements}
            className="omafit-shopper-restore-secondary flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            {props.t('shopperProfileUpdateMeasurements')}
          </button>
        </div>
        {props.onForget ? (
          <button
            type="button"
            onClick={props.onForget}
            disabled={props.forgetting}
            className="omafit-shopper-restore-forget mt-3 text-xs text-gray-500 underline transition-colors hover:text-gray-700 disabled:opacity-50"
          >
            {props.t('shopperProfileForget')}
          </button>
        ) : null}
      </div>
    );
  }

  const { consentChecked, onConsentChange, onDismiss, saving, saved, saveError, primaryColor, t } = props;

  if (saved) {
    return (
      <div className="omafit-shopper-save-compact omafit-shopper-save-compact-saved mx-auto mt-4 max-w-xs rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-center">
        <p className="omafit-shopper-save-compact-saved-text text-xs font-medium text-green-800">
          {t('shopperProfileSavedCompact')}
        </p>
      </div>
    );
  }

  return (
    <div className="omafit-shopper-save-compact mx-auto mt-4 max-w-xs rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left shadow-sm">
      <div className="flex items-start gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer select-none items-start gap-2">
          <input
            type="checkbox"
            checked={consentChecked}
            disabled={saving}
            onChange={(e) => onConsentChange(e.target.checked)}
            className="omafit-shopper-save-compact-checkbox mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-gray-300"
            style={{ accentColor: primaryColor }}
          />
          <span className="min-w-0">
            <span className="omafit-shopper-save-compact-title block text-xs font-medium leading-snug text-gray-800">
              {t('shopperProfileSaveCompactTitle')}
            </span>
            <span className="omafit-shopper-save-compact-consent mt-0.5 block text-[10px] leading-tight text-gray-500">
              {t('shopperProfileSaveCompactConsent')}
            </span>
          </span>
        </label>
        {saving ? (
          <Loader2
            className="omafit-shopper-save-compact-spinner h-3.5 w-3.5 shrink-0 animate-spin text-gray-400"
            aria-hidden="true"
          />
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="omafit-shopper-save-compact-dismiss shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:text-gray-600"
            aria-label={t('shopperProfileSaveDismiss')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {saveError ? (
        <p className="omafit-shopper-save-compact-error mt-1.5 text-[10px] text-red-600">{saveError}</p>
      ) : null}
    </div>
  );
}
