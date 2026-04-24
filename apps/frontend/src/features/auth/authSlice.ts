import { createSlice, PayloadAction, type Action, type ThunkAction } from "@reduxjs/toolkit";
import type { LoginResponse } from "@repo/dto";
import type { RootState } from "@/app/store";

const AUTH_TOKEN_STORAGE_KEY = "minimartek.auth.token";
const PERSIST_JWT_TO_LOCAL_STORAGE = import.meta.env.VITE_AUTH_PERSIST_JWT === "true";

function syncStoredToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!PERSIST_JWT_TO_LOCAL_STORAGE || !token) {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);

    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

function getInitialToken(): string | null {
  if (!PERSIST_JWT_TO_LOCAL_STORAGE || typeof window === "undefined") {
    return null;
  }

  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);

  return token && token.trim().length > 0 ? token : null;
}

export interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
}

const initialToken = getInitialToken();

const initialState: AuthState = {
  token: initialToken,
  isAuthenticated: Boolean(initialToken),
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentialsState: (state, action: PayloadAction<LoginResponse>) => {
      state.token = action.payload.access_token;
      state.isAuthenticated = true;
    },
    logoutState: (state) => {
      state.token = null;
      state.isAuthenticated = false;
    },
  },
});

const { setCredentialsState, logoutState } = authSlice.actions;

type AuthThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, Action>;

export const setCredentials =
  (payload: LoginResponse): AuthThunk =>
  (dispatch) => {
    syncStoredToken(payload.access_token);
    dispatch(setCredentialsState(payload));
  };

export const logout = (): AuthThunk => (dispatch) => {
  syncStoredToken(null);
  dispatch(logoutState());
};

export const selectAuth = (state: RootState) => state.auth;

export default authSlice.reducer;
