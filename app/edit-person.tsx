
import React from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { View } from 'react-native';
import PersonForm from '../components/forms/PersonForm';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { FormScreen } from '../components/ui';
import { useFormSessionKey } from '../hooks/useFormSessionKey';

export default function EditPersonScreen() {
  const params = useLocalSearchParams<{ personId: string }>();
  const { themedStyles } = useThemedStyles();
  const session = useFormSessionKey();

  // Return to wherever the form was opened from; a direct link has nowhere
  // to go back to, so it lands on the list.
  const handleClose = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/people');
  };

  return (
    <View style={themedStyles.container}>
      <FormScreen>
        {/* Fresh form per person and per visit (the screen stays mounted). */}
        <PersonForm key={`${params.personId}:${session}`} personId={params.personId} onClose={handleClose} />
      </FormScreen>
    </View>
  );
}
