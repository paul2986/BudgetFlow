/**
 * Getting a workbook out of the app and a picked file into it, in the browser.
 * Phones and tablets get the share sheet (it can save to Files, which a plain
 * download from an installed web app often can't); everything else downloads.
 *
 * Both calls have to be made straight from a tap or click, with no waiting
 * first, or the browser won't allow the share sheet or the file picker.
 */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

export interface PickedFile {
  bytes: Uint8Array;
  fileName: string;
}

const isTouchDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS Safari reports itself as a Mac, but has a touch screen.
  const ipad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return ipad || (/iPhone|iPad|iPod|Android/i.test(ua) && navigator.maxTouchPoints > 0);
};

export const saveWorkbook = async (fileName: string, bytes: Uint8Array): Promise<SaveOutcome> => {
  const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME });

  if (isTouchDevice() && typeof navigator.canShare === 'function') {
    const file = new File([blob], fileName, { type: XLSX_MIME });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName });
        return 'shared';
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return 'cancelled';
        // Anything else: fall through to a plain download.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
};

export const pickWorkbook = (): Promise<PickedFile | null> =>
  new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${XLSX_MIME},.xlsx`;
    input.style.display = 'none';

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      input.remove();
      fn();
    };

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return finish(() => resolve(null));
      try {
        const buffer = await file.arrayBuffer();
        finish(() => resolve({ bytes: new Uint8Array(buffer), fileName: file.name }));
      } catch (e) {
        finish(() => reject(e));
      }
    });
    // Fired when the picker is dismissed without a choice, so nothing is left waiting.
    input.addEventListener('cancel', () => finish(() => resolve(null)));

    document.body.appendChild(input);
    input.click();
  });
