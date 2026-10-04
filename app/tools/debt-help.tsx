import React, { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import ToolLayout from '../../components/tools/ToolLayout';
import DebtHelpServiceCard from '../../components/tools/DebtHelpServiceCard';
import Button from '../../components/Button';
import Icon from '../../components/Icon';
import { Card, ChoicePills } from '../../components/ui';
import { useTheme } from '../../hooks/useTheme';
import { useToast } from '../../hooks/useToast';
import { FCA_REGISTER_URL, NATIONS, checkedOnLabel, servicesFor, type Nation } from '../../utils/debtHelp';
import { openLink } from '../../utils/openLink';
import { type, space } from '../../styles/tokens';

/**
 * Debt help (UK): signposting to free, impartial debt advice. No inputs beyond
 * which nation you live in (the rules, and some services, differ), and nothing
 * from the budget is read or sent. The list is hand-checked data in
 * utils/debtHelp.ts.
 */

const EXPECT: { icon: string; text: string }[] = [
  { icon: 'heart-outline', text: 'It’s free and confidential. Advisers have heard it all before and won’t judge.' },
  { icon: 'list-outline', text: 'They look at your income, bills and what you owe, then explain the options that fit.' },
  { icon: 'document-text-outline', text: 'Recent bills, statements and letters help, but you can ring without them.' },
  { icon: 'checkmark-circle-outline', text: 'You don’t have to decide anything on the call. The numbers here are free from UK mobiles and landlines.' },
];

export default function DebtHelpScreen() {
  const { tokens } = useTheme();
  const { showToast } = useToast();
  const [nation, setNation] = useState<Nation>('england');

  const open = useCallback(
    async (url: string) => {
      if (await openLink(url)) return;
      showToast(
        url.startsWith('tel:') ? 'Couldn’t start the call. The number is on the card to dial by hand.' : 'Couldn’t open that page. Try searching for the name.',
        'error'
      );
    },
    [showToast]
  );

  const picker = (
    <Card title="Where do you live?">
      <ChoicePills label="Where you live" showLabel={false} options={NATIONS} value={nation} onChange={setNation} />
      <Text style={[type.caption, { color: tokens.colors.textMuted, marginTop: space.s3 }]}>
        Debt rules differ across the UK, so the list shows the services that cover where you are.
      </Text>
    </Card>
  );

  const results = (
    <View style={{ gap: space.s4 }}>
      {servicesFor(nation).map((service) => (
        <DebtHelpServiceCard key={service.id} service={service} onOpen={open} />
      ))}

      <Card title="Talking to an adviser">
        <View style={{ gap: space.s3 }}>
          {EXPECT.map((item) => (
            <View key={item.icon} style={{ flexDirection: 'row', gap: space.s3 }}>
              <Icon name={item.icon as any} size={20} color={tokens.colors.textMuted} />
              <Text style={[type.body, { flex: 1, color: tokens.colors.text }]}>{item.text}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card title="Before you pay anyone">
        <Text style={[type.body, { color: tokens.colors.text }]}>
          Good debt advice is free. Be wary of any company that charges a fee up front, promises to wipe out your debts or pushes you to
          sign quickly. You can check that a firm is authorised on the Financial Conduct Authority’s register.
        </Text>
        <Button
          variant="outline"
          text="Check a firm on the FCA register"
          icon={<Icon name="open-outline" size={18} color={tokens.colors.text} />}
          onPress={() => open(FCA_REGISTER_URL)}
          style={{ marginTop: space.s3 }}
        />
      </Card>

      <Text style={[type.caption, { color: tokens.colors.textMuted, marginHorizontal: space.s2 }]}>
        Budget Flow isn’t a debt adviser and earns nothing from these links. Nothing from your budget is sent to these services when you
        open one. Details were checked on {checkedOnLabel()}; check each service’s website for opening hours and the latest contact
        details.
      </Text>
    </View>
  );

  return (
    <ToolLayout
      title="Debt help"
      intro="If money is getting on top of you, these services give free, impartial advice. Getting in touch doesn’t commit you to anything."
      inputs={picker}
      results={results}
    />
  );
}
