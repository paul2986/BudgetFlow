import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import ConfirmDialog from './ui/ConfirmDialog';
import { DialogRequest, registerDialogPresenter } from '../utils/alert';

/**
 * Web presenter for `Alert.alert` calls routed through utils/alert.ts.
 * Requests queue so a follow-up error alert never replaces a pending confirm.
 */
export default function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    return registerDialogPresenter((request) => setQueue((q) => [...q, request]));
  }, []);

  const current = queue[0];
  if (!current) return null;

  const cancel = current.buttons.find((b) => b.style === 'cancel');
  const action = current.buttons.find((b) => b !== cancel) ?? cancel;

  const close = (button?: typeof action) => {
    setQueue((q) => q.slice(1));
    button?.onPress?.();
  };

  return (
    <ConfirmDialog
      visible
      title={current.title}
      message={current.message ?? ''}
      confirmLabel={action?.text ?? 'OK'}
      cancelLabel={cancel?.text ?? 'Cancel'}
      destructive={action?.style === 'destructive'}
      hideCancel={!cancel || action === cancel}
      onConfirm={() => close(action)}
      onCancel={() => close(cancel)}
    />
  );
}
