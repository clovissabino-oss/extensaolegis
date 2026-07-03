// src/ui/options/Options.tsx
import { useEffect, useState } from 'preact/hooks';
import { Coruja } from '../coruja';
import '../theme.css';

export function Options() {
  const [freq, setFreq] = useState<'horaria' | 'diaria' | 'semanal'>('diaria');
  const [popup, setPopup] = useState(true);
  useEffect(() => { chrome.storage.local.get(['frequencia', 'popupAtivo']).then((s) => { setFreq(s.frequencia ?? 'diaria'); setPopup(s.popupAtivo !== false); }); }, []);
  async function salvar() {
    await chrome.storage.local.set({ frequencia: freq, popupAtivo: popup });
    chrome.runtime.sendMessage({ tipo: 'reagendar' });
  }
  return (
    <div class="pagina">
      <header class="cabecalho">
        <Coruja tamanho={44} />
        <div class="cabecalho-titulos">
          <p class="cabecalho-eyebrow">Vigilância legislativa · Planalto</p>
          <h1 class="cabecalho-nome">Legis Monitor</h1>
        </div>
      </header>

      <div class="opcoes-corpo">
        <h2>Configurações</h2>
        <label class="campo">
          Frequência de verificação
          <select value={freq} onChange={(e) => setFreq((e.target as HTMLSelectElement).value as 'horaria' | 'diaria' | 'semanal')}>
            <option value="horaria">A cada hora</option>
            <option value="diaria">Diária</option>
            <option value="semanal">Semanal</option>
          </select>
        </label>
        <label class="campo-inline">
          <input type="checkbox" checked={popup} onChange={(e) => setPopup((e.target as HTMLInputElement).checked)} />
          Mostrar pop-up de notificação
        </label>
        <button class="btn btn-primario" onClick={salvar}>Salvar</button>
      </div>
    </div>
  );
}
