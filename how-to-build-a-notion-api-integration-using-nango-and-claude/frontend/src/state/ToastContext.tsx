import {
  createContext,
  use,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastVariant = "info" | "success" | "error";

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: {
    title: string;
    description?: string;
    variant?: ToastVariant;
  }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>(
    ({ title, description, variant = "info" }) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, title, description, variant }]);
      setTimeout(() => dismiss(id), 5500);
    },
    [dismiss],
  );

  return (
    <ToastContext value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-rise pointer-events-auto flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-lg shadow-stone-900/5"
          >
            {t.variant === "success" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            ) : t.variant === "error" ? (
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
            ) : (
              <Info className="mt-0.5 size-5 shrink-0 text-clay-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-stone-900">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-sm text-stone-500">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const ctx = use(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
