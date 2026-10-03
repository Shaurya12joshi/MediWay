import { createBrowserRouter, Navigate, Outlet, ScrollRestoration, useLocation } from 'react-router';
import Toast from './components/Toast';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toast />
      <ScrollRestoration />
    </>
  );
}

// Pages other than the home page load on first visit, so the map and admin code stay out of the first download
const page = load => async () => ({ Component: (await load()).default });

// Addresses from the multi-page site: bookmarks, shared links and Supabase invite emails.
// Query and hash are kept (?id=…, ?city=…, #access_token=…). netlify.toml redirects these too.
const LEGACY_PAGES = {
  'index.html': '/',
  'searchResult.html': '/search',
  'profile.html': '/profile',
  'review.html': '/review',
  'auth.html': '/auth',
  'admin.html': '/admin',
};

function LegacyRedirect({ to }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    HydrateFallback: () => null,
    children: [
      { index: true, Component: Home },
      { path: 'search', lazy: page(() => import('./pages/search/SearchPage')) },
      { path: 'profile', lazy: page(() => import('./pages/Profile')) },
      { path: 'review', lazy: page(() => import('./pages/Review')) },
      { path: 'auth', lazy: page(() => import('./pages/Auth')) },
      { path: 'admin', lazy: page(() => import('./pages/admin/AdminPage')) },
      ...Object.entries(LEGACY_PAGES).map(([path, to]) => ({ path, element: <LegacyRedirect to={to} /> })),
      { path: '*', Component: NotFound },
    ],
  },
]);
