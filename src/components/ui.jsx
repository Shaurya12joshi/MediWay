import { useEffect } from 'react';
import { Link } from 'react-router';

// Five stars, filled up to the rounded rating
export function Stars({ rating, size = 12, className = 'gap-[1px]' }) {
  const filled = Math.round(+rating || 0);
  return (
    <span className={`inline-flex leading-[1] ${className}`}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ fontSize: `${size / 16}rem`, color: i <= filled ? '#F59E0B' : '#D1D5DB' }}>★</span>
      ))}
    </span>
  );
}

export function Spinner({ label }) {
  return (
    <div className="text-center py-[64px] text-[#94A3B8] text-[14px]">
      <div className="w-[32px] h-[32px] border-[2px] border-[#E2E8F0] border-t-[#D0423A] rounded-full animate-spin mx-auto mb-[12px]" />
      {label}
    </div>
  );
}

// "No doctor specified", "Doctor not found"...
export function NotFoundMessage({ title, to = '/search', linkText = '← Back to results' }) {
  return (
    <div className="text-center py-[64px]">
      <p className="font-serif text-[22px] mb-[12px]">{title}</p>
      <Link to={to} className="text-[#D0423A] text-[14px] hover:underline">{linkText}</Link>
    </div>
  );
}

export function useTitle(title) {
  useEffect(() => { document.title = title; }, [title]);
}
