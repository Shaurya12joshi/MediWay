import { createSlice } from '@reduxjs/toolkit';

// Mirrors the Supabase session (kept in sync by the listener in main.jsx).
// `ready` turns true once Supabase has reported whether anyone is signed in.
const authSlice = createSlice({
  name: 'auth',
  initialState: { ready: false, user: null },
  reducers: {
    sessionChanged(state, { payload: session }) {
      state.ready = true;
      state.user = session ? { id: session.user.id, email: session.user.email } : null;
    },
  },
});

export const { sessionChanged } = authSlice.actions;
export default authSlice.reducer;
