// Bits shared by the admin tabs

export const KIND_COLORS = { hospital: '#D0423A', clinic: '#2563EB', pharmacy: '#16A34A', lab: '#7C3AED' };

export const BTN_APPROVE = 'bg-[#16A34A] hover:bg-[#15803D] text-white border-none rounded-[9px] font-semibold cursor-pointer font-sans disabled:opacity-60';
export const BTN_DARK = 'bg-[#1E293B] hover:bg-black text-white border-none rounded-[9px] font-semibold cursor-pointer font-sans disabled:opacity-60';
export const BTN_PLAIN = 'bg-white border-[1.5px] border-[#E6E6E1] text-[#3F3F46] rounded-[9px] font-semibold cursor-pointer font-sans disabled:opacity-60';
export const SELECT = 'border-[1.5px] border-[#E6E6E1] rounded-[9px] px-[10px] py-[7px] text-[13px] bg-white font-sans';
export const LOAD_MORE = 'mt-[14px] w-full py-[10px] rounded-[10px] border-[1.5px] border-dashed border-[#D6D3CC] bg-transparent text-[13px] text-[#64748B] cursor-pointer font-sans hover:border-[#D0423A] hover:text-[#D0423A]';

export const chip = on => `px-[11px] py-[6px] rounded-[8px] text-[12px] font-medium border-[1.5px] cursor-pointer font-sans ${on ? 'border-[#D0423A] bg-[#FDECEA] text-[#D0423A]' : 'border-[#E6E6E1] bg-white text-[#64748B]'}`;

export const fmtShortDate = iso => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const mapLink = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export function KindBadge({ kind }) {
  const color = KIND_COLORS[kind] || '#64748B';
  return <span className="text-[10px] font-bold uppercase tracking-[.08em] px-[7px] py-[2px] rounded-[5px]" style={{ color, background: `${color}14` }}>{kind}</span>;
}

export function TabLoading() {
  return <div className="text-center py-[48px] text-[#94A3B8] text-[14px]">Loading…</div>;
}

export function Empty({ title, children }) {
  return (
    <div className="text-center py-[48px]">
      <p className="font-serif text-[20px] mb-[6px]">{title}</p>
      <p className="text-[13px] text-[#94A3B8]">{children}</p>
    </div>
  );
}
