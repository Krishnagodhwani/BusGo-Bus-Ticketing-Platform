import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, registerUser } from '../services/authService';
import { saveAuth } from '../../../store/authStore';
import Toast from '../components/Toast';
import RedirectOverlay from '../components/RedirectOverlay';
import './AuthPages.css';

export default function AuthPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('login');

  // Toast state
  const [toasts, setToasts] = useState([]);

  // Redirect overlay state
  const [redirect, setRedirect] = useState(null);

  const addToast = useCallback((type, title, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const switchTab = (tab) => {
    setActiveTab(tab);
  };

  const getDashboardPath = (role) => {
    const map = { USER: '/dashboard', OPERATOR: '/operator/dashboard', ADMIN: '/admin/dashboard' };
    return map[role] || '/dashboard';
  };

  const showRedirect = (name) => {
    setRedirect({ name });
  };

  const handleLogin = async (phone, password) => {
    try {
      const res = await loginUser(phone, password);
      const { access_token, user } = res.data;
      saveAuth(access_token, user);

      addToast('success', 'Login successful', `Signed in as ${user.name || user.phone}`);
      showRedirect(user.name);

      setTimeout(() => {
        navigate(getDashboardPath(user.role), { replace: true });
      }, 2600);

      return { success: true };
    } catch (err) {
      const message = err.response?.data?.detail || 'Wrong phone number or password.';
      addToast('error', 'Login failed', message);
      return { success: false, message };
    }
  };

  const handleRegister = async (payload) => {
    try {
      await registerUser(payload);
      addToast('success', 'Account created!', `Welcome ${payload.name || payload.phone}! Please sign in now.`);
      setTimeout(() => switchTab('login'), 1500);
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.detail || 'Something went wrong. Try again.';
      addToast('error', 'Registration failed', message);
      return { success: false, message };
    }
  };

  return (
    <>
      {/* Background scene */}
      <div className="scene">
        <div className="scene-grid" />
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Toasts */}
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* Redirect overlay */}
      {redirect && (
        <RedirectOverlay name={redirect.name} />
      )}

      {/* Main page grid */}
      <div className="auth-page">
        {/* Left brand panel */}
        <BrandPanel />

        {/* Right auth panel */}
        <div className="auth-panel">
          {/* Tabs */}
          <div className="auth-tabs">
            <button
              className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => switchTab('login')}
              id="tab-login"
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => switchTab('register')}
              id="tab-register"
            >
              Create Account
            </button>
          </div>

          {/* Login form */}
          <div className={`form-view ${activeTab === 'login' ? 'active' : ''}`}>
            <LoginForm onSubmit={handleLogin} onSwitchToRegister={() => switchTab('register')} />
          </div>

          {/* Register form */}
          <div className={`form-view ${activeTab === 'register' ? 'active' : ''}`}>
            <RegisterForm onSubmit={handleRegister} onSwitchToLogin={() => switchTab('login')} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ==================== BRAND PANEL ==================== */
function BrandPanel() {
  return (
    <div className="brand-panel">
      <div className="brand-logo">
        <div className="brand-icon-wrap">🚌</div>
        <div className="brand-wordmark">BusGo</div>
      </div>

      <div className="brand-mid">
        <div className="headline">
          <div className="eyebrow">
            <div className="eyebrow-dot" />
            Trusted by lakhs of travellers
          </div>
          <h1 className="h1">
            Book your bus,<br />travel <span>smarter.</span>
          </h1>
          <p className="brand-desc">
            Search hundreds of routes, compare buses, pick your seat and get your ticket
            in minutes — all in one place.
          </p>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="stat-n">500+</div>
            <div className="stat-l">Routes</div>
          </div>
          <div className="stat-div" />
          <div className="stat">
            <div className="stat-n">50K+</div>
            <div className="stat-l">Happy travellers</div>
          </div>
          <div className="stat-div" />
          <div className="stat">
            <div className="stat-n">99.2%</div>
            <div className="stat-l">On-time</div>
          </div>
        </div>

        <div className="features">
          <div className="feat">
            <div className="feat-ic">🎫</div>
            Instant e-ticket on your phone
          </div>
          <div className="feat">
            <div className="feat-ic">💺</div>
            Choose your seat before you board
          </div>
          <div className="feat">
            <div className="feat-ic">🔄</div>
            Easy cancellation &amp; fast refunds
          </div>
          <div className="feat">
            <div className="feat-ic">📍</div>
            Pick your boarding &amp; dropping point
          </div>
        </div>

        <div className="route-demo">
          <div className="route-lbl">Live route</div>
          <div className="route-track">
            <div className="route-city">
              <div className="rc-name">🏙 Mumbai</div>
              <div className="rc-time">Dep. 22:00</div>
            </div>
            <div className="route-line">
              <div className="route-bus">🚌</div>
            </div>
            <div className="route-city">
              <div className="rc-name">🌆 Pune</div>
              <div className="rc-time">Arr. 01:30</div>
            </div>
          </div>
        </div>
      </div>

      <div className="brand-ft">
        <div className="brand-ft-tag">© 2025 BusGo</div>
        <div className="uptime">
          <div className="up-dot" />
          All systems operational
        </div>
      </div>
    </div>
  );
}

