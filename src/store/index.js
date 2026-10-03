import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { api } from './api';
import auth from './authSlice';
import toast from './toastSlice';
import search, { setOrigin } from './searchSlice';
import { saveOrigin } from '../lib/origin';

// Keep the origin per tab, so a detected location survives a reload
const persistOrigin = createListenerMiddleware();
persistOrigin.startListening({
  actionCreator: setOrigin,
  effect: ({ payload }) => saveOrigin(payload),
});

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth,
    toast,
    search,
  },
  middleware: getDefault => getDefault()
    .prepend(persistOrigin.middleware)
    .concat(api.middleware),
});
