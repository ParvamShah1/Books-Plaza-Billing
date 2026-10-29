"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

const listeners = new Set<(t: ToastItem) => void>();
let nextId = 1;

function emit(kind: ToastKind, message: string) {
  const t = { id: nextId++, kind, message };
  listeners.forEach((l) => l(t));
}

export const toast = {
  success: (message: string) => emit("success", message),
  error: (message: string) => {
    beep();
    emit("error", message);
  },
  info: (message: string) => emit("info", message),
};

// Short low beep so the cashier notices a failed scan without looking
let audioCtx: AudioContext | null = null;
export function beep() {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 220;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.18);
  } catch {
    // audio not available
  }
}

const styles: Record<ToastKind, string> = {
  success: "border-green-200 text-green-800",
  error: "border-red-200 text-red-700",
  info: "border-gray-200 text-neutral-700",
};

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (t: ToastItem) => {
      setToasts((prev) => [...prev.slice(-3), t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), t.kind === "error" ? 4000 : 2500);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 no-print">
      {toasts.map((t) => {
        const Icon = icons[t.kind];
        return (
          <div
            key={t.id}
            className={`glass-strong flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${styles[t.kind]}`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
