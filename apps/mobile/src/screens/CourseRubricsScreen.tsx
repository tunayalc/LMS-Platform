import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../api/client';
import { Feather } from '@expo/vector-icons';

type RubricLevelInput = { name: string; description: string; points: number };
type RubricCriteriaInput = { name: string; description: string; maxPoints: number; levels: RubricLevelInput[] };

type RubricListItem = {
  id: string;
  title: string;
  description?: string | null;
  course_id?: string | null;
  courseId?: string | null;
  created_at?: string;
  createdAt?: string;
};

export default function CourseRubricsScreen(props: { courseId: string; onBack: () => void }) {
  const { courseId, onBack } = props;
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [rubrics, setRubrics] = useState<RubricListItem[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<RubricCriteriaInput[]>([
    {
      name: '',
      description: '',
      maxPoints: 10,
      levels: [
        { name: 'İyi', description: '', points: 10 },
        { name: 'Orta', description: '', points: 6 },
        { name: 'Zayıf', description: '', points: 2 }
      ]
    }
  ]);

  const headersPromise = useMemo(
    () =>
      (async () => {
        const token = await AsyncStorage.getItem('auth_token');
        return token ? { Authorization: `Bearer ${token}` } : undefined;
      })(),
    []
  );

  const loadRubrics = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await headersPromise;
      const response = (await apiClient.get('/api/rubrics', { headers, params: { courseId } })) as any;
      const list = Array.isArray(response) ? response : response?.rubrics || [];
      setRubrics(list);
    } catch (e: any) {
      console.error('Rubrics load error:', e);
      Alert.alert(t('error', { defaultValue: 'Hata' }), t('load_failed', { defaultValue: 'Yükleme başarısız' }));
      setRubrics([]);
    } finally {
      setLoading(false);
    }
  }, [courseId, headersPromise, t]);

  useEffect(() => {
    void loadRubrics();
  }, [loadRubrics]);

  const resetCreate = () => {
    setTitle('');
    setDescription('');
    setCriteria([
      {
        name: '',
        description: '',
        maxPoints: 10,
        levels: [
          { name: 'İyi', description: '', points: 10 },
          { name: 'Orta', description: '', points: 6 },
          { name: 'Zayıf', description: '', points: 2 }
        ]
      }
    ]);
  };

  const updateCriteria = (index: number, patch: Partial<RubricCriteriaInput>) => {
    setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const updateLevel = (criteriaIndex: number, levelIndex: number, patch: Partial<RubricLevelInput>) => {
    setCriteria((prev) =>
      prev.map((c, i) => {
        if (i !== criteriaIndex) return c;
        return {
          ...c,
          levels: c.levels.map((l, j) => (j === levelIndex ? { ...l, ...patch } : l))
        };
      })
    );
  };

  const addCriteria = () => {
    setCriteria((prev) => [
      ...prev,
      {
        name: '',
        description: '',
        maxPoints: 10,
        levels: [
          { name: 'İyi', description: '', points: 10 },
          { name: 'Orta', description: '', points: 6 },
          { name: 'Zayıf', description: '', points: 2 }
        ]
      }
    ]);
  };

  const removeCriteria = (index: number) => {
    setCriteria((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert(t('error', { defaultValue: 'Hata' }), t('validation_error_title', { defaultValue: 'Başlık gerekli' }));
      return;
    }
    const cleanedCriteria = criteria
      .map((c) => ({
        name: c.name.trim(),
        description: c.description.trim(),
        maxPoints: Number(c.maxPoints) || 10,
        levels: c.levels
          .map((l) => ({
            name: l.name.trim(),
            description: l.description.trim(),
            points: Number(l.points) || 0
          }))
          .filter((l) => l.name)
      }))
      .filter((c) => c.name);

    if (!cleanedCriteria.length) {
      Alert.alert(t('error', { defaultValue: 'Hata' }), t('rubric_criteria_required', { defaultValue: 'En az 1 kriter gerekli' }));
      return;
    }

    setSaving(true);
    try {
      const headers = await headersPromise;
      await apiClient.post(
        '/api/rubrics',
        {
          title: title.trim(),
          description: description.trim() || undefined,
          courseId,
          criteria: cleanedCriteria
        },
        { headers }
      );
      setCreateOpen(false);
      resetCreate();
      await loadRubrics();
    } catch (e: any) {
      console.error('Rubric create error:', e);
      Alert.alert(t('error', { defaultValue: 'Hata' }), t('save_failed', { defaultValue: 'Kaydetme başarısız' }));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rubricId: string) => {
    Alert.alert(
      t('confirm', { defaultValue: 'Onay' }),
      t('delete_confirm', { defaultValue: 'Silmek istediğine emin misin?' }),
      [
        { text: t('cancel', { defaultValue: 'İptal' }), style: 'cancel' },
        {
          text: t('delete', { defaultValue: 'Sil' }),
          style: 'destructive',
          onPress: async () => {
            try {
              const headers = await headersPromise;
              await apiClient.del(`/api/rubrics/${rubricId}`, { headers });
              await loadRubrics();
            } catch (e: any) {
              Alert.alert(t('error', { defaultValue: 'Hata' }), t('delete_failed', { defaultValue: 'Silme başarısız' }));
            }
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('rubrics', { defaultValue: 'Rubrikler' })}</Text>
        <TouchableOpacity onPress={() => setCreateOpen(true)} style={styles.addButton}>
          <Feather name="plus" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {rubrics.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t('no_rubrics', { defaultValue: 'Bu derste rubrik yok.' })}
            </Text>
          ) : (
            rubrics.map((r) => (
              <View key={r.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{r.title}</Text>
                  <TouchableOpacity onPress={() => handleDelete(r.id)} style={{ padding: 6 }}>
                    <Feather name="trash-2" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
                {!!r.description && (
                  <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={3}>
                    {r.description}
                  </Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={createOpen} animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setCreateOpen(false); resetCreate(); }} style={styles.backButton}>
              <Feather name="x" size={20} color={colors.primary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>{t('create', { defaultValue: 'Oluştur' })}</Text>
            <TouchableOpacity onPress={handleCreate} disabled={saving} style={styles.addButton}>
              {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="check" size={20} color={colors.primary} />}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={[styles.label, { color: colors.text }]}>{t('title', { defaultValue: 'Başlık' })}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('title', { defaultValue: 'Başlık' })}
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
            />

            <Text style={[styles.label, { color: colors.text, marginTop: 14 }]}>{t('description', { defaultValue: 'Açıklama' })}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('description_optional', { defaultValue: 'Opsiyonel' })}
              placeholderTextColor={colors.textSecondary}
              multiline
              style={[styles.textArea, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
            />

            <View style={{ marginTop: 18, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('criteria', { defaultValue: 'Kriterler' })}</Text>
              <TouchableOpacity onPress={addCriteria} style={[styles.chip, { borderColor: colors.primary }]}>
                <Feather name="plus" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '700', marginLeft: 6 }}>{t('add', { defaultValue: 'Ekle' })}</Text>
              </TouchableOpacity>
            </View>

            {criteria.map((c, idx) => (
              <View key={idx} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{t('criteria', { defaultValue: 'Kriter' })} #{idx + 1}</Text>
                  {criteria.length > 1 && (
                    <TouchableOpacity onPress={() => removeCriteria(idx)} style={{ padding: 6 }}>
                      <Feather name="trash-2" size={18} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>

                <TextInput
                  value={c.name}
                  onChangeText={(v) => updateCriteria(idx, { name: v })}
                  placeholder={t('criteria_name', { defaultValue: 'Kriter adı' })}
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                />
                <TextInput
                  value={c.description}
                  onChangeText={(v) => updateCriteria(idx, { description: v })}
                  placeholder={t('description_optional', { defaultValue: 'Açıklama (opsiyonel)' })}
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { marginTop: 10, backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>{t('max_points', { defaultValue: 'Max puan' })}</Text>
                    <TextInput
                      value={String(c.maxPoints)}
                      onChangeText={(v) => updateCriteria(idx, { maxPoints: Number(v.replace(/[^0-9]/g, '')) || 0 })}
                      keyboardType="number-pad"
                      style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                    />
                  </View>
                </View>

                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 14 }]}>{t('levels', { defaultValue: 'Seviyeler' })}</Text>
                {c.levels.map((l, j) => (
                  <View key={j} style={{ marginTop: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 2 }}>
                        <TextInput
                          value={l.name}
                          onChangeText={(v) => updateLevel(idx, j, { name: v })}
                          placeholder={t('level_name', { defaultValue: 'Seviye adı' })}
                          placeholderTextColor={colors.textSecondary}
                          style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextInput
                          value={String(l.points)}
                          onChangeText={(v) => updateLevel(idx, j, { points: Number(v.replace(/[^0-9]/g, '')) || 0 })}
                          keyboardType="number-pad"
                          placeholder={t('points', { defaultValue: 'Puan' })}
                          placeholderTextColor={colors.textSecondary}
                          style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                        />
                      </View>
                    </View>
                    <TextInput
                      value={l.description}
                      onChangeText={(v) => updateLevel(idx, j, { description: v })}
                      placeholder={t('description_optional', { defaultValue: 'Açıklama (opsiyonel)' })}
                      placeholderTextColor={colors.textSecondary}
                      style={[styles.input, { marginTop: 10, backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
                    />
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1
  },
  backButton: { padding: 6 },
  addButton: { padding: 6 },
  title: { fontSize: 18, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { textAlign: 'center', marginTop: 30 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardDesc: { marginTop: 8, fontSize: 13, lineHeight: 18 },
  modalContainer: { flex: 1 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  smallLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15
  },
  textArea: {
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    textAlignVertical: 'top'
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1
  }
});
