import { Link } from 'react-router';
import { PinIcon } from './icons';

const LINK = 'text-slate-500 text-sm hover:text-slate-900 transition-colors';

// `inner` sets the content width to match the page above it
export default function Footer({
  className = 'px-6 py-5 md:px-12 lg:px-16',
  inner = 'max-w-7xl mx-auto',
  links = 'flex items-center justify-center flex-wrap gap-x-5 gap-y-2',
}) {
  return (
    <footer className={`bg-[#F2F1ED] border-t border-slate-200 ${className}`}>
      <div className={`${inner} flex flex-col sm:flex-row items-center justify-between gap-4`}>

        <div className="flex items-center gap-3">
          <div className="bg-[#D6453A] w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
            <PinIcon size={16} />
          </div>
          <Link to="/" className="font-bold text-base hover:text-[#D6453A] font-custom lg:text-xl">MediWay</Link>
          <span className="hidden sm:block text-slate-300 text-sm">|</span>
          <span className="hidden sm:block text-slate-500 text-sm">Healthcare discovery for travelers in India</span>
        </div>

        <div className={links}>
          <a href="#" className={LINK}>Privacy</a>
          <a href="#" className={LINK}>Terms</a>
          <a href="mailto:shaurya12joshi@gmail.com" className={LINK}>Contact</a>
          <a href="https://www.instagram.com/mediway.in/" target="_blank" rel="noopener noreferrer" aria-label="MediWay on Instagram" title="Instagram" className="text-slate-500 hover:text-slate-900 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <circle cx="12" cy="12" r="4" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
          </a>
        </div>

      </div>
    </footer>
  );
}
