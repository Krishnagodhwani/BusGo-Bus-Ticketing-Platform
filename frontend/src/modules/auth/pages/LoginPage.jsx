import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import './AuthPages.css';

export default function LoginPage() {
  const { login, loading, error, setError } = useAuth();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Basic client-side validation
    const cleanPhone = phone.replace(/[+91\s\-]/g, '').replace(/^0/, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setError('Please enter a valid 10-digit Indian mobile number');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    await login(cleanPhone, password);
  };

  return (
    <div className="login-page">
      {/* Left Hero Panel */}
      <div className="login-hero">
        <div className="hero-content">
          <div className="hero-bus-icon">🚌</div>
          <h1>Travel Smarter with YatraBus</h1>
          <p>
            Book bus tickets across India in seconds. Safe, reliable, and
            affordable travel — right at your fingertips.
          </p>

          <div className="hero-features">
            <div className="hero-feature">
              <span className="hero-feature-icon">🎫</span>
              <span>Instant ticket booking with real-time availability</span>
            </div>
            <div className="hero-feature">
              <span className="hero-feature-icon">🛡️</span>
              <span>Safe & secure payments with 100% data protection</span>
            </div>
            <div className="hero-feature">
              <span className="hero-feature-icon">💰</span>
              <span>Best prices guaranteed with exclusive discounts</span>
            </div>
            <div className="hero-feature">
              <span className="hero-feature-icon">📍</span>
              <span>Live bus tracking and instant e-ticket on phone</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="login-form-panel">
        <div className="login-form-container">
          {/* Brand logo (mobile + desktop) */}
          <div className="form-brand">
            <div className="form-brand-logo">
              <span className="logo-icon">🚌</span> YatraBus
            </div>
            <p>Your journey starts here</p>
          </div>

          {/* Login Card */}
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>Welcome Back</h2>
              <p>Sign in with your phone number to continue</p>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="alert-error" role="alert" id="login-error">
                <span className="alert-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* Phone Field */}
              <div className="form-group">
                <label className="form-label" htmlFor="login-phone">
                  Mobile Number
                </label>
                <div className="input-wrapper">
                  <span className="input-icon"></span>
                  <span className="phone-prefix">+91</span>
                  <input
                    id="login-phone"
                    type="tel"
                    className="form-input phone-input"
                    placeholder="Enter 10-digit number"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => {
                      // Only allow digits
                      const val = e.target.value.replace(/\D/g, '');
                      setPhone(val);
                    }}
                    autoComplete="tel"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="form-group">
                <label className="form-label" htmlFor="login-password">
                  Password
                </label>
                <div className="input-wrapper">
                  <span className="input-icon"></span>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
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

              {/* Submit */}
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                id="login-submit-btn"
              >
                <span>
                  {loading && <div className="btn-spinner" />}
                  {loading ? 'Signing in...' : 'Sign In'}
                </span>
              </button>
            </form>

            {/* Footer link */}
            <div className="auth-footer">
              Don't have an account?{' '}
              <Link to="/register">Create Account</Link>
            </div>

            <div className="terms-text">
              By signing in, you agree to our{' '}
              <a href="#">Terms of Service</a> &{' '}
              <a href="#">Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
