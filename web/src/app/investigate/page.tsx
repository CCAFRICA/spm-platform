import { redirect } from 'next/navigation';

// OB-97: Investigate workspace eliminated → redirects to Operate
export default function InvestigatePage() {
  redirect('/operate');
}
