import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Workspace } from '../types';
import { MOCK_WORKSPACES } from '../mocks/seedData';
import { api } from '../lib/api';
import { USE_MOCK } from '../lib/env';

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  isLoading: boolean;
  loadWorkspaces: () => Promise<void>;
  setActiveWorkspaceId: (id: string) => void;
  createWorkspace: (name: string, color: string, emoji: string) => Promise<Workspace>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  /** Forget everything (called on sign-out so accounts never see each other's data). */
  reset: () => void;
  getActiveWorkspace: () => Workspace | undefined;
}

// Demo mode starts with the seeded workspaces. Real mode starts empty and
// fills from the server: a signed-in user's data must never come from
// localStorage or from the demo seed.
const initialWorkspaces = (): Workspace[] => (USE_MOCK ? MOCK_WORKSPACES : []);
const initialActiveId = (): string => (USE_MOCK ? MOCK_WORKSPACES[0].id : '');

let loadInFlight: Promise<void> | null = null;

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: initialWorkspaces(),
      activeWorkspaceId: initialActiveId(),
      isLoading: false,

      loadWorkspaces: () => {
        if (loadInFlight) return loadInFlight;
        set({ isLoading: true });
        loadInFlight = (async () => {
          try {
            const list = await api.getWorkspaces();
            set((state) => ({
              workspaces: list,
              isLoading: false,
              // Keep the selection if it still exists, else fall back to the first.
              activeWorkspaceId: list.some((w) => w.id === state.activeWorkspaceId)
                ? state.activeWorkspaceId
                : (list[0]?.id ?? ''),
            }));
          } catch {
            set({ isLoading: false });
          } finally {
            loadInFlight = null;
          }
        })();
        return loadInFlight;
      },

      setActiveWorkspaceId: (id: string) => {
        set({ activeWorkspaceId: id });
      },

      createWorkspace: async (name: string, color: string, emoji: string) => {
        const created = await api.createWorkspace(name, color, emoji);
        set((state) => ({
          workspaces: [created, ...state.workspaces],
          activeWorkspaceId: created.id,
        }));
        return created;
      },

      renameWorkspace: async (id: string, name: string) => {
        const updated = await api.updateWorkspace(id, { name });
        set((state) => ({
          workspaces: state.workspaces.map((w) => (w.id === id ? updated : w)),
        }));
      },

      deleteWorkspace: async (id: string) => {
        await api.deleteWorkspace(id);
        set((state) => {
          const remaining = state.workspaces.filter((w) => w.id !== id);
          return {
            workspaces: remaining,
            activeWorkspaceId:
              state.activeWorkspaceId === id ? (remaining[0]?.id ?? '') : state.activeWorkspaceId,
          };
        });
      },

      reset: () => {
        loadInFlight = null;
        set({ workspaces: initialWorkspaces(), activeWorkspaceId: initialActiveId(), isLoading: false });
      },

      getActiveWorkspace: () => {
        const { workspaces, activeWorkspaceId } = get();
        return workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];
      },
    }),
    {
      name: 'studypilot_workspace_storage',
      // Real mode: only the selected id is remembered; the list always comes
      // from the server.
      partialize: (state) =>
        USE_MOCK
          ? { workspaces: state.workspaces, activeWorkspaceId: state.activeWorkspaceId }
          : { activeWorkspaceId: state.activeWorkspaceId },
    }
  )
);
