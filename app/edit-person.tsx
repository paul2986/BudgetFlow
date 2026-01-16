
import React from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { View } from 'react-native';
import PersonForm from '../components/forms/PersonForm';
import StandardHeader from '../components/StandardHeader';
import { useThemedStyles } from '../hooks/useThemedStyles';

export default function EditPersonScreen() {
  const params = useLocalSearchParams<{ personId: string }>();
  const { themedStyles } = useThemedStyles();

  const handleClose = () => {
    router.replace('/people');
  };

  return (
    <View style={themedStyles.container}>
      <StandardHeader
        title="Edit Person"
        onLeftPress={handleClose}
      />
      <PersonForm personId={params.personId} onClose={handleClose} />
    </View>
  );
}
