import React, { useEffect, useState } from 'react';
import { ShieldCheck, UserCheck, Wrench } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { signInWithGoogle } from '../lib/firebase';
import { apiFetch } from '../lib/api';
import { AuthInstallCard } from '../components/Layout';

export const AuthPage: React.FC = () => {
  const {
    lang,
    firebaseUser,
    userRecord,
    isAdmin,
    needsOnboarding,
    refreshSession,
    navigate,
    services,
  } = useApp();

  const [role, setRole] = useState<'CUSTOMER' | 'TECHNICIAN'>('CUSTOMER');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [areasText, setAreasText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (firebaseUser && !name) {
      setName(firebaseUser.displayName || '');
    }
  }, [firebaseUser, name]);

  useEffect(() => {
    if (userRecord) {
      if (userRecord.role === 'ADMIN' || isAdmin) navigate('/admin');
      else if (userRecord.role === 'TECHNICIAN') navigate('/technician');
      else navigate('/customer');
    }
  }, [userRecord, isAdmin, navigate]);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      await refreshSession();
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSpec = (id: string) => {
    setSelectedSpecialties((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/api/auth/register-profile', {
        method: 'POST',
        body: JSON.stringify({
          role,
          name,
          phone,
          preferredLang: lang,
          bio,
          specialtyIds: selectedSpecialties,
          serviceAreas: areasText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      await refreshSession();
      navigate(role === 'TECHNICIAN' ? '/technician/verification' : '/customer');
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14">
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#131316] p-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-neutral-950 dark:text-stone-100">
            {lang === 'ar' ? 'بوابة الدخول والتسجيل — InteriorX' : 'InteriorX Account Access'}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {lang === 'ar'
              ? 'سجل الدخول بحساب Google ثم اختر نوع حسابك (عميل أو فني محترف).'
              : 'Authenticate securely with Google, then select your Customer or Technician workspace.'}
          </p>
        </div>

        <AuthInstallCard />

        {!firebaseUser ? (
          <div className="space-y-4">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleGoogleSignIn()}
              className="w-full py-3.5 rounded-lg bg-[#C8A24E] text-black font-bold text-sm hover:bg-[#DFBE6F] transition-colors cursor-pointer"
            >
              {loading
                ? lang === 'ar'
                  ? 'جاري التحقق...'
                  : 'Authenticating...'
                : lang === 'ar'
                ? 'تسجيل الدخول / إنشاء حساب عبر Google'
                : 'Continue with Google'}
            </button>
            <p className="text-xs text-neutral-500 text-center">
              {lang === 'ar'
                ? 'للمديرين فقط: انتقل إلى بوابة دخول الإدارة المستقلة.'
                : 'Administrators: use the independent Admin Portal login.'}
            </p>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        ) : needsOnboarding ? (
          <form onSubmit={handleCompleteOnboarding} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('CUSTOMER')}
                className={`p-4 rounded-xl border text-start transition-colors cursor-pointer ${
                  role === 'CUSTOMER'
                    ? 'border-[#C8A24E] bg-[#C8A24E]/10'
                    : 'border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <UserCheck className="w-5 h-5 text-[#C8A24E] mb-2" />
                <p className="font-bold text-sm">{lang === 'ar' ? 'حساب عميل' : 'Customer Account'}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {lang === 'ar'
                    ? 'طلب خدمات التشطيبات والصيانة ومقارنة العروض.'
                    : 'Request services, compare quotes, track technicians.'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setRole('TECHNICIAN')}
                className={`p-4 rounded-xl border text-start transition-colors cursor-pointer ${
                  role === 'TECHNICIAN'
                    ? 'border-[#C8A24E] bg-[#C8A24E]/10'
                    : 'border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <Wrench className="w-5 h-5 text-[#C8A24E] mb-2" />
                <p className="font-bold text-sm">{lang === 'ar' ? 'حساب فني محترف' : 'Technician Account'}</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {lang === 'ar'
                    ? 'تقديم عروض الأسعار وتنفيذ الطلبات بعد توثيق الهوية.'
                    : 'Submit quotes & execute jobs after ID verification.'}
                </p>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">
                  {lang === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  {lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                </label>
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+20 1..."
                  className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                />
              </div>
            </div>

            {role === 'TECHNICIAN' && (
              <div className="space-y-4 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <div>
                  <label className="block text-xs font-medium mb-2">
                    {lang === 'ar' ? 'اختر التخصصات' : 'Select Specialties'}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {services.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSpec(s.id)}
                        className={`px-2.5 py-2 rounded-lg border text-xs text-start cursor-pointer ${
                          selectedSpecialties.includes(s.id)
                            ? 'border-[#C8A24E] bg-[#C8A24E]/15 text-[#C8A24E] font-semibold'
                            : 'border-neutral-200 dark:border-neutral-800'
                        }`}
                      >
                        {lang === 'ar' ? s.nameAr : s.nameEn}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    {lang === 'ar' ? 'مناطق العمل (افصل بفاصلة)' : 'Service Areas (comma-separated)'}
                  </label>
                  <input
                    value={areasText}
                    onChange={(e) => setAreasText(e.target.value)}
                    placeholder={lang === 'ar' ? 'التجمع الخامس، المعادي، الشيخ زايد' : 'New Cairo, Maadi, Sheikh Zayed'}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    {lang === 'ar' ? 'نبذة عن الخبرة المهنية' : 'Professional Bio'}
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm"
                  />
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-[#C8A24E] text-black font-bold text-sm hover:bg-[#DFBE6F] cursor-pointer"
            >
              {loading
                ? lang === 'ar'
                  ? 'جاري إنشاء الحساب...'
                  : 'Creating Account...'
                : lang === 'ar'
                ? 'إتمام التسجيل والمتابعة'
                : 'Complete Registration'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-neutral-500">
            {lang === 'ar' ? 'جاري التوجيه إلى لوحة التحكم...' : 'Redirecting to your workspace...'}
          </p>
        )}
      </div>
    </div>
  );
};

export const AdminLoginPage: React.FC = () => {
  const { lang, firebaseUser, isAdmin, refreshSession, navigate } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAdmin) navigate('/admin');
  }, [isAdmin, navigate]);

  const verifyAdmin = async () => {
    setLoading(true);
    setError('');
    try {
      if (!firebaseUser) {
        await signInWithGoogle();
      }
      await apiFetch('/api/auth/admin-verify', { method: 'POST' });
      await refreshSession();
      navigate('/admin');
    } catch (err: any) {
      setError(
        err.message ||
          (lang === 'ar'
            ? 'غير مصرح لك بدخول لوحة الإدارة.'
            : 'Access Denied: Not authorized as Admin.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="rounded-2xl border border-[#C8A24E]/40 bg-white dark:bg-[#131316] p-8 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-[#C8A24E]" />
          <div>
            <h1 className="text-xl font-bold">
              {lang === 'ar' ? 'بوابة دخول الإدارة' : 'Admin Console Gate'}
            </h1>
            <p className="text-xs text-neutral-500">
              {lang === 'ar' ? 'مصادقة مستقلة لصلاحيات الإدارة العليا' : 'Independent RBAC Administrator Authentication'}
            </p>
          </div>
        </div>

        <AuthInstallCard />

        {firebaseUser && (
          <div className="p-3 rounded-lg bg-neutral-100 dark:bg-black/40 text-xs">
            <span className="text-neutral-500">{lang === 'ar' ? 'الحساب الحالي: ' : 'Signed in as: '}</span>
            <span className="font-mono-num font-semibold">{firebaseUser.email}</span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-500">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={() => void verifyAdmin()}
          className="w-full py-3 rounded-lg bg-[#C8A24E] text-black font-bold text-sm hover:bg-[#DFBE6F] cursor-pointer"
        >
          {loading
            ? lang === 'ar'
              ? 'جاري التحقق من الصلاحية...'
              : 'Verifying Admin Privileges...'
            : lang === 'ar'
            ? 'تحقق ودخول لوحة الإدارة'
            : 'Verify & Enter Admin Console'}
        </button>
      </div>
    </div>
  );
};
