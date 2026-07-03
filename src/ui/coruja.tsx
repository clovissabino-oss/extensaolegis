// src/ui/coruja.tsx — a coruja investigativa, marca do Legis Monitor.
// Mesmo desenho usado no ícone da extensão (scripts/gerar-icone.mjs).

interface CorujaProps {
  tamanho?: number;
  comFundo?: boolean;
}

export function Coruja({ tamanho = 40, comFundo = true }: CorujaProps) {
  return (
    <svg
      class="coruja"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 128 128"
      role="img"
      aria-label="Coruja investigativa do Legis Monitor"
    >
      {comFundo && <rect x="0" y="0" width="128" height="128" rx="28" fill="#0E2033" />}
      {/* tufos */}
      <path d="M26 44 L30 16 L50 34 Z" fill="#F6F2E8" />
      <path d="M102 44 L98 16 L78 34 Z" fill="#F6F2E8" />
      {/* disco facial */}
      <circle cx="46" cy="62" r="33" fill="#F6F2E8" />
      <circle cx="82" cy="62" r="33" fill="#F6F2E8" />
      <rect x="30" y="62" width="68" height="30" rx="15" fill="#F6F2E8" />
      {/* olho esquerdo */}
      <circle cx="43" cy="60" r="15" fill="#FFFFFF" stroke="#1C3B5A" stroke-width="3.5" />
      <circle class="coruja-pupila" cx="43" cy="60" r="7.5" fill="#0E2033" />
      <circle cx="46" cy="57" r="2.4" fill="#FFFFFF" />
      {/* olho direito, ampliado pela lupa */}
      <circle cx="84" cy="58" r="20" fill="#FFFFFF" />
      <circle class="coruja-pupila" cx="84" cy="58" r="10.5" fill="#0E2033" />
      <circle cx="88.5" cy="53.5" r="3.2" fill="#FFFFFF" />
      <circle cx="84" cy="58" r="20" fill="none" stroke="#F5821F" stroke-width="6" />
      {/* cabo da lupa */}
      <line x1="99" y1="73" x2="114" y2="90" stroke="#F5821F" stroke-width="10" stroke-linecap="round" />
      {/* bico */}
      <path d="M61 76 L54 86 L61 98 L68 86 Z" fill="#F5821F" />
    </svg>
  );
}
