import { View, ScrollView } from 'react-native';
import { LAYOUT } from '../hooks/useBreakpoint';
import { router } from 'expo-router';
import StandardHeader from '../components/StandardHeader';
import PrivacyContent from '../components/PrivacyContent';
import { useThemedStyles } from '../hooks/useThemedStyles';
import { space } from '../styles/tokens';

/** Settings → Privacy. The same text the sign-in screen shows before an account exists. */
export default function PrivacyScreen() {
  const { themedStyles, breakpoint } = useThemedStyles();
  const goBack = () => (router.canGoBack() ? router.back() : router.navigate('/settings'));

  return (
    <View style={themedStyles.container}>
      <StandardHeader title="Privacy" onLeftPress={goBack} maxWidth={LAYOUT.listMaxWidth} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[themedStyles.scrollContent, { paddingHorizontal: breakpoint.gutter, paddingTop: space.s6 }]}
      >
        <View style={{ width: '100%', maxWidth: LAYOUT.listMaxWidth, alignSelf: 'center' }}>
          <PrivacyContent />
        </View>
      </ScrollView>
    </View>
  );
}
