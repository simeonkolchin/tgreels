// Иконки в стиле Instagram (outline, currentColor — цвет задаётся через CSS).
interface IconProps {
  size?: number;
  className?: string;
}

export function IconBack({ size = 26, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSearch({ size = 24, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconHeart({ size = 30, className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}>
      <path
        d="M12 20.5s-7.5-4.6-9.7-9C1 8.7 2.3 5.5 5.4 5.1c1.9-.2 3.5.8 4.6 2.2l2 2.5 2-2.5c1.1-1.4 2.7-2.4 4.6-2.2 3.1.4 4.4 3.6 3.1 6.4-2.2 4.4-9.7 9-9.7 9z"
        stroke="currentColor"
        strokeWidth={filled ? 0 : 2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconComment({ size = 28, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M21 11.5c0 4.3-4 7.8-9 7.8-1 0-2-.1-2.9-.4L4 20.5l1.4-3.7C4.2 15.4 3.5 13.5 3.5 11.5 3.5 7.2 7.5 3.7 12 3.7s9 3.5 9 7.8z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconShare({ size = 27, className }: IconProps) {
  // "самолётик" как в инсте
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22 3L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 3l-7 18-4-8-8-4 19-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconVolumeOn({ size = 26, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconVolumeOff({ size = 26, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M17 9.5l4 5M21 9.5l-4 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconPlay({ size = 30, className }: IconProps) {
  // скруглённые края треугольника
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M8.5 6.2l9 5.3a.6.6 0 010 1l-9 5.3a.6.6 0 01-.9-.5V6.7a.6.6 0 01.9-.5z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconDots({ size = 26, className }: IconProps) {
  // горизонтальное троеточие
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

export function IconQuality({ size = 22, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 10v4M7 12h2.2M9.2 10v4M13 10v4h2.4a1.4 1.4 0 001.4-1.4v-1.2A1.4 1.4 0 0015.4 10H13z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconNotInterested({ size = 22, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconCheck({ size = 20, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5l4.5 4.5L19 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconHome({ size = 26, className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}>
      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H10v6H4a1 1 0 01-1-1v-9.5z" stroke="currentColor" strokeWidth={filled ? 0 : 1.9} strokeLinejoin="round" />
    </svg>
  );
}

export function IconBell({ size = 26, className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}>
      <path d="M6 9a6 6 0 0112 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5z" stroke="currentColor" strokeWidth={filled ? 0 : 1.9} strokeLinejoin="round" />
      <path d="M10 19a2 2 0 004 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function IconMail({ size = 26, className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth={filled ? 0 : 1.9} />
      <path d="M4 7l8 6 8-6" stroke={filled ? '#000' : 'currentColor'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function IconReelsNav({ size = 27, className }: IconProps) {
  // центральная кнопка — рилсы (плёнка с play)
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M3 8h18M9 3l2.5 5M14 3l2.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10.5 12.2v3.6l3.2-1.8-3.2-1.8z" fill="currentColor" />
    </svg>
  );
}

export function IconAccount({ size = 26, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="9.5" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.7 19.2a6.6 6.6 0 0112.6 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function IconPersonPlus({ size = 26, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="9.5" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 20a6 6 0 0112 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M19 8v6M16 11h6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function IconMusic({ size = 15, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 18V6l10-2v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
      <circle cx="16.5" cy="16" r="2.5" fill="currentColor" />
    </svg>
  );
}
