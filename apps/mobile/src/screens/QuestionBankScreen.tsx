import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../api/client';
import { Feather } from '@expo/vector-icons';

type Exam = { id: string; title: string; courseId?: string };
type Question = {
  id: string;
  examId?: string;
  prompt: string;
  type: string;
  points?: number;
};

export default function QuestionBankScreen(props: { courseId: string; onBack: () => void }) {
  const { courseId, onBack } = props;
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examsById, setExamsById] = useState<Map<string, Exam>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');

  const headersPromise = useMemo(
    () =>
      (async () => {
        const token = await AsyncStorage.getItem('auth_token');
        return token ? { Authorization: `Bearer ${token}` } : undefined;
      })(),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await headersPromise;
      const examsRes = (await apiClient.get('/exams', { headers, params: { courseId, limit: 500, offset: 0 } })) as any;
      const examsList: Exam[] = Array.isArray(examsRes) ? examsRes : examsRes?.exams || [];
      const nextMap = new Map<string, Exam>(examsList.map((e) => [e.id, e]));
      setExamsById(nextMap);

      const qRes = (await apiClient.get('/questions', { headers, params: { limit: 500, offset: 0 } })) as any;
      const qList: Question[] = Array.isArray(qRes) ? qRes : qRes?.questions || [];
      const allowedExamIds = new Set(examsList.map((e) => e.id));
      setQuestions(qList.filter((q) => q.examId && allowedExamIds.has(q.examId)));
    } catch (e: any) {
      console.error('Question bank load error:', e);
      Alert.alert(t('error', { defaultValue: 'Hata' }), t('load_failed', { defaultValue: 'Yükleme başarısız' }));
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [courseId, headersPromise, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = questions.filter((q) => {
    const haystack = `${q.prompt} ${q.type} ${(q.examId && examsById.get(q.examId)?.title) || ''}`.toLowerCase();
    return haystack.includes(searchQuery.toLowerCase());
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Feather name="arrow-left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('question_bank', { defaultValue: 'Soru Bankası' })}</Text>
        <TouchableOpacity onPress={() => void load()} style={styles.headerBtn}>
          <Feather name="refresh-cw" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('search_questions', { defaultValue: 'Sorularda ara...' })}
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text }]}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t('no_questions', { defaultValue: 'Bu derste soru yok.' })}
            </Text>
          }
          renderItem={({ item }) => {
            const examTitle = item.examId ? examsById.get(item.examId)?.title : undefined;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.type, { color: colors.primary }]}>
                    {t(item.type, { defaultValue: item.type })}
                  </Text>
                  {typeof item.points === 'number' && (
                    <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>
                      {item.points} {t('points', { defaultValue: 'puan' })}
                    </Text>
                  )}
                </View>
                {examTitle && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>
                    {t('exam', { defaultValue: 'Sınav' })}: {examTitle}
                  </Text>
                )}
                <Text style={[styles.prompt, { color: colors.text }]} numberOfLines={3}>
                  {item.prompt}
                </Text>
              </View>
            );
          }}
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
  searchContainer: { padding: 16, paddingBottom: 6 },
  searchInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 30 },
  emptyText: { textAlign: 'center', marginTop: 30 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  type: { fontSize: 12, fontWeight: '800' },
  prompt: { fontSize: 14, lineHeight: 20, fontWeight: '600' }
});
