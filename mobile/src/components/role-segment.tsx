import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/chip';
import type { AppRole } from '@/types/domain';

const roles: Array<{ label: string; value: AppRole }> = [
  { label: 'Buyer', value: 'buyer' },
  { label: 'Seller', value: 'seller' },
  { label: 'Agent', value: 'agent' },
  { label: 'Developer', value: 'developer' },
  { label: 'Investor', value: 'investor' },
];

export function RoleSegment({ value, onChange }: { value: AppRole; onChange: (role: AppRole) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {roles.map((role) => (
        <Chip key={role.value} active={value === role.value} onPress={() => onChange(role.value)}>
          {role.label}
        </Chip>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingRight: 18,
  },
});
