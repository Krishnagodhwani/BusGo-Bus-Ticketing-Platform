import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import './AuthPages.css';

export default function RegisterPage() {
  const { register, loading, error, setError } = useAuth();

  const [form, setForm] = useState({
    phone: '',
    password: '',
    confirmPassword: '',
    name: '',
    email: '',
    gender: '',
    date_of_birth: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  const update = (field) => (e) => {
    let val = e.target.value;
    // Only digits for phone
    if (field === 'phone') val = val.replace(/\D/g, '');
    setForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validations
    const cleanPhone = form.phone.replace(/[+91\s\-]/g, '').replace(/^0/, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setError('Please enter a valid 10-digit Indian mobile number');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Build payload (only include non-empty optional fields)
    const payload = {
      phone: cleanPhone,
      password: form.password,
    };
    if (form.name.trim()) payload.name = form.name.trim();
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.gender) payload.gender = form.gender;
    if (form.date_of_birth) {
      // Convert from YYYY-MM-DD (input) to DD-MM-YYYY (backend format)
      const [y, m, d] = form.date_of_birth.split('-');
      payload.date_of_birth = `${d}-${m}-${y}`;
    }

    await register(payload);
  };

  return (
    <div className="login-page">
      {/* Left Hero Panel */}
      <div className="login-hero">
        <div className="hero-content">
          <div className="hero-bus-icon">🎉</div>
          <h1>Join YatraBus Today</h1>
          <p>
            Create your account and unlock the best bus travel experience
            across India. Thousands of routes, one platform.
          </p>

          <div className="hero-features">
            <div className="hero-feature">
              <span className="hero-feature-icon">⚡</span>
              <span>Quick registration — book in under 2 minutes</span>
            </div>
            <div className="hero-feature">
              <span className="hero-feature-icon">🎁</span>
              <span>Get exclusive first-booking discount</span>
            </div>
            <div className="hero-feature">
              <span className="hero-feature-icon">📱</span>
              <span>Manage bookings anytime from your phone</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="login-form-panel">
        <div className="login-form-container">
          {/* Brand logo */}
          <div className="form-brand">
            <div className="form-brand-logo">
              <span className="logo-icon">🚌</span> YatraBus
            </div>
            <p>Create your travel account</p>
          </div>

          {/* Register Card */}
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>Create Account</h2>
              <p>Fill in your details to get started</p>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="alert-error" role="alert" id="register-error">
                <span className="alert-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* Phone */}
              <div className="form-group">
                <label className="form-label" htmlFor="reg-phone">
                  Mobile Number <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <div className="input-wrapper">
                  <span className="input-icon">📱</span>
                  <span className="phone-prefix">+91</span>
                  <input
                    id="reg-phone"
                    type="tel"
                    className="form-input phone-input"
                    placeholder="Enter 10-digit number"
                    maxLength={10}
                    value={form.phone}
                    onChange={update('phone')}
                    autoComplete="tel"
                    required
                  />
                </div>
              </div>

              {/* Full Name */}
              <div className="form-group">
                <label className="form-label" htmlFor="reg-name">
                  Full Name <span className="optional-tag">(optional)</span>
                </label>
                <div className="input-wrapper">
                  <span className="input-icon">👤</span>
                  <input
                    id="reg-name"
                    type="text"
                    className="form-input"
                    placeholder="Enter your full name"
                    value={form.name}
                    onChange={update('name')}
                    autoComplete="name"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="form-group">
                <label className="form-label" htmlFor="reg-email">
                  Email <span className="optional-tag">(optional)</span>
                </label>
                <div className="input-wrapper">
                  <span className="input-icon">✉️</span>
                  <input
                    id="reg-email"
                    type="email"
                    className="form-input"
                    placeholder="your@email.com"
                    value={form.email}
                    onChange={update('email')}
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Gender & DOB row */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="reg-gender">
                    Gender <span className="optional-tag">(optional)</span>
                  </label>
                  <div className="input-wrapper">
                    <span className="input-icon">⚧</span>
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
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="reg-dob">
                    Date of Birth <span className="optional-tag">(optional)</span>
                  </label>
                  <div className="input-wrapper">
                    <span className="input-icon">📅</span>
                    <input
                      id="reg-dob"
                      type="date"
                      className="form-input"
                      value={form.date_of_birth}
                      onChange={update('date_of_birth')}
                    />
                  </div>
                </div>
              </div>

              {/* Password */}
              <div className="form-group">
                <label className="form-label" htmlFor="reg-password">
                  Password <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <div className="input-wrapper">
                  <span className="input-icon">🔒</span>
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Create a strong password (min 6 chars)"
                    value={form.password}
                    onChange={update('password')}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="form-group">
                <label className="form-label" htmlFor="reg-confirm-password">
                  Confirm Password <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <div className="input-wrapper">
                  <span className="input-icon">🔒</span>
                  <input
                    id="reg-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Re-enter your password"
                    value={form.confirmPassword}
                    onChange={update('confirmPassword')}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                id="register-submit-btn"
              >
                <span>
                  {loading && <div className="btn-spinner" />}
                  {loading ? 'Creating Account...' : 'Create My Account'}
                </span>
              </button>
            </form>

            {/* Footer */}
            <div className="auth-footer">
              Already have an account?{' '}
              <Link to="/login">Sign In</Link>
            </div>

            <div className="terms-text">
              By creating an account, you agree to our{' '}
              <a href="#">Terms of Service</a> &{' '}
              <a href="#">Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
