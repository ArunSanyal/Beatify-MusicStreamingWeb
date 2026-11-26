import { create } from "zustand";

// Holds who is signed in, for the UI only. The real session is the httpOnly
// cookie set by /api/login and /api/signup; nothing here is persisted to
// localStorage. The Navbar refills it from GET /api/session on page load.

type UserState = {
  username: string;
  premium: boolean;
  setUserData: (username: string, premium: boolean) => void;
  resetState: () => void;
};

const initialState = {
  username: "",
  premium: false,
};

export const useUserStore = create<UserState>()((set) => ({
  ...initialState,
  setUserData: (newUsername, newPremium) =>
    set({ username: newUsername, premium: newPremium }),
  resetState: () => set(initialState),
}));
