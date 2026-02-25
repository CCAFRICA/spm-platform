import { redirect } from 'next/navigation';

// OB-97: Govern workspace eliminated → redirects to Configure
export default function GovernCatchAll() {
  redirect('/configure');
}
