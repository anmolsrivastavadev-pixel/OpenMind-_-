export function Flame({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8.5 1s.6 2.3-.9 4.1C6.3 6.6 5 7.6 5 9.7A3.4 3.4 0 0 0 8.4 13c1.9 0 3.6-1.4 3.6-3.6 0-2.4-1.6-3.3-1.6-3.3s.1 1.5-.9 2.1C9.8 6.2 10.6 3.3 8.5 1Z" />
    </svg>
  );
}
const I = (d) =>
  function Icon() {
    return (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
    );
  };
export const IconList = I(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>);
export const IconChart = I(<><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M7 14l3-3 3 3 4-5" /></>);
export const IconCompass = I(<><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></>);
export const IconMenu = I(<><path d="M4 7h16M4 12h16M4 17h16" /></>);
export const Logo = () => (
  <svg viewBox="0 0 32 32" className="w-7 h-7"><rect width="32" height="32" rx="7" fill="#1a1a1a" /><path d="M7 22l6-7 4 4 8-10" stroke="#089981" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
