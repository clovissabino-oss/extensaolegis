// src/ui/options/Options.tsx
import { useEffect, useState } from 'preact/hooks';

export function Options() {
  const [freq, setFreq] = useState<'horaria' | 'diaria' | 'semanal'>('diaria');
  const [popup, setPopup] = useState(true);
  useEffect(() => { chrome.storage.local.get(['frequencia', 'popupAtivo']).then((s) => { setFreq(s.frequencia ?? 'diaria'); setPopup(s.popupAtivo !== false); }); }, []);
  async function salvar() {
    await chrome.storage.local.set({ frequencia: freq, popupAtivo: popup });
    chrome.runtime.sendMessage({ tipo: 'reagendar' });
  }
  return (
    <div style="padding:16px;font-family:sans-serif">
      <h2>Configurações</h2>
      <label>Frequência de verificação:{' '}
        <select value={freq} onChange={(e) => setFreq((e.target as HTMLSelectElement).value as 'horaria' | 'diaria' | 'semanal')}>
          <option value="horaria">A cada hora</option>
          <option value="diaria">Diária</option>
          <option value="semanal">Semanal</option>
        </select>
      </label>
      <p><label><input type="checkbox" checked={popup} onChange={(e) => setPopup((e.target as HTMLInputElement).checked)} /> Mostrar pop-up de notificação</label></p>
      <button onClick={salvar}>Salvar</button>
    </div>
  );
}
