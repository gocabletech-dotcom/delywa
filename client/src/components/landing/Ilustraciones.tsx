// Dibujos de la página principal: el colmado, el delivery en su motor y la casa del cliente.
// Son SVG en línea (sin archivos aparte) para que carguen al instante y se vean nítidos en cualquier pantalla.

type Props = { className?: string; style?: React.CSSProperties; titulo?: string };

const etiqueta = (titulo?: string) => (titulo ? { role: "img", "aria-label": titulo } : { "aria-hidden": true });

/** Toldo a rayas verde y blanco con los bordes redondeados de abajo. */
function Toldo() {
  const rayas = [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    <g>
      <rect x="26" y="66" width="268" height="26" fill="#FFFFFF" />
      {rayas.filter((i) => i % 2 === 0).map((i) => <rect key={`r${i}`} x={26 + i * 33.5} y="66" width="33.5" height="26" fill="#2E9E66" />)}
      {rayas.map((i) => <circle key={`c${i}`} cx={42.75 + i * 33.5} cy="92" r="16.75" fill={i % 2 === 0 ? "#2E9E66" : "#FFFFFF"} />)}
    </g>
  );
}

/** Frente de un colmado con su letrero, toldo, ventanas con estantes, puerta y una caja de cervezas. */
export function ColmadoFrente({ nombre = "COLMADO EL SOL", ...p }: Props & { nombre?: string }) {
  return (
    <svg viewBox="0 0 320 240" {...etiqueta(p.titulo)} className={p.className} style={p.style}>
      <rect x="18" y="58" width="284" height="182" rx="6" fill="#FCE3B0" />
      <rect x="34" y="16" width="252" height="46" rx="12" fill="#17804F" />
      <text x="160" y="47" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="24" fill="#FFFFFF">{nombre}</text>
      <Toldo />
      <rect x="40" y="124" width="70" height="66" rx="6" fill="#5A3E2B" />
      <rect x="46" y="146" width="58" height="3" fill="#8B6A4E" /><rect x="46" y="170" width="58" height="3" fill="#8B6A4E" />
      <rect x="50" y="130" width="8" height="16" rx="2" fill="#F2B544" /><rect x="62" y="132" width="8" height="14" rx="2" fill="#E25C3B" />
      <rect x="74" y="130" width="8" height="16" rx="2" fill="#F2B544" /><rect x="86" y="134" width="12" height="12" rx="2" fill="#FFFFFF" />
      <rect x="50" y="154" width="14" height="16" rx="2" fill="#E9D8B4" /><rect x="68" y="156" width="12" height="14" rx="2" fill="#3A8FD8" />
      <rect x="84" y="152" width="14" height="18" rx="2" fill="#E9D8B4" />
      <rect x="130" y="118" width="64" height="122" rx="4" fill="#3A2C22" />
      <rect x="138" y="128" width="48" height="3" fill="#7A5A40" /><rect x="138" y="160" width="48" height="3" fill="#7A5A40" /><rect x="138" y="192" width="48" height="3" fill="#7A5A40" />
      <rect x="142" y="140" width="8" height="20" rx="2" fill="#2E9E66" /><rect x="154" y="142" width="8" height="18" rx="2" fill="#F2B544" />
      <rect x="166" y="140" width="10" height="20" rx="2" fill="#E25C3B" /><rect x="142" y="172" width="14" height="20" rx="2" fill="#E9D8B4" />
      <rect x="160" y="174" width="14" height="18" rx="2" fill="#FFFFFF" />
      <rect x="212" y="124" width="70" height="66" rx="6" fill="#5A3E2B" />
      <rect x="218" y="146" width="58" height="3" fill="#8B6A4E" /><rect x="218" y="170" width="58" height="3" fill="#8B6A4E" />
      <rect x="222" y="130" width="10" height="16" rx="2" fill="#E25C3B" /><rect x="236" y="132" width="10" height="14" rx="2" fill="#F2B544" />
      <rect x="250" y="128" width="20" height="18" rx="3" fill="#E9D8B4" /><rect x="222" y="154" width="12" height="16" rx="2" fill="#3A8FD8" />
      <rect x="238" y="152" width="12" height="18" rx="2" fill="#2E9E66" /><rect x="254" y="156" width="14" height="14" rx="2" fill="#FFFFFF" />
      <rect x="214" y="206" width="54" height="34" rx="4" fill="#C9822F" />
      <circle cx="226" cy="204" r="5" fill="#B5651D" /><circle cx="241" cy="204" r="5" fill="#B5651D" /><circle cx="256" cy="204" r="5" fill="#B5651D" />
      <rect x="36" y="214" width="22" height="26" rx="4" fill="#C9822F" /><circle cx="47" cy="204" r="14" fill="#2E9E66" />
    </svg>
  );
}

