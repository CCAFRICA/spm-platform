import { redirect } from 'next/navigation';

// OB-213 Phase 7: DISCARD — superseded route; redirects to the canonical page.
export default function Page() {
  redirect('/operate/calculate');
}
