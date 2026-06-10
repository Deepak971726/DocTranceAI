import type { User } from "@/types/api";
import { store } from "@/store";

export const settingsApi = {
  profile: async (): Promise<User | null> => {
    return store.getState().auth.user;
  },
};

