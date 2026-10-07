import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useDispatch } from 'react-redux';
import { supabase } from '../lib/supabase';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useAddReviewMutation, useGetDoctorQuery, useGetPlaceQuery } from '../store/api';
import { showToast } from '../store/toastSlice';
import AuthButton from '../components/AuthButton';
import Footer from '../components/Footer';
import { BackIcon, PinIcon, ThumbIcon } from '../components/icons';
import { NotFoundMessage, Spinner, useTitle } from '../components/ui';
import { PAGE_DESCRIPTIONS } from '../lib/meta';

const STOOD_OUT_OPTIONS = [
  'Bedside manner', 'Short wait time', 'Accurate diagnosis', 'Clear explanation',
  'Friendly staff', 'Clean facility', 'Affordable', 'Followed up after visit',
  'Walk-in friendly', 'On time',
];
const IMPROVE_OPTIONS = [
  'Wait time', 'Communication', 'Front desk experience', 'Billing clarity',
  'Appointment scheduling', 'Cleanliness', 'Parking / access', 'Follow-up care',
];
const MAX_PROOF_BYTES = 8 * 1024 * 1024;

const CHIP = 'text-[13px] py-[9px] px-[15px] rounded-[100px] border-[1.5px] cursor-pointer transition-all font-sans';
const CHIP_OFF = `${CHIP} font-medium border-border bg-white text-muted`;
const CHIP_GOOD = `${CHIP} font-semibold border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]`;
const CHIP_IMPROVE = `${CHIP} font-semibold border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]`;
const REC = 'flex items-center justify-center gap-[8px] py-[13px] rounded-[12px] text-[14px] font-semibold cursor-pointer transition-all font-sans border-[1.5px]';
const LABEL = 'block text-[13px] font-semibold text-text';

// Tap to select, tap again to clear
function ChipPicker({ options, selected, onChange, onClass }) {
  const toggle = value => onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  return (
    <div className="flex flex-wrap gap-[8px]">
      {options.map(o => (
        <button key={o} type="button" aria-pressed={selected.includes(o)} onClick={() => toggle(o)} className={selected.includes(o) ? onClass : CHIP_OFF}>{o}</button>
      ))}
    </div>
  );
}

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex gap-[8px]" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" aria-label={`${n} star${n === 1 ? '' : 's'}`} aria-pressed={value === n}
          onClick={() => onChange(n)} onMouseEnter={() => setHover(n)}
          className="text-[32px] sm:text-[38px] leading-none cursor-pointer bg-transparent border-none p-0"
          style={{ color: n <= shown ? '#F59E0B' : '#D1D5DB' }}>★</button>
      ))}
    </div>
  );
}

