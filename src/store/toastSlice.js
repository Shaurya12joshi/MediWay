import { createSlice } from '@reduxjs/toolkit';

// One toast at a time; `seq` restarts the timer when the same message is shown twice
const toastSlice = createSlice({
  name: 'toast',
  initialState: { message: '', seq: 0 },
  reducers: {
    showToast(state, { payload: message }) {
      state.message = message;
      state.seq += 1;
    },
  },
});

export const { showToast } = toastSlice.actions;
export default toastSlice.reducer;
