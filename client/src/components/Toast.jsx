import React from "react";
import { CheckCircle2, AlertCircle, Sparkles, X, Info } from "lucide-react";

export default function Toast({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        let Icon = CheckCircle2;
        let iconColor = "text-emerald-400";
        if (toast.type === "error") {
          Icon = AlertCircle;
          iconColor = "text-rose-400";
        } else if (toast.type === "magic") {
          Icon = Sparkles;
          iconColor = "text-amber-400";
        } else if (toast.type === "info") {
          Icon = Info;
          iconColor = "text-cyan-400";
        }

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom duration-200"
            style={{
              boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 0 15px -3px var(--theme-glow, rgba(225, 29, 72, 0.2))"
            }}
          >
            <div className="flex items-center gap-2.5">
              <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
              <p className="text-xs font-semibold text-white tracking-wide leading-tight">
                {toast.message}
              </p>
            </div>
            {onDismiss && (
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-slate-400 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