// subject: { kind: 'doctor' | 'place', id, name }
function ReviewForm({ subject }) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [addReview] = useAddReviewMutation();

  const [rating, setRating] = useState(0);
  const [stoodOut, setStoodOut] = useState([]);
  const [couldImprove, setCouldImprove] = useState([]);
  const [recommend, setRecommend] = useState(null);
  const [author, setAuthor] = useState('');
  const [proof, setProof] = useState(null); // { file, url }
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(null); // button label while busy
  const [submitError, setSubmitError] = useState('');

  // The preview's object URL lives as long as the chosen photo
  useEffect(() => () => { if (proof) URL.revokeObjectURL(proof.url); }, [proof]);

  function chooseProof(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_PROOF_BYTES) {
      dispatch(showToast('Photo is too large. Please use one under 8MB'));
      return;
    }
    setProof({ file, url: URL.createObjectURL(file) });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const missing = { rating: !rating, recommend: recommend === null };
    setErrors(missing);
    if (missing.rating || missing.recommend) return;

    setSubmitError('');
    setSubmitting(proof ? 'Uploading photo…' : 'Submitting…');

    let proofPath = null;
    if (proof) {
      const ext = (proof.file.name.split('.').pop() || 'jpg').toLowerCase();
      proofPath = `${subject.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('review-proofs')
        .upload(proofPath, proof.file, { upsert: false });
      if (uploadError) {
        console.error(uploadError);
        setSubmitError('Could not upload your photo. Please try again.');
        setSubmitting(null);
        return;
      }
    }

    setSubmitting('Submitting…');
    const { error } = await addReview({
      ...(subject.kind === 'doctor' ? { doctor_id: subject.id } : { place_id: subject.id }),
      author: author.trim() || 'Anonymous',
      rating,
      stood_out: stoodOut,
      could_improve: couldImprove,
      recommend,
      verified: false,
      proof_photo_path: proofPath,
      proof_status: proofPath ? 'pending' : null,
      proof_submitted_at: proofPath ? new Date().toISOString() : null,
    });

    if (error) {
      console.error(error);
      setSubmitError('Something went wrong submitting your review. Please try again.');
      setSubmitting(null);
      return;
    }

    dispatch(showToast(proofPath ? 'Thanks! Your proof is pending review.' : 'Thanks for your review!'));
    setTimeout(() => navigate(subject.kind === 'doctor' ? `/doctor/${subject.id}` : '/search'), 800);
  }

  return (
    <>
      <div className="mb-[24px]">
        <h1 className="font-serif text-[22px] sm:text-[26px] text-text leading-[1.15]">Rate your visit</h1>
        <p className="text-[13px] text-faint mt-[4px]">with <strong className="text-text">{subject.name}</strong> · takes about 20 seconds</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-border rounded-[18px] p-[18px] sm:p-[26px] flex flex-col gap-[22px] sm:gap-[26px]">

        <div>
          <label className={`${LABEL} mb-[12px]`}>Overall, how was it?</label>
          <StarPicker value={rating} onChange={n => { setRating(n); setErrors(x => ({ ...x, rating: false })); }} />
          {errors.rating && <p className="text-[12px] text-red mt-[8px]">Please select a star rating.</p>}
        </div>

        <div>
          <label className={`${LABEL} mb-[3px]`}>What stood out?</label>
          <p className="text-[12px] text-faint mb-[12px]">Tap all that apply (optional)</p>
          <ChipPicker options={STOOD_OUT_OPTIONS} selected={stoodOut} onChange={setStoodOut} onClass={CHIP_GOOD} />
        </div>

        <div>
          <label className={`${LABEL} mb-[3px]`}>What could be improved?</label>
          <p className="text-[12px] text-faint mb-[12px]">Tap all that apply (optional)</p>
          <ChipPicker options={IMPROVE_OPTIONS} selected={couldImprove} onChange={setCouldImprove} onClass={CHIP_IMPROVE} />
        </div>

        <div>
          <label className={`${LABEL} mb-[12px]`}>{subject.kind === 'doctor' ? 'Would you recommend this doctor?' : 'Would you recommend this place?'}</label>
          <div className="grid grid-cols-2 gap-[10px]">
            <button type="button" aria-pressed={recommend === true} onClick={() => { setRecommend(true); setErrors(x => ({ ...x, recommend: false })); }}
              className={`${REC} ${recommend === true ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]' : 'border-border bg-white text-muted'}`}>
              <ThumbIcon />
              Yes
            </button>
            <button type="button" aria-pressed={recommend === false} onClick={() => { setRecommend(false); setErrors(x => ({ ...x, recommend: false })); }}
              className={`${REC} ${recommend === false ? 'border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]' : 'border-border bg-white text-muted'}`}>
              <ThumbIcon style={{ transform: 'scaleY(-1)' }} />
              No
            </button>
          </div>
          {errors.recommend && <p className="text-[12px] text-red mt-[8px]">Please let us know if you'd recommend them.</p>}
        </div>

        <div>
          <label htmlFor="authorInput" className={`${LABEL} mb-[8px]`}>Your name</label>
          <input id="authorInput" type="text" placeholder="e.g. Priya S." required value={author} onChange={e => setAuthor(e.target.value)}
            className="w-full border-[1.5px] border-border rounded-[10px] px-[14px] py-[10px] text-[14px] outline-none focus:border-red font-sans" />
        </div>

        <div>
          <label className={`${LABEL} mb-[3px]`}>Proof of visit</label>
          <p className="text-[12px] text-faint mb-[12px]">Upload a photo of a prescription or bill to get a "Verified visit" badge on your review. Optional, checked by our team, never shown publicly.</p>
          {proof ? (
            <div className="mt-[10px]">
              <img src={proof.url} alt="Proof of visit" className="rounded-[10px] max-h-[160px] object-cover border border-border" />
              <button type="button" onClick={() => setProof(null)} className="text-[12px] text-red font-medium mt-[6px] bg-transparent border-none cursor-pointer p-0">Remove photo</button>
            </div>
          ) : (
            <label htmlFor="proofInput" className="flex flex-col items-center justify-center gap-[8px] border-[1.5px] border-dashed border-border rounded-[12px] py-[24px] cursor-pointer hover:border-red transition-all">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              <span className="text-[13px] text-muted font-medium">Tap to upload photo</span>
            </label>
          )}
          <input id="proofInput" type="file" accept="image/*" className="hidden" onChange={chooseProof} />
        </div>

        <button type="submit" disabled={Boolean(submitting)} className="bg-red hover:bg-red-dark text-white border-none py-[14px] rounded-[12px] text-[14px] font-semibold cursor-pointer transition-colors font-sans">
          {submitting || 'Submit review'}
        </button>
        {submitError && <p className="text-[12px] text-red text-center">{submitError}</p>}
      </form>
    </>
  );
}

