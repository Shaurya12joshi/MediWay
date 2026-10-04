import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

export default function Toast() {
  const { message, seq } = useSelector(s => s.toast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!seq) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(timer);
  }, [seq]);

  return (
    <div role="status" aria-live="polite"
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[999] bg-[#1E293B] text-white text-[13px] font-medium px-5 py-3 rounded-xl shadow-lg pointer-events-none transition-all duration-300 max-w-[90vw] text-center ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      {message}
    </div>
  );
}
