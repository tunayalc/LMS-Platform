import React, { useState, useEffect } from 'react';

interface GradeItem {
    id: string;
    name: string;
    maxPoints: number;
    weight: number;
    grade?: number;
    feedback?: string;
    categoryName?: string;
}

interface Category {
    id: string;
    name: string;
    weight: number;
}

interface GradebookProps {
    courseId: string;
    role: string;
    apiBaseUrl: string;
    token: string | null;
}

export default function Gradebook({ courseId, role, apiBaseUrl, token }: GradebookProps) {
    const [loading, setLoading] = useState(false);
    const [grades, setGrades] = useState<GradeItem[]>([]);
    const [finalGrade, setFinalGrade] = useState<number | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [items, setItems] = useState<any[]>([]);

    // Form states
    const [showCategoryForm, setShowCategoryForm] = useState(false);
    const [showItemForm, setShowItemForm] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryWeight, setNewCategoryWeight] = useState('10');
    const [newItemName, setNewItemName] = useState('');
    const [newItemMaxPoints, setNewItemMaxPoints] = useState('100');
    const [newItemCategoryId, setNewItemCategoryId] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!token) return;
        if (role === 'student') {
            fetchStudentGrades();
        } else {
            fetchInstructorData();
        }
    }, [courseId, token, role]);

    const fetchStudentGrades = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiBaseUrl}/api/gradebook/${courseId}/my-grades`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setGrades(data.grades || []);
                setFinalGrade(data.finalGrade);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchInstructorData = async () => {
        setLoading(true);
        try {
            const [catRes, itemRes] = await Promise.all([
                fetch(`${apiBaseUrl}/api/gradebook/${courseId}/categories`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${apiBaseUrl}/api/gradebook/${courseId}/items`, { headers: { Authorization: `Bearer ${token}` } })
            ]);

            if (catRes.ok) setCategories(await catRes.json());
            if (itemRes.ok) setItems(await itemRes.json());

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) return;
        setSaving(true);
        try {
            const res = await fetch(`${apiBaseUrl}/api/gradebook/${courseId}/categories`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ name: newCategoryName, weight: Number(newCategoryWeight) })
            });
            if (res.ok) {
                setNewCategoryName('');
                setNewCategoryWeight('10');
                setShowCategoryForm(false);
                fetchInstructorData();
            }
        } catch (error) {
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    const handleAddItem = async () => {
        if (!newItemName.trim()) return;
        setSaving(true);
        try {
            const res = await fetch(`${apiBaseUrl}/api/gradebook/${courseId}/items`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newItemName,
                    maxPoints: Number(newItemMaxPoints),
                    categoryId: newItemCategoryId || undefined
                })
            });
            if (res.ok) {
                setNewItemName('');
                setNewItemMaxPoints('100');
                setNewItemCategoryId('');
                setShowItemForm(false);
                fetchInstructorData();
            }
        } catch (error) {
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-4 text-gray-500">Yükleniyor...</div>;

    // --- STUDENT VIEW ---
    if (role === 'student') {
        return (
            <div className="card">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Not Defterim</h2>
                    <div className="text-right">
                        <span className="block text-sm text-gray-500">Genel Ortalama</span>
                        <span className={`text-3xl font-bold ${finalGrade && finalGrade >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                            {finalGrade !== null ? finalGrade.toFixed(1) : '-'}
                        </span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left bg-white rounded-lg overflow-hidden">
                        <thead className="bg-gray-50 text-gray-700 uppercase text-xs font-semibold">
                            <tr>
                                <th className="p-4 border-b">Eylem</th>
                                <th className="p-4 border-b">Kategori</th>
                                <th className="p-4 border-b text-center">Puan</th>
                                <th className="p-4 border-b text-center">Max</th>
                                <th className="p-4 border-b text-center">Ağırlık</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {grades.length > 0 ? grades.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="p-4 font-medium text-gray-800">
                                        {item.name}
                                        {item.feedback && (
                                            <div className="text-xs text-gray-500 mt-1 italic">
                                                Geri Bildirim: {item.feedback}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4 text-gray-600">{item.categoryName || '-'}</td>
                                    <td className="p-4 text-center font-bold text-blue-600">
                                        {item.grade !== undefined && item.grade !== null ? item.grade : '-'}
                                    </td>
                                    <td className="p-4 text-center text-gray-500">{item.maxPoints}</td>
                                    <td className="p-4 text-center text-gray-400">{item.weight}%</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-400">
                                        Henüz not girişi yapılmamış.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    // --- INSTRUCTOR VIEW ---
    return (
        <div className="space-y-6">
            <div className="card">
                <h2 className="text-xl font-bold mb-4">Notlandırma Kategorileri</h2>
                <div className="flex flex-wrap gap-4 mb-4">
                    {categories.map(cat => (
                        <div key={cat.id} className="bg-blue-50 p-4 rounded-lg border border-blue-100 min-w-[150px]">
                            <div className="font-bold text-blue-900">{cat.name}</div>
                            <div className="text-sm text-blue-700">Ağırlık: %{cat.weight}</div>
                        </div>
                    ))}
                    {categories.length === 0 && <span className="text-gray-500">Kategori tanımlanmamış.</span>}
                </div>

                {showCategoryForm ? (
                    <div className="flex gap-2 items-center flex-wrap">
                        <input
                            className="input"
                            placeholder="Kategori Adı"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                        />
                        <input
                            className="input w-24"
                            type="number"
                            placeholder="Ağırlık %"
                            value={newCategoryWeight}
                            onChange={(e) => setNewCategoryWeight(e.target.value)}
                        />
                        <button className="btn" onClick={handleAddCategory} disabled={saving}>
                            {saving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setShowCategoryForm(false)}>İptal</button>
                    </div>
                ) : (
                    <button className="btn btn-outline" onClick={() => setShowCategoryForm(true)}>+ Kategori Ekle</button>
                )}
            </div>

            <div className="card">
                <h2 className="text-xl font-bold mb-4">Değerlendirme Öğeleri</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-500">
                            <tr>
                                <th className="p-3">İsim</th>
                                <th className="p-3">Max Puan</th>
                                <th className="p-3">Eylemler</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.map(item => (
                                <tr key={item.id}>
                                    <td className="p-3">{item.name}</td>
                                    <td className="p-3">{item.maxPoints}</td>
                                    <td className="p-3">
                                        <button className="text-blue-600 hover:underline text-sm mr-3">Düzenle</button>
                                        <button className="text-red-500 hover:underline text-sm ml-2">Sil</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {items.length === 0 && <div className="p-4 text-center text-gray-400">Öğe yok.</div>}
                </div>

                {showItemForm ? (
                    <div className="flex gap-2 items-center flex-wrap mt-4">
                        <input
                            className="input"
                            placeholder="Öğe Adı"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                        />
                        <input
                            className="input w-24"
                            type="number"
                            placeholder="Max Puan"
                            value={newItemMaxPoints}
                            onChange={(e) => setNewItemMaxPoints(e.target.value)}
                        />
                        <select
                            className="input"
                            value={newItemCategoryId}
                            onChange={(e) => setNewItemCategoryId(e.target.value)}
                        >
                            <option value="">Kategori Seç (Opsiyonel)</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                        <button className="btn" onClick={handleAddItem} disabled={saving}>
                            {saving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setShowItemForm(false)}>İptal</button>
                    </div>
                ) : (
                    <button className="mt-4 btn btn-outline" onClick={() => setShowItemForm(true)}>+ Yeni Öğe Ekle</button>
                )}
            </div>

            <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg text-sm">
                💡 Not: Öğrenci notlarını girmek için lütfen ilgili ödev veya sınava gidin. Burası yapılandırma alanıdır.
            </div>
        </div>
    );
}
