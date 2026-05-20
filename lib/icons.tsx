import React from 'react'

type IconProps = { className?: string; size?: number }
const ic = (size: number, className: string, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
)

export const IconWarning      = ({ size=14, className='' }: IconProps) => ic(size, className, <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>)
export const IconUser         = ({ size=14, className='' }: IconProps) => ic(size, className, <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/>)
export const IconUsers        = ({ size=14, className='' }: IconProps) => ic(size, className, <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>)
export const IconMapPin       = ({ size=14, className='' }: IconProps) => ic(size, className, <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></>)
export const IconFilm         = ({ size=14, className='' }: IconProps) => ic(size, className, <><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></>)
export const IconMail         = ({ size=14, className='' }: IconProps) => ic(size, className, <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>)
export const IconPhone        = ({ size=14, className='' }: IconProps) => ic(size, className, <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.9 1.17 2 2 0 012.85 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92v2z"/>)
export const IconStar         = ({ size=14, className='' }: IconProps) => ic(size, className, <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>)
export const IconCalendar     = ({ size=14, className='' }: IconProps) => ic(size, className, <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>)
export const IconInbox        = ({ size=14, className='' }: IconProps) => ic(size, className, <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></>)
export const IconSun          = ({ size=14, className='' }: IconProps) => ic(size, className, <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>)
export const IconHeart        = ({ size=14, className='' }: IconProps) => ic(size, className, <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>)
export const IconXCircle      = ({ size=14, className='' }: IconProps) => ic(size, className, <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>)
export const IconWrench       = ({ size=14, className='' }: IconProps) => ic(size, className, <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>)
export const IconHanger       = ({ size=14, className='' }: IconProps) => ic(size, className, <><path d="M12 3a2 2 0 100 4c1.1 0 2-.9 2-2s-.9-2-2-2z"/><path d="M12 7v2.5L2 17h20L12 9.5V7"/></>)
export const IconTheatre      = ({ size=14, className='' }: IconProps) => ic(size, className, <><path d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125v-5.625A1.125 1.125 0 013.375 12H4.5M3.375 19.5v-5.625M21 19.5h-1.5a1.125 1.125 0 01-1.125-1.125M21 19.5v-5.625A1.125 1.125 0 0019.875 12H18.75M3.375 12h17.25M3.375 12V7.875A1.125 1.125 0 014.5 6.75H6M21 12V7.875A1.125 1.125 0 0019.875 6.75H18.75M6 6.75h12M6 6.75A1.125 1.125 0 014.875 5.625V4.5M18.75 6.75A1.125 1.125 0 0019.875 5.625V4.5m-15.375 0h15.375"/></>)
