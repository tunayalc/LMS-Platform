import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  BackHandler,
  TextInput,
  AppState,
  AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../api/client';
import { Exam, Question, trueFalseOptions } from '../shared';
import { CodeQuestion, HotspotQuestion, MatchingQuestion, OrderingQuestion } from '../components/questions';

interface ExamTakingScreenProps {
  examId: string;
  onBack: () => void;
}

type AnswerMap = Record<string, any>;

export default function ExamTakingScreen({ examId, onBack }: ExamTakingScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [token, setToken] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const submittingRef = useRef(false);
  const lastProctorRef = useRef<{ type: string; at: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      if (!storedToken) {
        Alert.alert(t('error'), t('session_expired'));
        onBack();
        return;
      }
      setToken(storedToken);

      const headers = { Authorization: `Bearer ${storedToken}` };
      const examRes = (await apiClient.get(`/exams/${examId}`, { headers })) as any;
      const examData = examRes?.exam ?? examRes;
      setExam(examData);

      const qRes = (await apiClient.get(`/questions`, { headers, params: { examId } })) as any;
      const qList: Question[] = Array.isArray(qRes) ? qRes : (qRes?.questions ?? []);
      setQuestions(qList);

      const durationMinutes = examData?.durationMinutes ?? 0;
      setTimeLeft(durationMinutes ? durationMinutes * 60 : null);
    } catch (e) {
      console.error('Exam load failed', e);
      Alert.alert(t('error'), t('connection_error'));
      onBack();
    } finally {
      setLoading(false);
    }
  }, [examId, onBack, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const backAction = () => {
      Alert.alert(
        t('warning') || 'Uyarı',
        t('exam_exit_warning') || 'Sınavdan çıkmak istediğinize emin misiniz?',
        [
          { text: t('cancel') || 'İptal', style: 'cancel' },
          { text: t('exit') || 'Çık', style: 'destructive', onPress: onBack },
        ],
      );
      return true;
    };
    const handler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => handler.remove();
  }, [onBack, t]);

  const handleSubmit = useCallback(async (auto = false) => {
    if (submittingRef.current) return;
    if (!token) return;
    if (!exam) return;

    const doSubmit = async () => {
      submittingRef.current = true;
      setSubmitting(true);
      try {
        const res = (await apiClient.post(
          `/exams/${exam.id}/submit`,
          { answers },
          { headers: { Authorization: `Bearer ${token}` } },
        )) as any;
        const score = res?.score ?? 0;
        const needsManual = Boolean(res?.needsManualGrading);
        Alert.alert(
          t('exam_submitted', 'Sınav Gönderildi'),
          `${t('score', 'Skor')}: ${score}/100${needsManual ? `\n${t('manual_review_needed', 'Öğretmen değerlendirmesi gerekli')}` : ''}`,
          [{ text: 'OK', onPress: onBack }],
        );
      } catch (e: any) {
        Alert.alert(t('error'), e?.message || t('exam_submit_error'));
      } finally {
        setSubmitting(false);
        submittingRef.current = false;
      }
    };

    if (auto) {
      await doSubmit();
      return;
    }

    Alert.alert(
      t('submit_exam') || 'Sınavı Bitir',
      t('submit_confirm') || 'Sınavı bitirmek istediğinize emin misiniz?',
      [
        { text: t('cancel') || 'İptal', style: 'cancel' },
        { text: t('submit') || 'Bitir', style: 'default', onPress: () => void doSubmit() },
      ],
    );
  }, [answers, exam, onBack, t, token]);

  const logProctor = useCallback(async (type: string, message: string) => {
    if (!token || !exam) return;
    const now = Date.now();
    const last = lastProctorRef.current;
    if (last && last.type === type && now - last.at < 15000) {
      return;
    }
    lastProctorRef.current = { type, at: now };
    try {
      await apiClient.post(
        `/exams/${exam.id}/proctor`,
        { type, message },
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (_e) {
      // best-effort
    }
  }, [exam, token]);

  useEffect(() => {
    let prevState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (prevState === 'active' && nextState !== 'active') {
        void logProctor('app_background', `App switched (state=${nextState})`);
      }
      prevState = nextState;
    });
    return () => sub.remove();
  }, [logProctor]);

  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      void handleSubmit(true);
      return;
    }
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev === null ? null : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, handleSubmit]);

  const currentQuestion = questions[currentIndex];

  const setAnswer = useCallback((questionId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const toggleOption = useCallback((questionId: string, option: string, isMulti: boolean) => {
    setAnswers((prev) => {
      const current = prev[questionId];
      if (isMulti) {
        const list = Array.isArray(current) ? (current as string[]) : [];
        if (list.includes(option)) {
          return { ...prev, [questionId]: list.filter((o) => o !== option) };
        }
        return { ...prev, [questionId]: [...list, option] };
      }
      return { ...prev, [questionId]: option };
    });
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const questionProgress = useMemo(() => {
    const total = Math.max(1, questions.length);
    return { current: currentIndex + 1, total };
  }, [currentIndex, questions.length]);

  const renderMultipleChoice = (q: Question, multi: boolean) => {
    const options = q.options || [];
    const selected = answers[q.id];
    return (
      <View style={styles.optionsList}>
        {options.map((opt, idx) => {
          const isSelected = multi ? (Array.isArray(selected) ? selected.includes(opt) : false) : selected === opt;
          return (
            <TouchableOpacity
              key={`${q.id}-${idx}`}
              style={[
                styles.optionRow,
                { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: colors.card },
              ]}
              onPress={() => toggleOption(q.id, opt, multi)}
            >
              <View
                style={[
                  styles.radio,
                  { borderColor: isSelected ? colors.primary : colors.textSecondary },
                  isSelected && { backgroundColor: colors.primary },
                ]}
              />
              <Text style={[styles.optionText, { color: colors.text }]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderTrueFalse = (q: Question) => {
    const selected = (answers[q.id] as string | undefined) ?? undefined;
    const options = (q.options?.length ? q.options : trueFalseOptions) as string[];
    return (
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {options.map((opt) => {
          const isSelected = selected === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[
                styles.tfButton,
                { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: colors.card },
                isSelected && { backgroundColor: colors.primary },
              ]}
              onPress={() => setAnswer(q.id, opt)}
            >
              <Text style={[styles.tfButtonText, { color: isSelected ? '#fff' : colors.text }]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderTextAnswer = (q: Question, multiline: boolean) => (
    <TextInput
      value={(answers[q.id] as string) || ''}
      onChangeText={(val) => setAnswer(q.id, val)}
      placeholder={t('your_answer', 'Cevabınız')}
      placeholderTextColor={colors.textSecondary}
      multiline={multiline}
      style={[
        styles.textInput,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          color: colors.text,
          minHeight: multiline ? 120 : 44,
        },
      ]}
    />
  );

  const renderFillBlank = (q: Question) => {
    const blanks = (q.prompt.match(/_+/g) || []).length || 1;
    const current = (answers[q.id] as string[]) || Array(blanks).fill('');
    return (
      <View style={{ gap: 10 }}>
        {current.map((val, idx) => (
          <TextInput
            key={`${q.id}-blank-${idx}`}
            value={val}
            onChangeText={(text) => {
              const next = [...current];
              next[idx] = text;
              setAnswer(q.id, next);
            }}
            placeholder={`${t('blank', 'Boşluk')} ${idx + 1}`}
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.textInput,
              { backgroundColor: colors.card, borderColor: colors.border, color: colors.text, minHeight: 44 },
            ]}
          />
        ))}
      </View>
    );
  };

  const renderCalculation = (q: Question) => (
    <TextInput
      value={(answers[q.id] as string) || ''}
      onChangeText={(val) => setAnswer(q.id, val)}
      placeholder={t('calculation_placeholder', 'Sayısal cevap')}
      placeholderTextColor={colors.textSecondary}
      keyboardType="numeric"
      style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text, minHeight: 44 }]}
    />
  );

  const renderOrdering = (q: Question) => {
    const items = q.meta?.orderingItems ?? [];
    const value = (answers[q.id] as string[]) ?? [];
    return <OrderingQuestion items={items} value={value} onChange={(order) => setAnswer(q.id, order)} />;
  };

  const renderMatching = (q: Question) => {
    const pairs = q.meta?.matchingPairs ?? [];
    const leftItems = pairs.map((p) => p.left);
    const rightItems = pairs.map((p) => p.right);
    const value = (answers[q.id] as Record<string, string>) ?? {};
    return (
      <MatchingQuestion
        leftItems={leftItems}
        rightItems={rightItems}
        value={value}
        onChange={(next) => setAnswer(q.id, next)}
      />
    );
  };

  const renderHotspot = (q: Question) => {
    const imageUrl = q.meta?.hotspot?.imageUrl;
    const areas = q.meta?.hotspot?.areas ?? [];
    if (!imageUrl) {
      return <Text style={{ color: colors.error }}>{t('hotspot_missing_image', 'Hotspot resmi eksik.')}</Text>;
    }
    const regions = areas.map((a, idx) => ({
      id: `area-${idx}`,
      type: 'rectangle' as const,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
    }));
    const value = (answers[q.id] as { x: number; y: number } | null) ?? null;
    return <HotspotQuestion imageUrl={imageUrl} regions={regions} value={value} onChange={(p) => setAnswer(q.id, p)} />;
  };

  const renderCode = (q: Question) => {
    const meta = q.meta?.code;
    return (
      <CodeQuestion
        language={meta?.language || 'javascript'}
        starterCode={meta?.starter}
        value={(answers[q.id] as string) || ''}
        onChange={(val) => setAnswer(q.id, val)}
        testResults={[]}
      />
    );
  };

  const renderQuestion = (q: Question) => {
    switch (q.type) {
      case 'multiple_choice':
        return renderMultipleChoice(q, false);
      case 'multiple_select':
        return renderMultipleChoice(q, true);
      case 'true_false':
        return renderTrueFalse(q);
      case 'short_answer':
        return renderTextAnswer(q, false);
      case 'long_answer':
        return renderTextAnswer(q, true);
      case 'ordering':
        return renderOrdering(q);
      case 'matching':
        return renderMatching(q);
      case 'fill_blank':
        return renderFillBlank(q);
      case 'calculation':
        return renderCalculation(q);
      case 'hotspot':
        return renderHotspot(q);
      case 'code':
        return renderCode(q);
      default:
        return (
          <Text style={{ color: colors.textSecondary }}>
            {t('unsupported_question_type', 'Desteklenmeyen soru tipi')}: {q.type}
          </Text>
        );
    }
  };

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!exam || questions.length === 0) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>{t('no_questions_found', 'Soru bulunamadı')}</Text>
        <TouchableOpacity style={[styles.backBtn, { borderColor: colors.border }]} onPress={onBack}>
          <Text style={{ color: colors.text }}>{t('back', 'Geri')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.topBack}>
          <Text style={{ color: colors.text }}>{t('back', 'Geri')}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.examTitle, { color: colors.text }]} numberOfLines={1}>
            {exam.title}
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            {questionProgress.current}/{questionProgress.total}
          </Text>
        </View>
        <View style={styles.timerBox}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('time_remaining', 'Kalan')}</Text>
          <Text style={{ color: timeLeft !== null && timeLeft < 300 ? colors.error : colors.primary, fontWeight: '800' }}>
            {timeLeft !== null ? formatTime(timeLeft) : '--:--'}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.prompt, { color: colors.text }]}>{currentQuestion.prompt}</Text>
        <View style={{ marginTop: 12 }}>{renderQuestion(currentQuestion)}</View>
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.navBtn, { borderColor: colors.border, opacity: currentIndex === 0 ? 0.4 : 1 }]}
          disabled={currentIndex === 0 || submitting}
          onPress={() => setCurrentIndex((p) => Math.max(0, p - 1))}
        >
          <Text style={{ color: colors.text }}>{t('prev', 'Önceki')}</Text>
        </TouchableOpacity>

        {currentIndex === questions.length - 1 ? (
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.success, opacity: submitting ? 0.7 : 1 }]}
            disabled={submitting}
            onPress={() => void handleSubmit(false)}
          >
            <Text style={styles.submitBtnText}>{submitting ? (t('submitting', 'Gönderiliyor...')) : t('submit', 'Bitir')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}
            disabled={submitting}
            onPress={() => setCurrentIndex((p) => Math.min(questions.length - 1, p + 1))}
          >
            <Text style={styles.nextBtnText}>{t('next', 'Sonraki')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.palette, { backgroundColor: colors.background }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {questions.map((q, idx) => {
            const isAnswered = answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== '';
            const isCurrent = idx === currentIndex;
            return (
              <TouchableOpacity
                key={q.id}
                style={[
                  styles.paletteItem,
                  { backgroundColor: isAnswered ? colors.success + '22' : colors.card, borderColor: isCurrent ? colors.primary : colors.border },
                  isCurrent && { borderWidth: 2 },
                ]}
                onPress={() => setCurrentIndex(idx)}
              >
                <Text style={{ color: isCurrent ? colors.primary : isAnswered ? colors.success : colors.textSecondary, fontWeight: isCurrent ? '800' : '600' }}>
                  {idx + 1}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  topBar: {
    padding: 12,
    paddingTop: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    gap: 12,
  },
  topBack: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  examTitle: { fontSize: 16, fontWeight: '800' },
  timerBox: { alignItems: 'flex-end' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  prompt: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  optionsList: { gap: 10 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  optionText: { flex: 1, fontSize: 14 },
  radio: { width: 18, height: 18, borderWidth: 2, borderRadius: 9 },
  tfButton: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  tfButtonText: { fontSize: 14, fontWeight: '800' },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  bottomBar: { flexDirection: 'row', gap: 12, padding: 12, borderTopWidth: 1 },
  navBtn: { flex: 1, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', height: 44 },
  nextBtn: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', height: 44 },
  nextBtnText: { color: '#fff', fontWeight: '800' },
  submitBtn: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', height: 44 },
  submitBtnText: { color: '#fff', fontWeight: '800' },
  backBtn: { marginTop: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  palette: { paddingVertical: 10 },
  paletteItem: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
});
