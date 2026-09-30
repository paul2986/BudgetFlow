
import React from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { View } from 'react-native';
import PersonForm from '../components/forms/PersonForm';
import NewPersonForm from '../components/forms/NewPersonForm';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { FormScreen } from '../components/ui';
import { useFormSessionKey } from '../hooks/useFormSessionKey';
import { newPersonHandoff } from '../utils/newPersonHandoff';

export default function EditPersonScreen() {
  // pick=1: opened from another form to choose someone; hand the new person back.
  const params = useLocalSearchParams<{ personId: string; pick?: string }>();
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
        {/* Fresh form per person and per visit (the screen stays mounted).
            No personId: adding someone new (People's + button). */}
        {params.personId ? (
          <PersonForm key={`${params.personId}:${session}`} personId={params.personId} onClose={handleClose} />
        ) : (
          <NewPersonForm
            key={`new:${session}`}
            onClose={handleClose}
            onCreated={params.pick === '1' ? newPersonHandoff.put : undefined}
          />
        )}
      </FormScreen>
    </View>
  );
}
