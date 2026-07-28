import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

export class WidgetErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Omafit Widget]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-white p-6">
          <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
            <p className="text-base font-semibold text-red-900">Não foi possível carregar o provador</p>
            <p className="mt-2 text-sm text-red-800">
              Atualize a página. Se o problema continuar, entre em contato com a loja.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