/** El colmado por dentro: estantes llenos y el mostrador con la caja. */
export function ColmadoDentro(p: Props) {
  const fila1 = [[56, 9, 20, "#F2B544"], [69, 9, 18, "#F2B544"], [82, 9, 20, "#F2B544"], [100, 18, 16, "#E9D8B4"], [124, 10, 18, "#E25C3B"], [140, 12, 20, "#3A8FD8"], [160, 20, 16, "#FFFFFF"], [188, 10, 20, "#2E9E66"], [204, 10, 18, "#2E9E66"], [222, 22, 16, "#E9D8B4"], [250, 12, 20, "#E25C3B"]] as const;
  const fila2 = [[56, 20, 24, "#E9D8B4"], [82, 16, 20, "#FFFFFF"], [104, 12, 24, "#F2B544"], [122, 22, 22, "#3A8FD8"], [150, 18, 24, "#E9D8B4"], [176, 14, 20, "#E25C3B"], [196, 22, 24, "#FFFFFF"], [224, 16, 22, "#2E9E66"], [246, 18, 24, "#F2B544"]] as const;
  return (
    <svg viewBox="0 0 320 240" {...etiqueta(p.titulo)} className={p.className} style={p.style}>
      <rect x="18" y="58" width="284" height="182" rx="6" fill="#FCE3B0" />
      <rect x="34" y="16" width="252" height="46" rx="12" fill="#17804F" />
      <text x="160" y="47" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700" fontSize="24" fill="#FFFFFF">TU COLMADO</text>
      <Toldo />
      <rect x="40" y="124" width="240" height="116" rx="6" fill="#5A3E2B" />
      <rect x="48" y="150" width="224" height="3" fill="#8B6A4E" /><rect x="48" y="184" width="224" height="3" fill="#8B6A4E" />
      {fila1.map(([x, w, h, c]) => <rect key={`a${x}`} x={x} y={150 - h} width={w} height={h} rx="2" fill={c} />)}
      {fila2.map(([x, w, h, c]) => <rect key={`b${x}`} x={x} y={184 - h} width={w} height={h} rx="2" fill={c} />)}
      <rect x="40" y="200" width="240" height="40" fill="#C9822F" />
      <rect x="40" y="200" width="240" height="6" fill="#E3A65C" />
      <rect x="196" y="186" width="34" height="14" rx="3" fill="#FFFFFF" />
      <text x="213" y="197" textAnchor="middle" fontFamily="Nunito, sans-serif" fontWeight="800" fontSize="10" fill="#17804F">RD$</text>
    </svg>
  );
}

/** El delivery en su motor con la caja de pedidos. `girando` hace rodar las ruedas. */
export function DeliveryMotor({ girando = false, ...p }: Props & { girando?: boolean }) {
  const rueda = (cx: number) => (
    <g style={girando ? { transformOrigin: `${cx}px 128px`, animation: "dw-rueda 0.8s linear infinite" } : undefined}>
      <circle cx={cx} cy="128" r="26" fill="#2B2F2D" />
      <circle cx={cx} cy="128" r="11" fill="#C8CDCB" />
      <path d={`M${cx} 106 V150 M${cx - 22} 128 H${cx + 22}`} stroke="#6E7572" strokeWidth="3" />
    </g>
  );
  return (
    <svg viewBox="0 0 220 160" {...etiqueta(p.titulo)} className={p.className} style={p.style}>
      <rect x="18" y="34" width="56" height="48" rx="8" fill="#F28C28" />
      <rect x="18" y="52" width="56" height="8" fill="#FFFFFF" opacity="0.85" />
      <path d="M40 92 H150 L170 70 H186" stroke="#2B2F2D" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M70 92 Q96 70 128 84 L150 92" fill="#17804F" />
      <rect x="72" y="76" width="44" height="10" rx="5" fill="#2B2F2D" />
      <path d="M104 78 L118 46 L140 50" stroke="#17804F" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M104 80 L128 104 L120 128" stroke="#2E4C78" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M140 50 L172 66" stroke="#17804F" strokeWidth="10" strokeLinecap="round" />
      <circle cx="122" cy="30" r="17" fill="#17804F" />
      <path d="M126 22 h14 v14 h-10" fill="#BFE3F2" />
      {rueda(50)}
      {rueda(176)}
    </svg>
  );
}

/** Casa del cliente con el visto bueno de "entregado". */
export function CasaCliente(p: Props) {
  return (
    <svg viewBox="0 0 200 200" {...etiqueta(p.titulo)} className={p.className} style={p.style}>
      <path d="M14 92 L100 26 L186 92 Z" fill="#E25C3B" />
      <rect x="28" y="88" width="144" height="112" fill="#BFE3F2" />
      <rect x="84" y="128" width="36" height="72" rx="4" fill="#2E6E9E" />
      <circle cx="112" cy="166" r="3" fill="#FFE08A" />
      <rect x="40" y="110" width="32" height="30" rx="3" fill="#FFFFFF" /><rect x="128" y="110" width="32" height="30" rx="3" fill="#FFFFFF" />
      <rect x="54" y="110" width="3" height="30" fill="#BFE3F2" /><rect x="142" y="110" width="3" height="30" fill="#BFE3F2" />
      <circle cx="160" cy="30" r="16" fill="#FFFFFF" />
      <path d="M152 30 l6 6 10 -12" stroke="#17804F" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Icono pequeño de moto (trazo). */
export function IconoMoto({ color = "currentColor", size = 20 }: { color?: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M9 17h6l-2-6h-3M13 11l2-4h3" />
    </svg>
  );
}