/* ==================== LOGIN FORM ==================== */
function LoginForm({ onSubmit, onSwitchToRegister }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!/^[6-9]\d{9}$/.test(phone.trim())) errs.phone = 'Enter a valid 10-digit Indian mobile number';
    if (!password) errs.password = 'Password is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    const result = await onSubmit(phone.trim(), password);
    if (!result.success) {
      setErrors({ phone: ' ', password: ' ' });
    }
    setLoading(false);
  };

  return (
    <>
      <div className="form-header">
        <div className="form-title">Welcome back 👋</div>
        <div className="form-subtitle">Enter your phone number and password to continue booking.</div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* Phone */}
        <div className="fg">
          <label className="form-label" htmlFor="login-phone">
            Phone Number <span className="required">*</span>
          </label>
          <div className="phone-wrapper">
            <div className="phone-prefix">🇮🇳 +91</div>
            <div className="input-wrapper" style={{ flex: 1 }}>
              <span className="input-icon"></span>
              <input
                id="login-phone"
                className={`form-input ${errors.phone ? 'has-error' : ''}`}
                type="tel"
                placeholder="9999999999"
                maxLength={10}
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                  setErrors((prev) => ({ ...prev, phone: undefined }));
                }}
              />
            </div>
          </div>
          {errors.phone && errors.phone !== ' ' && (
            <div className="field-error">⚠ {errors.phone}</div>
          )}
        </div>

        {/* Password */}
        <div className="fg">
          <label className="form-label" htmlFor="login-password">
            Password <span className="required">*</span>
          </label>
          <div className="input-wrapper">
            <span className="input-icon"></span>
            <input
              id="login-password"
              className={`form-input ${errors.password ? 'has-error' : ''}`}
              type={showPwd ? 'text' : 'password'}
              placeholder="Enter your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((prev) => ({ ...prev, password: undefined }));
              }}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPwd(!showPwd)}
              tabIndex={-1}
            >
              {showPwd ? '🙈' : '👁'}
            </button>
          </div>
          {errors.password && errors.password !== ' ' && (
            <div className="field-error">⚠ {errors.password}</div>
          )}
        </div>

        <button type="submit" className="btn-submit" disabled={loading} id="login-btn">
          {loading && <div className="btn-spinner" />}
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="auth-divider">
        <div className="line" />
        <div className="text">NEW HERE?</div>
        <div className="line" />
      </div>

      <div className="auth-footer">
        Don't have an account?{' '}
        <a onClick={onSwitchToRegister}>Create one free →</a>
      </div>
    </>
  );
}