export default function Review() {
  useTitle('Write a review · MediWay', PAGE_DESCRIPTIONS.review);
  const [params] = useSearchParams();
  const id = params.get('id');
  const placeId = params.get('place');
  const doctor = useGetDoctorQuery(id ?? skipToken);
  const place = useGetPlaceQuery(!id && placeId ? placeId : skipToken);
  const subject = doctor.data ? { kind: 'doctor', id: doctor.data.id, name: doctor.data.name }
    : place.data ? { kind: 'place', id: place.data.id, name: place.data.name } : null;

  let content;
  if (!id && !placeId) content = <NotFoundMessage title="Nothing to review" />;
  else if (doctor.isLoading || place.isLoading) content = <Spinner label="Loading…" />;
  else if (!subject) content = <NotFoundMessage title={id ? 'Doctor not found' : 'Place not found'} />;
  else content = <ReviewForm subject={subject} />;

  return (
    <div className="font-sans min-h-screen flex flex-col">
      <nav className="sticky top-0 z-[200] bg-[#F5F5F4] backdrop-blur-[12px] border-b border-border h-[60px] flex items-center px-[16px] sm:px-[24px]">
        <div className="max-w-[640px] w-full mx-auto flex items-center gap-[8px] sm:gap-[12px]">
          <Link to="/" className="flex items-center gap-[9px] no-underline shrink-0">
            <div className="w-[34px] h-[34px] rounded-[10px] bg-red flex items-center justify-center shrink-0">
              <PinIcon size={16} />
            </div>
            <span className="font-custom text-[22px] sm:text-[29px] font-bold hover:text-[#D6453A] text-text">MediWay</span>
          </Link>
          <div style={{ flex: 1 }}></div>
          <Link to={subject?.kind === 'doctor' ? `/doctor/${subject.id}` : '/search'} title="Back" className="flex items-center gap-[5px] text-[13px] text-faint no-underline hover:text-text shrink-0">
            <BackIcon />
            <span className="hidden sm:inline">{subject?.kind === 'doctor' ? 'Back to profile' : 'Back to results'}</span>
          </Link>
          <AuthButton />
        </div>
      </nav>

      <div className="flex-1 w-full max-w-[640px] mx-auto px-[16px] sm:px-[24px] py-[28px] sm:py-[36px]">
        {content}
      </div>

      <Footer inner="" />
    </div>
  );
}
