import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { haptics } from '../utils/haptics';
import { PinPad, Sheet } from './ui';
import { space, type } from '../styles/tokens';

/**
 * A sheet that asks for a code, in whichever shape is needed:
 * - on its own: one code, for `onSubmit` to check (turning the lock off);
 * - `confirm`: a new code, typed twice, and said so if the two differ;
 * - `current` as well: the code in force first (changing it).
 * Whoever is asked answers with an error message to show, or nothing when the code
 * was accepted, and the sheet then closes itself. The steps start over each time
 * it opens, and after any mistake.
 */

interface CodeSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Asked when one code is wanted (or the new one, when `confirm`). */
  prompt: string;
  /** Choosing a new code: ask twice. */
  confirm?: boolean;
  /** The code in force, asked for first: returns an error to show, or nothing when right. */
  current?: { prompt: string; check: (pin: string) => Promise<string | void> };
  onSubmit: (pin: string) => Promise<string | void> | string | void;
}

type Step = 'current' | 'first' | 'second';

export default function CodeSheet({ visible, onClose, title, prompt, confirm, current, onSubmit }: CodeSheetProps) {
  const { tokens } = useTheme();
  const firstStep: Step = current ? 'current' : 'first';
  const [step, setStep] = useState<Step>(firstStep);
  const [chosen, setChosen] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    if (visible) {
      setStep(firstStep);
      setChosen('');
      setMessage(null);
    }
  }, [visible, firstStep]);

  const fail = useCallback((text: string, backTo?: Step) => {
    haptics.error();
    setMessage(text);
    setShakeKey((k) => k + 1);
    if (backTo) setStep(backTo);
  }, []);

  const handleComplete = useCallback(
    async (pin: string) => {
      if (step === 'current' && current) {
        const error = await current.check(pin);
        if (error) fail(error);
        else {
          setMessage(null);
          setStep('first');
        }
        return;
      }
      if (confirm && step === 'first') {
        setChosen(pin);
        setMessage(null);
        setStep('second');
        return;
      }
      if (confirm && pin !== chosen) {
        fail('Those two codes didn’t match. Choose a code again.', 'first');
        return;
      }
      const error = await onSubmit(pin);
      if (error) fail(error, confirm ? 'first' : undefined);
      else {
        setMessage(null);
        onClose();
      }
    },
    [step, current, confirm, chosen, onSubmit, onClose, fail]
  );

  const heading = step === 'current' && current ? current.prompt : step === 'second' ? 'Enter it again to confirm' : prompt;

  return (
    <Sheet visible={visible} onClose={onClose} title={title} leadingAction={{ label: 'Cancel', onPress: onClose }}>
      <View style={{ alignItems: 'center', paddingHorizontal: space.s5, paddingTop: space.s5, paddingBottom: space.s7 }}>
        <Text accessibilityRole="header" style={[type.h3, { color: tokens.colors.text, textAlign: 'center' }]}>
          {heading}
        </Text>
        <PinPad onComplete={handleComplete} error={!!message} shakeKey={shakeKey} />
        <View style={{ minHeight: 36, justifyContent: 'center' }} accessibilityLiveRegion="polite">
          {message ? <Text style={[type.caption, { color: tokens.colors.danger, textAlign: 'center' }]}>{message}</Text> : null}
        </View>
      </View>
    </Sheet>
  );
}
