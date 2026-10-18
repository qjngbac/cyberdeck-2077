import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
  /** Escape hatch for crashes caused by persisted state, where "restart" just re-crashes. */
  secondaryAction?: { label: string; onClick: () => void };
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-950/90 text-red-200 select-none overflow-auto">
          <div className="max-w-md w-full p-5 rounded-lg border border-red-500/50 bg-red-950/30 backdrop-blur-md shadow-neon-pink flex flex-col gap-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
              <h3 className="font-bold tracking-wider text-sm">
                {this.props.fallbackTitle || '程序遇到不可恢复异常'}
              </h3>
            </div>

            <div className="text-xs font-mono bg-black/60 p-3 rounded border border-red-900/40 text-red-300 break-all max-h-36 overflow-y-auto">
              {this.state.error?.message || '未知运行时错误'}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              受保护的独立窗口沙箱已拦截此错误，桌面与其它应用不受影响。您可以尝试重新加载该模块。
            </p>

            <button
              onClick={this.handleReset}
              className="mt-2 flex items-center justify-center gap-2 py-2 px-4 rounded bg-red-600/80 hover:bg-red-500 text-white text-xs font-semibold tracking-wider transition-colors shadow-lg active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              重新启动该应用
            </button>

            {this.props.secondaryAction && (
              <button
                onClick={this.props.secondaryAction.onClick}
                className="flex items-center justify-center gap-2 py-2 px-4 rounded bg-slate-700/80 hover:bg-slate-600 text-slate-100 text-xs font-semibold tracking-wider transition-colors shadow-lg active:scale-95"
              >
                {this.props.secondaryAction.label}
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
