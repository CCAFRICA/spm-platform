import { redirect } from 'next/navigation';

// OB-97: Design workspace eliminated → redirects to Configure
export default function DesignCatchAll() {
  redirect('/configure');
}
