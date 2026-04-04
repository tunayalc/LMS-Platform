import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../api/client';
import { Feather } from '@expo/vector-icons';

type ModuleNode = {
  id: string;
  courseId: string;
  title: string;
  sortOrder?: number;
  parentModuleId?: string | null;
  children?: ModuleNode[];
  contentItems?: any[];
};

export default function ModulesEditorScreen(props: { courseId: string; onBack: () => void }) {
  const { courseId, onBack } = props;
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modules, setModules] = useState<ModuleNode[]>([]);
  const [newTitle, setNewTitle] = useState('');

  const headersPromise = useMemo(
    () =>
      (async () => {
        const token = await AsyncStorage.getItem('auth_token');
        return token ? { Authorization: `Bearer ${token}` } : undefined;
      })(),
    []
  );

  const loadModules = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await headersPromise;
      const response = (await apiClient.get(`/courses/${courseId}/modules`, { headers })) as any;
      const list = Array.isArray(response) ? response : response?.modules || [];
      // Only root modules are edited here; nested structure is still visible in CourseDetail.
      setModules(list);
    } catch (e: any) {
      console.error('Modules load error:', e);
      Alert.alert(t('error', { defaultValue: 'Hata' }), t('load_failed', { defaultValue: 'Yükleme başarısız' }));
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, [courseId, headersPromise, t]);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  const persistOrder = async (nextModules: ModuleNode[]) => {
    const headers = await headersPromise;
    const updates = nextModules.map((m, index) => ({
      id: m.id,
      sortOrder: index,
      parentModuleId: m.parentModuleId ?? null
    }));
    await apiClient.post('/api/modules/reorder', { updates }, { headers });
  };

  const moveModule = async (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= modules.length) return;

    const next = [...modules];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setModules(next);

    try {
      await persistOrder(next);
    } catch (e) {
      console.error('Module reorder error:', e);
      Alert.alert(t('error', { defaultValue: 'Hata' }), t('update_failed', { defaultValue: 'Güncelleme başarısız' }));
      await loadModules();
    }
  };

  const addModule = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const headers = await headersPromise;
      const created = (await apiClient.post(
        '/api/modules',
        { courseId, title: newTitle.trim(), sortOrder: modules.length },
        { headers }
      )) as any;
      setNewTitle('');
      setModules((prev) => [...prev, created]);
    } catch (e) {
      console.error('Create module error:', e);
      Alert.alert(t('error', { defaultValue: 'Hata' }), t('add_failed', { defaultValue: 'Ekleme başarısız' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Feather name="arrow-left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('edit_modules_title', { defaultValue: 'Modülleri Düzenle' })}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={[styles.addRow, { borderBottomColor: colors.border }]}>
        <TextInput
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder={t('new_module_placeholder', { defaultValue: 'Yeni modül başlığı' })}
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
        />
        <TouchableOpacity
          onPress={addModule}
          disabled={saving || !newTitle.trim()}
          style={[styles.addBtn, { backgroundColor: saving || !newTitle.trim() ? colors.border : colors.primary }]}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="plus" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={modules}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t('no_modules_yet', { defaultValue: 'Henüz modül yok.' })}
            </Text>
          }
          renderItem={({ item, index }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                  {t('order', { defaultValue: 'Sıra' })}: {index + 1}
                </Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => void moveModule(index, 'up')} disabled={index === 0} style={styles.iconBtn}>
                  <Feather name="chevron-up" size={18} color={index === 0 ? colors.border : colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void moveModule(index, 'down')}
                  disabled={index === modules.length - 1}
                  style={styles.iconBtn}
                >
                  <Feather name="chevron-down" size={18} color={index === modules.length - 1 ? colors.border : colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800' },
  addRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1
  },
  input: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15
  },
  addBtn: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 30 },
  emptyText: { textAlign: 'center', marginTop: 30 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12
  },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 6, marginLeft: 12 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }
});