/* ==================== REGISTER FORM ==================== */
function RegisterForm({ onSubmit, onSwitchToLogin }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    gender: '',
    dob: '',
    password: '',
    confirmPassword: '',
  });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [pwdStrength, setPwdStrength] = useState({ score: 0, label: '', color: '' });

  const update = (field) => (e) => {
    let val = e.target.value;
    if (field === 'phone') val = val.replace(/\D/g, '').slice(0, 10);
    setForm((prev) => ({ ...prev, [field]: val }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));

    if (field === 'password') {
      computePwdStrength(val);
    }
  };

  const computePwdStrength = (val) => {
    if (!val) {
      setPwdStrength({ score: 0, label: '', color: '' });
      return;
    }
    let sc = 0;
    if (val.length >= 6) sc++;
    if (val.length >= 10 && /[A-Z]/.test(val)) sc++;
    if (/[0-9]/.test(val) && /[^A-Za-z0-9]/.test(val)) sc++;

    const levels = [
      { label: 'Weak', color: 'var(--red-400)', cls: 'weak' },
      { label: 'Fair', color: 'var(--amber-400)', cls: 'fair' },
      { label: 'Strong', color: 'var(--green-400)', cls: 'strong' },
    ];
    const level = levels[Math.max(sc - 1, 0)];
    setPwdStrength({ score: sc, label: level.label, color: level.color, cls: level.cls });
  };

  const validate = () => {
    const errs = {};
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) errs.phone = 'Enter a valid 10-digit Indian mobile number';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Enter a valid email address';
    if (form.password.length < 6) errs.password = 'Password must be at least 6 characters';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = { phone: form.phone.trim(), password: form.password };
    if (form.name.trim()) payload.name = form.name.trim();
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.gender) payload.gender = form.gender;
    if (form.dob) {
      payload.date_of_birth = form.dob;
    }

    setLoading(true);
    await onSubmit(payload);
    setLoading(false);
  };

  return (
    <>
      <div className="form-header">
        <div className="form-title">Create account</div>
        <div className="form-subtitle">Sign up to start booking bus tickets instantly.</div>
      </div>

      <div className="auth-scroll">
        <form onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <div className="fg">
            <label className="form-label" htmlFor="reg-name">Full Name</label>
            <div className="input-wrapper">
              <span className="input-icon">👤</span>
              <input
                id="reg-name"
                className="form-input"
                type="text"
                placeholder="Rahul Sharma"
                autoComplete="name"
                value={form.name}
                onChange={update('name')}
              />
            </div>
          </div>

          {/* Phone */}
          <div className="fg">
            <label className="form-label" htmlFor="reg-phone">
              Phone Number <span className="required">*</span>
            </label>
            <div className="phone-wrapper">
              <div className="phone-prefix">🇮🇳 +91</div>
              <div className="input-wrapper" style={{ flex: 1 }}>
                <span className="input-icon">📱</span>
                <input
                  id="reg-phone"
                  className={`form-input ${errors.phone ? 'has-error' : ''}`}
                  type="tel"
                  placeholder="9999999999"
                  maxLength={10}
                  inputMode="numeric"
                  value={form.phone}
                  onChange={update('phone')}
                />
              </div>
            </div>
            {errors.phone && <div className="field-error">⚠ {errors.phone}</div>}
          </div>

          {/* Email */}
          <div className="fg">
            <label className="form-label" htmlFor="reg-email">Email Address</label>
            <div className="input-wrapper">
              <span className="input-icon">✉️</span>
              <input
                id="reg-email"
                className={`form-input ${errors.email ? 'has-error' : ''}`}
                type="email"
                placeholder="rahul@example.com"
                autoComplete="email"
                value={form.email}
                onChange={update('email')}
              />
            </div>
            {errors.email && <div className="field-error">⚠ {errors.email}</div>}
          </div>

          {/* Gender & DOB */}
          <div className="form-row">
            <div>
              <label className="form-label" htmlFor="reg-gender">Gender</label>
              <select
                id="reg-gender"
                className="form-select"
                value={form.gender}
                onChange={update('gender')}
              >
                <option value="">Select</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="reg-dob">Date of Birth</label>
              <input
                id="reg-dob"
                className="form-input no-icon"
                type="date"
                style={{ colorScheme: 'dark' }}
                value={form.dob}
                onChange={update('dob')}
              />
            </div>
          </div>

          {/* Password */}
          <div className="fg">
            <label className="form-label" htmlFor="reg-password">
              Password <span className="required">*</span>
            </label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input
                id="reg-password"
                className={`form-input ${errors.password ? 'has-error' : ''}`}
                type={showPwd ? 'text' : 'password'}
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
                value={form.password}
                onChange={update('password')}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPwd(!showPwd)}
                tabIndex={-1}
              >
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>

            {/* Password strength */}
            <div className="pwd-strength">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`pwd-bar ${pwdStrength.score >= i ? pwdStrength.cls : ''}`}
                />
              ))}
              <div className="pwd-label" style={{ color: pwdStrength.color }}>
                {pwdStrength.label}
              </div>
            </div>

            {errors.password && <div className="field-error">⚠ {errors.password}</div>}
          </div>

          {/* Confirm Password */}
          <div className="fg">
            <label className="form-label" htmlFor="reg-confirm-password">
              Confirm Password <span className="required">*</span>
            </label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input
                id="reg-confirm-password"
                className={`form-input ${errors.confirmPassword ? 'has-error' : ''}`}
                type={showPwd ? 'text' : 'password'}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPwd(!showPwd)}
                tabIndex={-1}
              >
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
            {errors.confirmPassword && <div className="field-error">⚠ {errors.confirmPassword}</div>}
          </div>

          <button type="submit" className="btn-submit" disabled={loading} id="register-btn">
            {loading && <div className="btn-spinner" />}
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
      </div>

      <div className="auth-footer" style={{ marginTop: 14 }}>
        Already have an account?{' '}
        <a onClick={onSwitchToLogin}>Sign in →</a>
      </div>
    </>
  );
}
