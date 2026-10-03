import { useDispatch } from 'react-redux';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { showToast } from '../../store/toastSlice';
import { Stars } from '../../components/ui';
import { useDecideReviewMutation, usePendingReviewsQuery, useProofUrlQuery } from './adminApi';
import { BTN_APPROVE, BTN_PLAIN, TabLoading } from './shared';

function ProofPhoto({ path }) {
  const { data: url, isLoading } = useProofUrlQuery(path ?? skipToken);
  return (
    <div className="w-full h-[200px] sm:w-[220px] sm:h-[220px] shrink-0 rounded-[10px] bg-[#F2F1ED] flex items-center justify-center overflow-hidden">
      {url
        ? <img src={url} alt="Proof of visit" className="w-full h-full object-cover" />
        : <span className="text-[12px] text-[#94A3B8] px-[10px] text-center">{isLoading ? 'Loading photo…' : "Couldn't load photo"}</span>}
    </div>
  );
}

function ProofCard({ review: r }) {
  const dispatch = useDispatch();
  const [decide, { isLoading: busy }] = useDecideReviewMutation();

  async function act(approve) {
    const { error } = await decide({ id: r.id, approve });
    if (error) {
      console.error(error);
      dispatch(showToast('Something went wrong — try again'));
      return;
    }
    dispatch(showToast(approve ? 'Marked as verified' : 'Rejected'));
  }

  return (
    <div className="bg-white border border-[#E6E6E1] rounded-[16px] p-[16px] sm:p-[20px] flex flex-col sm:flex-row gap-[16px] sm:gap-[20px]">
      <ProofPhoto path={r.proof_photo_path} />
      <div className="flex-1 min-w-0">
        <div className="font-serif text-[17px] text-[#1E293B]">{r.doctors?.name || 'Unknown doctor'}</div>
        <div className="text-[12px] text-[#94A3B8] mb-[10px]">{r.doctors?.hospital || ''}</div>
        <div className="flex items-center gap-[8px] mb-[8px]">
          <span className="text-[13px] font-semibold text-[#1E293B]">{r.author}</span>
          <Stars rating={r.rating} size={13} className="gap-0" />
        </div>
        {r.stood_out?.length > 0 && <div className="text-[12px] text-[#3F3F46] mb-[4px]"><strong>Stood out:</strong> {r.stood_out.join(', ')}</div>}
        {r.could_improve?.length > 0 && <div className="text-[12px] text-[#3F3F46] mb-[4px]"><strong>Could improve:</strong> {r.could_improve.join(', ')}</div>}
        <div className="text-[12px] text-[#3F3F46] mb-[14px]"><strong>Recommends:</strong> {r.recommend ? 'Yes' : 'No'}</div>
        <div className="flex gap-[8px] flex-wrap">
          <button type="button" disabled={busy} onClick={() => act(true)} className={`${BTN_APPROVE} px-[16px] py-[9px] text-[13px]`}>✓ Approve<span className="hidden sm:inline"> — mark verified</span></button>
          <button type="button" disabled={busy} onClick={() => act(false)} className={`${BTN_PLAIN} px-[16px] py-[9px] text-[13px] hover:border-[#D0423A] hover:text-[#D0423A]`}>Reject</button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewQueue() {
  const { data: reviews, isLoading } = usePendingReviewsQuery();
  if (isLoading) return <TabLoading />;

  if (!reviews?.length) {
    return (
      <div className="text-center py-[64px]">
        <p className="font-serif text-[22px] mb-[8px]">Queue is empty</p>
        <p className="text-[14px] text-[#94A3B8]">No proof photos waiting on review.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-[20px]">
        <h1 className="font-serif text-[24px]">Pending verifications</h1>
        <p className="text-[13px] text-[#94A3B8] mt-[3px]">{reviews.length} review{reviews.length === 1 ? '' : 's'} awaiting a decision</p>
      </div>
      <div className="flex flex-col gap-[16px]">
        {reviews.map(r => <ProofCard key={r.id} review={r} />)}
      </div>
    </>
  );
}
