import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { createWorker, PSM } from 'tesseract.js';
import { api } from '../api';
import { useGame } from '../game';
import { cardName, useLanguage } from '../i18n';
import { Print } from '../types';
import AddToCollectionModal from './AddToCollectionModal';
import CardImage from './CardImage';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

type Phase = 'idle' | 'crop' | 'recognizing' | 'results' | 'none';

interface Selection {
  /** Alle Werte in Prozent der angezeigten Bildgröße — unabhängig von der tatsächlichen Auflösung. */
  x: number;
  y: number;
  w: number;
  h: number;
}

// Startvorschlag: unteres Bilddrittel, wo Set-Code/Sammelnummer bei den meisten
// TCGs aufgedruckt ist. Der Nutzer zieht bei Bedarf ein eigenes Rechteck darüber.
const DEFAULT_SELECTION: Selection = { x: 8, y: 82, w: 84, h: 14 };
const MIN_SELECTION = 3; // Prozent — kleinere Ziehgesten zählen als versehentlicher Klick

// getUserMedia gibt es nur in sicheren Kontexten (HTTPS oder localhost) — läuft die
// App wie im Synology-Setup über einfaches HTTP, ist navigator.mediaDevices schlicht
// nicht vorhanden. Der Button erscheint dann gar nicht erst statt mit Fehler zu enden.
const WEBCAM_SUPPORTED = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

// Fokus-Steuerung (Teil der Image-Capture-Spec) ist nicht Teil von TypeScripts
// Standard-DOM-Typen und wird nur von einem Teil der Browser (v. a. Android/Chrome)
// überhaupt unterstützt — deshalb eigene, minimale Typerweiterung statt "any".
interface FocusConstraintSet extends MediaTrackConstraintSet {
  focusMode?: string;
}
interface FocusCapabilities extends MediaTrackCapabilities {
  focusMode?: string[];
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Schneidet den gewählten Bildausschnitt zu, hochskaliert (bessere OCR-Trefferquote
 * bei kleinen Ausschnitten) und in Graustufen mit erhöhtem Kontrast — Fotos haben
 * durch Beleuchtung/Reflexion oft zu wenig Kontrast für zuverlässige Texterkennung,
 * ein einfacher Kontrast-/Graustufen-Filter hilft Tesseract deutlich mehr als die
 * reine Auflösung. Liefert das Ergebnis als PNG-Blob.
 */
function cropToBlob(img: HTMLImageElement, sel: Selection): Promise<Blob> {
  const sx = (sel.x / 100) * img.naturalWidth;
  const sy = (sel.y / 100) * img.naturalHeight;
  const sw = Math.max(1, (sel.w / 100) * img.naturalWidth);
  const sh = Math.max(1, (sel.h / 100) * img.naturalHeight);
  const scale = clamp(480 / Math.min(sw, sh), 1, 4);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas nicht verfügbar'));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'grayscale(1) contrast(1.6) brightness(1.1)';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Zuschnitt fehlgeschlagen'))), 'image/png');
  });
}

/**
 * Foto der Karte aufnehmen (Handy-Kamera per Datei-Input oder Webcam am Rechner)
 * → Bildausschnitt mit Set-Code/Sammelnummer markieren → Text per OCR erkennen
 * → gegen card_prints.collector_number matchen (GET /games/:code/scan, siehe
 * backend/src/routes/cards.ts). Reine Text-Erkennung, keine Bilderkennung des
 * Kartenmotivs — funktioniert am besten bei Spielen mit gedrucktem Set-Code
 * (Yu-Gi-Oh!, Magic); bei reiner Nummer (Pokémon, Lorcana, Riftbound) kann die
 * Trefferliste mehrdeutig sein, dann einfach den richtigen Treffer auswählen.
 * Wo OCR trotz Zuschnitt scheitert, hilft die manuelle Texteingabe (nutzt
 * denselben Matching-Endpunkt, nur ohne OCR-Zwischenschritt).
 */
