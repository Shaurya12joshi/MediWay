
const doctors = await supabase.from('doctors')
  .select('id, name, hospital, hospital_address')
  .eq('city', 'Varanasi');

for (const doc of doctors.data) {
  const query = `${doc.hospital} ${doc.hospital_address}`;
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json`+
    `?query=${encodeURIComponent(query)}&key=YOUR_KEY`
  );
  const place = (await res.json()).results[0];
  if (!place) continue;

  await supabase.from('doctors').update({
    google_place_id: place.place_id,
    google_rating: place.rating,
    google_reviews: place.user_ratings_total,
  }).eq('id', doc.id);
}