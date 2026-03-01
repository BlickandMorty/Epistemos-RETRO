'use client';

import type { PFCSet, PFCGet } from '../use-pfc-store';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
}

export interface ToastSliceState {
  toasts: Toast[];
}

export interface ToastSliceActions {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

let _toastId = 0;
const _toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const createToastSlice = (set: PFCSet, get: PFCGet) => ({
  toasts: [] as Toast[],

  addToast: (toast: Omit<Toast, 'id'>) => {
    const id = `toast-${++_toastId}`;
    const duration = toast.duration ?? 4000;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    if (duration > 0) {
      const timer = setTimeout(() => {
        _toastTimers.delete(id);
        set((s) => ({ toasts: s.toasts.filter((t: Toast) => t.id !== id) }));
      }, duration);
      _toastTimers.set(id, timer);
    }
  },

  removeToast: (id: string) => {
    const timer = _toastTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      _toastTimers.delete(id);
    }
    set((s) => ({ toasts: s.toasts.filter((t: Toast) => t.id !== id) }));
  },
});
