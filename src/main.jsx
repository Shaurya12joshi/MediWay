import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router/dom';
import { store } from './store';
import { router } from './router';
import { supabase } from './lib/supabase';
import { sessionChanged } from './store/authSlice';
import './index.css';

// Fires once with the current session, then on every sign-in, sign-out and token refresh
supabase.auth.onAuthStateChange((_event, session) => store.dispatch(sessionChanged(session)));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>
);
