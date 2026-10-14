import { useId } from "react";
export function Youtube({ size = 20 }: {
    size?: number;
}) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3V9Z" fill="currentColor" strokeWidth="1"/></svg>; }
export function CinemaArt({ className = "", compact = false }: {
    className?: string;
    compact?: boolean;
}) {
    const prefix = useId().replace(/:/g, "");
    const p = (name: string) => `${prefix}-${name}`;
    return <svg className={`cinema-art ${className}`} viewBox="0 0 800 470" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={p("sky")} x1="400" y1="0" x2="400" y2="380" gradientUnits="userSpaceOnUse"><stop stopColor="#142e31"/><stop offset="1" stopColor="#092020"/></linearGradient>
      <linearGradient id={p("seat")} x1="0%" y1="0%" x2="0%" y2="100%"><stop stopColor="#edaf76"/><stop offset=".65" stopColor="#b36f41"/><stop offset="1" stopColor="#74472f"/></linearGradient>
      <linearGradient id={p("arm")} x1="0%" y1="0%" x2="100%" y2="0%"><stop stopColor="#f5be86"/><stop offset="1" stopColor="#995a34"/></linearGradient>
      <linearGradient id={p("curtain")} x1="0%" y1="0%" x2="100%" y2="0%"><stop stopColor="#301e1c"/><stop offset=".35" stopColor="#51332a"/><stop offset=".65" stopColor="#2b1c1b"/><stop offset="1" stopColor="#3b2620"/></linearGradient>
      <radialGradient id={p("glow")}><stop stopColor="#fbd9a4" stopOpacity=".3"/><stop offset="1" stopColor="#fbd9a4" stopOpacity="0"/></radialGradient>
      <filter id={p("blur")}><feGaussianBlur stdDeviation="20"/></filter>
      <filter id={p("shadow")} x="-40%" y="-20%" width="180%" height="160%"><feDropShadow dy="12" stdDeviation="12" floodColor="#000" floodOpacity=".55"/></filter>
      <clipPath id={p("screen")}><rect x="150" y="36" width="500" height="290" rx="12"/></clipPath>
    </defs>
    <ellipse cx="400" cy="205" rx="330" ry="220" fill={`url(#${p("glow")})`} filter={`url(#${p("blur")})`}/>
    <rect x="137" y="24" width="526" height="314" rx="18" fill="#e6caa5" fillOpacity=".08" stroke="#e6caa5" strokeOpacity=".2"/>
    <rect x="150" y="36" width="500" height="290" rx="12" fill={`url(#${p("sky")})`}/>
    <g clipPath={`url(#${p("screen")})`}>
      {[[195, 72], [252, 98], [291, 55], [343, 86], [445, 54], [555, 83], [606, 133], [489, 112], [383, 50], [209, 144], [568, 171], [309, 141]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.8 : 1} fill="#e3d2b7" opacity={.45 + (i % 3) * .18}/>)}
      <circle cx="471" cy="105" r="28" fill="#f5dfb7"/><circle cx="483" cy="97" r="27" fill="#122b2e"/>
      <path d="M133 290 224 164 302 273 366 205 452 291 548 203 668 290V345H130" fill="#285052"/>
      <path d="m224 164 19 57-19-8-19 16 19-65ZM366 205l23 39-23-10-13 4 13-33ZM548 203l24 37-24-7-16 4 16-34Z" fill="#8ba3a0" opacity=".6"/>
      <path d="M144 280c98-10 151 37 249 16s171-33 270-13v52H144" fill="#163c3c"/>
      <path d="M150 305c102 15 199-7 280 0s157 22 220 3v35H150" fill="#092527"/>
      <path d="M375 271c7-4 13 0 16 4 5-5 13-8 18-2 8 9-16 23-16 23s-25-15-18-25Z" fill="#e4ab7a" opacity=".85"/>
    </g>
    {!compact && <g opacity=".85"><path d="M58 0h95l-10 338-16 21-7-328-10 330-20-27L58 0Z" fill={`url(#${p("curtain")})`}/><path d="M742 0h-95l10 338 16 21 7-328 10 330 20-27L742 0Z" fill={`url(#${p("curtain")})`}/></g>}
    <ellipse cx="400" cy="428" rx="207" ry="26" fill="#000" opacity=".45"/>
    <g filter={`url(#${p("shadow")})`}>
      {[249, 425].map((x, i) => <g key={x} transform={`translate(${x} 275)`}>
        <rect x="-9" y="63" width="153" height="91" rx="22" fill="#7b492e"/>
        <rect x="10" y="4" width="116" height="119" rx="30" fill={`url(#${p("seat")})`} stroke="#edbd90" strokeOpacity=".25"/>
        <rect x="21" y="14" width="94" height="95" rx="23" stroke="#774629" strokeOpacity=".4"/>
        <path d="M35 19v87M103 19v87" stroke="#edbd90" strokeOpacity=".2"/>
        <rect x="6" y="101" width="124" height="36" rx="13" fill="#c38a57"/>
        <path d="M17 117h103" stroke="#ebbd8b" strokeOpacity=".4"/>
        <rect x="-12" y="89" width="30" height="62" rx="11" fill={`url(#${p("arm")})`}/>
        <rect x="118" y="89" width="30" height="62" rx="11" fill={`url(#${p("arm")})`}/>
        <ellipse cx={i === 0 ? 134 : 3} cy="97" rx="9" ry="5" fill="#51342a"/>
        <rect x="6" y="144" width="15" height="19" rx="3" fill="#32261f"/><rect x="114" y="144" width="15" height="19" rx="3" fill="#32261f"/>
      </g>)}
    </g>
    <g transform="translate(398 337)"><path d="M-12 0h24l-4 37H-8L-12 0Z" fill="#e7cb9c"/><path d="M-7 2h5v31h-5ZM3 2h5v31H3" fill="#bf7352"/><path d="M-12 0c-9-4-3-13 3-10-1-8 12-9 14-2 6-5 13 3 9 8 5 3 1 8-3 6H-12Z" fill="#fae7bd"/></g>
  </svg>;
}
