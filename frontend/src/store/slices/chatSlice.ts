import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface ChatState {
  activeConversationId: string | null;
  selectedDocumentIds: string[];
  draft: string;
  isStreaming: boolean;
  sidebarOpen: boolean;
  error: string | null;
}

const initialState: ChatState = {
  activeConversationId: null,
  selectedDocumentIds: [],
  draft: "",
  isStreaming: false,
  sidebarOpen: true,
  error: null,
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setActiveConversationId(state, action: PayloadAction<string | null>) {
      state.activeConversationId = action.payload;
    },
    setSelectedDocumentIds(state, action: PayloadAction<string[]>) {
      state.selectedDocumentIds = action.payload;
    },
    setDraft(state, action: PayloadAction<string>) {
      state.draft = action.payload;
    },
    setStreaming(state, action: PayloadAction<boolean>) {
      state.isStreaming = action.payload;
    },
    setChatSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
    },
    setChatError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    resetChatState(state) {
      state.draft = "";
      state.isStreaming = false;
      state.error = null;
    },
  },
});

export const {
  setActiveConversationId,
  setSelectedDocumentIds,
  setDraft,
  setStreaming,
  setChatSidebarOpen,
  setChatError,
  resetChatState,
} = chatSlice.actions;
export default chatSlice.reducer;
