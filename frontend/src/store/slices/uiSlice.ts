import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface UiState {
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  loading: boolean;
  activeModal: string | null;
}

const initialState: UiState = {
  sidebarOpen: true,
  mobileMenuOpen: false,
  loading: false,
  activeModal: null,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
    },
    setMobileMenuOpen(state, action: PayloadAction<boolean>) {
      state.mobileMenuOpen = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setActiveModal(state, action: PayloadAction<string | null>) {
      state.activeModal = action.payload;
    },
  },
});

export const { toggleSidebar, setSidebarOpen, setMobileMenuOpen, setLoading, setActiveModal } =
  uiSlice.actions;
export default uiSlice.reducer;
