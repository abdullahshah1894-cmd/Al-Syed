import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Catches a crash in any page so the app shows what went wrong (with a way back)
// instead of a blank white screen. Nothing is lost: all data lives in the database.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[App crash]", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Moving to another page clears the error
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-rose-900/50 rounded-3xl p-6 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
          <h1 className="text-lg font-bold text-slate-100">This page hit an error</h1>
          <p className="text-xs text-slate-400">
            Your data is safe in the database. Reload the page, or open another page from the menu.
          </p>
          <pre className="text-[10px] text-rose-300 bg-slate-950 rounded-xl p-3 text-left whitespace-pre-wrap break-words max-h-40 overflow-auto">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2"
          >
            <RotateCcw size={14} /> Reload page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
