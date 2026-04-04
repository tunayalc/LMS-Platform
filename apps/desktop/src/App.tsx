import { useState, useEffect, useRef } from 'react'
import { createApiClient, resolveApiBaseUrl } from './shared';
// @ts-ignore
import { jwtDecode } from "jwt-decode";
import './App.css';

interface Course {
    id: string;
    title: string;
    description: string;
}

interface Exam {
    id: string;
    title: string;
    courseId: string | null;
    createdAt: string;
}

interface DecodedToken {
    userId: string;
    username: string;
    role: 'SuperAdmin' | 'Admin' | 'Instructor' | 'Assistant' | 'Student' | 'Guest';
    iat: number;
    exp: number;
}

function App() {
    const [usernameInput, setUsernameInput] = useState('admin')
    const [passwordInput, setPasswordInput] = useState('1234')

    // Auth State
    const [token, setToken] = useState<string | null>(null)
    const [userRole, setUserRole] = useState<string>('');
    const [loggedInUser, setLoggedInUser] = useState<string>('');

    // UI State
    const [error, setError] = useState<string | null>(null)
    const [courses, setCourses] = useState<Course[]>([]);
    const [exams, setExams] = useState<Exam[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('courses');
    const [creating, setCreating] = useState(false);

    // OMR State
    const [omrFile, setOmrFile] = useState<File | null>(null);
    const [omrPreview, setOmrPreview] = useState<string | null>(null);
    const [omrResult, setOmrResult] = useState<any>(null);
    const [omrError, setOmrError] = useState<string | null>(null);
    const [omrProcessing, setOmrProcessing] = useState(false);
    const [omrCameraActive, setOmrCameraActive] = useState(false);
    const [omrAnswerKey, setOmrAnswerKey] = useState('');
    const omrVideoRef = useRef<HTMLVideoElement | null>(null);
    const omrCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const omrStreamRef = useRef<MediaStream | null>(null);

    // API Config
    const apiUrl = resolveApiBaseUrl({ runtime: "desktop" });
    const apiClient = createApiClient({ baseUrl: apiUrl });

    const handleLogin = async () => {
        try {
            console.log("Attempting login to:", apiUrl);
            const res = await apiClient.post<any>('/auth/login', { username: usernameInput, password: passwordInput });
            console.log("Login success:", res);

            const accessToken = res.accessToken || res.token;
            setToken(accessToken);

            try {
                const decoded = jwtDecode<DecodedToken>(accessToken);
                setUserRole(decoded.role);
                setLoggedInUser(decoded.username);
            } catch (decodeError) {
                console.error("Token decode failed:", decodeError);
                setUserRole('Guest');
            }

            setError(null);
            // Initial fetch based on default tab
            if (activeTab === 'courses') fetchCourses(accessToken);
        } catch (e: any) {
            console.error("Login error full:", e);
            setError(e.message || JSON.stringify(e));
        }
    }

    const stopOmrCamera = () => {
        omrStreamRef.current?.getTracks().forEach((track) => track.stop());
        omrStreamRef.current = null;
        setOmrCameraActive(false);
    };

    const startOmrCamera = async () => {
        setOmrError(null);
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                setOmrError("Kamera desteklenmiyor.");
                return;
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            omrStreamRef.current = stream;
            if (omrVideoRef.current) {
                omrVideoRef.current.srcObject = stream;
                await omrVideoRef.current.play();
            }
            setOmrCameraActive(true);
        } catch (err) {
            setOmrError("Kamera açılamadı. İzinleri kontrol et.");
        }
    };

    const captureOmrFrame = () => {
        const video = omrVideoRef.current;
        const canvas = omrCanvasRef.current;
        if (!video || !canvas) return;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    setOmrError("Görüntü yakalanamadı.");
                    return;
                }
                const captured = new File([blob], 'omr-capture.jpg', { type: blob.type });
                setOmrFile(captured);
                setOmrResult(null);
                stopOmrCamera();
            },
            'image/jpeg',
            0.9
        );
    };

    const handleOmrFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextFile = event.target.files?.[0] ?? null;
        setOmrFile(nextFile);
        setOmrResult(null);
        setOmrError(null);
    };

    const handleOmrScan = async () => {
        if (!token) {
            setOmrError("Önce giriş yapmalısın.");
            return;
        }
        if (!omrFile) {
            setOmrError("Önce dosya seç veya kamera ile çek.");
            return;
        }
        setOmrProcessing(true);
        setOmrError(null);
        setOmrResult(null);
        try {
            const formData = new FormData();
            formData.append('image', omrFile);
            if (omrAnswerKey.trim()) {
                formData.append('answerKey', omrAnswerKey.trim());
            }
            const response = await apiClient.post<any>(
                '/api/omr/scan',
                formData,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setOmrResult(response);
        } catch (e: any) {
            setOmrError(e.message || "OMR taraması başarısız.");
        } finally {
            setOmrProcessing(false);
        }
    };

    useEffect(() => {
        if (!omrFile) {
            setOmrPreview(null);
            return;
        }
        const url = URL.createObjectURL(omrFile);
        setOmrPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [omrFile]);

    useEffect(() => {
        return () => stopOmrCamera();
    }, []);

    useEffect(() => {
        if (token) {
            if (activeTab === 'courses') fetchCourses(token);
            if (activeTab === 'exams') fetchExams(token);
        }
    }, [activeTab, token]);

    const fetchCourses = async (authToken: string) => {
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/courses`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();
            if (data.data) setCourses(data.data);
        } catch (e) {
            console.error("Fetch courses error:", e);
        } finally {
            setLoading(false);
        }
    }

    const fetchExams = async (authToken: string) => {
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/exams`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();
            if (data.exams) setExams(data.exams);
        } catch (e) {
            console.error("Fetch exams error:", e);
        } finally {
            setLoading(false);
        }
    }

    const handleCreateCourse = async () => {
        const title = window.prompt("Ders Adı Giriniz:");
        if (!title) return;
        setCreating(true);
        try {
            const res = await fetch(`${apiUrl}/courses`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description: "Masaüstü uygulamasından oluşturuldu.",
                    code: title.substring(0, 3).toUpperCase() + Math.floor(Math.random() * 1000)
                })
            });
            if (res.ok) { fetchCourses(token!); alert("Ders başarıyla oluşturuldu!"); }
        } catch (e) { alert("Hata."); } finally { setCreating(false); }
    }

    const handleCreateExam = async () => {
        const title = window.prompt("Sınav Başlığı Giriniz:");
        if (!title) return;
        setCreating(true);
        try {
            const res = await fetch(`${apiUrl}/exams`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, courseId: null })
            });
            if (res.ok) { fetchExams(token!); alert("Sınav başarıyla oluşturuldu!"); }
        } catch (e) { alert("Hata."); } finally { setCreating(false); }
    }

    // Role Checks
    // Admin = Tanrı modu - her şeye erişim
    const isAdmin = ['SuperAdmin', 'Admin'].includes(userRole);
    // Ders oluşturma sadece Öğretmen ve Admin
    const canCreateCourse = ['SuperAdmin', 'Admin', 'Instructor'].includes(userRole);
    // İçerik/Sınav düzenleme - Asistan dahil
    const canWrite = ['SuperAdmin', 'Admin', 'Instructor', 'Assistant'].includes(userRole);

    const [users, setUsers] = useState<any[]>([]);

    const fetchUsers = async (authToken: string) => {
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/users`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();
            if (data.users) setUsers(data.users);
        } catch (e) {
            console.error("Fetch users error:", e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (token) {
            if (activeTab === 'courses') fetchCourses(token);
            if (activeTab === 'exams') fetchExams(token);
            if (activeTab === 'users' && isAdmin) fetchUsers(token);
        }
    }, [activeTab, token, isAdmin]);

    if (!token) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0f4f8 0%, #d9e2ec 100%)' }}>
                <div style={{ background: 'white', padding: '3rem', borderRadius: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', width: '100%', maxWidth: '400px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <div style={{ width: 64, height: 64, background: '#e0f2f1', color: '#0f766e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>🔐</div>
                        <h2 style={{ color: '#0f172a', fontSize: '1.875rem', fontWeight: 'bold' }}>Masaüstü Giriş</h2>
                        <p style={{ color: '#64748b' }}>Lütfen kimliğinizi doğrulayın</p>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600', color: '#334155' }}>Kullanıcı Adı</label>
                        <input
                            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '1rem', outline: 'none', transition: 'all 0.2s' }}
                            placeholder="Kullanıcı Adı"
                            value={usernameInput}
                            onChange={e => setUsernameInput(e.target.value)}
                        />
                    </div>
                    <div style={{ marginBottom: '2rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600', color: '#334155' }}>Şifre</label>
                        <input
                            style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '1rem', outline: 'none', transition: 'all 0.2s' }}
                            placeholder="Şifre"
                            type="password"
                            value={passwordInput}
                            onChange={e => setPasswordInput(e.target.value)}
                        />
                    </div>

                    <button
                        style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', background: '#0f766e', color: 'white', border: 'none', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(15, 118, 110, 0.2)', marginBottom: '1rem' }}
                        onClick={handleLogin}
                    >
                        Giriş Yap
                    </button>



                    {error && <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '0.75rem', background: '#fee2e2', color: '#b91c1c', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}
                </div>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
            <aside style={{ width: 280, background: 'white', borderRight: '1px solid #e2e8f0', padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '3rem' }}>
                    <div style={{ width: 40, height: 40, background: '#0f766e', borderRadius: '0.75rem' }}></div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>LMS Desktop</h2>
                </div>

                <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button
                        onClick={() => setActiveTab('courses')}
                        style={{ textAlign: 'left', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: activeTab === 'courses' ? '#f0fdfa' : 'transparent', color: activeTab === 'courses' ? '#0f766e' : '#64748b', border: 'none', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s' }}
                    >
                        <span>📚</span> Derslerim
                    </button>
                    <button
                        onClick={() => setActiveTab('exams')}
                        style={{ textAlign: 'left', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: activeTab === 'exams' ? '#f0fdfa' : 'transparent', color: activeTab === 'exams' ? '#0f766e' : '#64748b', border: 'none', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s' }}
                    >
                        <span>📝</span> Sınavlarım
                    </button>
                    <button
                        onClick={() => setActiveTab('omr')}
                        style={{ textAlign: 'left', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: activeTab === 'omr' ? '#f0fdfa' : 'transparent', color: activeTab === 'omr' ? '#0f766e' : '#64748b', border: 'none', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s' }}
                    >
                        <span>OMR</span> Optik Okuyucu
                    </button>
                    {isAdmin && (
                        <>
                            <button
                                onClick={() => setActiveTab('users')}
                                style={{ textAlign: 'left', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: activeTab === 'users' ? '#f0fdfa' : 'transparent', color: activeTab === 'users' ? '#0f766e' : '#64748b', border: 'none', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s' }}
                            >
                                <span>👥</span> Kullanıcılar
                            </button>
                            <button
                                onClick={() => alert("İstatistikler paneli.")}
                                style={{ textAlign: 'left', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: 'transparent', color: '#64748b', border: 'none', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s' }}
                            >
                                <span>📊</span> İstatistikler
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => alert("Ayarlar paneli.")}
                        style={{ textAlign: 'left', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: 'transparent', color: '#64748b', border: 'none', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s' }}
                    >
                        <span>⚙️</span> Ayarlar
                    </button>
                </nav>

                <div style={{ marginTop: 'auto' }}>
                    <div style={{ padding: '1rem', background: '#f1f5f9', borderRadius: '1rem', marginBottom: '1rem' }}>
                        <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '0.25rem' }}>{loggedInUser}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: canWrite ? '#10b981' : '#3b82f6' }}></span>
                            {userRole !== 'Guest' && userRole}
                        </div>
                    </div>
                    <button
                        onClick={() => setToken(null)}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                        Çıkış Yap
                    </button>
                </div>
            </aside>

            <main style={{ flex: 1, padding: '3rem', overflowY: 'auto' }}>
                {activeTab === 'users' && isAdmin && (
                    <>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                            <div>
                                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Kullanıcılar</h1>
                                <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Sistemdeki kullanıcıları yönetin.</p>
                            </div>
                        </header>
                        {loading ? <p>Yükleniyor...</p> : (
                            <div style={{ background: 'white', borderRadius: '1.5rem', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <tr>
                                            <th style={{ padding: '1rem', fontWeight: '600', color: '#475569' }}>Kullanıcı Adı</th>
                                            <th style={{ padding: '1rem', fontWeight: '600', color: '#475569' }}>Rol</th>
                                            <th style={{ padding: '1rem', fontWeight: '600', color: '#475569', textAlign: 'right' }}>İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map(u => (
                                            <tr key={u.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '1rem', color: '#0f172a' }}>{u.username}</td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '999px', background: '#f1f5f9', color: '#64748b', fontSize: '0.875rem', fontWeight: '500' }}>
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'right' }}>
                                                    <button
                                                        onClick={async () => {
                                                            if (!window.confirm("Bu kullanıcıyı silmek istediğinize emin misiniz?")) return;
                                                            try {
                                                                await fetch(`${apiUrl}/users/${u.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                                                                fetchUsers(token!);
                                                            } catch (e) { alert("Silinemedi."); }
                                                        }}
                                                        style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#fee2e2', color: '#b91c1c', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                                                    >
                                                        Sil
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
                {activeTab === 'courses' && (
                    <>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                            <div>
                                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Derslerim</h1>
                                <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Kayıtlı olduğunuz tüm dersleri buradan yönetebilirsiniz.</p>
                            </div>
                            {canCreateCourse && <button onClick={handleCreateCourse} disabled={creating} style={{ padding: '0.875rem 1.5rem', borderRadius: '0.75rem', background: '#0f766e', color: 'white', border: 'none', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(15, 118, 110, 0.2)' }}>{creating ? 'Ekleniyor...' : '+ Yeni Ders Ekle'}</button>}
                        </header>
                        {loading ? <p>Yükleniyor...</p> : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '2rem' }}>
                                {courses.length > 0 ? courses.map(c => (
                                    <div key={c.id} style={{ background: 'white', borderRadius: '1.5rem', padding: '1.5rem', border: '1px solid #e2e8f0', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)' }}>
                                        <div style={{ height: 120, background: '#f0fdfa', marginBottom: '1.5rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>📖</div>
                                        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '0.5rem' }}>{c.title}</h3>
                                        <p style={{ color: '#64748b', marginBottom: '1.5rem', lineHeight: '1.5' }}>{c.description}</p>
                                        <button style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid #ccfbf1', background: '#f0fdfa', color: '#0f766e', fontWeight: '600', cursor: 'pointer' }}>Derse Git</button>
                                    </div>
                                )) : <div style={{ gridColumn: '1 / -1', padding: '4rem', textAlign: 'center', background: 'white', borderRadius: '1.5rem', border: '2px dashed #e2e8f0' }}><p style={{ color: '#94a3b8' }}>Henüz ders bulunmuyor.</p></div>}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'exams' && (
                    <>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                            <div>
                                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Sınavlarım</h1>
                                <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Yaklaşan ve geçmiş sınavlarınızı kontrol edin.</p>
                            </div>
                            {canWrite && <button onClick={handleCreateExam} disabled={creating} style={{ padding: '0.875rem 1.5rem', borderRadius: '0.75rem', background: '#0f766e', color: 'white', border: 'none', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(15, 118, 110, 0.2)' }}>{creating ? 'Ekleniyor...' : '+ Yeni Sınav Ekle'}</button>}
                        </header>
                        {loading ? <p>Yükleniyor...</p> : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '2rem' }}>
                                {exams.length > 0 ? exams.map(e => (
                                    <div key={e.id} style={{ background: 'white', borderRadius: '1.5rem', padding: '1.5rem', border: '1px solid #e2e8f0', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)' }}>
                                        <div style={{ height: 120, background: '#fffbeb', marginBottom: '1.5rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>📝</div>
                                        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a', marginBottom: '0.5rem' }}>{e.title}</h3>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                            <span style={{ fontSize: '0.875rem', padding: '0.25rem 0.75rem', borderRadius: '999px', background: '#f1f5f9', color: '#64748b', fontWeight: '500' }}>📅 {new Date(e.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <button style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid #fde68a', background: '#fffbeb', color: '#d97706', fontWeight: '600', cursor: 'pointer' }}>Sınavı Başlat</button>
                                    </div>
                                )) : <div style={{ gridColumn: '1 / -1', padding: '4rem', textAlign: 'center', background: 'white', borderRadius: '1.5rem', border: '2px dashed #e2e8f0' }}><p style={{ color: '#94a3b8' }}>Henüz sınav bulunmuyor.</p></div>}
                            </div>
                        )}
                    </>
                )}
            

                {activeTab === 'omr' && (
                    <>
                        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <div>
                                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>Optik Okuyucu</h1>
                                <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Dosya sec veya kameradan kare yakala, sonra taramayi baslat.</p>
                            </div>
                        </header>

                        <div style={{ display: 'grid', gap: '1.5rem' }}>
                            <div style={{ background: 'white', borderRadius: '1.5rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#0f172a' }}>Girdi</h3>
                                <input type="file" accept="image/*" onChange={handleOmrFileChange} />
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                                    <button
                                        className="btn btn-primary"
                                        type="button"
                                        onClick={startOmrCamera}
                                        disabled={omrCameraActive}
                                    >
                                        Kamera Ac
                                    </button>
                                    <button
                                        className="btn btn-ghost"
                                        type="button"
                                        onClick={captureOmrFrame}
                                        disabled={!omrCameraActive}
                                    >
                                        Kare Yakala
                                    </button>
                                    <button
                                        className="btn btn-ghost"
                                        type="button"
                                        onClick={stopOmrCamera}
                                        disabled={!omrCameraActive}
                                    >
                                        Kamera Kapat
                                    </button>
                                </div>
                                {omrCameraActive ? (
                                    <div style={{ marginTop: '1rem' }}>
                                        <video ref={omrVideoRef} style={{ width: '100%', borderRadius: 12 }} />
                                        <canvas ref={omrCanvasRef} style={{ display: 'none' }} />
                                    </div>
                                ) : null}
                            </div>

                            {omrPreview ? (
                                <div style={{ background: 'white', borderRadius: '1.5rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                                    <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#0f172a' }}>Onizleme</h3>
                                    <img src={omrPreview} alt="OMR preview" style={{ maxWidth: '100%', borderRadius: 12 }} />
                                </div>
                            ) : null}

                            <div style={{ background: 'white', borderRadius: '1.5rem', padding: '1.5rem', border: '1px solid #e2e8f0' }}>
                                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#0f172a' }}>Yanit Anahtari (JSON)</h3>
                                <textarea
                                    style={{ width: '100%', minHeight: 120, padding: '0.75rem', borderRadius: 10, border: '1px solid #d1d5db', background: '#f9fafb' }}
                                    placeholder='{"Q1":"A","Q2":"C"}'
                                    value={omrAnswerKey}
                                    onChange={(event) => setOmrAnswerKey(event.target.value)}
                                />
                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', alignItems: 'center' }}>
                                    <button
                                        className="btn btn-primary"
                                        type="button"
                                        onClick={handleOmrScan}
                                        disabled={omrProcessing || !omrFile}
                                    >
                                        {omrProcessing ? 'Isleniyor...' : 'Taramayi Baslat'}
                                    </button>
                                    {omrError ? (
                                        <div style={{ color: '#b91c1c', background: '#fee2e2', padding: '0.5rem 0.75rem', borderRadius: 8 }}>
                                            {omrError}
                                        </div>
                                    ) : null}
                                </div>
                                {omrResult ? (
                                    <pre style={{ marginTop: '1rem', background: '#0f172a', color: '#e2e8f0', padding: '1rem', borderRadius: 12, overflowX: 'auto' }}>
                                        {JSON.stringify(omrResult, null, 2)}
                                    </pre>
                                ) : null}
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    )
}

export default App
