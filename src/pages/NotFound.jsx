import { Link } from 'react-router';
import { PinIcon } from '../components/icons';
import { useTitle } from '../components/ui';

export default function NotFound() {
  useTitle('MediWay — Page not found');
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="bg-[#D6453A] w-12 h-12 rounded-xl flex items-center justify-center">
        <PinIcon size={24} />
      </div>
      <h1 className="font-custom font-bold text-4xl text-slate-900">Page not found</h1>
      <p className="text-slate-500 text-sm max-w-sm">That address doesn't lead anywhere on MediWay.</p>
      <div className="flex gap-3 mt-2">
        <Link to="/" className="border-[#E6E6E1] border-2 px-5 py-2.5 rounded-3xl text-sm hover:bg-white hover:border-black transition-all">Home</Link>
        <Link to="/search" className="bg-[#D0423A] text-white text-sm font-semibold px-5 py-2.5 rounded-3xl hover:bg-red-700 transition-colors">Find care</Link>
      </div>
    </div>
  );
}