export default function ScanCardModal({ onClose, onSaved }: Props) {
  const { game } = useGame();
  const { lang, t } = useLanguage();
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const prevSelectionRef = useRef<Selection>(DEFAULT_SELECTION);

  const [phase, setPhase] = useState<Phase>('idle');
  const [webcamActive, setWebcamActive] = useState(false);
  const [focusSupported, setFocusSupported] = useState(false);
  const [focusing, setFocusing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION);
  const [rawText, setRawText] = useState('');
  const [results, setResults] = useState<Print[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Print | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  function stopWebcam() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setWebcamActive(false);
    setFocusSupported(false);
  }

  // Kamera-Stream in jedem Fall stoppen, wenn der Dialog verlassen wird — sonst
  // bleibt die Kamera-Anzeige im Browser aktiv, obwohl der Dialog schon zu ist.
  useEffect(() => () => stopWebcam(), []);

  // srcObject muss gesetzt werden, nachdem das <video>-Element gerendert ist.
  useEffect(() => {
    if (webcamActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [webcamActive]);

  async function startWebcam() {
    setError(null);
    try {
      // Höhere Zielauflösung: mehr echte Bilddetails für den späteren Zuschnitt,
      // statt nur eine verwaschene Aufnahme hochzuskalieren. "ideal" statt "exact",
      // damit Geräte ohne so hohe Auflösung trotzdem einen Stream liefern.
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      setWebcamActive(true);

      // Kontinuierlichen Autofokus anfragen, wo unterstützt (v. a. Android/Chrome —
      // iOS Safari kennt diese Erweiterung nicht, dann bleibt es beim Kamera-Default).
      // Best effort: schlägt applyConstraints fehl, einfach ohne explizite
      // Fokus-Steuerung weitermachen statt den ganzen Scan abzubrechen.
      const track = streamRef.current.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() as FocusCapabilities | undefined;
      if (capabilities?.focusMode?.includes('continuous')) {
        try {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as FocusConstraintSet] });
        } catch {
          // ignorieren — Fokus bleibt dann einfach beim Kamera-Default
        }
      }
      setFocusSupported(!!capabilities?.focusMode?.length);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /**
   * Erzwingt einen neuen Autofokus-Durchlauf per Tippen auf den "Fokussieren"-Button
   * — nützlich, wenn die Kamera auf den Hintergrund statt die Karte fokussiert hat.
   * Kurzer Wechsel auf "single-shot"/"manual" (falls verfügbar) und zurück auf
   * "continuous" stößt bei den meisten unterstützten Geräten einen frischen
   * Fokus-Suchlauf an; ist nur "continuous" verfügbar, hilft erneutes Anwenden
   * derselben Einschränkung oft ebenfalls, einen neuen Suchlauf auszulösen.
   */
  async function applyFocus() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    setFocusing(true);
    try {
      const capabilities = track.getCapabilities?.() as FocusCapabilities | undefined;
      const retrigger = capabilities?.focusMode?.find((m) => m === 'single-shot' || m === 'manual');
      if (retrigger) {
        await track.applyConstraints({ advanced: [{ focusMode: retrigger } as FocusConstraintSet] });
        await new Promise((r) => setTimeout(r, 400));
      }
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as FocusConstraintSet] });
    } catch {
      // Best effort — Kamera bleibt einfach beim vorherigen Fokus
    } finally {
      setFocusing(false);
    }
  }

  function captureFromWebcam() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopWebcam();
      handleFile(new File([blob], 'scan.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  }

  function handleFile(file: File) {
    setError(null);
    setResults([]);
    setPreview(URL.createObjectURL(file));
    setSelection(DEFAULT_SELECTION);
    setPhase('crop');
  }

  async function matchText(text: string) {
    setRawText(text);
    const r = await api.scanCard(game, text);
    if (r.data.length === 1) {
      // Eindeutiger Treffer: direkt weiter zum "Zur Sammlung hinzufügen"-Dialog
      setSelected(r.data[0]);
    } else {
      setResults(r.data);
      setPhase(r.data.length ? 'results' : 'none');
    }
  }

  async function runRecognition() {
    if (!imgRef.current) return;
    setError(null);
    setPhase('recognizing');
    try {
      const blob = await cropToBlob(imgRef.current, selection);
      const worker = await createWorker('eng');
      try {
        await worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/',
          // Der Ausschnitt enthält bewusst nur eine Textzeile (Set-Code/Nummer) —
          // die automatische Seitensegmentierung (Tesseract-Default) versucht sonst
          // fälschlich, mehrere Blöcke/Absätze zu erkennen, was bei so einem
          // kleinen Ausschnitt öfter zu Fehlerkennungen führt als eine feste
          // "eine Zeile"-Annahme.
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
        });
        const { data } = await worker.recognize(blob);
        await matchText(data.text);
      } finally {
        await worker.terminate();
      }
    } catch (err) {
      setError((err as Error).message);
      setPhase('crop'); // Foto/Ausschnitt bleiben erhalten, statt komplett neu zu beginnen
    }
  }

  async function submitManual(e: FormEvent) {
    e.preventDefault();
    if (!manualText.trim()) return;
    setError(null);
    setManualBusy(true);
    try {
      await matchText(manualText.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setManualBusy(false);
    }
  }

  function retry() {
    setPhase('idle');
    setResults([]);
    setRawText('');
    setPreview(null);
    setSelection(DEFAULT_SELECTION);
  }

  // Zurück zum bestehenden Foto, um nur den Ausschnitt zu korrigieren — ohne
  // neu zu fotografieren (die eigentlich häufigste Ursache für schlechte OCR
  // ist ein zu großer/unscharfer Ausschnitt, nicht ein schlechtes Foto).
  function adjustCrop() {
    setError(null);
    setPhase('crop');
  }

  function pointerPercent(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = cropContainerRef.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function onCropPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    prevSelectionRef.current = selection;
    const p = pointerPercent(e);
    dragOriginRef.current = p;
    setSelection({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onCropPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragOriginRef.current) return;
    const p = pointerPercent(e);
    const o = dragOriginRef.current;
    setSelection({ x: Math.min(o.x, p.x), y: Math.min(o.y, p.y), w: Math.abs(p.x - o.x), h: Math.abs(p.y - o.y) });
  }

  function onCropPointerUp() {
    if (!dragOriginRef.current) return;
    dragOriginRef.current = null;
    // Zu kleine Ziehgeste (z. B. ein bloßer Tipp) verwirft sich selbst, statt
    // eine unbrauchbare Mini-Auswahl stehen zu lassen.
    setSelection((sel) => (sel.w < MIN_SELECTION || sel.h < MIN_SELECTION ? prevSelectionRef.current : sel));
  }

  // Nach Auswahl/eindeutigem Treffer direkt in den bestehenden "Zur Sammlung
  // hinzufügen"-Dialog übergeben — keine eigene Speicherlogik nötig.
  if (selected) {
    return (
      <AddToCollectionModal
        print={selected}
        cardName={cardName({ name: selected.card_name || '', name_de: selected.card_name_de }, lang)}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }

  const showManualToggle = !webcamActive && phase !== 'recognizing';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('scan_title')}</h3>
        {error && <div className="error-banner">{error}</div>}

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {webcamActive && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="scan-preview" />
            <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 0, marginBottom: 14 }}>
              <button type="button" className="btn primary" onClick={captureFromWebcam}>{t('scan_capture')}</button>
              {focusSupported && (
                <button type="button" className="btn" onClick={applyFocus} disabled={focusing}>
                  {focusing ? t('scan_focusing') : t('scan_focus')}
                </button>
              )}
              <button type="button" className="btn" onClick={stopWebcam}>{t('modal_cancel')}</button>
            </div>
          </>
        )}

        {!webcamActive && phase === 'idle' && (
          <>
            <p className="muted" style={{ marginBottom: 14 }}>{t('scan_hint')}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={() => fileInput.current?.click()}>{t('scan_take_photo')}</button>
              {WEBCAM_SUPPORTED && <button className="btn" onClick={startWebcam}>{t('scan_use_webcam')}</button>}
            </div>
          </>
        )}

        {!webcamActive && phase === 'crop' && preview && (
          <>
            <p className="muted" style={{ marginBottom: 8 }}>{t('scan_crop_hint')}</p>
            <div
              ref={cropContainerRef}
              className="scan-crop"
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              onPointerCancel={onCropPointerUp}
            >
              <img ref={imgRef} src={preview} alt="" draggable={false} onDragStart={(e) => e.preventDefault()} />
              <div
                className="scan-crop-box"
                style={{ left: `${selection.x}%`, top: `${selection.y}%`, width: `${selection.w}%`, height: `${selection.h}%` }}
              />
            </div>
            <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 0, marginBottom: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn primary"
                disabled={selection.w < MIN_SELECTION || selection.h < MIN_SELECTION}
                onClick={runRecognition}
              >
                {t('scan_crop_confirm')}
              </button>
              <button type="button" className="btn" onClick={() => setSelection(DEFAULT_SELECTION)}>{t('scan_crop_reset')}</button>
              <button type="button" className="btn" onClick={retry}>{t('scan_retry')}</button>
            </div>
          </>
        )}

        {!webcamActive && phase !== 'crop' && preview && <img src={preview} alt="" className="scan-preview" />}

        {phase === 'recognizing' && <p className="muted">{t('scan_recognizing')}</p>}

        {phase === 'none' && (
          <>
            <p className="muted" style={{ marginBottom: 6 }}>{t('scan_no_match')}</p>
            {rawText.trim() && <p className="muted" style={{ fontSize: 12 }}>„{rawText.trim().slice(0, 80)}“</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <button className="btn" onClick={adjustCrop}>{t('scan_adjust_crop')}</button>
              <button className="btn" onClick={retry}>{t('scan_retry')}</button>
            </div>
          </>
        )}

        {phase === 'results' && (
          <>
            <p className="muted" style={{ marginBottom: 10 }}>{t('scan_pick_result')}</p>
            {results.map((p) => (
              <div key={p.id} className="deck-row" style={{ cursor: 'pointer' }} onClick={() => setSelected(p)}>
                <CardImage className="thumb" src={p.image_small_url || p.image_url} alt="" />
                <div className="grow">
                  <div className="rowname">{cardName({ name: p.card_name || '', name_de: p.card_name_de }, lang)}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{p.set_code} {p.collector_number} · {p.rarity}</div>
                </div>
              </div>
            ))}
            <button className="btn" style={{ marginTop: 10 }} onClick={retry}>{t('scan_retry')}</button>
          </>
        )}

        {showManualToggle && (
          <div className="scan-manual">
            <button type="button" className="btn small" onClick={() => setManualOpen((v) => !v)}>
              {manualOpen ? t('scan_manual_close') : t('scan_manual_open')}
            </button>
            {manualOpen && (
              <form className="scan-manual-form" onSubmit={submitManual}>
                <input
                  type="text"
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder={t('scan_manual_placeholder')}
                  autoFocus
                />
                <button type="submit" className="btn primary small" disabled={manualBusy || !manualText.trim()}>
                  {manualBusy ? t('scan_manual_searching') : t('scan_manual_search')}
                </button>
              </form>
            )}
          </div>
        )}

        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>{t('modal_cancel')}</button>
        </div>
      </div>
    </div>
  );
}
