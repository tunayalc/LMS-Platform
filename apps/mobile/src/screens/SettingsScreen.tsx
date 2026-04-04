import React, { useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import ScreenLayout from '../components/ui/ScreenLayout';
import Header from '../components/ui/Header';
import Card from '../components/ui/Card';
import { Feather } from '@expo/vector-icons';

const LANGUAGES = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

interface SettingsScreenProps {
  onBack: () => void;
  onLogout: () => void;
  appVersion?: string;
}

export default function SettingsScreen({ onBack, onLogout, appVersion = '1.0.0' }: SettingsScreenProps) {
  const { t, i18n } = useTranslation();
  const { colors, mode, setMode } = useTheme();
  const [langModalVisible, setLangModalVisible] = useState(false);

  const currentLang = useMemo(() => LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0], [i18n.language]);

  const SettingRow = ({ icon, label, value, onPress, isSwitch, switchValue, onSwitch }: any) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      disabled={isSwitch}
      activeOpacity={0.8}
    >
      <View style={styles.rowLeft}>
        <View style={[styles.iconBox, { backgroundColor: `${colors.primary}15` }]}>
          <Feather name={icon} size={20} color={colors.primary} />
        </View>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {isSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={onSwitch}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        ) : (
          <>
            {value ? <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{value}</Text> : null}
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenLayout header={<Header title={t('settings') || 'Ayarlar'} showBack onBack={onBack} />}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
          {t('visual_settings') || 'Görünüm'}
        </Text>
        <Card noPadding>
          <SettingRow
            icon="moon"
            label={t('dark_mode') || 'Karanlık Mod'}
            isSwitch
            switchValue={mode === 'dark'}
            onSwitch={(value: boolean) => setMode(value ? 'dark' : 'light')}
          />
          <SettingRow
            icon="globe"
            label={t('language') || 'Dil'}
            value={`${currentLang.flag} ${currentLang.label}`}
            onPress={() => setLangModalVisible(true)}
          />
        </Card>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary, marginTop: 24 }]}>
          {t('account_settings') || 'Hesap'}
        </Text>
        <Card noPadding>
          <SettingRow
            icon="shield"
            label={t('twofa_title') || '2FA'}
            value={t('setup') || 'Kur'}
            onPress={() => Alert.alert(t('twofa_title') || '2FA', '2FA ve şifre işlemlerini web üzerinden yapabilirsiniz.')}
          />
          <SettingRow
            icon="lock"
            label={t('change_password') || 'Şifre Değiştir'}
            value={t('setup') || 'Kur'}
            onPress={() => Alert.alert(t('change_password') || 'Şifre', 'Şifre değiştirme web üzerinden yapılır.')}
          />
        </Card>

        <Text style={[styles.sectionHeader, { color: colors.textSecondary, marginTop: 24 }]}>
          {t('about') || 'Hakkında'}
        </Text>
        <Card noPadding>
          <SettingRow icon="info" label={t('version') || 'Sürüm'} value={appVersion} onPress={() => { }} />
          <SettingRow
            icon="file-text"
            label={t('kvkk_link') || 'KVKK'}
            onPress={() => Alert.alert('KVKK', t('kvkk_intro') || '')}
          />
          <SettingRow
            icon="log-out"
            label={t('logout') || 'Çıkış Yap'}
            onPress={() => {
              Alert.alert(
                t('logout') || 'Çıkış',
                t('logout_confirm') || 'Çıkış yapmak istediğinize emin misiniz?',
                [
                  { text: t('cancel') || 'İptal', style: 'cancel' },
                  { text: t('logout') || 'Çıkış', style: 'destructive', onPress: onLogout },
                ],
              );
            }}
          />
        </Card>
      </ScrollView>

      <Modal
        transparent
        visible={langModalVisible}
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setLangModalVisible(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('select_language') || 'Dil Seçin'}</Text>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langOption,
                  { backgroundColor: i18n.language === lang.code ? `${colors.primary}15` : 'transparent' },
                ]}
                onPress={() => {
                  i18n.changeLanguage(lang.code);
                  setLangModalVisible(false);
                }}
              >
                <Text style={{ fontSize: 22, marginRight: 12 }}>{lang.flag}</Text>
                <Text
                  style={[
                    styles.langLabel,
                    {
                      color: i18n.language === lang.code ? colors.primary : colors.text,
                      fontWeight: i18n.language === lang.code ? '700' : '400',
                    },
                  ]}
                >
                  {lang.label}
                </Text>
                {i18n.language === lang.code ? (
                  <Feather name="check" size={20} color={colors.primary} style={{ marginLeft: 'auto' }} />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowValue: {
    fontSize: 14,
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  langLabel: {
    fontSize: 16,
  },
});

