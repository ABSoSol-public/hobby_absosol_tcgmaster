import { useEffect, useState } from 'react';

// Sprachunabhängiger Platzhalter (Kartenformat 59:86), falls kein Bild vorhanden
// ist oder das Laden fehlschlägt — als data-URI, damit kein Netzwerk-Request nötig ist.
const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 59 86">
      <rect x="1" y="1" width="57" height="84" rx="4" fill="#1e2530" stroke="#2a3342" stroke-width="1.5"/>
      <g stroke="#5a6579" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <rect x="15" y="30" width="29" height="21" rx="2"/>
        <circle cx="22" cy="37" r="2.5"/>
        <path d="M15 47 L24 40 L31 45 L37 38 L44 44"/>
      </g>
    </svg>
  `);

interface Props {
  src?: string | null;
  alt: string;
  className?: string;
}

export default function CardImage({ src, alt, className }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  return (
    <img
      src={!src || failed ? PLACEHOLDER : src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
