import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Getting a workbook out of the app and a picked file into it, on iOS and
 * Android. The web build has its own version in `fileTransfer.web.ts`.
 */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_UTI = 'org.openxmlformats.spreadsheetml.sheet';

/** What happened to an exported file: handed to the share sheet, saved by the browser, or the person backed out. */
export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

export interface PickedFile {
  bytes: Uint8Array;
  fileName: string;
}

/** Write the workbook to a temporary file and open the share sheet (Save to Files, AirDrop, Mail, …). */
export const saveWorkbook = async (fileName: string, bytes: Uint8Array): Promise<SaveOutcome> => {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType: XLSX_MIME, UTI: XLSX_UTI, dialogTitle: fileName });
  // The share sheet doesn't say whether anything was done with the file.
  return 'shared';
};

/** Let the person choose an .xlsx file; null if they back out. */
export const pickWorkbook = async (): Promise<PickedFile | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: [XLSX_MIME, 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return { bytes: await new File(asset.uri).bytes(), fileName: asset.name };
};
