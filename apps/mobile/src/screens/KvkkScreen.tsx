import React from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Linking
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

interface KvkkScreenProps {
    onBack: () => void;
}

export default function KvkkScreen({ onBack }: KvkkScreenProps) {
    const { t } = useTranslation();
    const { colors } = useTheme();

    const themedStyles = {
        container: {
            backgroundColor: colors.background,
        },
        card: {
            backgroundColor: colors.card,
        },
        title: {
            color: colors.text,
        },
        sectionTitle: {
            color: colors.text,
        },
        text: {
            color: colors.textSecondary,
        },
        listItem: {
            color: colors.text,
        },
        footer: {
            backgroundColor: colors.surface,
            borderColor: colors.border,
        },
        footerText: {
            color: colors.textSecondary,
        },
        backButton: {
            backgroundColor: colors.primary,
        },
        link: {
            color: colors.primary,
        }
    };

    return (
        <View style={[styles.container, themedStyles.container]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButtonSmall}>
                    <Text style={[styles.backButtonSmallText, { color: colors.primary }]}>
                        ← {t('return_to_login') || 'Giriş Sayfasına Dön'}
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={[styles.card, themedStyles.card]}>
                    {/* Title */}
                    <Text style={[styles.title, themedStyles.title]}>
                        {t('kvkk_title') || 'Kişisel Verilerin Korunması Kanunu (KVKK) Aydınlatma Metni'}
                    </Text>

                    {/* Intro */}
                    <Text style={[styles.paragraph, themedStyles.text]}>
                        {t('kvkk_intro') || 'LMS platformumuz, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında kişisel verilerinizi işlemektedir. Bu metin, veri sorumlusu sıfatıyla sizleri bilgilendirmek amacıyla hazırlanmıştır.'}
                    </Text>

                    {/* Section 1 */}
                    <Text style={[styles.sectionTitle, themedStyles.sectionTitle]}>
                        {t('kvkk_sec1_title') || '1. Toplanan Kişisel Veriler'}
                    </Text>
                    <Text style={[styles.paragraph, themedStyles.text]}>
                        {t('kvkk_sec1_desc') || 'Platformumuz aşağıdaki kişisel verileri toplamaktadır:'}
                    </Text>
                    <View style={styles.list}>
                        <Text style={[styles.listItem, themedStyles.listItem]}>
                            • {t('kvkk_sec1_item1') || 'Kimlik Bilgileri: Ad, soyad, kullanıcı adı'}
                        </Text>
                        <Text style={[styles.listItem, themedStyles.listItem]}>
                            • {t('kvkk_sec1_item2') || 'İletişim Bilgileri: E-posta adresi'}
                        </Text>
                        <Text style={[styles.listItem, themedStyles.listItem]}>
                            • {t('kvkk_sec1_item3') || 'Eğitim Bilgileri: Kurs ilerlemesi, sınav sonuçları'}
                        </Text>
                        <Text style={[styles.listItem, themedStyles.listItem]}>
                            • {t('kvkk_sec1_item4') || 'Teknik Veriler: IP adresi, oturum bilgileri'}
                        </Text>
                    </View>

                    {/* Section 2 */}
                    <Text style={[styles.sectionTitle, themedStyles.sectionTitle]}>
                        {t('kvkk_sec2_title') || '2. Verilerin İşlenme Amaçları'}
                    </Text>
                    <Text style={[styles.paragraph, themedStyles.text]}>
                        {t('kvkk_sec2_desc') || 'Kişisel verileriniz; eğitim hizmetlerinin sunulması, kullanıcı hesabının yönetimi, yasal yükümlülüklerin yerine getirilmesi ve platform güvenliğinin sağlanması amaçlarıyla işlenmektedir.'}
                    </Text>

                    {/* Section 3 */}
                    <Text style={[styles.sectionTitle, themedStyles.sectionTitle]}>
                        {t('kvkk_sec3_title') || '3. Veri Saklama ve Güvenlik'}
                    </Text>
                    <Text style={[styles.paragraph, themedStyles.text]}>
                        {t('kvkk_sec3_desc') || 'Verileriniz, yasal saklama süreleri boyunca güvenli sunucularda şifreli olarak saklanmaktadır. Veri güvenliği için endüstri standardı önlemler uygulanmaktadır.'}
                    </Text>

                    {/* Footer Card */}
                    <View style={[styles.footerCard, themedStyles.footer]}>
                        <Text style={[styles.footerText, themedStyles.footerText]}>
                            {t('kvkk_footer') || 'KVKK kapsamındaki haklarınız hakkında daha fazla bilgi almak veya başvuru yapmak için destek@lms.local adresine e-posta gönderebilirsiniz.'}
                        </Text>
                        <TouchableOpacity
                            onPress={() => Linking.openURL('mailto:destek@lms.local')}
                            style={styles.emailLink}
                        >
                            <Text style={[styles.linkText, themedStyles.link]}>
                                📧 destek@lms.local
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            {/* Bottom Back Button */}
            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={[styles.backButton, themedStyles.backButton]}
                    onPress={onBack}
                >
                    <Text style={styles.backButtonText}>
                        {t('back') || 'Geri Dön'}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    backButtonSmall: {
        paddingVertical: 8,
    },
    backButtonSmallText: {
        fontSize: 14,
        fontWeight: '600',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 100,
    },
    card: {
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 16,
        lineHeight: 28,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 20,
        marginBottom: 8,
    },
    paragraph: {
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 12,
    },
    list: {
        marginLeft: 4,
        marginBottom: 8,
    },
    listItem: {
        fontSize: 14,
        lineHeight: 24,
        marginBottom: 4,
    },
    footerCard: {
        marginTop: 24,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    footerText: {
        fontSize: 13,
        lineHeight: 20,
        marginBottom: 12,
    },
    emailLink: {
        paddingVertical: 8,
    },
    linkText: {
        fontSize: 14,
        fontWeight: '600',
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        paddingBottom: 32,
    },
    backButton: {
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});
