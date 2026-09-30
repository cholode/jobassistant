import { create } from 'zustand';
import type { Snapshot } from '../../shared/protocol';
export const useDesktopStore = create<{
  snapshot: Snapshot | null;
  set: (snapshot: Snapshot) => void;
}>((set) => ({ snapshot: null, set: (snapshot) => set({ snapshot }) }));
