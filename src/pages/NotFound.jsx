import { Link } from 'react-router';
import { PinIcon } from '../components/icons';
import { useTitle } from '../components/ui';
import LanguagePicker from '../components/LanguagePicker';
import Footer from '../components/Footer';
import { useT } from '../i18n';
import { PAGE_DESCRIPTIONS } from '../lib/meta';

// Any address that leads nowhere. Netlify serves this with a real 404 status (netlify.toml).
// Someone on a dead link may need care now, so the way out is search and emergency help, not just "Home".
export default function NotFound() {
  const t = useT();
  useTitle(`${t('nf.title')} · MediWay`, PAGE_DESCRIPTIONS.notFound);
  return (
    <div className="min-h-screen flex flex-col bg-[#F8F2ED]">
      <nav className="flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/" className="flex items-center gap-3 no-underline">
          <div className="bg-[#D6453A] w-9 h-9 rounded-xl flex items-center justify-center"><PinIcon size={18} /></div>
          <span className="font-custom font-bold text-xl text-slate-900">MediWay</span>
        </Link>
        <LanguagePicker />
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="relative mb-6">
          <span className="font-custom font-bold text-[120px] sm:text-[160px] leading-none text-[#1E293B]/10 select-none" aria-hidden="true">404</span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-[#D6453A] w-16 h-16 rounded-2xl flex items-center justify-center shadow-[0_12px_30px_rgba(214,69,58,.35)] rotate-[-8deg]">
              <PinIcon size={30} />
            </div>
          </div>
        </div>
        <h1 className="font-custom font-bold text-3xl sm:text-4xl text-slate-900">{t('nf.title')}</h1>
        <p className="text-slate-500 text-[15px] max-w-md mt-3">{t('nf.text')}</p>
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          <Link to="/search" className="bg-[#D0423A] text-white text-sm font-semibold px-6 py-3 rounded-3xl hover:bg-[#B8362F] transition-colors no-underline">{t('nf.search')}</Link>
          <Link to="/emergency" className="flex items-center gap-2 border-2 border-[#F3C9C6] bg-white text-[#D0423A] text-sm font-semibold px-6 py-3 rounded-3xl hover:border-[#D0423A] transition-colors no-underline">
            <span className="w-2 h-2 rounded-full bg-[#D0423A]" />{t('nf.emergency')}
          </Link>
          <Link to="/" className="border-2 border-[#E6E6E1] text-slate-700 text-sm px-6 py-3 rounded-3xl hover:bg-white hover:border-slate-900 transition-all no-underline">{t('nf.home')}</Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
