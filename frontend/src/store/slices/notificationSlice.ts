import { createSlice, nanoid, type PayloadAction } from "@reduxjs/toolkit";

export type NotificationTone = "success" | "warning" | "info" | "error";

export interface NotificationItem {
  id: string;
  title: string;
  description?: string;
  tone: NotificationTone;
}

export interface NotificationState {
  items: NotificationItem[];
}

const initialState: NotificationState = {
  items: [],
};

const notificationSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    pushNotification: {
      reducer(state, action: PayloadAction<NotificationItem>) {
        state.items.unshift(action.payload);
      },
      prepare(payload: Omit<NotificationItem, "id">) {
        return { payload: { ...payload, id: nanoid() } };
      },
    },
    dismissNotification(state, action: PayloadAction<string>) {
      state.items = state.items.filter((item) => item.id !== action.payload);
    },
    clearNotifications(state) {
      state.items = [];
    },
  },
});

export const { pushNotification, dismissNotification, clearNotifications } =
  notificationSlice.actions;
export default notificationSlice.reducer;
